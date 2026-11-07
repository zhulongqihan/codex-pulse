import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { createPulseHome } from '../e2e/fixtures/pulse-home.ts';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.PULSE_MAINTENANCE_OUTPUT || join(root, '.local/native-maintenance', `run-${Date.now()}`));
assert(output.toLowerCase().startsWith('f:'), 'Maintenance artifacts must remain on F:');
mkdirSync(output, { recursive: true });
const source = resolve(process.env.CARGO_TARGET_DIR || join(root, 'src-tauri/target'), 'release/codex-pulse.exe');
const executable = join(output, 'Codex Pulse maintenance.exe');
copyFileSync(source, executable);
const fixture = createPulseHome(output);
const powershell = join(process.env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceFiles = () => Object.fromEntries(['sessions', 'archived_sessions'].flatMap(folder => readdirSync(join(fixture.home, folder)).map(name => [join(folder, name), sha(join(fixture.home, folder, name))])));
const originalSources = sourceFiles();
const evidence = { mode: 'production executable; synthetic logs; PULSE_OFFLINE=1', executable, sourceSha256: sha(source), checks: {} };

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function connect({ hidden = false } = {}) {
  const port = await freePort();
  const child = spawn(executable, hidden ? ['--hidden'] : [], { cwd: output, windowsHide: true, stdio: 'ignore', env: { ...process.env, PULSE_DATA_DIR: fixture.data, PULSE_CODEX_HOME: fixture.home, PULSE_OFFLINE: '1', WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } });
  const exited = new Promise(resolve => child.once('exit', resolve));
  let target;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find(t => t.type === 'page' && t.url.includes('tauri.localhost') && !t.url.includes('#'));
      if (target) break;
    } catch {}
    await delay(100);
  }
  if (!target) { child.kill(); throw new Error('Native maintenance WebView did not become available'); }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20_000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if (await evaluate(expression)) return; } catch {}
      await delay(100);
    }
    throw new Error(`Native UI condition did not settle: ${expression}`);
  }
  await waitFor('!!document.querySelector("[data-testid=dashboard-nav-tab]")');
  return { child, invoke, send, evaluate, waitFor, async screenshot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(output, name), Buffer.from(result.data, 'base64'));
  }, async close() {
    socket.send(JSON.stringify({ id: ++sequence, method: 'Runtime.evaluate', params: { expression: 'void window.__TAURI_INTERNALS__.invoke("widget_action",{action:"quit"})' } }));
    await Promise.race([exited, delay(10000).then(() => { throw new Error('Application did not quit'); })]);
    socket.close();
  } };
}

