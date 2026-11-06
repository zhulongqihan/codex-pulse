import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { dayInZone, emptyTokens, normalizeTokens, projectName } from './scanner-core.mjs';
import { createQuotaClient } from './quota-service.mjs';

const require = createRequire(import.meta.url);
const FIELDS = ['inputTokens', 'cachedTokens', 'outputTokens', 'reasoningTokens', 'totalTokens'];
const add = (target, value) => { for (const field of FIELDS) target[field] = (target[field] || 0) + (value[field] || 0); return target; };
const uniqueWarnings = values => [...new Set(values.filter(Boolean))].slice(0, 24);

function localTimeZone(selected) {
  const zone = selected || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone; } catch { return 'UTC'; }
}

export function defaultDesktopDatabase() {
  if (process.platform === 'win32' && process.env.APPDATA) return path.join(process.env.APPDATA, 'com.ccusage.codex.desktop', 'codex-usage-desktop.db');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/com.ccusage.codex.desktop/codex-usage-desktop.db');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'com.ccusage.codex.desktop/codex-usage-desktop.db');
}

function pairs(value) {
  if (Array.isArray(value)) return value.map(item => [item.name || item.model || item.project || 'unknown', item]);
  return value && typeof value === 'object' ? Object.entries(value) : [];
}

function safeDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayInZone(`${value}T12:00:00Z`, 'UTC') === value; }

/** Optional, read-only acceleration. The companion application is never required. */
export function importDesktopCache(file, timeZone) {
  if (!file || !fs.existsSync(file)) return null;
  let db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(file, { readOnly: true });
    const columns = new Set(db.prepare('PRAGMA table_info(daily_usage_rollups)').all().map(c => c.name));
    if (!['date', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens', 'models_json', 'projects_json', 'updated_at'].every(c => columns.has(c))) return null;
    const scan = db.prepare('SELECT scanned_at,timezone FROM scan_runs ORDER BY id DESC LIMIT 1').get();
    if (scan?.timezone && scan.timezone !== timeZone) return null;
    const counts = new Map();
    try { for (const row of db.prepare('SELECT date,count(DISTINCT path) AS sessions FROM project_session_days GROUP BY date').all()) counts.set(row.date, row.sessions); } catch { /* Older cache may not have a session index. */ }
    const rows = db.prepare('SELECT date,input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,models_json,projects_json,updated_at FROM daily_usage_rollups ORDER BY date').all();
    const daily = rows.filter(row => safeDate(row.date)).map(row => {
      const models = pairs(JSON.parse(row.models_json || '{}')).map(([name, value]) => ({ name, ...normalizeTokens(value), sessions: null }));
      const projects = pairs(JSON.parse(row.projects_json || '{}')).map(([name, value]) => ({ name: projectName(name), ...normalizeTokens(value), sessions: null }));
      return { date: row.date, ...normalizeTokens(row), sessions: counts.get(row.date) ?? null, models, projects };
    });
    const sessions = [];
    try {
      // Fixed aggregation-only projection. prompt_title, detail_json and search_text
      // are deliberately never queried or copied.
      for (const row of db.prepare('SELECT project,date,path,usage_json FROM project_session_days ORDER BY date DESC LIMIT 5000').all()) {
        const usage = JSON.parse(row.usage_json || '{}');
        const id = crypto.createHash('sha256').update(row.path).digest('hex').slice(0, 16);
        const models = pairs(usage.models);
        for (const [name, values] of models.length ? models : [['unknown', usage]]) {
          const tokens = normalizeTokens(values);
          // This optional aggregate cache has a day, not an exact timestamp.
          // Do not invent a noon session start to satisfy the UI contract.
          if (tokens) sessions.push({ id, date: row.date, project: projectName(row.project), model: name, startedAt: null, timePrecision: 'day', ...tokens });
        }
      }
    } catch { /* The daily view remains useful without optional session aggregates. */ }
    let sessionFiles = 0;
    try { sessionFiles = db.prepare('SELECT count(*) AS n FROM session_file_rollups').get().n; } catch { }
    return { daily, sessions, sessionFiles, scannedAt: scan?.scanned_at || null, timeZone, origin: 'imported-desktop-cache', warnings: ['Initial statistics were imported from a local companion cache; the independent scanner will replace them when ready.'] };
  } catch { return null; }
  finally { if (db) db.close(); }
}

function unavailableQuota() {
  return { available: false, remainingPercent: null, usedPercent: null, resetsAt: null, plan: null, windows: [], source: 'codex-app-server', officialDaily: [], lifetimeTokens: null, currentStreakDays: null, stale: false, errorCode: null };
}

export function loadReferencePricing(file) {
  if (!file) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw.pricing || typeof raw.pricing !== 'object' || !Number.isFinite(raw.last_successful_refresh_at)) return null;
    const asOf = new Date(raw.last_successful_refresh_at * 1000).toISOString();
    const prices = new Map();
    for (const [name, row] of Object.entries(raw.pricing)) {
      const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
      if (row && valid(row.input_cost_per_token) && valid(row.output_cost_per_token)) prices.set(name, { input: row.input_cost_per_token, output: row.output_cost_per_token, cached: valid(row.cache_read_input_token_cost) ? row.cache_read_input_token_cost : undefined });
    }
    return { prices, asOf, source: 'Local Codex Usage Desktop reference-price cache', basis: 'Standard API token-rate reference; excludes speed multipliers and tool charges.' };
  } catch { return null; }
}

