import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { readExecutableVersion, signUpdate } from './sign-update.mjs';

const fixturesRoot = resolve(import.meta.dirname, '../.local/sign-update-tests');
const windowsOnly = { skip: process.platform !== 'win32' };
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');

function fixture(t, version = '0.5.0') {
  mkdirSync(fixturesRoot, { recursive: true });
  const root = mkdtempSync(join(fixturesRoot, 'fixture-'));
  t.after(() => {
    const parent = realpathSync(fixturesRoot), target = realpathSync(root);
    const child = relative(parent, target);
    assert(child && !isAbsolute(child) && !child.startsWith('..') && !child.includes('/') && !child.includes('\\'));
    assert(basename(target).startsWith('fixture-'));
    rmSync(target, { recursive: true, force: true });
  });
  const scripts = join(root, 'scripts');
  mkdirSync(scripts);
  mkdirSync(join(root, 'src-tauri'));
  for (const name of ['sign-update.mjs', 'version.mjs', 'read-executable-version.ps1']) {
    copyFileSync(resolve(import.meta.dirname, name), join(scripts, name));
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'codex-pulse', version }));
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ productName: 'Codex Pulse', version }));
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), `[package]\nname = "codex-pulse"\nversion = "${version}"\n`);
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), `version = 4\n\n[[package]]\nname = "codex-pulse"\nversion = "${version}"\n`);
  const output = join(root, '中文 & $ release');
  mkdirSync(output);
  const executable = join(output, 'program $(not-a-command) & [sample].exe');
  const notes = join(root, 'release-notes.md');
  writeFileSync(notes, '# Synthetic release\n测试说明。\n');
  const key = join(root, 'temporary-signing-key.pem');
  const manifest = join(output, 'pulse-update.json');
  const command = join(scripts, 'sign-update.mjs');
  return { root, output, executable, notes, key, manifest, command };
}

function addTemporaryKey(file) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  return publicKey;
}

function cli(f, args = [f.executable, f.notes]) {
  return spawnSync(process.execPath, [f.command, ...args], {
    cwd: f.root, env: { ...process.env, PULSE_SIGNING_KEY_FILE: f.key }, windowsHide: true, encoding: 'utf8', timeout: 35_000,
  });
}

test('passes executable paths as a literal -File helper parameter without a shell command', () => {
  const executable = resolve('.local/synthetic $(not-a-command) & [version].exe');
  let invoked = false;
  const version = readExecutableVersion(executable, {
    platform: 'win32',
    executeFile(command, args, options) {
      invoked = true;
      assert.equal(basename(command).toLowerCase(), 'powershell.exe');
      assert(!args.includes('-Command'));
      assert.equal(args[args.indexOf('-Executable') + 1], executable);
      assert.equal(basename(args[args.indexOf('-File') + 1]), 'read-executable-version.ps1');
      assert.equal(options.windowsHide, true);
      assert.equal(options.shell, undefined);
      return '\uFEFF{"productVersion":"0.5.0"}\r\n';
    },
  });
  assert.equal(invoked, true);
  assert.equal(version, '0.5.0');
});

test('refuses a non-Windows signing host before attempting the helper', () => {
  let called = false;
  assert.throws(() => readExecutableVersion('not-read.exe', { platform: 'linux', executeFile() { called = true; } }), /requires Windows/);
  assert.equal(called, false);
});

test('rejects unreadable or unsupported metadata without relaying arbitrary helper output', () => {
  assert.throws(() => readExecutableVersion('not-read.exe', {
    platform: 'win32', executeFile() { throw new Error('untrusted helper details'); },
  }), error => /Cannot read executable/.test(error.message) && !error.message.includes('untrusted helper details'));
  for (const output of ['not JSON', '{}', '{"productVersion":"0.5.0-beta.1"}', '{"productVersion":"0.5.0.0"}']) {
    assert.throws(() => readExecutableVersion('not-read.exe', { platform: 'win32', executeFile: () => output }));
  }
});

