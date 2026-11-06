import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';

const mainUrl = new URL('../src/main/index.mjs', import.meta.url);
const base = fileURLToPath(new URL('../.local/tests', import.meta.url));
const harnesses = new Map();
const harnessKey = Symbol.for('pulse-settings-test-harnesses');
globalThis[harnessKey] = harnesses;
let serial = 0;

// Exercise the real main-process entry point with isolated Electron and service
// boundaries. No account client, scanner, private settings or live timers run.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.split('?')[0] === mainUrl.href && ['electron', './usage-service.mjs'].includes(specifier)) {
      const id = new URL(context.parentURL).searchParams.get('settingsTest');
      return { url: `pulse-settings-test:${specifier === 'electron' ? 'electron' : 'service'}/${id}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('pulse-settings-test:')) return nextLoad(url, context);
    const id = Number(url.slice(url.lastIndexOf('/') + 1));
    const access = `globalThis[Symbol.for('pulse-settings-test-harnesses')].get(${id})`;
    const source = url.startsWith('pulse-settings-test:electron/')
      ? `const e = ${access}.electron; export const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen, shell, dialog, globalShortcut } = e;`
      : `export const createUsageService = (...args) => ${access}.createService(...args);`;
    return { format: 'module', source, shortCircuit: true };
  },
});
after(() => { hooks.deregister(); delete globalThis[harnessKey]; });

async function desktop(t, saved) {
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'settings-'));
  const settingsFile = path.join(directory, 'settings.json');
  if (saved !== undefined) await fs.writeFile(settingsFile, JSON.stringify(saved));
  const original = { dataDir: process.env.PULSE_DATA_DIR, temp: process.env.TEMP, tmp: process.env.TMP, setInterval, clearInterval };
  const state = { directory, windows: [], handlers: new Map(), appEvents: new Map(), intervals: [], cleared: [], themes: [], logins: [], trayMenus: 0, serviceCreations: 0, refreshes: 0, serviceCloses: 0, errors: [], snapshotCalls: [], saveDialogs: [], saveDialogResult: { canceled: true } };
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  class Window {
    constructor(options) {
      this.options = options; this.bounds = { x: 0, y: 0, ...options }; this.events = new Map();
      this.shows = 0; this.hides = 0; this.resizes = 0; this.messages = [];
      this.webContents = { setWindowOpenHandler() {}, on() {}, send: (channel, value) => this.messages.push({ channel, value }) };
      state.windows.push(this);
    }
    on(name, callback) { this.events.set(name, callback); }
    once() {}
    loadFile() {}
    isDestroyed() { return false; }
    getBounds() { return this.bounds; }
    setBounds(value) { this.resizes++; this.bounds = { ...this.bounds, ...value }; }
    showInactive() { this.shows++; }
    hide() { this.hides++; }
  }
  const image = { resize: () => image };
  state.electron = {
    app: {
      isPackaged: false, setPath() {}, setAppLogsPath() {}, setAppUserModelId() {}, commandLine: { appendSwitch() {} },
      requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {},
      on: (name, callback) => state.appEvents.set(name, callback),
      setLoginItemSettings: value => state.logins.push(value),
    },
    BrowserWindow: Window,
    ipcMain: { handle: (name, callback) => state.handlers.set(name, callback) },
    Menu: { buildFromTemplate: template => ({ template, popup() {} }) },
    Tray: class { setToolTip() {} setContextMenu() { state.trayMenus++; } on() {} },
    nativeImage: { createFromPath: () => image, createFromDataURL: () => image },
    nativeTheme: { set themeSource(value) { state.themes.push(value); } },
    screen: { getPrimaryDisplay: () => ({ workArea: area, workAreaSize: area }), getAllDisplays: () => [{ workArea: area }], getDisplayMatching: () => ({ workArea: area }) },
    shell: {}, dialog: {
      showErrorBox: (...args) => state.errors.push(args),
      showSaveDialog: async (parent, options) => { state.saveDialogs.push({ parent, options }); return state.saveDialogResult; },
    }, globalShortcut: { unregisterAll() {} },
  };
  state.createService = () => {
    state.serviceCreations++;
    return { getSnapshot: range => { state.snapshotCalls.push(range); return state.snapshotFactory?.(range) || {}; }, refresh: async () => { state.refreshes++; }, close: () => { state.serviceCloses++; } };
  };
  const id = ++serial;
  harnesses.set(id, state);
  process.env.PULSE_DATA_DIR = directory;
  globalThis.setInterval = (callback, delay) => { const value = { callback, delay }; state.intervals.push(value); return value; };
  globalThis.clearInterval = value => state.cleared.push(value);
  t.after(async () => {
    state.appEvents.get('before-quit')?.();
    globalThis.setInterval = original.setInterval;
    globalThis.clearInterval = original.clearInterval;
    for (const [name, value] of [['PULSE_DATA_DIR', original.dataDir], ['TEMP', original.temp], ['TMP', original.tmp]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    harnesses.delete(id);
    const relative = path.relative(base, directory);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe test cleanup');
    await fs.rm(directory, { recursive: true, force: true });
  });
  await import(`${mainUrl.href}?settingsTest=${id}`);
  await Promise.resolve();
  assert.deepEqual(state.errors, [], 'the real desktop startup completed');
  state.read = () => state.handlers.get('pulse:settings')({ sender: state.windows[0].webContents });
  state.save = (patch, surface = 0) => state.handlers.get('pulse:save-settings')({ sender: state.windows[surface].webContents }, patch);
  state.export = (format, range, surface = 0) => state.handlers.get('pulse:export')({ sender: state.windows[surface].webContents }, format, range);
  state.persisted = async () => JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  return state;
}

test('legacy desktop preferences migrate to Meter and persist valid native and motion settings', async t => {
  const legacy = { theme: 'system', language: 'en', motionLevel: 'off', reducedMotion: true, respectReducedMotion: false, widgetVisible: false, widgetExpanded: true, refreshSeconds: 300, launchAtLogin: true, codexExecutable: 'F:/example/codex.exe', widgetPosition: { x: 120, y: 40 } };
  const app = await desktop(t, legacy);
  assert.deepEqual(app.read(), { ...legacy, skinId: 'meter', compactMode: false });
  assert.deepEqual(await app.persisted(), app.read(), 'migration is durable without a renderer save');
  assert.equal(app.windows.length, 1, 'the hidden-widget preference survives migration');
  assert.deepEqual(app.themes, ['system']);
  assert.equal(app.intervals[0].delay, 300000);
});

test('settings sanitize unknown skins and malformed persisted fields while preserving valid preferences', async t => {
  const app = await desktop(t, { skinId: 'retired-skin', compactMode: 'yes', theme: 'dark', motionLevel: 'full', reducedMotion: false, refreshSeconds: { toString: 'invalid' }, widgetVisible: 'yes', widgetPosition: { x: 'wrong', y: 20 } });
  assert.equal(app.read().skinId, 'clear');
  assert.equal(app.read().theme, 'dark');
  assert.equal(app.read().motionLevel, 'full');
  assert.equal(app.read().compactMode, false);
  assert.equal(app.read().widgetVisible, true);
  assert.equal(app.read().refreshSeconds, 60);
  assert.equal(app.read().widgetPosition, undefined);
  assert.deepEqual(await app.persisted(), app.read());
  const before = app.read();
  await assert.rejects(app.save({ skinId: 'meter', theme: 'invalid' }), /Invalid preference/);
  await assert.rejects(app.save({ motionLevel: 'fast' }), /Invalid preference/);
  await assert.rejects(app.save({ widgetVisible: 'false' }), /Invalid switch/);
  await assert.rejects(app.save({ compactMode: 'true' }), /Invalid switch/);
  await assert.rejects(app.save({ refreshSeconds: 1 }), /Unsupported refresh interval/);
  await assert.rejects(app.save([]), /Invalid preferences/);
  assert.deepEqual(app.read(), before, 'a rejected patch does not partially apply a valid skin');
  const clean = await app.save({ skinId: 'meter', codexExecutable: 'F:/untrusted.exe', widgetPosition: { x: 0, y: 0 } });
  assert.equal(clean.skinId, 'meter');
  assert.equal(clean.codexExecutable, undefined, 'renderer settings cannot replace the native executable selection');
  assert.equal(clean.widgetPosition, undefined);
  const fallback = await app.save({ skinId: 'future-skin' });
  assert.equal(fallback.skinId, 'clear');
  assert.equal((await app.persisted()).skinId, 'clear');
});

test('skin and compact changes persist and broadcast to both surfaces without restarting data or changing other preferences', async t => {
  const app = await desktop(t, { skinId: 'meter', theme: 'dark', motionLevel: 'full', reducedMotion: false, respectReducedMotion: false, refreshSeconds: 120, widgetExpanded: true });
  const before = app.read();
  const baseline = { intervals: app.intervals.length, cleared: app.cleared.length, themes: [...app.themes], logins: app.logins.length, trayMenus: app.trayMenus, widgetShows: app.windows[1].shows, widgetResizes: app.windows[1].resizes };
  const switched = await app.save({ skinId: 'clear' });
  assert.deepEqual(switched, { ...before, skinId: 'clear' });
  assert.deepEqual(await app.persisted(), switched);
  for (const window of app.windows) assert.deepEqual(window.messages, [{ channel: 'pulse:settings-update', value: switched }]);
  const restored = await app.save({ skinId: 'meter' }, 1);
  assert.deepEqual(restored, before, 'widget-originated changes use the same settings path');
  for (const window of app.windows) assert.deepEqual(window.messages.at(-1), { channel: 'pulse:settings-update', value: before });
  const compact = await app.save({ compactMode: true });
  assert.deepEqual(compact, { ...before, compactMode: true });
  assert.deepEqual(await app.persisted(), compact);
  for (const window of app.windows) assert.deepEqual(window.messages.at(-1), { channel: 'pulse:settings-update', value: compact });
  assert.equal(app.intervals.length, baseline.intervals);
  assert.equal(app.cleared.length, baseline.cleared);
  assert.deepEqual(app.themes, baseline.themes);
  assert.equal(app.logins.length, baseline.logins);
  assert.equal(app.trayMenus, baseline.trayMenus);
  assert.equal(app.windows.length, 2);
  assert.equal(app.windows[1].shows, baseline.widgetShows);
  assert.equal(app.windows[1].resizes, baseline.widgetResizes);
  assert.equal(app.serviceCreations, 1);
  assert.equal(app.refreshes, 0, 'a skin patch cannot query quota or scan logs');
  assert.equal(app.serviceCloses, 0);
});

test('native setting side effects run only for their own changed field', async t => {
  const app = await desktop(t, { widgetVisible: true });
  const widget = app.windows[1];
  await app.save({ theme: 'system', motionLevel: 'off', reducedMotion: true });
  assert.deepEqual(app.themes, ['light', 'system']);
  assert.equal(widget.shows, 0);
  assert.equal(widget.resizes, 0);
  assert.equal(app.intervals.length, 1);
  await app.save({ refreshSeconds: '300' });
  assert.equal(app.intervals.length, 2);
  assert.equal(app.intervals[1].delay, 300000);
  await app.save({ refreshSeconds: 300 });
  assert.equal(app.intervals.length, 2, 'saving the existing interval does not postpone its next refresh');
  await app.save({ launchAtLogin: true });
  assert.equal(app.logins.length, 1);
  await app.save({ widgetExpanded: true });
  assert.equal(widget.bounds.height, 276);
  await app.save({ widgetVisible: false });
  assert.equal(widget.hides, 1);
  const counts = [widget.shows, widget.resizes];
  await app.save({ skinId: 'clear' });
  assert.deepEqual([widget.shows, widget.resizes], counts);
  assert.equal(widget.hides, 1, 'a hidden widget remains untouched during a skin change');
  assert.equal(app.refreshes, 0);
});

test('a failed settings write leaves old state and no side effects, and the same patch can be retried durably', async t => {
  const app = await desktop(t, { theme: 'light' });
  const before = app.read();
  const settingsFile = path.join(app.directory, 'settings.json');
  const originalWrite = fsSync.writeFileSync;
  let attempts = 0;
  t.mock.method(fsSync, 'writeFileSync', function (file, ...args) {
    if (file === settingsFile && ++attempts === 1) throw Object.assign(new Error('Settings write failed'), { code: 'EACCES' });
    return originalWrite.call(this, file, ...args);
  });
  const nativeState = () => ({
    themes: [...app.themes], logins: app.logins.length, intervals: app.intervals.length, cleared: app.cleared.length,
    widgetShows: app.windows[1].shows, widgetResizes: app.windows[1].resizes,
    broadcasts: app.windows.map(window => window.messages.length),
  });
  const baseline = nativeState();
  const patch = { skinId: 'clear', compactMode: true, theme: 'dark', refreshSeconds: 300, widgetExpanded: true, launchAtLogin: true };
  await assert.rejects(app.save(patch), { code: 'EACCES' });
  assert.deepEqual(app.read(), before, 'readback must not report a preference that could not be saved');
  assert.deepEqual(await app.persisted(), before);
  assert.deepEqual(nativeState(), baseline, 'failed persistence must not change any native preference or broadcast');
  const expected = { ...before, ...patch };
  assert.deepEqual(await app.save(patch), expected, 'an identical retry must not become a false no-op');
  assert.deepEqual(await app.persisted(), expected, 'the successful retry actually reaches disk');
  assert.equal(attempts, 2);
  assert.deepEqual(nativeState(), {
    themes: [...baseline.themes, 'dark'], logins: baseline.logins + 1,
    intervals: baseline.intervals + 1, cleared: baseline.cleared + 1,
    widgetShows: baseline.widgetShows + 1, widgetResizes: baseline.widgetResizes + 1,
    broadcasts: baseline.broadcasts.map(count => count + 1),
  });
  const committed = nativeState();
  assert.deepEqual(await app.save(patch), expected);
  assert.equal(attempts, 2, 'a durable no-op needs no extra write');
  assert.deepEqual(nativeState(), committed, 'the retry applies native side effects exactly once');
});

function usageForExport(range) {
  return {
    mode: 'live', range: { from: range?.from || '2026-11-04', to: range?.to || '2026-11-06', timeZone: 'UTC' },
    daily: [4, 5, 6].map(day => ({ date: `2026-11-0${day}`, inputTokens: day * 10, cachedTokens: day, outputTokens: day, totalTokens: day * 11 })),
    sessions: [{ id: 'PRIVATE_SESSION', path: 'F:/PRIVATE_PATH/thread.jsonl', prompt: 'PRIVATE_PROMPT' }],
    source: { origin: 'pulse-scan', logsAsOf: '2026-11-06T10:00:00Z', file: 'F:/PRIVATE_PATH/cache.json', description: 'PRIVATE_SOURCE' },
  };
}

test('native export uses the requested range, native chosen destination and aggregate-only CSV/Markdown; legacy action still works', async t => {
  const app = await desktop(t);
  app.snapshotFactory = usageForExport;
  const range = { from: '2026-11-05', to: '2026-11-05' };
  const attempted = path.join(app.directory, 'renderer-attempt.csv');
  const chosenCsv = path.join(app.directory, 'chosen.csv');
  app.saveDialogResult = { canceled: false, filePath: chosenCsv };
  assert.equal(await app.export('csv', { ...range, filePath: attempted, content: 'RENDERER_CONTENT' }), true);
  assert.deepEqual(app.snapshotCalls, [range], 'only validated range fields reach the service');
  assert.equal(app.saveDialogs[0].parent, app.windows[0]);
  assert.equal(app.saveDialogs[0].options.defaultPath, path.join(app.directory, 'exports', 'pulse-2026-11-05-2026-11-05.csv'));
  assert.deepEqual(app.saveDialogs[0].options.filters, [{ name: 'CSV', extensions: ['csv'] }]);
  const csv = await fs.readFile(chosenCsv, 'utf8');
  assert(csv.startsWith('\ufeff'), 'CSV retains its Excel-friendly UTF-8 marker');
  assert.match(csv, /2026-11-05/);
  assert.doesNotMatch(csv, /(?:^|\r\n)"2026-11-0[46]",/, 'rows outside the requested range are absent');
  assert.doesNotMatch(csv, /PRIVATE_|RENDERER_CONTENT|thread\.jsonl|cache\.json/);
  await assert.rejects(fs.access(attempted), { code: 'ENOENT' });
  const chosenMarkdown = path.join(app.directory, 'chosen.md');
  app.saveDialogResult = { canceled: false, filePath: chosenMarkdown };
  assert.equal(await app.export('markdown', range, 1), true, 'the trusted widget can use the same export boundary');
  assert.equal(app.saveDialogs[1].options.defaultPath, path.join(app.directory, 'exports', 'pulse-2026-11-05-2026-11-05.md'));
  const markdown = await fs.readFile(chosenMarkdown, 'utf8');
  assert.match(markdown, /^# Codex Pulse usage statistics/);
  assert.match(markdown, /\| 2026-11-05 \| 50 \| 5 \| 5 \| 55 \|/);
  assert.doesNotMatch(markdown, /2026-11-04|PRIVATE_|F:\//);
  const legacyCsv = path.join(app.directory, 'legacy.csv');
  app.saveDialogResult = { canceled: false, filePath: legacyCsv };
  assert.equal(await app.handlers.get('pulse:action')({ sender: app.windows[0].webContents }, 'export-csv'), true);
  assert.equal(app.snapshotCalls.at(-1), undefined, 'the old action exports the full range');
  assert.equal(app.saveDialogs[2].options.defaultPath, path.join(app.directory, 'exports', 'pulse-2026-11-04-2026-11-06.csv'));
  assert.match(await fs.readFile(legacyCsv, 'utf8'), /2026-11-04/);
  assert.equal(app.refreshes, 0, 'exporting retained aggregates must not scan or query quota');
});

test('export rejects invalid senders, formats and calendar ranges before the dialog; cancel never writes', async t => {
  const app = await desktop(t);
  app.snapshotFactory = usageForExport;
  await assert.rejects(async () => app.handlers.get('pulse:export')({ sender: {} }, 'csv', {}), /Unknown application surface/);
  for (const format of ['pdf', '../csv', '__proto__', null, { format: 'csv' }]) {
    await assert.rejects(async () => app.export(format, {}), /Unsupported export format/);
  }
  for (const range of [[], '2026-11-05', { from: '../../outside' }, { from: 20261105 }, { from: '2026-02-29' }, { to: '2026-13-01' }, { from: '0000-01-01' }, { from: '2026-11-06', to: '2026-11-05' }]) {
    await assert.rejects(async () => app.export('csv', range), /Invalid date|Date range is reversed/);
  }
  assert.equal(app.snapshotCalls.length, 0);
  assert.equal(app.saveDialogs.length, 0);
  const sentinel = path.join(app.directory, 'cancelled.csv');
  await fs.writeFile(sentinel, 'UNCHANGED');
  app.saveDialogResult = { canceled: true, filePath: sentinel };
  assert.equal(await app.export('csv', { from: '2026-11-05', to: '2026-11-05' }), false);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'UNCHANGED');
  app.saveDialogResult = { canceled: false };
  assert.equal(await app.export('markdown'), false, 'a missing native file selection also cancels');
  assert.deepEqual(await fs.readdir(path.join(app.directory, 'exports')), [], 'cancellation creates no export files');
});

test('preload exposes only the format/range export contract through the fixed IPC channel', async () => {
  const invocations = [];
  let bridge;
  const source = await fs.readFile(new URL('../src/main/preload.cjs', import.meta.url), 'utf8');
  runInNewContext(source, {
    require(name) {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'pulse'); bridge = value; } },
        ipcRenderer: { invoke: (...args) => { invocations.push(args); return Promise.resolve(false); } },
      };
    },
  });
  const range = { from: '2026-11-05', to: '2026-11-06' };
  assert.equal(await bridge.exportData('csv', range, 'F:/ignored.csv', 'IGNORED CONTENT'), false);
  assert.deepEqual(invocations, [['pulse:export', 'csv', range]]);
  assert(Object.isFrozen(bridge));
});
