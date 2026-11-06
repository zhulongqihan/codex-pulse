import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';
const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true } });
await server.listen();
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '', PULSE_DEV_URL: 'http://127.0.0.1:5186' } });
const stop = async () => { child.kill(); await server.close(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
