import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.local');
const temporary = path.join(local, 'tmp');
const npmCache = path.join(local, 'cache', 'npm');
// Electron's install.js passes the lower-case variable to @electron/get.
// Respect an explicitly selected Electron cache, otherwise keep it in the checkout.
const electronCache = process.env.electron_config_cache || process.env.ELECTRON_CACHE || path.join(local, 'cache', 'electron');
for (const directory of [temporary, npmCache, electronCache]) fs.mkdirSync(directory, { recursive: true });

const installScript = path.join(root, 'node_modules', 'electron', 'install.js');
if (!fs.existsSync(installScript)) {
  console.error('Electron is missing. Install the development dependencies, then try again.');
  process.exit(1);
}

// These settings belong only to this child process. The parent npm process has
// already downloaded dependencies; use npm --cache .local/cache/npm install/ci
// to place that earlier work on the checkout drive as well.
const result = spawnSync(process.execPath, [installScript], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    npm_config_cache: npmCache,
    electron_config_cache: electronCache,
    ELECTRON_CACHE: electronCache,
    TEMP: temporary,
    TMP: temporary,
    TMPDIR: temporary,
  },
});

if (result.error) {
  console.error(`Electron installation could not start (${result.error.code || 'unknown error'}).`);
  process.exit(1);
}
process.exit(result.status ?? 1);
