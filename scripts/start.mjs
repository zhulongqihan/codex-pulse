import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
if (!fs.existsSync('dist/index.html')) {
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
child.on('exit', code => process.exit(code ?? 0));
