// Private, real-data verification of an already packaged application.
// Run only after packaging. No screenshots, traces, account details or exact
// usage values are recorded, and the existing independent cache is required.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.resolve(process.env.PULSE_EXECUTABLE || path.join(process.cwd(), '..', 'CodexPulseApp', 'CodexPulse.exe'));
const dataDir = path.resolve(process.env.PULSE_DATA_DIR || path.join(path.dirname(executable), 'data'));
const privateDir = path.join(root, '.local');
const reportFile = path.join(privateDir, 'installed-smoke.json');
const temporaryDir = path.join(privateDir, 'temp');
fs.mkdirSync(temporaryDir, { recursive: true });
process.env.TEMP = temporaryDir;
process.env.TMP = temporaryDir;
process.env.TMPDIR = temporaryDir;

const report = { passed: false, checks: {}, statisticsFiles: 0, timingsMs: {}, warningTypes: [] };
const warningTypes = new Set();
const started = performance.now();
let application;
let rootIdentity;
let page;
const owned = new Map();
const rendererFailures = new Set();
const fields = ['inputTokens', 'cachedTokens', 'outputTokens', 'reasoningTokens', 'totalTokens'];
const elapsed = () => Math.round(performance.now() - started);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const identity = row => `${row.id}:${row.born}`;

class SmokeFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function requireCheck(name, value) {
  report.checks[name] = Boolean(value);
  if (!value) throw new SmokeFailure(name.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase());
}

// Query metadata only. Never request command lines, credentials or process
// environment. All output stays in memory and is absent from the report.
async function powershellJson(script, extraEnv = {}) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = [];
    const deadline = setTimeout(() => { child.kill(); reject(new SmokeFailure('PROCESS_METADATA_TIMEOUT')); }, 12000);
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.resume();
    child.on('error', () => { clearTimeout(deadline); reject(new SmokeFailure('PROCESS_METADATA_UNAVAILABLE')); });
    child.on('close', code => {
      clearTimeout(deadline);
      if (code !== 0) return reject(new SmokeFailure('PROCESS_METADATA_UNAVAILABLE'));
      try { const rows = JSON.parse(Buffer.concat(output).toString('utf8').replace(/^\uFEFF/, '') || '[]'); resolve(Array.isArray(rows) ? rows : [rows]); }
      catch { reject(new SmokeFailure('PROCESS_METADATA_UNAVAILABLE')); }
    });
  });
}

async function existingApplication() {
  const rows = await powershellJson(`
    $ErrorActionPreference = 'Stop'
    $rows = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $env:PULSE_SMOKE_EXE } | ForEach-Object { @{ id = [int]$_.ProcessId } })
    ConvertTo-Json -InputObject $rows -Compress
  `, { PULSE_SMOKE_EXE: executable });
  return rows.length > 0;
}

async function processTable() {
  return powershellJson(`
    $ErrorActionPreference = 'Stop'
    $rows = @(Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { @{ id = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; name = [string]$_.Name; born = $_.CreationDate.ToUniversalTime().ToString('o') } })
    ConvertTo-Json -InputObject $rows -Compress
  `);
}

async function observeOwnedProcesses() {
  const table = await processTable();
  // Playwright disposes its process bridge during close(); retain the captured
  // identity instead of asking a closed ElectronApplication for its process.
  const applicationPid = rootIdentity?.id || application?.process()?.pid;
  if (!rootIdentity && applicationPid) rootIdentity = table.find(row => row.id === applicationPid);
  if (rootIdentity) owned.set(identity(rootIdentity), rootIdentity);
  // Revalidate both PID and creation time before following or terminating any
  // process. PID reuse must never turn another Codex session into our child.
  const valid = table.filter(row => owned.has(identity(row)));
  const parents = new Set(valid.map(row => row.id));
  let advanced;
  do {
    advanced = false;
    for (const row of table) if (parents.has(row.parent) && !parents.has(row.id) && (!rootIdentity || row.born >= rootIdentity.born)) {
      owned.set(identity(row), row); parents.add(row.id); advanced = true;
    }
  } while (advanced);
  return table.filter(row => owned.has(identity(row)));
}