// Snapshot only this application's Run/StartupApproved values. Restore exact kinds and bytes,
// including the absence of a value. No unrelated startup entry is read or modified.
const registryHelper = join(output, 'registry-fixture.ps1');
const registrySnapshot = join(output, 'startup-before.json');
writeFileSync(registryHelper, String.raw`param([string]$Mode,[string]$Name,[string]$Snapshot)
$ErrorActionPreference='Stop'
$runPath='Software\Microsoft\Windows\CurrentVersion\Run'
$approvedPath='Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
function Read-PulseEntries {
  $rows=@()
  foreach($hive in @('CurrentUser','LocalMachine')) {
    $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hive,[Microsoft.Win32.RegistryView]::Registry64)
    foreach($path in @($runPath,$approvedPath)) {
      $key=$base.OpenSubKey($path,$false)
      $exists=$null -ne $key -and $key.GetValueNames().Contains($Name)
      $kind=$null; $value=$null
      if($exists) {
        $kind=$key.GetValueKind($Name).ToString()
        $value=$key.GetValue($Name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if($value -is [byte[]]) { $value=[Convert]::ToBase64String($value) }
      }
      $rows+=@{hive=$hive;path=$path;exists=$exists;kind=$kind;value=$value}
      if($key) {$key.Dispose()}
    }
    $base.Dispose()
  }
  return $rows
}
if($Mode -eq 'snapshot') {
  [IO.File]::WriteAllText($Snapshot,(ConvertTo-Json -InputObject @(Read-PulseEntries) -Depth 8),[Text.UTF8Encoding]::new($false))
  Write-Output '{"saved":true}'
} elseif($Mode -eq 'inspect') {
  $entries=@(Read-PulseEntries)
  $registered=@($entries | Where-Object {$_.path -eq $runPath -and $_.exists})
  @{registered=$registered.Count;quoted=(@($registered | Where-Object {$_.value -notmatch '^".+" --hidden$'}).Count -eq 0)} | ConvertTo-Json -Compress
} elseif($Mode -eq 'simulate-disabled') {
  $registered=Read-PulseEntries | Where-Object {$_.path -eq $runPath -and $_.exists} | Select-Object -First 1
  if(!$registered) {throw 'The test application must be registered before testing Task Manager disabled state'}
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]([string]$registered.hive),[Microsoft.Win32.RegistryView]::Registry64)
  $key=$base.CreateSubKey($approvedPath)
  $key.SetValue($Name,[byte[]]@(3,0,0,0,1,0,0,0,0,0,0,0),[Microsoft.Win32.RegistryValueKind]::Binary)
  $key.Dispose(); $base.Dispose()
  Write-Output '{"simulatedDisabled":true}'
} elseif($Mode -eq 'restore') {
  $saved=Get-Content -LiteralPath $Snapshot -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach($entry in $saved) {
    $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]([string]$entry.hive),[Microsoft.Win32.RegistryView]::Registry64)
    if($entry.exists) {
      $key=$base.CreateSubKey($entry.path)
      $value=$entry.value
      if($entry.kind -eq 'Binary') {$value=[Convert]::FromBase64String($value)}
      $key.SetValue($Name,$value,[Microsoft.Win32.RegistryValueKind]([string]$entry.kind)); $key.Dispose()
    } else {
      $read=$base.OpenSubKey($entry.path,$false)
      $present=$null -ne $read -and $read.GetValueNames().Contains($Name)
      if($read) {$read.Dispose()}
      if($present) { $key=$base.OpenSubKey($entry.path,$true); $key.DeleteValue($Name,$false); $key.Dispose() }
    }
    $base.Dispose()
  }
  $actual=@(Read-PulseEntries)
  for($i=0;$i -lt $saved.Count;$i++) { foreach($field in @('hive','path','exists','kind','value')) { if($saved[$i].$field -cne $actual[$i].$field) { throw "Startup restoration mismatch: $field" } } }
  Write-Output '{"restored":true}'
} else { throw 'Unknown registry fixture action' }
`);
const registry = (mode, name) => JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', registryHelper, '-Mode', mode, '-Name', name, '-Snapshot', registrySnapshot], { windowsHide: true, encoding: 'utf8' }));

