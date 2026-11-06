import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen, shell, dialog, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUsageService } from './usage-service.mjs';

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
const defaults = { theme: 'light', language: 'zh', widgetVisible: true, widgetExpanded: false, launchAtLogin: false, refreshSeconds: 60, motionLevel: 'gentle', reducedMotion: false, respectReducedMotion: true };
const settingsFile = path.join(dataDir, 'settings.json');
let settings = { ...defaults };
try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch {}
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
    if (typeof value[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value[key])) throw new Error('Invalid date');
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
  mainWindow = new BrowserWindow({ width: Math.max(900, Math.min(1440, area.width - 40)), height: Math.max(660, Math.min(1040, area.height - 40)), minWidth: 900, minHeight: 660, show: false, backgroundColor: '#ffffff', title: 'Codex Pulse · 专注的回响', autoHideMenuBar: true, icon: path.join(root, 'assets', 'icon.png'), webPreferences: { preload: path.join(root, 'src/main/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: !headlessCapture, spellcheck: false } });
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
function persist() { if (!demo) fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); }
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
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid preferences');
  const clean = {};
  for (const [key, allowed] of Object.entries({ theme: ['light', 'dark', 'system'], language: ['zh', 'en'], motionLevel: ['full', 'gentle', 'off'] })) if (key in patch) {
    if (!allowed.includes(patch[key])) throw new Error('Invalid preference'); clean[key] = patch[key];
  }
  for (const key of ['widgetVisible', 'widgetExpanded', 'launchAtLogin', 'reducedMotion', 'respectReducedMotion']) if (key in patch) {
    if (typeof patch[key] !== 'boolean') throw new Error('Invalid switch'); clean[key] = patch[key];
  }
  if ('refreshSeconds' in patch) { if (![60, 120, 300, 600].includes(Number(patch.refreshSeconds))) throw new Error('Unsupported refresh interval'); clean.refreshSeconds = Number(patch.refreshSeconds); }
  settings = { ...settings, ...clean };
  nativeTheme.themeSource = settings.theme;
  if ('launchAtLogin' in clean && !demo) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: process.execPath, args: ['--background'] });
  if (settings.widgetVisible) {
    createWidget();
    const bounds = widgetWindow.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const height = settings.widgetExpanded ? 276 : 126;
    widgetWindow.setBounds({ width: 340, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - 340)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) });
  } else if (widgetWindow) widgetWindow.hide();
  persist(); timer();
  for (const win of [mainWindow, widgetWindow]) if (win && !win.isDestroyed()) win.webContents.send('pulse:settings-update', { ...settings });
  if (tray) tray.setContextMenu(trayMenu());
  return { ...settings };
}
function csvCell(value) { const text = String(value ?? ''); return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"'; }
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
    case 'export-csv': {
      const result = await dialog.showSaveDialog(mainWindow, { title: '导出每日统计', defaultPath: path.join(dataDir, 'codex-pulse-daily.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (result.canceled || !result.filePath) return false;
      const rows = service.getSnapshot().daily;
      const csv = '\ufeff' + [['Date', 'Total tokens', 'Input', 'Cached input (included in input)', 'Output', 'Sessions'], ...rows.map(r => [r.date, r.totalTokens, r.inputTokens, r.cachedTokens, r.outputTokens, r.sessions])].map(row => row.map(csvCell).join(',')).join('\r\n');
      fs.writeFileSync(result.filePath, csv); return true;
    }
    default: throw new Error('Unsupported action');
  }
}

ipcMain.handle('pulse:snapshot', (event, range) => { trusted(event); return service.getSnapshot(parseRange(range)); });
ipcMain.handle('pulse:settings', event => { trusted(event); return { ...settings }; });
ipcMain.handle('pulse:save-settings', (event, value) => { trusted(event); return updateSettings(value); });
ipcMain.handle('pulse:action', (event, name) => { trusted(event); if (typeof name !== 'string') throw new Error('Invalid action'); return action(name); });
ipcMain.handle('pulse:refresh', async (event, value) => {
  trusted(event); const options = {};
  for (const key of ['logs', 'quota']) if (value && key in value) { if (typeof value[key] !== 'boolean') throw new Error('Invalid refresh request'); options[key] = value[key]; }
  await service.refresh(options);
});

app.on('second-instance', showDashboard);
app.on('before-quit', () => { quitting = true; clearInterval(refreshTimer); globalShortcut.unregisterAll(); service?.close(); });
app.on('window-all-closed', () => {});
app.on('activate', showDashboard);

if (locked) app.whenReady().then(async () => {
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
