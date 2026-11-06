import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

function exists(file) { try { return fs.statSync(file).isFile(); } catch { return false; } }

function findOnPath(name) {
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    for (const extension of process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']) {
      const file = path.join(entry, name + extension);
      if (exists(file)) return file;
    }
  }
  return null;
}

function commandOutput(file, args, timeoutMs = 8000) {
  return new Promise(resolve => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let output = '';
    const timer = setTimeout(() => { child.kill(); resolve(null); }, timeoutMs);
    child.stdout.on('data', chunk => { if (output.length < 65536) output += chunk.toString(); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('exit', code => { clearTimeout(timer); resolve(code === 0 ? output.trim() : null); });
  });
}

export async function discoverCodexExecutable(selected) {
  if (selected && exists(selected)) return selected;
  const configured = process.env.CODEX_EXECUTABLE;
  if (configured && exists(configured)) return configured;
  if (process.platform === 'win32') {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    // Literal PowerShell; no user-provided paths or shell fragments are interpolated.
    const location = await commandOutput(powershell, ['-NoProfile', '-NonInteractive', '-Command', "(Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation"]);
    if (location) {
      const binary = path.join(location, 'app', 'resources', 'codex.exe');
      if (exists(binary)) return binary;
    }
  } else if (process.platform === 'darwin') {
    for (const application of ['/Applications/Codex.app', '/Applications/ChatGPT.app', path.join(os.homedir(), 'Applications/Codex.app')]) {
      for (const name of ['codex', 'codex-cli']) { const binary = path.join(application, 'Contents/Resources', name); if (exists(binary)) return binary; }
    }
  }
  return findOnPath('codex');
}

function finite(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function percentage(value) { const n = finite(value); return n == null ? null : Math.min(100, Math.max(0, n)); }
function resetDate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeQuota(limitsResult, usageResult) {
  const byId = limitsResult?.rateLimitsByLimitId;
  const bucket = byId?.codex || limitsResult?.rateLimits || (byId && Object.values(byId)[0]);
  const windows = [];
  if (bucket) {
    for (const [position, raw] of Object.entries({ primary: bucket.primary, secondary: bucket.secondary })) {
      if (!raw || percentage(raw.usedPercent) == null) continue;
      const minutes = finite(raw.windowDurationMins);
      const key = minutes != null && minutes >= 7 * 24 * 60 ? 'weekly' : minutes === 300 ? 'session' : position;
      windows.push({ key, name: key === 'weekly' ? 'Weekly' : key === 'session' ? '5-hour' : bucket.limitName || 'Usage window', usedPercent: percentage(raw.usedPercent), remainingPercent: 100 - percentage(raw.usedPercent), resetsAt: resetDate(raw.resetsAt), windowMinutes: minutes });
    }
  }
  const selected = windows.find(w => w.key === 'weekly') || windows[0];
  const daily = Array.isArray(usageResult?.dailyUsageBuckets) ? usageResult.dailyUsageBuckets.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.startDate || '') && finite(row.tokens) != null && row.tokens >= 0).map(row => ({ date: row.startDate, totalTokens: row.tokens })) : [];
  return {
    available: Boolean(selected), remainingPercent: selected?.remainingPercent ?? null, usedPercent: selected?.usedPercent ?? null,
    resetsAt: selected?.resetsAt ?? null, plan: bucket?.planType || null, windows, source: 'codex-app-server',
    officialDaily: daily, lifetimeTokens: finite(usageResult?.summary?.lifetimeTokens),
    currentStreakDays: finite(usageResult?.summary?.currentStreakDays),
  };
}

