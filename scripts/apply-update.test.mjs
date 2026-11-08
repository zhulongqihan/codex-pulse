import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const fixtureRoot = join(root, '.local/apply-update-tests');
const windows = process.platform === 'win32';
const system = process.env.WINDIR || 'C:/Windows';
const powershell = join(system, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const compiler = join(system, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const helper = join(root, 'src-tauri/src/apply-update.ps1');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const alive = child => child.exitCode === null && child.signalCode === null;

async function until(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await delay(50);
  }
}

function compile(destination, version, fail, environment, reconnect = false) {
  const source = destination.replace(/\.exe$/i, '.cs');
  writeFileSync(source, `using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
internal static class UpdateFixture {
  static int Main(string[] args) {
    string data = Environment.GetEnvironmentVariable("PULSE_DATA_DIR");
    string mode = args.Contains("--mcp") ? "mcp" : args.Contains("initial") ? "initial" : args.Length > 0 ? "other" : "restarted";
    File.WriteAllText(Path.Combine(data, mode + ".pid"), Process.GetCurrentProcess().Id.ToString());
    if (mode == "restarted") {
      ${reconnect ? `var start = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, "--mcp");
      start.UseShellExecute = false; start.CreateNoWindow = true;
      var mcp = Process.Start(start);
      File.WriteAllText(Path.Combine(data, "reconnected-mcp.pid"), mcp.Id.ToString());
      Thread.Sleep(200);` : ''}
      ${fail ? 'return 2;' : `File.WriteAllText(Path.Combine(data, "updates", "healthy"), "${version}");`}
    }
    while (!File.Exists(Path.Combine(data, "close-" + mode))) Thread.Sleep(30);
    return 0;
  }
}`);
  const result = spawnSync(compiler, ['/nologo', '/target:winexe', '/optimize+', `/out:${destination}`, source], {
    encoding: 'utf8', windowsHide: true, env: environment, timeout: 20000,
  });
  assert.equal(result.status, 0, result.stdout || result.stderr);
}

function fixture(t, fail, reconnect = false) {
  mkdirSync(fixtureRoot, { recursive: true });
  const directory = mkdtempSync(join(fixtureRoot, 'fixture-'));
  const installation = join(directory, 'Portable 中文 app with spaces');
  const data = join(installation, 'data');
  const updates = join(data, 'updates');
  const temporary = join(directory, 'tmp');
  mkdirSync(updates, { recursive: true });
  mkdirSync(temporary);
  const environment = { ...process.env, PULSE_DATA_DIR: data, TEMP: temporary, TMP: temporary };
  const executable = join(installation, 'CodexPulse.exe');
  const packagePath = join(updates, 'pending.exe');
  compile(executable, '0.4.0', false, environment);
  compile(packagePath, '0.5.0', fail, environment, reconnect);
  const oldHash = hash(executable), newHash = hash(packagePath);
  const sentinel = join(data, 'preserve-user-data.txt');
  writeFileSync(sentinel, 'Retained synthetic settings and history.');
  writeFileSync(join(updates, 'pending.json'), '{}');
  const children = [];
  function start(file, args = [], env = environment) {
    const child = spawn(file, args, { windowsHide: true, env, cwd: installation, stdio: 'ignore' });
    children.push(child);
    return child;
  }
  t.after(async () => {
    for (const mode of ['initial', 'mcp', 'other', 'restarted']) writeFileSync(join(data, `close-${mode}`), 'exit');
    for (const child of children) if (alive(child)) child.kill();
    // The helper's restarted fixture also exits on the owned close marker.
    // Do not act on a PID from a file after a short-lived failure process exits.
    await delay(150);
    const target = realpathSync(directory), base = realpathSync(fixtureRoot), child = relative(base, target);
    assert(child && !isAbsolute(child) && !child.startsWith('..') && basename(target).startsWith('fixture-'));
    rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  return { directory, installation, data, updates, environment, executable, packagePath, oldHash, newHash, sentinel, children, start };
}

async function apply(f, oldProcess, tampered = false) {
  const config = join(f.updates, 'apply-update.json');
  writeFileSync(config, JSON.stringify({
    processId: oldProcess.pid, executable: f.executable, package: f.packagePath,
    dataDir: f.data, health: join(f.updates, 'healthy'), version: '0.5.0',
    sha256: tampered ? '0'.repeat(64) : f.newHash,
  }));
  const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', config], {
    windowsHide: true, env: f.environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  f.children.push(child);
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
  child.stdout.resume();
  const completion = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit({ code, stderr }));
  });
  writeFileSync(join(f.data, 'close-initial'), 'exit');
  const timeout = setTimeout(() => child.kill(), 55000);
  try { return await completion; } finally { clearTimeout(timeout); }
}