function recordWarnings(snapshot) {
  for (const message of snapshot.status?.warnings || []) {
    const type = /oversized/i.test(message) ? 'OVERSIZED_RECORD'
      : /without a matching compaction/i.test(message) ? 'UNPAIRED_COMPACTION'
      : /ambiguous.*compaction/i.test(message) ? 'AMBIGUOUS_COMPACTION'
      : /baseline.*timestamp|timestamps.*boundary/i.test(message) ? 'SUBAGENT_TIMESTAMP_BASELINE'
      : /no recorded model/i.test(message) ? 'UNKNOWN_MODEL'
      : /counter reset/i.test(message) ? 'CUMULATIVE_COUNTER_RESET'
      : /malformed/i.test(message) ? 'MALFORMED_METADATA'
      : /decode/i.test(message) ? 'SOURCE_DECODE_FAILURE'
      : /imported.*cache/i.test(message) ? 'IMPORTED_CACHE_PENDING_SCAN'
      : /quota|account limits/i.test(message) ? 'OFFICIAL_QUOTA_UNAVAILABLE'
      : /cache.*saved/i.test(message) ? 'PRIVATE_CACHE_WRITE_FAILURE'
      : 'OTHER_STATISTICS_WARNING';
    warningTypes.add(type);
  }
  if (snapshot.status?.quotaErrorCode) warningTypes.add('OFFICIAL_QUOTA_UNAVAILABLE');
}

function matchingSums(rows, aggregate) {
  return fields.every(field => rows.reduce((sum, row) => sum + row[field], 0) === aggregate[field]);
}
function validTokens(row) {
  return row && fields.every(field => Number.isSafeInteger(row[field]) && row[field] >= 0)
    && row.cachedTokens <= row.inputTokens && row.reasoningTokens <= row.outputTokens;
}
function consistent(snapshot) {
  const daily = snapshot.daily || [];
  return daily.length > 0 && validTokens(snapshot.totals)
    && [daily, snapshot.models, snapshot.projects, snapshot.sessions].every(rows => Array.isArray(rows) && rows.every(validTokens) && matchingSums(rows, snapshot.totals))
    && daily.every(day => Array.isArray(day.models) && matchingSums(day.models, day)
      && Array.isArray(day.projects) && matchingSums(day.projects, day)
      && Array.isArray(day.hourly) && day.hourly.every(hour => validTokens(hour) && Number.isInteger(hour.hour) && hour.hour >= 0 && hour.hour <= 23)
      && new Set(day.hourly.map(hour => hour.hour)).size === day.hourly.length && matchingSums(day.hourly, day))
    && snapshot.totals.sessions === new Set(snapshot.sessions.map(row => row.id)).size
    && snapshot.totals.activeDays === daily.length;
}

async function readSnapshot() {
  const value = await page.evaluate(() => window.pulse.getSnapshot());
  recordWarnings(value);
  return value;
}

async function closeOwnedApplication() {
  const shutdownStarted = performance.now();
  if (!application) return;
  try { await observeOwnedProcesses(); } catch { warningTypes.add('PROCESS_METADATA_UNAVAILABLE'); }
  // close() performs a real app quit rather than the dashboard's hide action.
  let deadline;
  try {
    await Promise.race([
      application.close(),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new SmokeFailure('APP_CLOSE_TIMEOUT')), 12000); }),
    ]);
  } catch { warningTypes.add('APP_CLOSE_TIMEOUT'); }
  finally { clearTimeout(deadline); }

  let remaining = [];
  let inspected = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { remaining = await observeOwnedProcesses(); inspected = true; }
    catch { inspected = false; warningTypes.add('PROCESS_METADATA_UNAVAILABLE'); break; }
    if (!remaining.length) break;
    await sleep(300);
  }
  report.checks.appExitedNaturally = inspected && !remaining.some(row => rootIdentity && identity(row) === identity(rootIdentity));
  report.checks.ownedHelpersExitedNaturally = inspected && !remaining.some(row => /^codex(?:\.exe)?$/i.test(row.name));
  if (remaining.length) {
    warningTypes.add('OWNED_PROCESS_REQUIRED_CLEANUP');
    // Exact, revalidated descendants only. Never kill processes by name.
    for (const row of remaining.reverse()) {
      try {
        const fresh = (await processTable()).find(item => identity(item) === identity(row));
        if (fresh && owned.has(identity(fresh))) process.kill(fresh.id);
      } catch { /* The process may have exited between the metadata read and kill. */ }
    }
    await sleep(300);
    try { remaining = await observeOwnedProcesses(); inspected = true; } catch { inspected = false; warningTypes.add('PROCESS_METADATA_UNAVAILABLE'); }
  }
  report.checks.cleanupProcessMetadataVerified = inspected;
  report.checks.noOwnedProcessLeftBehind = inspected && remaining.length === 0;
  report.timingsMs.shutdown = Math.round(performance.now() - shutdownStarted);
}