/** Official CLI owns authentication. This module never reads auth.json. */
export function createQuotaClient({ codexExecutable, dataDir, timeoutMs = 25000 } = {}) {
  let active = null;
  let closed = false;
  let requestCounter = 0;
  let inFlight = null;

  async function read() {
    const executable = await discoverCodexExecutable(codexExecutable);
    if (!executable) return { ok: false, errorCode: 'CODEX_NOT_FOUND' };
    if (closed) return { ok: false, errorCode: 'CLOSED' };
    return new Promise(resolve => {
      let child;
      const environment = { ...process.env };
      if (dataDir) {
        const temporary = path.join(dataDir, 'temp');
        fs.mkdirSync(temporary, { recursive: true });
        environment.TEMP = temporary; environment.TMP = temporary; environment.TMPDIR = temporary;
      }
      // .cmd is an explicit user/PATH wrapper. Quote as one Windows command and
      // reject shell metacharacters; native executables never go through a shell.
      if (process.platform === 'win32' && /\.cmd$/i.test(executable)) {
        if (/["\r\n&|<>^%!]/.test(executable)) return resolve({ ok: false, errorCode: 'CODEX_EXECUTABLE_INVALID' });
        child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${executable}" app-server"`], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, windowsVerbatimArguments: true, env: environment });
      } else child = spawn(executable, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: environment });
      active = child;
      const pending = new Map();
      let finished = false;
      let initialized = false;
      let limits = null;
      let usage = null;
      let responseCount = 0;
      let authFailure = false;
      const lines = readline.createInterface({ input: child.stdout });
      const timer = setTimeout(() => finish({ ok: false, errorCode: 'QUOTA_TIMEOUT' }), timeoutMs);
      function finish(result) {
        if (finished) return;
        finished = true;
        clearTimeout(timer); lines.close(); pending.clear();
        child.stdin.end();
        // Terminate only the exact child spawned by this request, never other Codex clients.
        if (child.exitCode == null) child.kill();
        if (active === child) active = null;
        resolve(result);
      }
      function send(method, params, type) {
        const id = ++requestCounter;
        pending.set(id, type);
        child.stdin.write(JSON.stringify({ id, method, ...(params ? { params } : {}) }) + '\n');
      }
      function maybeFinish() {
        if (responseCount >= 2) finish(limits ? { ok: true, quota: normalizeQuota(limits, usage), checkedAt: new Date().toISOString() } : { ok: false, errorCode: authFailure ? 'AUTH_REQUIRED' : 'QUOTA_UNAVAILABLE' });
      }
      child.stdin.on('error', () => finish({ ok: false, errorCode: 'CODEX_UNAVAILABLE' }));
      child.stderr.on('data', () => { /* Do not log arbitrary CLI diagnostics or authentication material. */ });
      lines.on('line', line => {
        if (line.length > 4 * 1024 * 1024) return;
        let message;
        try { message = JSON.parse(line); } catch { return; }
        const type = pending.get(message.id);
        if (!type) return;
        pending.delete(message.id);
        if (message.error) {
          const safeCode = message.error.code;
          if (safeCode === -32001 || /auth|sign.?in|unauthoriz/i.test(String(message.error.message || ''))) authFailure = true;
          if (type === 'initialize') return finish({ ok: false, errorCode: authFailure ? 'AUTH_REQUIRED' : 'CODEX_INCOMPATIBLE' });
        }
        if (type === 'initialize') {
          initialized = true;
          child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
          send('account/rateLimits/read', undefined, 'limits');
          send('account/usage/read', undefined, 'usage');
          return;
        }
        if (type === 'limits' && message.result) limits = message.result;
        if (type === 'usage' && message.result) usage = message.result;
        responseCount++; maybeFinish();
      });
      child.on('error', () => finish({ ok: false, errorCode: 'CODEX_UNAVAILABLE' }));
      child.on('exit', () => { if (!finished) finish({ ok: false, errorCode: initialized ? 'CODEX_DISCONNECTED' : 'CODEX_UNAVAILABLE' }); });
      send('initialize', { clientInfo: { name: 'codex_pulse', title: 'Codex Pulse', version: '0.2.0' }, capabilities: { experimentalApi: true } }, 'initialize');
    });
  }
  return {
    read() { if (closed) return Promise.resolve({ ok: false, errorCode: 'CLOSED' }); if (!inFlight) inFlight = read().finally(() => { inFlight = null; }); return inFlight; },
    close() { closed = true; if (active) { active.stdin.end(); active.kill(); active = null; } },
  };
}