test('rejects a stale executable against four synchronized manifests before reading notes or a key', t => {
  const f = fixture(t, '0.5.0');
  writeFileSync(f.manifest, 'previous manifest');
  assert.throws(() => signUpdate(f.executable, join(f.root, 'missing-notes.md'), {
    root: f.root, keyPath: f.key, readVersion: () => '0.4.0',
  }), /ProductVersion '0\.4\.0' does not match source version '0\.5\.0'/);
  assert.equal(existsSync(f.key), false);
  assert.equal(readFileSync(f.manifest, 'utf8'), 'previous manifest');
});

test('checks source-version consistency before inspecting the executable', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'src-tauri/Cargo.lock'), 'version = 4\n\n[[package]]\nname = "codex-pulse"\nversion = "0.4.0"\n');
  let called = false;
  assert.throws(() => signUpdate(f.executable, f.notes, {
    root: f.root, keyPath: f.key, readVersion() { called = true; return '0.5.0'; },
  }), /Version mismatch/);
  assert.equal(called, false);
  assert.equal(existsSync(f.manifest), false);
  assert.equal(existsSync(f.key), false);
});

test('signs a real matching Windows PE using only a temporary test key and verifies the resulting signature', windowsOnly, t => {
  const f = fixture(t, process.versions.node);
  copyFileSync(process.execPath, f.executable);
  assert.equal(readExecutableVersion(f.executable), process.versions.node);
  const publicKey = addTemporaryKey(f.key);
  const result = cli(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pulse-update\.json/);
  const envelope = JSON.parse(readFileSync(f.manifest, 'utf8'));
  const payload = Buffer.from(envelope.payload, 'base64');
  assert.equal(verify(null, payload, publicKey, Buffer.from(envelope.signature, 'base64')), true);
  const manifest = JSON.parse(payload);
  assert.equal(manifest.version, process.versions.node);
  assert.equal(manifest.product, 'codex-pulse');
  assert.equal(manifest.target, 'windows-x86_64');
  assert.equal(manifest.sha256, hash(f.executable));
  assert.equal(manifest.bytes, readFileSync(f.executable).length);
  assert.equal(manifest.notes, readFileSync(f.notes, 'utf8'));
  assert.equal(manifest.url, `https://github.com/zhulongqihan/codex-pulse/releases/download/v${process.versions.node}/CodexPulse-${process.versions.node}-windows-x64.exe`);
});

test('the actual CLI rejects a real PE version mismatch and preserves an existing update manifest', windowsOnly, t => {
  const f = fixture(t, '0.5.0');
  copyFileSync(process.execPath, f.executable);
  writeFileSync(f.manifest, 'previous manifest');
  // No key exists: a metadata mismatch must be reported before any key-read error.
  const result = cli(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ProductVersion/);
  assert.match(result.stderr, /does not match source version '0\.5\.0'/);
  assert(!result.stderr.includes('ENOENT'));
  assert.equal(readFileSync(f.manifest, 'utf8'), 'previous manifest');
  assert.equal(existsSync(f.key), false);
});

test('the actual CLI rejects a non-PE file without a product version before reading a key', windowsOnly, t => {
  const f = fixture(t);
  writeFileSync(f.executable, 'synthetic text, not a Windows PE');
  const result = cli(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot read executable product version/);
  assert.equal(existsSync(f.manifest), false);
  assert.equal(existsSync(f.key), false);
});

test('importing the signer has no side effects and --init preserves an existing temporary key', t => {
  const f = fixture(t);
  const publicKey = addTemporaryKey(f.key);
  const keyHash = hash(f.key);
  const imported = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(f.command).href)});`], {
    cwd: f.root, env: { ...process.env, PULSE_SIGNING_KEY_FILE: f.key }, windowsHide: true, encoding: 'utf8',
  });
  assert.equal(imported, '');
  assert.equal(existsSync(join(f.root, 'src-tauri/update-public-key.bin')), false);
  const initialized = cli(f, ['--init']);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(hash(f.key), keyHash);
  assert.deepEqual(readFileSync(join(f.root, 'src-tauri/update-public-key.bin')), publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  assert.equal(existsSync(f.manifest), false);
});
