import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, createPublicKey, createPrivateKey, sign, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkVersions, parseVersion } from './version.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'Usage: node scripts/sign-update.mjs <exe> <release-notes.md> | --init';

export function readExecutableVersion(executable, { platform = process.platform, executeFile = execFileSync } = {}) {
  if (platform !== 'win32') throw new Error('Signing Windows updates requires Windows and Windows PowerShell to verify the executable product version.');
  const powershell = join(process.env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  let metadata;
  try {
    const output = executeFile(powershell, [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      resolve(import.meta.dirname, 'read-executable-version.ps1'), '-Executable', resolve(executable),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30_000 });
    metadata = JSON.parse(String(output).replace(/^\uFEFF/, '').trim());
  } catch {
    // Do not relay arbitrary helper stderr or executable metadata to public logs.
    throw new Error('Cannot read executable product version with the Windows metadata helper.');
  }
  try { parseVersion(metadata?.productVersion); }
  catch { throw new Error('Executable ProductVersion must be a stable X.Y.Z version supported by the updater.'); }
  return metadata.productVersion;
}

export function signUpdate(executable, notesPath, {
  root = ROOT,
  keyPath = process.env.PULSE_SIGNING_KEY_FILE || resolve(root, '.local/signing/update-private.pem'),
  readVersion = readExecutableVersion,
} = {}) {
  if (!executable || !notesPath) throw new Error(USAGE);
  const { version } = checkVersions(root);
  const binaryVersion = readVersion(executable);
  if (binaryVersion !== version) {
    throw new Error(`Executable ProductVersion '${binaryVersion}' does not match source version '${version}'; rebuild before signing.`);
  }
  // Reject stale binaries before reading the signing key or writing a manifest.
  const bytes = readFileSync(executable);
  const payload = Buffer.from(JSON.stringify({
    product: 'codex-pulse', target: 'windows-x86_64', version,
    url: `https://github.com/zhulongqihan/codex-pulse/releases/download/v${version}/CodexPulse-${version}-windows-x64.exe`,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    notes: readFileSync(notesPath, 'utf8'), publishedAt: new Date().toISOString(),
  }));
  const signature = sign(null, payload, createPrivateKey(readFileSync(keyPath)));
  const output = resolve(dirname(executable), 'pulse-update.json');
  writeFileSync(output, JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }, null, 2) + '\n');
  return output;
}

export function initializeSigningKey({ root = ROOT, keyPath = process.env.PULSE_SIGNING_KEY_FILE || resolve(root, '.local/signing/update-private.pem') } = {}) {
  if (!existsSync(keyPath)) {
    mkdirSync(dirname(keyPath), { recursive: true });
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const publicKey = createPublicKey(readFileSync(keyPath)).export({ type: 'spki', format: 'der' }).subarray(-32);
  writeFileSync(resolve(root, 'src-tauri/update-public-key.bin'), publicKey);
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--init') {
    initializeSigningKey();
    console.log('Update verification public key saved; signing private key stays local.');
    return;
  }
  if (args.length !== 2 || args[0].startsWith('--')) throw new Error(USAGE);
  console.log(signUpdate(args[0], args[1]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
