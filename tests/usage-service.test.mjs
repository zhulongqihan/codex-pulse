import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdCompressSync } from 'node:zlib';
import { createUsageService, estimateReferenceCost, importDesktopCache } from '../src/main/usage-service.mjs';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local/tests');
await fs.mkdir(base, { recursive: true });
async function scratch() { return fs.mkdtemp(path.join(base, 'usage-')); }
async function cleanup(directory) { if (!path.resolve(directory).startsWith(base + path.sep)) throw new Error('Unsafe test cleanup'); await fs.rm(directory, { recursive: true, force: true }); }
const count = (input, output, at) => ({ type: 'event_msg', timestamp: at, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: input / 2, output_tokens: output, total_tokens: input + output } } } });
function file(id, model, project, events) { return [{ type: 'session_meta', timestamp: '2026-11-05T00:00:00Z', payload: { id, cwd: `F:/example/${project}` } }, { type: 'turn_context', timestamp: '2026-11-05T00:00:01Z', payload: { model } }, ...events].map(row => JSON.stringify(row)).join('\n') + '\n'; }

test('worker scans synthetic plain/zstd logs, replaces cached contributions, and filters model/project ranges consistently', async () => {
  const temporary = await scratch();
  let service;
  try {
    const home = path.join(temporary, 'codex'); const data = path.join(temporary, 'data');
    await fs.mkdir(path.join(home, 'sessions'), { recursive: true }); await fs.mkdir(path.join(home, 'archived_sessions'), { recursive: true });
    const a = file('a', 'model-a', 'alpha', [count(100, 10, '2026-11-05T10:00:00Z'), count(140, 20, '2026-11-06T10:00:00Z')]);
    await fs.writeFile(path.join(home, 'sessions', 'rollout-a.jsonl'), a);
    await fs.writeFile(path.join(home, 'sessions', 'rollout-a.jsonl.zst'), zstdCompressSync(Buffer.from(file('a', 'model-a', 'alpha', [count(900, 90, '2026-11-05T10:00:00Z')]))));
    await fs.writeFile(path.join(home, 'archived_sessions', 'rollout-a.jsonl'), file('a', 'model-a', 'alpha', [count(800, 80, '2026-11-05T10:00:00Z')]));
    await fs.writeFile(path.join(home, 'sessions', 'rollout-b.jsonl.zst'), zstdCompressSync(Buffer.from(file('b', 'model-b', 'beta', [count(20, 2, '2026-11-06T12:00:00Z')]))));
    const states = [];
    service = createUsageService({ dataDir: data, codexHome: home, timeZone: 'UTC', importDatabase: null, pricingFile: null, autoStart: false, onUpdate: snapshot => states.push(snapshot.status.scanning) });
    await Promise.all([service.refresh({ quota: false }), service.refresh({ quota: false })]);
    const all = service.getSnapshot();
    assert.equal(all.totals.totalTokens, 182);
    assert.equal(all.source.sessionFiles, 2);
    assert.equal(all.status.logErrorCode, null);
    assert.equal(all.status.scanning, false);
    assert(states.includes(true));
    const day = service.getSnapshot({ from: '2026-11-06', to: '2026-11-06' });
    assert.equal(day.totals.totalTokens, 72);
    assert.equal(day.models.reduce((n, row) => n + row.totalTokens, 0), 72);
    assert.equal(day.projects.reduce((n, row) => n + row.totalTokens, 0), 72);
    assert.equal(day.sessions.reduce((n, row) => n + row.totalTokens, 0), 72);
    assert.equal(day.estimatedCost, undefined);
    assert(!JSON.stringify(all).includes(temporary));
    await service.close();
    service = createUsageService({ dataDir: data, codexHome: home, timeZone: 'UTC', importDatabase: null, pricingFile: null, autoStart: false });
    assert.equal(service.getSnapshot().totals.totalTokens, 182, 'warm start uses its own cached aggregate');
    await fs.appendFile(path.join(home, 'sessions', 'rollout-a.jsonl'), JSON.stringify(count(150, 25, '2026-11-06T13:00:00Z')) + '\n');
    await service.refresh({ quota: false });
    assert.equal(service.getSnapshot().totals.totalTokens, 197, 'a modified file replaces its old contribution instead of being added twice');
    assert.throws(() => service.getSnapshot({ from: '2026-11-99' }), /valid inclusive/);
  } finally { await service?.close(); await cleanup(temporary); }
});

