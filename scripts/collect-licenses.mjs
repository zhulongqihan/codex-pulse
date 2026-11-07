import { readdirSync, readFileSync, existsSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const seen = new Set();
const sections = [];
function licenseFiles(directory, depth = 0) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^(licen[cs]e|copying|notice|ofl)([._-]|$)/i.test(entry.name)) files.push(join(directory, entry.name));
    if (entry.isDirectory() && depth < 3 && !['node_modules', '.git', 'target', 'tests', 'test'].includes(entry.name)) files.push(...licenseFiles(join(directory, entry.name), depth + 1));
  }
  return files;
}
function add(label, directory, declared) {
  const texts = [...new Set(licenseFiles(directory).map(file => readFileSync(file, 'utf8').trim()).filter(Boolean))];
  sections.push(`${label}\nDeclared license: ${declared || 'See package source'}\n${'='.repeat(78)}\n${texts.join('\n\n---\n\n') || 'License text is provided in the upstream package source.'}\n`);
}
function visit(directory) {
  directory = realpathSync(directory);
  if (seen.has(directory)) return;
  seen.add(directory);
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (directory !== root) add(`${metadata.name} ${metadata.version} (JavaScript)`, directory, metadata.license);
  const require = createRequire(join(directory, 'package.json'));
  for (const name of Object.keys(metadata.dependencies || {})) {
    try {
      let file;
      try { file = require.resolve(`${name}/package.json`); }
      catch {
        file = require.resolve(name);
        let search = dirname(file);
        while (!existsSync(join(search, 'package.json')) && dirname(search) !== search) search = dirname(search);
        file = join(search, 'package.json');
      }
      visit(dirname(file));
    } catch { /* Optional platform packages are absent from this distribution. */ }
  }
}
visit(root);
const cargoRoot = process.env.CARGO_HOME;
if (!cargoRoot) throw new Error('Run through scripts/build-env.ps1 to locate locked Rust sources.');
for (const index of readdirSync(join(cargoRoot, 'registry/src'))) {
  for (const crate of readdirSync(join(cargoRoot, 'registry/src', index))) {
    if (crate === 'auto-launch-0.6.0') continue; // The locally patched source below is the selected crate.
    if (crate === 'tauri-plugin-single-instance-2.5.5') continue;
    const directory = join(cargoRoot, 'registry/src', index, crate);
    const manifest = readFileSync(join(directory, 'Cargo.toml'), 'utf8');
    add(`${crate} (Rust)`, directory, manifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1]);
  }
}
add('auto-launch-0.6.0 (Rust, Pulse compatibility patch)', join(root, 'src-tauri/vendor/auto-launch'), 'MIT');
add('tauri-plugin-single-instance-2.5.5 (Rust, profile isolation patch)', join(root, 'src-tauri/vendor/tauri-plugin-single-instance'), 'Apache-2.0 OR MIT');
sections.sort((a, b) => a.localeCompare(b));
writeFileSync(join(root, 'THIRD_PARTY_LICENSES.txt'), 'Codex Pulse dependency notices\n\nOriginal license texts from the installed, locked dependency packages.\nThis includes build/test dependencies present in the source distribution.\nCodex Usage Desktop has its own preserved license in vendor/codex-usage-desktop/LICENSE.\n\n' + sections.join('\n\n'));
console.log(`Collected ${sections.length} dependency notices.`);
