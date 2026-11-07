import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkPath, inspectFile, scanRepository } from './check-public-files.mjs';

const script = fileURLToPath(new URL('./check-public-files.mjs', import.meta.url));
const fixturesRoot = resolve(dirname(script), '../.local/public-guard-tests');
const projectKey = () => ['sk-', 'proj-', 'a'.repeat(40)].join('');
const privateHeader = () => ['-----BEGIN ', 'PRIVATE KEY-----'].join('');

function fixture(t) {
  mkdirSync(fixturesRoot, { recursive: true });
  const directory = mkdtempSync(join(fixturesRoot, 'run-'));
  t.after(() => {
    // Delete only the concrete, owned fixture created by this test.
    const parent = realpathSync(fixturesRoot);
    const target = realpathSync(directory);
    const inside = relative(parent, target);
    assert(inside && !inside.startsWith('..') && !isAbsolute(inside));
    rmSync(target, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet');
  git('config', 'user.name', 'Guard Test');
  git('config', 'user.email', 'guard@example.invalid');
  git('config', 'commit.gpgSign', 'false');
  const hooks = join(directory, 'empty-hooks');
  mkdirSync(hooks);
  git('config', 'core.hooksPath', hooks);
  const write = (name, text) => {
    const destination = join(directory, name);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  };
  return { directory, git, write };
}

test('allows public source, user documentation, synthetic JSON and public media', () => {
  for (const path of ['LICENSE', 'README.md', 'README.en.md', 'VERSIONING.md', 'CHANGELOG.md',
    '.github/workflows/ci.yml', 'docs/releases/v0.4.0.md', 'docs/PORTABLE.md',
    'docs/screenshots/clear-overview.png', 'src/demo/seed.json', 'e2e/fixtures/pulse-home.ts',
    'src-tauri/update-public-key.bin', 'src/pulse/lib/cache-utils.ts', '.env.example']) {
    assert.deepEqual(checkPath(path), [], path);
  }
});

test('rejects internal material, runtime data, credentials and generated artifacts', () => {
  for (const path of ['.local/signing/update-private.pem', '.cache/log', 'cache/value.json',
    'node_modules/package/index.js', 'release/app.exe', 'output/demo.png', 'data/prefs.json',
    'src-tauri/target/app.exe', 'dist/index.html', '.codex/auth.json',
    'CodexPulse-内部资料/继续开发.md', 'PRODUCT.md', 'DESIGN.md', 'AGENTS.md',
    'docs/context_summary_20261107_1200.md', 'docs/audits/report.md', 'docs/parity/acceptance.json',
    'docs/PARITY_IMPLEMENTATION.zh-CN.md', 'docs/FEATURE_PARITY.zh-CN.md', 'docs/CONTRACT.md',
    'docs/ROADMAP.md', 'copy/auth.json', '.env', '.env.local', 'sub/.env.production',
    'copy/private.sqlite', 'copy/private.db-wal', 'copy/private.sqlite3-shm',
    'copy/session.jsonl', 'copy/session.jsonl.zst', 'copy/session.ndjson.gz', 'app.log',
    'sessions/file.json', 'archived_sessions/file.json', '.impeccable/critique/report.md']) {
    assert(checkPath(path).length > 0, path);
  }
  assert(checkPath('docs\\parity\\acceptance.json').includes('internal-document'));
});

test('rejects non-repository paths instead of resolving them outside the checkout', () => {
  for (const path of ['', '../auth.json', 'docs/../../notes.md', '/notes.md', 'C:/notes.md']) {
    assert(checkPath(path).includes('invalid-repository-path'));
  }
});

test('reports high-signal secrets by rule without returning their content', () => {
  const cases = [
    [privateHeader(), 'private-key'],
    [['-----BEGIN ', 'ENCRYPTED ', 'PRIVATE KEY-----'].join(''), 'private-key'],
    [['gh', 'p_', 'b'.repeat(36)].join(''), 'github-token'],
    [['github_', 'pat_', 'c'.repeat(60)].join(''), 'github-fine-grained-token'],
    [projectKey(), 'openai-project-key'],
    [['sk-', 'svcacct-', 'd'.repeat(40)].join(''), 'openai-service-account-key'],
  ];
  for (const [secret, rule] of cases) {
    const findings = inspectFile('src/example.ts', `prefix ${secret} suffix`);
    assert.deepEqual(findings, [{ path: 'src/example.ts', rule }]);
    assert(!JSON.stringify(findings).includes(secret));
  }
});

test('does not mistake public keys, licensing or placeholder fragments for secrets', () => {
  const content = [
    'MIT License. Permission is hereby granted, free of charge.',
    '-----BEGIN PUBLIC KEY-----', '-----BEGIN CERTIFICATE-----',
    'process.env.OPENAI_API_KEY', 'ghp_example', 'sk-proj-example',
    'https://github.com/zhulongqihan/codex-pulse',
  ].join('\n');
  assert.deepEqual(inspectFile('THIRD_PARTY_LICENSES.txt', content), []);
  assert.deepEqual(inspectFile('docs/screenshots/sample.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff])), []);
});

test('detects UTF-16 secrets as well as UTF-8', () => {
  const secret = privateHeader();
  const littleEndian = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(secret, 'utf16le')]);
  const bigEndian = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(secret, 'utf16le').swap16()]);
  for (const bytes of [littleEndian, bigEndian]) {
    assert.equal(inspectFile('notes.txt', bytes)[0].rule, 'private-key');
  }
});

test('staged mode reads index content even when the working copy is cleaned', t => {
  const { directory, git, write } = fixture(t);
  write('notes.txt', projectKey());
  git('add', '--', 'notes.txt');
  write('notes.txt', 'clean working copy');
  assert.equal(scanRepository({ cwd: directory }).passed, true);
  const staged = scanRepository({ cwd: directory, staged: true });
  assert.equal(staged.passed, false);
  assert.deepEqual(staged.findings, [{ path: 'notes.txt', rule: 'openai-project-key' }]);
  const cli = spawnSync(process.execPath, [script, '--staged'], { cwd: directory, encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 1);
  assert(!cli.stdout.includes(projectKey()));
  assert.equal(JSON.parse(cli.stdout).findings[0].rule, 'openai-project-key');
});

test('staged clean content is independent from an unstaged secret and excludes untracked files', t => {
  const { directory, git, write } = fixture(t);
  write('notes.txt', 'clean staged content');
  git('add', '--', 'notes.txt');
  write('notes.txt', projectKey());
  write('untracked.txt', privateHeader());
  assert.equal(scanRepository({ cwd: directory }).passed, false);
  const staged = scanRepository({ cwd: directory, staged: true });
  assert.equal(staged.passed, true);
  assert.equal(staged.filesChecked, 1);
});

test('skips staged deletions while allowing their removal from a private path', t => {
  const { directory, git, write } = fixture(t);
  write('data/old.txt', 'owned synthetic fixture');
  git('add', '--', 'data/old.txt');
  git('commit', '--quiet', '-m', 'test: fixture');
  git('rm', '--quiet', '--', 'data/old.txt');
  const result = scanRepository({ cwd: directory, staged: true });
  assert.equal(result.passed, true);
  assert.equal(result.filesChecked, 0);
});

test('handles spaces in staged paths and fails closed for a missing tracked file', t => {
  const { directory, git, write } = fixture(t);
  write('docs/中文 notes.txt', 'public');
  git('add', '--', 'docs/中文 notes.txt');
  assert.equal(scanRepository({ cwd: directory, staged: true }).passed, true);
  rmSync(join(directory, 'docs/中文 notes.txt'));
  assert.deepEqual(scanRepository({ cwd: directory }).findings, [
    { path: 'docs/中文 notes.txt', rule: 'missing-tracked-file' },
  ]);
});

test('CLI rejects unsupported arguments and importing the tool has no side effects', t => {
  const { directory } = fixture(t);
  const invalid = spawnSync(process.execPath, [script, '--unknown'], { cwd: directory, encoding: 'utf8', windowsHide: true });
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Usage:/);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./check-public-files.mjs', import.meta.url).href)})`], {
    cwd: directory, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});

test('the guard and its own tests contain no complete credential fixtures', () => {
  for (const path of [script, fileURLToPath(import.meta.url)]) {
    assert.deepEqual(inspectFile(`scripts/${path.split(/[\\/]/).at(-1)}`, readFileSync(path)), []);
  }
});