test('missing source preserves imported/private-cache data and reports unavailable instead of inventing zero', async () => {
  const temporary = await scratch(); let service;
  try {
    service = createUsageService({ dataDir: path.join(temporary, 'data'), codexHome: path.join(temporary, 'missing'), importDatabase: null, pricingFile: null, autoStart: false });
    await service.refresh({ quota: false });
    const snapshot = service.getSnapshot();
    assert.equal(snapshot.status.logErrorCode, 'LOGS_NOT_FOUND');
    assert.equal(snapshot.today.available, false);
    assert.equal(snapshot.quota.available, false);
    assert.equal(snapshot.quota.remainingPercent, null);
  } finally { await service?.close(); await cleanup(temporary); }
});

test('pricing is a standard-rate reference and missing model/cache price remains unknown', () => {
  const pricing = { prices: new Map([['sample-model', { input: 0.02, cached: 0.001, output: 0.05 }]]) };
  const tokens = { inputTokens: 100, cachedTokens: 80, outputTokens: 10 };
  assert.equal(estimateReferenceCost(tokens, 'sample-model', pricing), 0.98);
  assert.equal(estimateReferenceCost(tokens, 'unknown-model', pricing), undefined);
  assert.equal(estimateReferenceCost(tokens, 'sample-model', { prices: new Map([['sample-model', { input: 0.02, output: 0.05 }]]) }), undefined);
});

test('read-only cache import excludes private title/search fields and preserves price provenance', async () => {
  const temporary = await scratch(); let service;
  try {
    const database = path.join(temporary, 'companion.db');
    const db = new DatabaseSync(database);
    const tokens = { inputTokens: 100, cachedInputTokens: 60, outputTokens: 20, reasoningOutputTokens: 2, totalTokens: 120 };
    const project = 'F:\\private-root\\project-alpha';
    db.exec('CREATE TABLE scan_runs(id INTEGER,scanned_at TEXT,timezone TEXT); CREATE TABLE daily_usage_rollups(date TEXT,input_tokens INTEGER,cached_input_tokens INTEGER,output_tokens INTEGER,reasoning_output_tokens INTEGER,total_tokens INTEGER,models_json TEXT,projects_json TEXT,updated_at TEXT); CREATE TABLE project_session_days(project TEXT,date TEXT,path TEXT,usage_json TEXT); CREATE TABLE session_file_rollups(path TEXT,prompt_title TEXT);');
    db.prepare('INSERT INTO scan_runs VALUES(?,?,?)').run(1, '2026-11-06T10:00:00Z', 'UTC');
    db.prepare('INSERT INTO daily_usage_rollups VALUES(?,?,?,?,?,?,?,?,?)').run('2026-11-06', 100, 60, 20, 2, 120, JSON.stringify({ 'model-a': tokens }), JSON.stringify({ [project]: { ...tokens, models: { 'model-a': tokens } } }), '2026-11-06T10:00:00Z');
    db.prepare('INSERT INTO project_session_days VALUES(?,?,?,?)').run(project, '2026-11-06', 'C:\\private-path\\thread.jsonl', JSON.stringify({ ...tokens, models: [{ model: 'model-a', ...tokens }] }));
    db.prepare('INSERT INTO session_file_rollups VALUES(?,?)').run('C:\\private-path\\thread.jsonl', 'PRIVATE PROMPT DO NOT COPY');
    db.close();
    const pricingFile = path.join(temporary, 'prices.json');
    await fs.writeFile(pricingFile, JSON.stringify({ last_successful_refresh_at: 1794000000, pricing: { 'model-a': { input_cost_per_token: 0.02, cache_read_input_token_cost: 0.001, output_cost_per_token: 0.05 } } }));
    service = createUsageService({ dataDir: path.join(temporary, 'data'), codexHome: path.join(temporary, 'unused'), importDatabase: database, pricingFile, timeZone: 'UTC', autoStart: false });
    const snapshot = service.getSnapshot({ from: '2026-11-06', to: '2026-11-06' });
    assert.equal(snapshot.source.origin, 'imported-desktop-cache');
    assert.equal(snapshot.totals.totalTokens, 120);
    assert.equal(snapshot.projects[0].name, 'project-alpha');
    assert.equal(snapshot.models[0].sessions, 1);
    assert.equal(snapshot.sessions[0].startedAt, null);
    assert.equal(snapshot.sessions[0].date, '2026-11-06');
    assert.equal(snapshot.daily[0].hourly, undefined, 'daily cache import cannot invent an hourly breakdown');
    assert(Math.abs(snapshot.estimatedCost - 1.86) < 1e-10);
    assert(snapshot.pricingAsOf);
    assert.match(snapshot.pricingSource, /reference-price cache/);
    assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE PROMPT|private-root|private-path/);
    assert.equal(importDesktopCache(database, 'Asia/Shanghai'), null, 'different calendar partition must not be relabeled silently');
  } finally { await service?.close(); await cleanup(temporary); }
});

