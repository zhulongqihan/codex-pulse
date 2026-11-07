import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, cpSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { createPulseHome } from '../e2e/fixtures/pulse-home.ts';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.local/portable-verification', `run-${Date.now()}`);
const source = resolve(process.env.CARGO_TARGET_DIR || join(root, 'src-tauri/target'), 'release/codex-pulse.exe');
const first = join(output, '原位置 Portable app');
const second = join(output, '搬迁位置 Moved app');
mkdirSync(first, { recursive: true });
copyFileSync(source, join(first, 'CodexPulse.exe'));
const fixture = createPulseHome(first);
function sourceDigests(folder) {
  return Object.fromEntries(readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const file = join(entry.parentPath, entry.name);
      return [file.slice(folder.length + 1), createHash('sha256').update(readFileSync(file)).digest('hex')];
    }).sort(([a], [b]) => a.localeCompare(b)));
}
const sourceBefore = sourceDigests(fixture.home);

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function connect(folder) {
  const port = await freePort();
  const env = { ...process.env, PULSE_CODEX_HOME: fixture.home, PULSE_OFFLINE: '1', WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
  delete env.PULSE_DATA_DIR;
  const child = spawn(join(folder, 'CodexPulse.exe'), [], { cwd: folder, env, windowsHide: true, stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', resolve));
  let target;
  for (let i = 0; i < 100; i++) {
    try { const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = targets.find(t => t.type === 'page' && t.url.includes('tauri.localhost') && !t.url.includes('#')); if (target) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!target) { child.kill(); throw new Error('Production WebView did not expose the test debugging endpoint'); }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => { const message = JSON.parse(data); if (!message.id) return; const result = pending.get(message.id); if (!result) return; pending.delete(message.id); message.error ? result.reject(new Error(message.error.message)) : result.resolve(message.result); });
  function send(method, params = {}) { const id = ++sequence; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
  async function evaluate(expression) { const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails)); return response.result.value; }
  const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
  for (let i = 0; i < 80; i++) { if (await evaluate('document.querySelectorAll("[data-testid=dashboard-nav-tab]").length > 0')) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  return { child, invoke, send, evaluate, async close() { await send('Runtime.evaluate', { expression: 'void window.__TAURI_INTERNALS__.invoke("widget_action",{action:"quit"})' }).catch(() => {}); socket.close(); await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Application did not exit')), 10000))]); } };
}

const evidence = { mode: 'production binary, synthetic logs, offline', executable: source, binarySha256: createHash('sha256').update(readFileSync(source)).digest('hex'), runs: [] };
let running;
try {
  running = await connect(first);
  await running.invoke('scan_usage');
  const paths = await running.invoke('get_pulse_paths');
  assert.equal(paths.data, join(first, 'data'));
  for (const path of [paths.logs, paths.profile, paths.temporary, paths.exports]) assert(path.startsWith(paths.data));
  assert(existsSync(paths.profile));
  await running.invoke('set_pulse_preferences', { patch: { skinId: 'meter', theme: 'dark', compactMode: true, motionLevel: 'off', widgetVisible: true, widgetExpanded: true } });
  const screenshot = await running.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(output, 'production-original.png'), Buffer.from(screenshot.data, 'base64'));
  evidence.runs.push({ location: first, paths, preferences: await running.invoke('get_pulse_preferences'), tokens: (await running.invoke('fetch_overview', { range: '30d' })).totals.totalTokens });
  await running.close(); running = null;
  // Only copy the owned fixture directory to another directory within this run.
  assert(first.startsWith(output) && second.startsWith(output));
  // WebView2 may finish deleting transient profile files just after its host exits.
  // Retry only those profile-copy races; a persistent failure still fails the run.
  let profileCopyRetries = 0;
  for (;;) {
    try { cpSync(first, second, { recursive: true }); break; }
    catch (error) {
      if (profileCopyRetries >= 20 || !['ENOENT', 'EBUSY', 'EPERM'].includes(error.code) || !/[\\/]data[\\/]webview[\\/]/i.test(error.path ?? '')) throw error;
      profileCopyRetries++;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  evidence.profileCopyRetries = profileCopyRetries;
  running = await connect(second);
  const movedPaths = await running.invoke('get_pulse_paths');
  assert.equal(movedPaths.data, join(second, 'data'));
  const saved = await running.invoke('get_pulse_preferences');
  assert.equal(saved.skinId, 'meter'); assert.equal(saved.theme, 'dark'); assert.equal(saved.motionLevel, 'off');
  assert.equal(saved.compactMode, true); assert.equal(saved.widgetVisible, true); assert.equal(saved.widgetExpanded, true);
  assert.equal((await running.invoke('fetch_overview', { range: '30d' })).totals.totalTokens, evidence.runs[0].tokens);
  const movedScreenshot = await running.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(output, 'production-relocated.png'), Buffer.from(movedScreenshot.data, 'base64'));
  evidence.runs.push({ location: second, paths: movedPaths, preferences: saved });
  await running.close(); running = null;
  assert.deepEqual(sourceDigests(fixture.home), sourceBefore);
  writeFileSync(join(output, 'evidence.json'), JSON.stringify({ ...evidence, sourceUnmodified: true, sourceFileCount: Object.keys(sourceBefore).length, passed: true }, null, 2));
  console.log(JSON.stringify({ passed: true, evidence: join(output, 'evidence.json') }));
} finally { if (running) { try { await running.close(); } catch { running.child.kill(); } } }