let app;
let startupName;
let startupRestored = false;
try {
  app = await connect();
  await app.invoke('scan_usage');
  const overview = await app.invoke('fetch_overview', { range: '30d' });
  assert.equal(overview.totals.totalTokens, 540690);
  writeFileSync(join(output, 'overview.json'), JSON.stringify(overview));
  const diagnostics = await app.invoke('fetch_usage_diagnostics');
  assert.equal(diagnostics.status, 'ready'); assert.equal(diagnostics.filesFound, 18);
  assert.equal(diagnostics.codexHome, fixture.home);
  evidence.checks.diagnostics = diagnostics;

  const xlsx = join(output, 'synthetic-export.xlsx');
  const markdown = join(output, 'synthetic-export.md');
  await app.invoke('export_usage', { range: '30d', format: 'xlsx', path: xlsx });
  await app.invoke('export_usage', { range: '30d', format: 'markdown', path: markdown });
  const text = readFileSync(markdown, 'utf8');
  assert(text.includes('| Total Tokens | 540690 |'));
  assert(text.includes('F:/Demo/Studio/Atlas') && text.includes('F:/Demo/Research/Atlas'));
  assert.equal(text.split('\n').filter(line => /^\| \d{4}-\d{2}-\d{2} \|/.test(line)).length, 30);
  const workbookCheck = String.raw`import sys,json,zipfile,xml.etree.ElementTree as E,math
expected=json.load(open(sys.argv[2],encoding='utf8'))
with zipfile.ZipFile(sys.argv[1]) as z:
 ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 shared=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
 def cells(index):
  result={}
  for c in E.fromstring(z.read('xl/worksheets/sheet%d.xml'%index)).findall('.//s:c',ns):
   v=c.find('s:v',ns)
   if v is not None: result[c.attrib['r']]=shared[int(v.text)] if c.attrib.get('t')=='s' else float(v.text)
  return result
 names=[s.attrib['name'] for s in E.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',ns)]
 assert names==['Summary','Daily Usage','Model Usage','Project Usage'],names
 summary,daily,models,projects=[cells(i) for i in range(1,5)]
 assert summary['B5']==expected['totals']['totalTokens']==540690
 assert summary['B6']==expected['totals']['inputTokens']
 assert summary['B7']==expected['totals']['cachedInputTokens']
 assert summary['B8']==expected['totals']['outputTokens']
 assert math.isclose(summary['B9'],expected['totals']['costUSD'],rel_tol=1e-9)
 for table,column in [(daily,'B'),(models,'B'),(projects,'D')]:
  assert sum(value for cell,value in table.items() if cell.startswith(column) and isinstance(value,float))==540690
 assert len([cell for cell in daily if cell.startswith('A')])-1==30
 assert 'F:/Demo/Studio/Atlas' in projects.values() and 'F:/Demo/Research/Atlas' in projects.values()
 print(json.dumps({'sheets':names,'dailyRows':30,'totalTokens':540690,'matchesNativeOverview':True}))
`;
  evidence.checks.export = JSON.parse(execFileSync('python', ['-B', '-c', workbookCheck, xlsx, join(output, 'overview.json')], { windowsHide: true, encoding: 'utf8' }));

  await app.evaluate('localStorage.setItem("show_logs_tab","true"); location.reload(); true');
  await app.waitFor('!!document.querySelector("[data-testid=logs-nav-tab]")');
  await app.evaluate('document.querySelector("[data-testid=logs-nav-tab]").click(); true');
  await delay(250);
  const marker = `Pulse synthetic maintenance ${Date.now()}`;
  await app.invoke('plugin:log|log', { level: 3, message: marker, location: 'synthetic-maintenance', file: null, line: null, keyValues: null });
  await app.waitFor(`document.querySelector("main").innerText.includes(${JSON.stringify(marker)})`);
  const logText = await app.evaluate('document.querySelector("main").innerText');
  assert(/\d{2}:\d{2}:\d{2}\.\d{3}/.test(logText), 'Logs must contain milliseconds');
  for (let index = 0; index < 80; index++) await app.invoke('plugin:log|log', { level: 3, message: `Synthetic scroll ${index}`, location: 'synthetic-maintenance', file: null, line: null, keyValues: null });
  await delay(100);
  const scroll = await app.evaluate('(()=>{const el=document.querySelector("main .overflow-y-auto.font-mono");return el?{top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight}:null})()');
  assert(scroll && scroll.top > 0 && Math.abs(scroll.top + scroll.height - scroll.total) < 3);
  await app.screenshot('logs-before-clear.png');
  assert(await app.evaluate('(()=>{const button=[...document.querySelectorAll("main button")].find(b=>/清空|清除|Clear/.test(b.textContent));button?.click();return !!button})()'));
  await app.waitFor(`!document.querySelector("main").innerText.includes(${JSON.stringify(marker)})`);
  evidence.checks.logs = { millisecondTimestamp: true, liveNativeDelivery: true, autoscroll: scroll, clearedDisplay: true, copiedClipboard: false };

  await app.evaluate('document.querySelector("[data-testid=settings-nav-tab]").click();true');
  await delay(100);
  await app.evaluate('[...document.querySelectorAll("[role=tab]")].find(e=>e.textContent.trim()==="数据来源")?.click();true');
  await delay(200);
  await app.evaluate('[...document.querySelectorAll("main button")].find(e=>e.textContent.trim()==="诊断")?.click();true');
  await app.waitFor(`document.querySelector("main").innerText.includes(${JSON.stringify(fixture.home)})`);
  await app.screenshot('diagnostics.png');

  startupName = await app.invoke('plugin:app|name');
  registry('snapshot', startupName);
  const initial = await app.invoke('plugin:autostart|is_enabled');
  try {
    await app.invoke('plugin:autostart|enable');
    assert.equal(await app.invoke('plugin:autostart|is_enabled'), true);
    const registration = registry('inspect', startupName);
    assert(registration.registered > 0);
    registry('simulate-disabled', startupName);
    assert.equal(await app.invoke('plugin:autostart|is_enabled'), false);
    await app.invoke('plugin:autostart|enable');
    assert.equal(await app.invoke('plugin:autostart|is_enabled'), true);
    await app.invoke('plugin:autostart|disable');
    assert.equal(await app.invoke('plugin:autostart|is_enabled'), false);
    evidence.checks.autostart = { initialEnabled: initial, enabled: true, taskManagerDisabledObserved: true, explicitReenable: true, disabled: true, registration };
    assert.equal(registration.quoted, true, 'Login startup executable paths must be quoted');
  } finally {
    registry('restore', startupName);
    startupRestored = true;
    assert.equal(await app.invoke('plugin:autostart|is_enabled'), initial);
    if (evidence.checks.autostart) evidence.checks.autostart.restoredExactRegistryState = true;
  }
  await app.close(); app = null;

  const database = join(fixture.data, 'codex-pulse.db');
  assert(database.startsWith(output));
  copyFileSync(database, join(output, 'derived-cache-before.db'));
  writeFileSync(database, 'Pulse synthetic deliberately corrupt derived cache. Source logs must remain unchanged.');
  app = await connect();
  const corrupt = await app.invoke('fetch_usage_diagnostics');
  assert.equal(corrupt.status, 'databaseError');
  const backupDirectory = await app.invoke('schedule_cache_rebuild');
  assert(backupDirectory.startsWith(fixture.data));
  assert(readFileSync(database, 'utf8').startsWith('Pulse synthetic deliberately corrupt'));
  await app.screenshot('corrupt-cache-before-restart.png');
  await app.close(); app = null;
  app = await connect();
  await app.invoke('scan_usage');
  const recovered = await app.invoke('fetch_overview', { range: '30d' });
  assert.deepEqual(recovered.totals, overview.totals);
  assert.equal((await app.invoke('fetch_usage_diagnostics')).status, 'ready');
  const archived = readdirSync(backupDirectory).map(name => join(backupDirectory, name, 'codex-pulse.db')).find(existsSync);
  assert(archived && readFileSync(archived, 'utf8').startsWith('Pulse synthetic deliberately corrupt'));
  assert(!existsSync(join(fixture.data, 'codex-pulse.rebuild-on-start')));
  assert.deepEqual(sourceFiles(), originalSources);
  evidence.checks.corruptCache = { observedDatabaseError: true, scheduledBeforeRestart: true, corruptBytesArchived: true, reconstructedTokens: recovered.totals.totalTokens, sourceFilesUnchanged: Object.keys(originalSources).length };
  await app.screenshot('recovered-cache.png');
  await app.close(); app = null;

  app = await connect({ hidden: true });
  assert.equal(await app.invoke('plugin:window|is_visible', { label: 'main' }), false);
  await app.invoke('widget_action', { action: 'showMain' });
  assert.equal(await app.invoke('plugin:window|is_visible', { label: 'main' }), true);
  evidence.checks.hiddenStartup = { mainInitiallyHidden: true, restoredThroughTrayAction: true };
  await app.close(); app = null;

  const logs = readdirSync(join(fixture.data, 'logs')).filter(name => name.endsWith('.log'));
  assert(logs.some(name => readFileSync(join(fixture.data, 'logs', name), 'utf8').includes(marker)));
  evidence.checks.logs.persistedUnderPortableData = true;
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.error = String(error?.stack || error);
  throw error;
} finally {
  if (startupName && !startupRestored && existsSync(registrySnapshot)) {
    try { registry('restore', startupName); startupRestored = true; } catch (error) { evidence.startupRestoreError = String(error); }
  }
  if (app) { try { await app.close(); } catch { app.child.kill(); } }
  evidence.startupRestored = startupRestored;
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: evidence.passed, startupRestored, evidence: join(output, 'evidence.json'), autostart: evidence.checks.autostart }));
}
