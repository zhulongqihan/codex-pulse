import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen, shell, dialog, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUsageService } from './usage-service.mjs';
import { rangeCsv, rangeMarkdown } from '../renderer/analytics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const demo = process.argv.includes('--demo');
const headlessCapture = process.argv.includes('--capture');
const base = app.isPackaged ? path.dirname(process.execPath) : path.join(root, '.local');
const dataDir = demo ? path.join(base, 'demo-state') : process.env.PULSE_DATA_DIR || path.join(base, 'data');
for (const child of ['', 'browser', 'temp', 'logs', 'crashes']) fs.mkdirSync(path.join(dataDir, child), { recursive: true });
process.env.TEMP = path.join(dataDir, 'temp');
process.env.TMP = process.env.TEMP;
app.setPath('userData', dataDir);
app.setPath('sessionData', path.join(dataDir, 'browser'));
app.setPath('crashDumps', path.join(dataDir, 'crashes'));
app.setAppLogsPath(path.join(dataDir, 'logs'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(dataDir, 'browser', 'cache'));
app.setAppUserModelId('io.github.zhulongqihan.codex-pulse');

let mainWindow, widgetWindow, tray, service, refreshTimer;
let quitting = false;
const defaults = { skinId: 'meter', compactMode: false, theme: 'light', language: 'zh', widgetVisible: true, widgetExpanded: false, launchAtLogin: false, refreshSeconds: 60, motionLevel: 'gentle', reducedMotion: false, respectReducedMotion: true };
const settingsFile = path.join(dataDir, 'settings.json');
let settingsNeedMigration = false;
let settings = loadSettings();
if (headlessCapture) settings.widgetVisible = false;
const locked = demo || app.requestSingleInstanceLock();
if (!locked) app.quit();

function sendSnapshot() {
  if (!service) return;
  const value = service.getSnapshot();
  for (const win of [mainWindow, widgetWindow]) if (win && !win.isDestroyed()) win.webContents.send('pulse:update', value);
}
function trusted(event) {
  if (![mainWindow, widgetWindow].some(w => w && !w.isDestroyed() && w.webContents === event.sender)) throw new Error('Unknown application surface');
}
function parseRange(value) {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid date range');
  const result = {};
  for (const key of ['from', 'to']) if (value[key] != null) {
    if (typeof value[key] !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value[key])) throw new Error('Invalid date');
    const date = new Date(value[key] + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value[key]) throw new Error('Invalid date');
    result[key] = value[key];
  }
  if (result.from && result.to && result.from > result.to) throw new Error('Date range is reversed');
  return result;
}
function configureWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('did-finish-load', sendSnapshot);
}
function load(win, view) {
  const dev = process.env.PULSE_DEV_URL;
  if (dev && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(dev)) return win.loadURL(dev.replace(/\/$/, '') + '/#/' + view);
  return win.loadFile(path.join(root, 'dist', 'index.html'), { hash: '/' + view });
}
function showDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) createDashboard();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
function createDashboard() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({ width: Math.max(900, Math.min(1440, area.width - 40)), height: Math.max(660, Math.min(1040, area.height - 40)), minWidth: 900, minHeight: 660, show: false, backgroundColor: '#ffffff', title: 'Codex Pulse · 用量与额度', autoHideMenuBar: true, icon: path.join(root, 'assets', 'icon.png'), webPreferences: { preload: path.join(root, 'src/main/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: !headlessCapture, spellcheck: false } });
  configureWindow(mainWindow); load(mainWindow, 'overview');
  mainWindow.once('ready-to-show', () => { if (!process.argv.includes('--background') && !headlessCapture) mainWindow.show(); });
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
}
function createWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) { widgetWindow.showInactive(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  const size = { width: 340, height: settings.widgetExpanded ? 276 : 126 };
  const saved = settings.widgetPosition;
  const valid = saved && screen.getAllDisplays().some(d => saved.x >= d.workArea.x && saved.x + size.width <= d.workArea.x + d.workArea.width && saved.y >= d.workArea.y && saved.y + size.height <= d.workArea.y + d.workArea.height);
  widgetWindow = new BrowserWindow({ ...size, x: valid ? saved.x : area.x + area.width - size.width - 20, y: valid ? saved.y : area.y + area.height - size.height - 20, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: true, webPreferences: { preload: path.join(root, 'src/main/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  configureWindow(widgetWindow); load(widgetWindow, 'widget');
  widgetWindow.once('ready-to-show', () => { if (!headlessCapture) widgetWindow.showInactive(); });
  widgetWindow.on('moved', () => { if (!widgetWindow || widgetWindow.isDestroyed()) return; const [x, y] = widgetWindow.getPosition(); settings.widgetPosition = { x, y }; persist(); });
  widgetWindow.on('close', () => { widgetWindow = null; });
  widgetWindow.webContents.on('context-menu', () => trayMenu().popup({ window: widgetWindow }));
}
function persist(value = settings) { if (!demo) fs.writeFileSync(settingsFile, JSON.stringify(value, null, 2)); }
function sanitizeSettings(patch, { persisted = false } = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    if (persisted) return {};
    throw new Error('Invalid preferences');
  }
  const clean = {};
  const own = key => Object.hasOwn(patch, key);
  // An absent skin migrates to the default; an unrecognized saved or requested
  // skin uses Clear so a future/removed skin cannot leave the surface unstyled.
  if (own('skinId')) clean.skinId = ['clear', 'meter'].includes(patch.skinId) ? patch.skinId : 'clear';
  for (const [key, allowed] of Object.entries({ theme: ['light', 'dark', 'system'], language: ['zh', 'en'], motionLevel: ['full', 'gentle', 'off'] })) if (own(key)) {
    if (allowed.includes(patch[key])) clean[key] = patch[key];
    else if (!persisted) throw new Error('Invalid preference');
  }
  for (const key of ['compactMode', 'widgetVisible', 'widgetExpanded', 'launchAtLogin', 'reducedMotion', 'respectReducedMotion']) if (own(key)) {
    if (typeof patch[key] === 'boolean') clean[key] = patch[key];
    else if (!persisted) throw new Error('Invalid switch');
  }
  if (own('refreshSeconds')) {
    const seconds = ['number', 'string'].includes(typeof patch.refreshSeconds) ? Number(patch.refreshSeconds) : NaN;
    if ([60, 120, 300, 600].includes(seconds)) clean.refreshSeconds = seconds;
    else if (!persisted) throw new Error('Unsupported refresh interval');
  }
  // These values are written only by native actions, never by renderer patches.
  if (persisted) {
    if (typeof patch.codexExecutable === 'string' && patch.codexExecutable && !patch.codexExecutable.includes('\0')) clean.codexExecutable = patch.codexExecutable;
    if (patch.widgetPosition && Number.isFinite(patch.widgetPosition.x) && Number.isFinite(patch.widgetPosition.y)) clean.widgetPosition = { x: patch.widgetPosition.x, y: patch.widgetPosition.y };
  }
  return clean;
}
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const value = { ...defaults, ...sanitizeSettings(saved, { persisted: true }) };
    settingsNeedMigration = JSON.stringify(saved) !== JSON.stringify(value);
    return value;
  } catch { return { ...defaults }; }
}
function timer() {
  clearInterval(refreshTimer);
  if (!demo) refreshTimer = setInterval(() => { service.refresh().catch(() => {}); }, settings.refreshSeconds * 1000);
}
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: '打开看板 / Open dashboard', click: showDashboard },
    { label: '显示悬浮窗 / Show widget', type: 'checkbox', checked: settings.widgetVisible, click: item => updateSettings({ widgetVisible: item.checked }) },
    { label: '刷新数据 / Refresh', click: () => service.refresh().catch(() => {}) },
    { type: 'separator' },
    { label: '退出 / Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}
async function updateSettings(patch) {
  const clean = sanitizeSettings(patch);
  const changed = new Set(Object.keys(clean).filter(key => settings[key] !== clean[key]));
  if (!changed.size) return { ...settings };
  const next = { ...settings, ...clean };
  // Commit only after persistence succeeds, so a failed save can be retried
  // without publishing an unsaved value or running native side effects early.
  persist(next);
  settings = next;
  if (changed.has('theme')) nativeTheme.themeSource = settings.theme;
  if (changed.has('launchAtLogin') && !demo) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: process.execPath, args: ['--background'] });
  if (changed.has('widgetVisible') || changed.has('widgetExpanded')) {
    if (settings.widgetVisible) {
      createWidget();
      const bounds = widgetWindow.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      const height = settings.widgetExpanded ? 276 : 126;
      widgetWindow.setBounds({ width: 340, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - 340)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) });
    } else if (widgetWindow) widgetWindow.hide();
  }
  if (changed.has('refreshSeconds')) timer();
  for (const win of [mainWindow, widgetWindow]) if (win && !win.isDestroyed()) win.webContents.send('pulse:settings-update', { ...settings });
  if (tray && changed.has('widgetVisible')) tray.setContextMenu(trayMenu());
  return { ...settings };
}
async function exportData(format, range) {
  const formats = { csv: { extension: 'csv', name: 'CSV', render: rangeCsv }, markdown: { extension: 'md', name: 'Markdown', render: rangeMarkdown } };
  if (typeof format !== 'string' || !Object.hasOwn(formats, format)) throw new Error('Unsupported export format');
  const selected = formats[format];
  const snapshot = service.getSnapshot(range);
  const content = selected.render(snapshot);
  const directory = path.join(dataDir, 'exports');
  fs.mkdirSync(directory, { recursive: true });
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出范围统计',
    defaultPath: path.join(directory, `pulse-${snapshot.range.from}-${snapshot.range.to}.${selected.extension}`),
    filters: [{ name: selected.name, extensions: [selected.extension] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content, 'utf8');
  return true;
}
async function action(name) {
  switch (name) {
    case 'show-dashboard': showDashboard(); return true;
    case 'toggle-widget': return updateSettings({ widgetVisible: !settings.widgetVisible });
    case 'hide-widget': return updateSettings({ widgetVisible: false });
    case 'minimize': mainWindow?.minimize(); return true;
    case 'close': mainWindow?.hide(); return true;
    case 'quit': quitting = true; app.quit(); return true;
    case 'open-data-folder': await shell.openPath(dataDir); return true;
    case 'open-repo': await shell.openExternal('https://github.com/zhulongqihan/codex-pulse'); return true;
    case 'open-codex': if (process.platform === 'win32') await shell.openExternal('codex://'); else await shell.openExternal('https://chatgpt.com'); return true;
    case 'choose-codex': {
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择官方 Codex 可执行文件', properties: ['openFile'], filters: [{ name: 'Codex executable', extensions: process.platform === 'win32' ? ['exe', 'cmd'] : ['*'] }] });
      if (!result.canceled && result.filePaths[0]) { settings.codexExecutable = result.filePaths[0]; persist(); if (!demo) await service.setCodexExecutable(settings.codexExecutable); }
      return { ...settings };
    }
    case 'export-csv': return exportData('csv');
    default: throw new Error('Unsupported action');
  }
}

ipcMain.handle('pulse:snapshot', (event, range) => { trusted(event); return service.getSnapshot(parseRange(range)); });
ipcMain.handle('pulse:settings', event => { trusted(event); return { ...settings }; });
ipcMain.handle('pulse:save-settings', (event, value) => { trusted(event); return updateSettings(value); });
ipcMain.handle('pulse:export', (event, format, range) => { trusted(event); return exportData(format, parseRange(range)); });
ipcMain.handle('pulse:action', (event, name) => { trusted(event); if (typeof name !== 'string') throw new Error('Invalid action'); return action(name); });
ipcMain.handle('pulse:refresh', async (event, value) => {
  trusted(event); const options = {};
  for (const key of ['logs', 'quota', 'force']) if (value && key in value) { if (typeof value[key] !== 'boolean') throw new Error('Invalid refresh request'); options[key] = value[key]; }
  await service.refresh(options);
});

app.on('second-instance', showDashboard);
app.on('before-quit', () => { quitting = true; clearInterval(refreshTimer); globalShortcut.unregisterAll(); service?.close(); });
app.on('window-all-closed', () => {});
app.on('activate', showDashboard);

if (locked) app.whenReady().then(async () => {
  if (settingsNeedMigration && !headlessCapture) persist();
  if (demo) {
    const { getDemoSnapshot } = await import('../renderer/demo-data.js');
    service = { getSnapshot: getDemoSnapshot, refresh: async () => { sendSnapshot(); }, close() {} };
  } else service = createUsageService({ dataDir: path.join(dataDir, 'statistics'), codexExecutable: settings.codexExecutable, onUpdate: sendSnapshot });
  nativeTheme.themeSource = settings.theme;
  createDashboard();
  if (settings.widgetVisible) createWidget();
  const iconFile = path.join(root, 'assets', 'icon.png');
  const icon = fs.existsSync(iconFile) ? nativeImage.createFromPath(iconFile) : nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  tray = new Tray(icon.resize({ width: 20, height: 20 })); tray.setToolTip('Codex Pulse · 本机活动与账号额度'); tray.setContextMenu(trayMenu()); tray.on('double-click', showDashboard);
  timer();
}).catch(() => { dialog.showErrorBox('Codex Pulse', '无法启动，请将完整应用放到可写目录后再试。'); quitting = true; app.quit(); });