export function estimateReferenceCost(tokens, model, pricing) {
  const rate = pricing?.prices.get(model);
  if (!rate || (tokens.cachedTokens > 0 && rate.cached == null)) return undefined;
  const value = Math.max(0, tokens.inputTokens - tokens.cachedTokens) * rate.input + tokens.cachedTokens * (rate.cached || 0) + tokens.outputTokens * rate.output;
  return Number.isFinite(value) ? value : undefined;
}

export function createUsageService({ dataDir, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), codexExecutable, onUpdate = () => {}, timeZone, autoStart = true, importDatabase = defaultDesktopDatabase(), pricingFile = typeof importDatabase === 'string' ? path.join(path.dirname(importDatabase), 'codex-pricing-cache.json') : null } = {}) {
  if (!dataDir || !path.isAbsolute(dataDir)) throw new TypeError('An absolute application dataDir is required.');
  const zone = localTimeZone(timeZone);
  fs.mkdirSync(dataDir, { recursive: true });
  const snapshotCache = path.join(dataDir, 'usage-snapshot-v1.json');
  let local = { daily: [], sessions: [], sessionFiles: 0, scannedAt: null, origin: 'pulse-scan', warnings: [] };
  let logsAvailable = false;
  let quota = unavailableQuota();
  let scanWorker = null;
  let scanJob = null;
  let quotaJob = null;
  let closed = false;
  let client = createQuotaClient({ codexExecutable, dataDir });
  let quotaErrorCode = null;
  let logErrorCode = null;
  let pricing = loadReferencePricing(pricingFile);
  const status = { scanning: false, quotaRefreshing: false, progress: { done: 0, total: 0 }, scanAt: null, quotaAt: null, error: null, warnings: [] };
  try {
    const stored = JSON.parse(fs.readFileSync(snapshotCache, 'utf8'));
    if (stored.version === 1 && stored.timeZone === zone && Array.isArray(stored.data?.daily)) { local = stored.data; logsAvailable = true; }
  } catch { }
  if (!logsAvailable) {
    const imported = importDesktopCache(importDatabase, zone);
    if (imported) { local = imported; logsAvailable = true; }
  }
  status.scanAt = local.scannedAt;
  status.progress = { done: local.sessionFiles || 0, total: local.sessionFiles || 0 };

  function getSnapshot(options = {}) {
    const todayDate = dayInZone(new Date(), zone);
    const from = options.from || local.daily[0]?.date || todayDate;
    const to = options.to || todayDate;
    if (!safeDate(from) || !safeDate(to) || from > to) throw new TypeError('Expected a valid inclusive YYYY-MM-DD date range.');
    const selected = local.daily.filter(row => row.date >= from && row.date <= to);
    const sessions = (local.sessions || []).filter(row => (row.date || dayInZone(row.startedAt, zone)) >= from && (row.date || dayInZone(row.startedAt, zone)) <= to);
    const models = new Map();
    const projects = new Map();
    const totals = { ...emptyTokens(), sessions: new Set(sessions.map(s => s.id)).size, activeDays: selected.length };
    for (const day of selected) {
      add(totals, day);
      for (const row of day.models || []) { if (!models.has(row.name)) models.set(row.name, { name: row.name, ...emptyTokens(), sessions: 0 }); add(models.get(row.name), row); }
      for (const row of day.projects || []) { if (!projects.has(row.name)) projects.set(row.name, { name: row.name, ...emptyTokens(), sessions: 0 }); add(projects.get(row.name), row); }
    }
    for (const row of models.values()) row.sessions = new Set(sessions.filter(s => s.model === row.name).map(s => s.id)).size;
    for (const row of projects.values()) row.sessions = new Set(sessions.filter(s => s.project === row.name).map(s => s.id)).size;
    const modelCost = row => estimateReferenceCost(row, row.name || row.model, pricing);
    const totalCost = (rows, expectedTokens) => {
      if (!pricing || rows.reduce((sum, row) => sum + row.totalTokens, 0) !== expectedTokens || rows.some(row => modelCost(row) === undefined)) return undefined;
      return rows.reduce((sum, row) => sum + modelCost(row), 0);
    };
    const pricedModels = [...models.values()].sort((a, b) => b.totalTokens - a.totalTokens).map(row => ({ ...row, estimatedCost: modelCost(row) }));
    const today = local.daily.find(row => row.date === todayDate) || { date: todayDate, ...emptyTokens(), sessions: 0, models: [] };
    const warnings = uniqueWarnings([...(local.warnings || []), logErrorCode ? 'Local log statistics could not be refreshed; previous successful values were retained.' : null, quotaErrorCode ? 'Official account limits could not be refreshed. Local activity is still available.' : null]);
    return {
      version: 1, mode: 'live', range: { from, to, timeZone: zone }, totals: { ...totals, estimatedCost: totalCost(pricedModels, totals.totalTokens) },
      estimatedCost: totalCost(pricedModels, totals.totalTokens), pricingAsOf: pricing?.asOf, pricingSource: pricing?.source, pricingBasis: pricing?.basis,
      status: { ...status, progress: { ...status.progress }, warnings, logErrorCode, quotaErrorCode, error: !logsAvailable && logErrorCode ? 'Local Codex logs are not available yet.' : null },
      quota: structuredClone(quota), today: { ...today, source: 'local-logs', available: logsAvailable, estimatedCost: totalCost(today.models || [], today.totalTokens) },
      daily: structuredClone(selected).map(row => ({ ...row, estimatedCost: totalCost(row.models || [], row.totalTokens) })), models: pricedModels, projects: [...projects.values()].sort((a, b) => b.totalTokens - a.totalTokens),
      sessions: sessions.map(row => ({ ...row, estimatedCost: modelCost(row) })),
      source: { sessionFiles: local.sessionFiles || 0, lastScan: local.scannedAt, logsAsOf: local.scannedAt, quotaAsOf: status.quotaAt, origin: local.origin || 'pulse-scan', localOnly: true, logsAvailable },
    };
  }
  function emit() { if (!closed) { try { onUpdate(getSnapshot()); } catch { /* A UI listener must not interrupt scans. */ } } }
  async function saveSnapshot() {
    const temporary = `${snapshotCache}.${process.pid}.tmp`;
    await fsp.writeFile(temporary, JSON.stringify({ version: 1, timeZone: zone, data: local }));
    await fsp.rename(temporary, snapshotCache);
  }
  function scan(force) {
    if (scanJob) return scanJob;
    status.scanning = true; status.progress = { done: 0, total: 0 }; logErrorCode = null; emit();
    scanJob = new Promise(resolve => {
      const worker = new Worker(new URL('./scanner-worker.mjs', import.meta.url), {
        workerData: { dataDir, codexHome, timeZone: zone, force },
        // This service is also usable by Node ESM one-liners. --input-type is
        // valid for their stdin, but invalid for a worker backed by a real file.
        // Leave normal inheritance to Node: it removes its own test-runner
        // flags, whereas explicitly forwarding those flags breaks Workers.
        ...(process.execArgv.some(arg => arg.startsWith('--input-type')) ? {
          execArgv: process.execArgv.filter((arg, index, all) => !arg.startsWith('--input-type') && all[index - 1] !== '--input-type'),
        } : {}),
      });
      scanWorker = worker;
      let settled = false;
      let completedMessageReceived = false;
      function finish(errorCode) {
        if (settled) return;
        settled = true;
        if (errorCode) logErrorCode = errorCode;
        status.scanning = false;
        if (scanWorker === worker) scanWorker = null;
        emit(); resolve();
      }
      worker.on('message', async message => {
        if (closed) return;
        if (message.type === 'progress') { status.progress = message.progress; emit(); }
        else if (message.type === 'complete') {
          completedMessageReceived = true;
          local = { ...message.data, origin: 'pulse-scan' }; logsAvailable = true; status.scanAt = local.scannedAt;
          try { await saveSnapshot(); } catch { local.warnings = uniqueWarnings([...(local.warnings || []), 'The private statistics cache could not be saved.']); }
          finish();
        } else if (message.type === 'failure' || message.type === 'unavailable') finish(message.errorCode);
      });
      worker.on('error', () => finish('SCAN_FAILED'));
      worker.on('exit', () => { if (!completedMessageReceived) finish(settled ? null : 'SCAN_INTERRUPTED'); });
    }).catch(() => { logErrorCode = 'SCAN_FAILED'; status.scanning = false; emit(); }).finally(() => { scanJob = null; });
    return scanJob;
  }
  function readQuota() {
    if (quotaJob) return quotaJob;
    status.quotaRefreshing = true; emit();
    quotaJob = client.read().then(result => {
      if (closed) return;
      if (result.ok) { quota = { ...result.quota, stale: false, errorCode: null }; status.quotaAt = result.checkedAt; quotaErrorCode = null; }
      else { quotaErrorCode = result.errorCode; quota = { ...quota, stale: Boolean(quota.available), errorCode: result.errorCode }; }
    }).catch(() => { if (!closed) { quotaErrorCode = 'QUOTA_UNAVAILABLE'; quota = { ...quota, stale: Boolean(quota.available), errorCode: quotaErrorCode }; } }).finally(() => {
      quotaJob = null; status.quotaRefreshing = false; emit();
    });
    return quotaJob;
  }
  async function refresh({ logs = true, quota: shouldReadQuota = true, force = false } = {}) {
    if (closed) return;
    pricing = loadReferencePricing(pricingFile);
    const jobs = [];
    if (logs) jobs.push(scan(force));
    if (shouldReadQuota) jobs.push(readQuota());
    await Promise.all(jobs);
  }
  function close() {
    closed = true;
    client.close();
    if (scanWorker) { const worker = scanWorker; scanWorker = null; return worker.terminate(); }
    return Promise.resolve();
  }
  async function setCodexExecutable(value) { client.close(); if (quotaJob) await quotaJob; client = createQuotaClient({ codexExecutable: value, dataDir }); quotaErrorCode = null; return readQuota(); }
  if (autoStart) queueMicrotask(() => refresh().catch(() => {}));
  return { getSnapshot, refresh, close, setCodexExecutable };
}
