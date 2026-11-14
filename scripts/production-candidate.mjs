import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkVersions, parseVersion } from './version.mjs';

const API = 'https://api.github.com';
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const PORTABLE_FILES = ['CodexPulse.exe', 'Start-Codex-Pulse.cmd', 'Create-Codex-Pulse-Shortcuts.cmd', 'Create-Codex-Pulse-Shortcuts.ps1', 'install-codex-plugin.ps1', 'LICENSE', 'LICENSE-Codex-Usage-Desktop.txt', 'THIRD_PARTY_LICENSES.txt', 'THIRD_PARTY_NOTICES.md', 'README.txt'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function windowsPowerShellEnvironment(env) {
  const native = Object.fromEntries(Object.entries(env).filter(([key]) => key.toLowerCase() !== 'psmodulepath'));
  // PowerShell 7's module path cannot be loaded by Windows PowerShell 5.1.
  native.PSModulePath = join(env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/Modules');
  return native;
}

export function sourceCommit(value) {
  if (typeof value !== 'string' || value.length !== 40 || !/^[a-fA-F0-9]{40}$/.test(value)) throw new Error('source_commit must be a complete 40-character hexadecimal commit.');
  return value.toLowerCase();
}

export function repositoryName(value) {
  if (typeof value !== 'string' || value !== value.trim() || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value)) throw new Error('Invalid repository identity.');
  return value;
}

/** Reject an older green run when a newer main-push run for the same source failed. */
export function verifiedChecks({ repository, sha, workflow, runs }) {
  repositoryName(repository); sourceCommit(sha);
  if (workflow?.path !== WORKFLOW_PATH || workflow?.name !== 'Checks' || !Number.isSafeInteger(workflow?.id)) throw new Error('The Checks workflow identity does not match ci.yml.');
  if (!Array.isArray(runs)) throw new Error('Workflow runs are missing.');
  const matches = runs.filter(run => run?.workflow_id === workflow.id && run.head_sha === sha
    && run.head_branch === 'main' && run.event === 'push'
    && run.repository?.full_name === repository && run.head_repository?.full_name === repository);
  if (!matches.length) throw new Error('No exact-source main push Checks run was found.');
  if (matches.some(run => !Number.isSafeInteger(run.id) || !Number.isFinite(Date.parse(run.created_at)))) throw new Error('Invalid Checks run metadata.');
  matches.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const run = matches[0];
  if (run.status !== 'completed' || run.conclusion !== 'success') throw new Error('The latest exact-source main push Checks run must be completed and successful.');
  return { id: run.id, attempt: run.run_attempt ?? null, url: `${API.replace('api.github.com', 'github.com')}/${repository}/actions/runs/${run.id}`, createdAt: run.created_at, status: run.status, conclusion: run.conclusion, workflowId: workflow.id, workflowPath: workflow.path };
}

export async function githubJSON(path, { allowMissing = false, token = process.env.GH_TOKEN, fetchJSON = fetch } = {}) {
  const response = await fetchJSON(`${API}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Codex-Pulse-production-candidate', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub verification request failed (${response.status}); production build is blocked.`);
  return response.json();
}

export async function verifySource({ sha: requested, repository, readJSON = githubJSON }) {
  const sha = sourceCommit(requested); repositoryName(repository);
  const prefix = `repos/${repository}`;
  const workflow = await readJSON(`${prefix}/actions/workflows/ci.yml`);
  const result = await readJSON(`${prefix}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&branch=main&event=push&per_page=100`);
  const checks = verifiedChecks({ repository, sha, workflow, runs: result.workflow_runs });
  const content = await readJSON(`${prefix}/contents/package.json?ref=${sha}`);
  if (content?.encoding !== 'base64' || typeof content.content !== 'string') throw new Error('Exact-source package metadata is unavailable.');
  const pkg = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
  if (pkg?.name !== 'codex-pulse') throw new Error('The source does not describe Codex Pulse.');
  parseVersion(pkg.version);
  const existing = await readJSON(`${prefix}/releases/tags/v${pkg.version}`, { allowMissing: true });
  if (existing !== null) throw new Error('This software version already has a release; do not rebuild it as a new candidate.');
  return { schemaVersion: 1, verifiedAt: new Date().toISOString(), repository, sourceCommit: sha, version: pkg.version, checks };
}

export function validatePortableMetadata(metadata, expectedVersion, expectedExeHash) {
  if (metadata?.productVersion !== expectedVersion || metadata?.authenticodeStatus !== 'NotSigned') throw new Error('Candidate PE version or unsigned publisher-signature status does not match.');
  if (!Array.isArray(metadata.archiveEntries) || metadata.archiveEntries.length !== PORTABLE_FILES.length
    || [...metadata.archiveEntries].sort().join('\n') !== [...PORTABLE_FILES].sort().join('\n')) throw new Error('Portable archive contains unexpected or missing files.');
  if (metadata.archiveExeSha256 !== expectedExeHash) throw new Error('Portable archive executable differs from the candidate executable.');
}

export function collectMetadata(rootPath, gatePath, env = process.env) {
  const root = resolve(rootPath), gate = JSON.parse(readFileSync(gatePath, 'utf8'));
  const sha = sourceCommit(gate.sourceCommit), repository = repositoryName(gate.repository);
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' }).trim();
  if (head !== sha || dirty) throw new Error('Candidate source must remain clean and match the verified commit.');
  const { version } = checkVersions(root);
  if (version !== gate.version) throw new Error('Built source version differs from the verified source.');
  const release = join(root, 'release');
  const exe = `CodexPulse-${version}-windows-x64.exe`, zip = `CodexPulse-${version}-windows-x64.zip`;
  const files = [exe, `${exe}.sha256`, zip, `${zip}.sha256`].map(name => {
    const bytes = readFileSync(join(release, name));
    return { name, bytes: statSync(join(release, name)).size, sha256: sha256(bytes) };
  });
  for (const name of [exe, zip]) {
    const digest = readFileSync(join(release, `${name}.sha256`), 'utf8').trim().split(/\s+/);
    if (digest.length !== 2 || digest[0] !== files.find(file => file.name === name).sha256 || digest[1] !== name) throw new Error('A packaged checksum does not match its artifact.');
  }
  const powershell = join(env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const native = JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-File', join(import.meta.dirname, 'read-production-candidate.ps1'), '-Executable', join(release, exe), '-Archive', join(release, zip)], { encoding: 'utf8', windowsHide: true, env: windowsPowerShellEnvironment(env) }).replace(/^\uFEFF/, ''));
  validatePortableMetadata(native, version, files.find(file => file.name === exe).sha256);
  for (const field of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) if (!/^\d+$/.test(env[field] ?? '')) throw new Error('GitHub run identity is missing.');
  const metadata = {
    schemaVersion: 1, createdAt: new Date().toISOString(), kind: 'unsigned-production-candidate',
    sourceCommit: sha, version, repository, workflowCommit: sourceCommit(env.GITHUB_WORKFLOW_SHA),
    workflowRef: env.GITHUB_WORKFLOW_REF, workflow: env.GITHUB_WORKFLOW,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    runUrl: `https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}`,
    sourceChecks: gate.checks, files, executable: native,
    tools: Object.fromEntries(['node', 'pnpm', 'rustc', 'cargo'].map(name => [name, execFileSync(name === 'pnpm' && process.platform === 'win32' ? 'pnpm.cmd' : name, ['--version'], { encoding: 'utf8', shell: name === 'pnpm' && process.platform === 'win32', windowsHide: true }).trim()])),
    runner: { os: env.RUNNER_OS, architecture: env.RUNNER_ARCH, image: env.ImageOS, imageVersion: env.ImageVersion },
    limitations: ['Not a formal release or Windows publisher-signed package.', 'No Pulse update-manifest signing key was used.', 'Build provenance metadata is not a security audit or independent adoption evidence.'],
  };
  writeFileSync(join(release, 'candidate-build.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args[0] === 'verify' && args.length === 2) {
    const gate = await verifySource({ sha: env.SOURCE_COMMIT, repository: env.GITHUB_REPOSITORY });
    writeFileSync(resolve(args[1]), JSON.stringify(gate, null, 2) + '\n');
    if (!env.GITHUB_OUTPUT) throw new Error('GitHub step output path is missing.');
    appendFileSync(env.GITHUB_OUTPUT, `source_sha=${gate.sourceCommit}\nversion=${gate.version}\nchecks_run_id=${gate.checks.id}\n`);
    console.log(`Verified ${gate.sourceCommit} against main push Checks run ${gate.checks.id}; ${gate.version} is unreleased.`);
  } else if (args[0] === 'metadata' && args.length === 3) {
    const metadata = collectMetadata(args[1], args[2], env);
    console.log(`Recorded ${metadata.files.length} candidate files for ${metadata.sourceCommit}; Authenticode=${metadata.executable.authenticodeStatus}.`);
  } else throw new Error('Usage: node scripts/production-candidate.mjs verify <gate.json> | metadata <source-root> <gate.json>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
