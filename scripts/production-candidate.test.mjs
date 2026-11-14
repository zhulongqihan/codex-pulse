import assert from 'node:assert/strict';
import test from 'node:test';
import { githubJSON, repositoryName, sourceCommit, validatePortableMetadata, verifiedChecks, verifySource, windowsPowerShellEnvironment } from './production-candidate.mjs';

const sha = 'a'.repeat(40), repository = 'owner/codex-pulse';
const workflow = { id: 1234, name: 'Checks', path: '.github/workflows/ci.yml' };
const run = {
  id: 9876, workflow_id: workflow.id, head_sha: sha, head_branch: 'main', event: 'push',
  repository: { full_name: repository }, head_repository: { full_name: repository },
  created_at: '2026-11-14T09:00:00Z', run_attempt: 1, status: 'completed', conclusion: 'success',
};
const gate = (runs, selectedWorkflow = workflow) => verifiedChecks({ repository, sha, workflow: selectedWorkflow, runs });

test('full source identities reject branch names, short hashes and shell/output injection', () => {
  assert.equal(sourceCommit('A'.repeat(40)), sha);
  for (const bad of [undefined, 'main', 'a'.repeat(7), sha + '\n', sha + '\r', sha + ';whoami', ' ' + sha, 'g'.repeat(40)]) assert.throws(() => sourceCommit(bad), /40-character/);
  assert.equal(repositoryName(repository), repository);
  for (const bad of ['owner/repo\n', 'owner/repo/extra', 'owner/$(whoami)', 'https://github.com/owner/repo']) assert.throws(() => repositoryName(bad), /repository identity/);
});

test('only the exact workflow, source and main-push repository identity can authorize build', () => {
  assert.equal(gate([run]).id, run.id);
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { event: 'pull_request' }, { workflow_id: 2 }, { repository: { full_name: 'other/repo' } }, { head_repository: { full_name: 'fork/repo' } }]) assert.throws(() => gate([{ ...run, ...patch }]), /No exact-source/);
  for (const patch of [{ name: 'Other' }, { path: '.github/workflows/other.yml' }]) assert.throws(() => gate([run], { ...workflow, ...patch }), /workflow identity/);
});

test('a newer failure, cancellation or in-progress run prevents reuse of an older green run', () => {
  for (const [status, conclusion] of [['completed', 'failure'], ['completed', 'cancelled'], ['in_progress', null], ['queued', null]]) {
    assert.throws(() => gate([run, { ...run, id: run.id + 1, created_at: '2026-11-14T10:00:00Z', status, conclusion }]), /latest exact-source/);
  }
  assert.equal(gate([{ ...run, conclusion: 'failure' }, { ...run, id: run.id + 1, created_at: '2026-11-14T10:00:00Z' }]).id, run.id + 1);
});

test('missing or malformed CI evidence does not authorize a candidate', () => {
  assert.throws(() => gate([]), /No exact-source/);
  assert.throws(() => gate(null), /runs are missing/);
  assert.throws(() => gate([{ ...run, created_at: 'not-a-date' }]), /metadata/);
  assert.throws(() => gate([{ ...run, status: 'completed', conclusion: 'skipped' }]), /successful/);
});

function sourceReader({ release = null, missingPackage = false } = {}) {
  return async path => {
    if (path.endsWith('/actions/workflows/ci.yml')) return workflow;
    if (path.includes('/runs?')) return { workflow_runs: [run] };
    if (path.includes('/contents/package.json?ref=')) return missingPackage ? {} : { encoding: 'base64', content: Buffer.from(JSON.stringify({ name: 'codex-pulse', version: '0.11.0' })).toString('base64') };
    if (path.endsWith('/releases/tags/v0.11.0')) return release;
    throw Error('Unexpected API request');
  };
}

test('verification binds source package version and rejects rebuilding released versions', async () => {
  const result = await verifySource({ sha, repository, readJSON: sourceReader() });
  assert.equal(result.version, '0.11.0');
  assert.equal(result.sourceCommit, sha);
  await assert.rejects(verifySource({ sha, repository, readJSON: sourceReader({ release: { id: 1 } }) }), /already has a release/);
  await assert.rejects(verifySource({ sha, repository, readJSON: sourceReader({ missingPackage: true }) }), /metadata is unavailable/);
});

test('an explicit missing release is allowed; API authorization or service failures are not', async () => {
  assert.equal(await githubJSON('repos/owner/repo/releases/tags/v0.11.0', { allowMissing: true, fetchJSON: async () => ({ status: 404 }) }), null);
  for (const status of [401, 403, 429, 500]) await assert.rejects(githubJSON('repos/owner/repo/releases/tags/v0.11.0', { allowMissing: true, fetchJSON: async () => ({ status, ok: false }) }), /build is blocked/);
});

test('candidate metadata rejects wrong PE version, a signature mismatch, unexpected ZIP data and different ZIP executable', () => {
  const metadata = { productVersion: '0.11.0', authenticodeStatus: 'NotSigned', archiveExeSha256: sha, archiveEntries: ['CodexPulse.exe', 'Start-Codex-Pulse.cmd', 'Create-Codex-Pulse-Shortcuts.cmd', 'Create-Codex-Pulse-Shortcuts.ps1', 'install-codex-plugin.ps1', 'LICENSE', 'LICENSE-Codex-Usage-Desktop.txt', 'THIRD_PARTY_LICENSES.txt', 'THIRD_PARTY_NOTICES.md', 'README.txt'] };
  assert.doesNotThrow(() => validatePortableMetadata(metadata, '0.11.0', sha));
  for (const patch of [{ productVersion: '0.10.0' }, { authenticodeStatus: 'Valid' }, { archiveEntries: [...metadata.archiveEntries, 'data/auth.json'] }, { archiveExeSha256: 'b'.repeat(40) }]) assert.throws(() => validatePortableMetadata({ ...metadata, ...patch }, '0.11.0', sha));
});

test('native metadata subprocess uses Windows PowerShell modules rather than inherited PowerShell 7 modules', () => {
  const env = windowsPowerShellEnvironment({ WINDIR: 'C:/Windows', PSModulePath: 'PowerShell7/modules', psmodulepath: 'duplicate/modules', Path: 'retained' });
  assert.equal(Object.keys(env).filter(key => key.toLowerCase() === 'psmodulepath').length, 1);
  assert.match(env.PSModulePath.replaceAll('\\', '/'), /Windows\/System32\/WindowsPowerShell\/v1\.0\/Modules$/);
  assert.equal(env.Path, 'retained');
});
