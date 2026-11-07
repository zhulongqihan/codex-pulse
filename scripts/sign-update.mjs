import { generateKeyPairSync, createPublicKey, createPrivateKey, sign, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const keyPath = process.env.PULSE_SIGNING_KEY_FILE || resolve(root, '.local/signing/update-private.pem');
if (process.argv.includes('--init')) {
  if (!existsSync(keyPath)) {
    mkdirSync(dirname(keyPath), { recursive: true });
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const publicKey = createPublicKey(readFileSync(keyPath)).export({ type: 'spki', format: 'der' }).subarray(-32);
  writeFileSync(resolve(root, 'src-tauri/update-public-key.bin'), publicKey);
  console.log('Update verification public key saved; signing private key stays local.');
} else {
  const executable = process.argv[2];
  const notesPath = process.argv[3];
  if (!executable || !notesPath) throw new Error('Usage: node scripts/sign-update.mjs <exe> <release-notes.md>');
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8').replace(/^\uFEFF/, '')).version;
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
  console.log(output);
}