try {
  requireCheck('windowsProcessMonitor', process.platform === 'win32');
  requireCheck('executablePresent', fs.existsSync(executable));
  const snapshotFile = path.join(dataDir, 'statistics', 'usage-snapshot-v1.json');
  const fileCache = path.join(dataDir, 'statistics', 'usage-files-v1.json');
  requireCheck('independentWarmCachePresent', fs.existsSync(snapshotFile) && fs.existsSync(fileCache));
  const previous = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  requireCheck('independentWarmCacheUsable', previous.version === 1 && previous.data?.origin === 'pulse-scan' && previous.data.daily?.length > 0);
  // Validate the private cache rather than discovering corruption by starting
  // an accidental cold scan of the original multi-gigabyte log collection.
  const savedFiles = JSON.parse(fs.readFileSync(fileCache, 'utf8'));
  requireCheck('fileFingerprintCacheUsable', savedFiles.parserVersion === 1 && savedFiles.files && Object.keys(savedFiles.files).length > 0);
  requireCheck('exclusiveLaunch', !(await existingApplication()));

  const env = { ...process.env, PULSE_DATA_DIR: dataDir, TEMP: temporaryDir, TMP: temporaryDir, TMPDIR: temporaryDir };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PULSE_DEV_URL;
  delete env.DEBUG;
  const { _electron } = await import('@playwright/test');
  const launchStarted = performance.now();
  application = await _electron.launch({ executablePath: executable, args: ['--capture'], cwd: path.dirname(executable), env, artifactsDir: path.join(privateDir, 'installed-smoke-artifacts'), timeout: 30000 });
  await observeOwnedProcesses();
  requireCheck('ownedProcessRootObserved', Boolean(rootIdentity));
  page = await application.firstWindow();
  application.on('window', window => window.on('pageerror', () => rendererFailures.add(true)));
  page.on('pageerror', () => rendererFailures.add(true));
  await page.waitForFunction(() => typeof window.pulse?.getSnapshot === 'function', undefined, { timeout: 20000 });
  requireCheck('preloadReady', true);
  await page.waitForSelector('.app .app-header nav button[data-route]', { timeout: 20000 });
  requireCheck('liveRendererReady', await page.locator('.app-header nav button[data-route]').count() === 6);
  const preferences = await page.evaluate(() => window.pulse.getSettings());
  requireCheck('approvedNativeSkinLoaded', ['clear', 'meter'].includes(preferences.skinId));
  report.timingsMs.launchToPreload = Math.round(performance.now() - launchStarted);
  let snapshot = await readSnapshot();
  requireCheck('realCacheLoaded', snapshot.mode === 'live' && snapshot.source?.origin === 'pulse-scan' && snapshot.source.logsAvailable && snapshot.source.sessionFiles > 0);
  requireCheck('noDemoSource', snapshot.mode !== 'demo' && snapshot.source.localOnly === true && snapshot.today?.source === 'local-logs');
  report.timingsMs.cacheReady = elapsed();

  const scanDeadline = performance.now() + 45000;
  while ((snapshot.status.scanning || !snapshot.status.scanAt || snapshot.status.scanAt === previous.data.scannedAt) && performance.now() < scanDeadline) {
    await sleep(300); snapshot = await readSnapshot();
  }
  requireCheck('incrementalWorkerCompleted', !snapshot.status.scanning && !snapshot.status.logErrorCode && snapshot.status.scanAt !== previous.data.scannedAt);
  report.timingsMs.incrementalRefreshCompleted = elapsed();
  report.statisticsFiles = snapshot.source.sessionFiles;
  requireCheck('allAggregationDimensionsAgree', consistent(snapshot));
  const today = snapshot.daily.find(row => row.date === snapshot.today.date);
  requireCheck('todayAgreesWithDaily', validTokens(snapshot.today) && (today ? fields.every(field => today[field] === snapshot.today[field]) : fields.every(field => snapshot.today[field] === 0)));

  const selected = snapshot.daily[Math.floor(snapshot.daily.length / 2)];
  const selectedSnapshot = await page.evaluate(date => window.pulse.getSnapshot({ from: date, to: date }), selected.date);
  requireCheck('selectedDayRangeAgrees', consistent(selectedSnapshot) && selectedSnapshot.daily.length === 1 && fields.every(field => selectedSnapshot.totals[field] === selected[field]));
  const exportFile = path.resolve(privateDir, 'installed-range-check.csv');
  if (!exportFile.startsWith(path.resolve(privateDir) + path.sep)) throw new SmokeFailure('EXPORT_PATH_INVALID');
  await application.evaluate(({ dialog }, file) => {
    globalThis.__pulseSmokeSaveDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exportFile);
  try {
    const exported = await page.evaluate(date => window.pulse.exportData('csv', { from: date, to: date }), selected.date);
    const exportedRows = fs.readFileSync(exportFile, 'utf8').split(/\r?\n/).filter(line => /^"\d{4}-\d{2}-\d{2}",/.test(line));
    requireCheck('packagedRangeExportWorks', exported && exportedRows.length === 1 && exportedRows[0].startsWith('"' + selected.date + '"'));
  } finally {
    await application.evaluate(({ dialog }) => { dialog.showSaveDialog = globalThis.__pulseSmokeSaveDialog; delete globalThis.__pulseSmokeSaveDialog; });
    if (fs.existsSync(exportFile)) fs.unlinkSync(exportFile);
  }
  requireCheck('noInternalPathsExposed', !JSON.stringify(snapshot).includes(dataDir) && !JSON.stringify(snapshot).includes(path.dirname(executable)));

  // The initial refresh already requests official limits. Waiting for it does
  // not cause another log scan and never requires reading an auth file.
  const quotaDeadline = performance.now() + 25000;
  while (snapshot.status.quotaRefreshing && performance.now() < quotaDeadline) {
    await sleep(300); snapshot = await readSnapshot();
  }
  report.checks.officialQuotaReadSucceeded = snapshot.quota?.available === true && !snapshot.status.quotaErrorCode;
  if (!report.checks.officialQuotaReadSucceeded) warningTypes.add('OFFICIAL_QUOTA_UNAVAILABLE');
  else {
    report.timingsMs.officialQuotaReady = elapsed();
    requireCheck('officialQuotaShapeValid', snapshot.quota.source === 'codex-app-server' && snapshot.quota.windows.length > 0
      && snapshot.quota.windows.every(window => Number.isFinite(window.usedPercent) && Number.isFinite(window.remainingPercent)
        && window.usedPercent >= 0 && window.usedPercent <= 100 && window.remainingPercent >= 0 && window.remainingPercent <= 100
        && Math.abs(window.usedPercent + window.remainingPercent - 100) < 0.000001));
  }
  const descendants = await observeOwnedProcesses();
  // The quota service deliberately releases its helper after each request, so
  // success is followed by no live request helper rather than a persistent one.
  report.checks.officialHelperReleasedAfterRequest = !snapshot.status.quotaRefreshing && !descendants.some(row => /^codex(?:\.exe)?$/i.test(row.name));
  requireCheck('rendererErrorFree', rendererFailures.size === 0);
  report.passed = true;
} catch (error) {
  warningTypes.add(error instanceof SmokeFailure ? error.code : 'INSTALLED_SMOKE_FAILED');
  report.passed = false;
} finally {
  await closeOwnedApplication();
  if (application && (!report.checks.appExitedNaturally || !report.checks.ownedHelpersExitedNaturally || !report.checks.noOwnedProcessLeftBehind)) report.passed = false;
  report.timingsMs.total = elapsed();
  report.warningTypes = [...warningTypes].sort();
  fs.mkdirSync(privateDir, { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  // Deliberately omit raw exceptions and Playwright launch logs: those can
  // contain private paths or renderer data. The report contains categories.
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
