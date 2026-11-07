import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { createPulseHome } from '../e2e/fixtures/pulse-home.ts';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.PULSE_INSTANCE_OUTPUT || join(root, '.local/native-instance', `run-${Date.now()}`));
mkdirSync(output, { recursive: true });
const source = resolve(process.env.PULSE_NATIVE_BINARY || join(process.env.CARGO_TARGET_DIR || join(root, 'src-tauri/target'), 'debug/codex-pulse.exe'));
const executable = join(output, 'Codex Pulse instance test.exe');
copyFileSync(source, executable);
const a = createPulseHome(join(output, 'Profile A'));
const b = createPulseHome(join(output, 'Profile B'));
const expectedVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const powershell = join(process.env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const owned = new Set();
const evidence = { mode: 'Native instance controls; isolated synthetic data; no user profile or registry changes', binarySha256: createHash('sha256').update(readFileSync(source)).digest('hex'), source, checks: {} };
async function bounded(promise, timeout, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); })]); }
  finally { clearTimeout(timer); }
}

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function launch(profile, args = [], port = 0) {
  const child = spawn(executable, args, { windowsHide: true, cwd: output, stdio: 'ignore', env: {
    ...process.env, PULSE_DATA_DIR: profile.data, PULSE_CODEX_HOME: profile.home, PULSE_OFFLINE: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: port ? `--remote-debugging-port=${port}` : '',
  } });
  child.exited = new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  owned.add(child);
  return child;
}

async function waitFor(predicate, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) { if (await predicate()) return; await delay(100); }
  throw new Error(`Timed out: ${label}`);
}

async function connect(profile) {
  const port = await freePort();
  const child = launch(profile, ['--hidden'], port);
  let target;
  await waitFor(async () => {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find(item => item.type === 'page' && item.url.includes('tauri.localhost') && !item.url.includes('#'));
      return Boolean(target);
    } catch { return false; }
  }, 'native debugging page', 150);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data); const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
  await waitFor(() => evaluate('!!window.__TAURI_INTERNALS__?.invoke'), 'native IPC');
  assert.equal(await invoke('plugin:app|version'), expectedVersion, 'Build the current application before testing');
  assert.equal((await invoke('get_pulse_paths')).data, profile.data);
  return { child, port, socket, invoke, visible: () => invoke('plugin:window|is_visible', { label: 'main' }) };
}

async function secondary(profile, args = []) {
  const child = launch(profile, args);
  const code = await bounded(child.exited, 15000, 'Secondary process did not exit');
  assert.equal(code, 0);
}

async function quit(instance, profile) {
  await secondary(profile, ['--quit']);
  await bounded(instance.child.exited, 10000, 'Original instance did not quit');
  instance.socket.close();
}

let first, other, restarted;
try {
  first = await connect(a);
  assert.equal(await first.visible(), false);
  await first.invoke('widget_action', { action: 'showMain' });
  assert.equal(await first.visible(), true);
  execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', `$pulseInstance = Get-Process -Id ${first.child.pid}; if (!$pulseInstance.CloseMainWindow()) { throw 'Main window did not accept close' }`], { windowsHide: true, stdio: 'pipe' });
  await waitFor(async () => !await first.visible(), 'actual close-to-tray');
  await secondary(a, ['--hidden']);
  assert.equal(await first.visible(), false, 'Login startup must not reopen an existing hidden window');
  await secondary({ ...a, data: a.data.toUpperCase() });
  await waitFor(() => first.visible(), 'shortcut reopens the original hidden window');
  assert.equal(first.child.exitCode, null);
  evidence.checks.reopenSameProfile = { passed: true, firstPidRemained: first.child.pid, caseAndCanonicalKey: true, hiddenStartupDidNotStealFocus: true, realCloseToTray: true };
  other = await connect(b);
  assert.notEqual(other.child.pid, first.child.pid);
  assert.equal(await other.visible(), false);
  evidence.checks.separateProfiles = { passed: true, firstPid: first.child.pid, secondPid: other.child.pid };
  await quit(first, a); first = null;
  assert.equal(other.child.exitCode, null, 'Quitting one profile must not stop the other');
  restarted = await connect(a);
  evidence.checks.quitAndRestart = { passed: true, otherProfileStillRunning: true, restartedPid: restarted.child.pid };
  await quit(restarted, a); restarted = null;
  await quit(other, b); other = null;
  const noExistingQuit = launch(a, ['--quit']);
  assert.equal(await bounded(noExistingQuit.exited, 15000, 'Quit without an existing instance did not finish'), 0);
  evidence.checks.quitWithoutInstance = true;
  writeFileSync(join(output, 'evidence.json'), JSON.stringify({ ...evidence, passed: true }, null, 2));
  console.log(JSON.stringify({ passed: true, evidence: join(output, 'evidence.json') }));
} catch (error) {
  writeFileSync(join(output, 'evidence.json'), JSON.stringify({ ...evidence, passed: false, failure: String(error) }, null, 2));
  throw error;
} finally {
  first?.socket.close(); other?.socket.close(); restarted?.socket.close();
  for (const child of owned) if (child.exitCode === null) child.kill();
}
