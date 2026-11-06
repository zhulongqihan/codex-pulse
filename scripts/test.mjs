import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = fs.readdirSync('tests').filter(f => f.endsWith('.test.mjs')).map(f => path.join('tests', f));
if (!files.length) throw new Error('No tests discovered');
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: process.env });
process.exit(run.status ?? 1);