for (const scenario of ['success', 'held-mcp', 'startup-failure', 'startup-failure-with-mcp-reconnect', 'tampered-package', 'non-mcp-holder']) {
  test(`real update helper: ${scenario} preserves data and targets only its MCP image`, { skip: !windows, timeout: 65000 }, async t => {
    const f = fixture(t, scenario.startsWith('startup-failure'), scenario === 'startup-failure-with-mcp-reconnect');
    const oldProcess = f.start(f.executable, ['initial']);
    await until(() => existsSync(join(f.data, 'initial.pid')), 'Initial fixture did not start');
    let mcp, other, otherPath;
    if (['held-mcp', 'startup-failure', 'tampered-package'].includes(scenario)) {
      mcp = f.start(f.executable, ['--mcp']);
      await until(() => existsSync(join(f.data, 'mcp.pid')), 'MCP fixture did not start');
    }
    if (scenario === 'non-mcp-holder') {
      // The substring is inside a single quoted argument, not an MCP flag.
      other = f.start(f.executable, ['diagnostic --mcp']);
      await until(() => existsSync(join(f.data, 'other.pid')), 'Non-MCP fixture did not start');
    }
    if (scenario === 'held-mcp') {
      otherPath = join(f.directory, 'different-installation');
      mkdirSync(otherPath);
      mkdirSync(join(otherPath, 'updates'));
      const otherImage = join(otherPath, 'CodexPulse.exe');
      copyFileSync(f.executable, otherImage);
      other = f.start(otherImage, ['--mcp'], { ...f.environment, PULSE_DATA_DIR: otherPath });
      await until(() => existsSync(join(otherPath, 'mcp.pid')), 'Different-image fixture did not start');
    }
    const result = await apply(f, oldProcess, scenario === 'tampered-package');
    const succeeds = scenario === 'success' || scenario === 'held-mcp';
    assert.equal(result.code, succeeds ? 0 : 1, result.stderr);
    assert.equal(hash(f.executable), succeeds ? f.newHash : f.oldHash);
    assert.equal(readFileSync(f.sentinel, 'utf8'), 'Retained synthetic settings and history.');
    assert.equal(existsSync(join(f.updates, 'pending.json')), false);
    assert.equal(existsSync(join(f.updates, 'pending.failed.json')), !succeeds);
    assert.match(readFileSync(join(f.updates, 'result.txt'), 'utf8'), succeeds ? /installed successfully/ : /user data preserved/);
    if (mcp) {
      if (scenario === 'tampered-package') assert(alive(mcp), 'Rejected bytes must not stop a running MCP server');
      else await until(() => !alive(mcp), 'Own MCP image was not released');
    }
    if (other) assert(alive(other), 'A different image or non-MCP mode must remain running');
    if (otherPath) writeFileSync(join(otherPath, 'close-mcp'), 'exit');
    await until(() => existsSync(join(f.data, 'restarted.pid')), 'Updated or restored app did not restart');
    if (scenario === 'startup-failure-with-mcp-reconnect') {
      const reconnectedId = Number(readFileSync(join(f.data, 'reconnected-mcp.pid'), 'utf8'));
      assert.throws(() => process.kill(reconnectedId, 0), { code: 'ESRCH' }, 'Reconnected MCP must release the image before rollback');
    }
  });
}