test('a complete unterminated JSON record counts; incomplete append and corrupt archive retain known statistics', async () => {
  const temporary = await scratch(); let service;
  try {
    const home = path.join(temporary, 'home'); const source = path.join(home, 'sessions');
    await fs.mkdir(source, { recursive: true });
    const plain = path.join(source, 'a.jsonl'); const compressed = path.join(source, 'b.jsonl.zst');
    await fs.writeFile(plain, file('a', 'model-a', 'alpha', [count(100, 10, '2026-11-06T01:00:00Z')]).trimEnd());
    await fs.writeFile(compressed, zstdCompressSync(Buffer.from(file('b', 'model-b', 'beta', [count(20, 2, '2026-11-06T02:00:00Z')]))));
    service = createUsageService({ dataDir: path.join(temporary, 'data'), codexHome: home, importDatabase: null, pricingFile: null, timeZone: 'UTC', autoStart: false });
    await service.refresh({ quota: false });
    assert.equal(service.getSnapshot().totals.totalTokens, 132);
    await fs.appendFile(plain, '\n{"type":"event_msg","payload":{"type":"token_count",');
    await fs.writeFile(compressed, 'not a zstd archive');
    await service.refresh({ quota: false });
    const snapshot = service.getSnapshot();
    assert.equal(snapshot.totals.totalTokens, 132);
    assert.match(snapshot.status.warnings.join(' '), /last successful cached/);
  } finally { await service?.close(); await cleanup(temporary); }
});

test('Node stdin ESM flags are not inherited by file-backed scanner workers', async () => {
  const temporary = await scratch();
  try {
    const moduleUrl = new URL('../src/main/usage-service.mjs', import.meta.url).href;
    const code = `import {createUsageService} from ${JSON.stringify(moduleUrl)};const s=createUsageService({dataDir:${JSON.stringify(path.join(temporary, 'data'))},codexHome:${JSON.stringify(path.join(temporary, 'missing'))},importDatabase:null,pricingFile:null,autoStart:false});await s.refresh({quota:false});console.log(JSON.stringify({error:s.getSnapshot().status.logErrorCode}));await s.close();`;
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; child.stdout.on('data', value => { stdout += value; });
      child.on('error', reject); child.on('exit', value => value === 0 ? resolve(stdout.trim()) : reject(new Error('ESM fixture failed')));
    });
    assert.equal(JSON.parse(output).error, 'LOGS_NOT_FOUND');
  } finally { await cleanup(temporary); }
});
