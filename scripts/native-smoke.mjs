import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from '@playwright/test';
import electronBinary from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotsDir = path.join(root, 'docs', 'screenshots');
const reportFile = path.join(root, '.local', 'native-smoke.json');
const demoDir = path.join(root, '.local', 'demo-state');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.PULSE_DEV_URL;
env.PULSE_DATA_DIR = demoDir;
env.TEMP = path.join(root, '.local', 'temp');
env.TMP = env.TEMP;
env.TMPDIR = env.TEMP;
fs.mkdirSync(env.TEMP, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.rmSync(reportFile, { force: true });

const errors = [];
const screenshots = [];
const routes = [['overview', 'overview'], ['sessions', 'sessions'], ['models', 'models'], ['daily', 'day'], ['monthly', 'monthly'], ['projects', 'projects'], ['settings', 'settings']];
const native = await _electron.launch({ executablePath: electronBinary, args: [root, '--demo', '--capture'], cwd: root, env, timeout: 30000 });
try {
  const watched = new WeakSet();
  const watch = surface => {
    if (watched.has(surface)) return;
    watched.add(surface);
    surface.on('pageerror', error => errors.push(error.message));
  };
  native.on('window', watch);
  const page = await native.firstWindow();
  native.windows().forEach(watch);
  await page.waitForSelector('.app', { timeout: 20000 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  const launch = await native.evaluate(({ app }) => ({ dataDir: app.getPath('userData'), demo: process.argv.includes('--demo'), capture: process.argv.includes('--capture') }));
  assert.equal(path.resolve(launch.dataDir), demoDir, 'native screenshots must use the isolated demo state');
  assert(launch.demo && launch.capture, 'both demo and capture flags are required');
  const mainId = await native.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('/widget')).id);

  async function resizeMain(height = 1024) {
    await native.evaluate(({ BrowserWindow }, { id, height }) => {
      const win = BrowserWindow.fromId(id);
      win.setContentSize(1440, height);
      win.showInactive();
    }, { id: mainId, height });
  }
  async function settle(surface) {
    await surface.evaluate(async () => {
      await document.fonts.ready;
      // Hidden native capture does not advance finite compositor transitions.
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming().iterations !== Infinity) {
          try { animation.finish(); } catch { /* An idle animation need not finish. */ }
        }
      }
    });
    await surface.waitForTimeout(100);
  }
  async function capture(id, filename) {
    const encoded = await native.evaluate(async ({ BrowserWindow }, id) => {
      const image = await BrowserWindow.fromId(id).webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      return image.toPNG().toString('base64');
    }, id);
    fs.writeFileSync(path.join(screenshotsDir, filename), Buffer.from(encoded, 'base64'));
    screenshots.push(filename);
  }
  async function navigate(route) {
    const button = page.locator(`button[data-route="${route}"]`);
    await button.waitFor();
    if (await page.evaluate(() => location.hash) !== '#/' + route) await button.click();
    await page.waitForFunction(route => location.hash === '#/' + route, route);
    await page.locator(`button[data-route="${route}"][aria-current="page"]`).waitFor();
    assert.equal(await page.locator('.app').count(), 1, 'one application root on ' + route);
  }
  async function captureRoute(route, filename) {
    await resizeMain();
    await navigate(route);
    await settle(page);
    const height = await page.evaluate(() => Math.min(3600, Math.max(1024, document.documentElement.scrollHeight)));
    await resizeMain(height);
    await settle(page);
    await capture(mainId, filename);
  }
  async function saveSettings(patch, surface = page) {
    return surface.evaluate(patch => window.pulse.saveSettings(patch), patch);
  }
  async function expectSkin(skin) {
    await page.waitForFunction(skin => document.documentElement.dataset.variant === skin && document.documentElement.dataset.skin === 'light', skin);
    assert.equal((await page.evaluate(() => window.pulse.getSettings())).skinId, skin);
  }
  async function selectionState() {
    return page.evaluate(() => ({
      route: location.hash,
      fields: [...document.querySelectorAll('main select, main input[type="date"], main input[type="search"], main input[type="text"]')].map(field => ({
        name: field.getAttribute('aria-label') || field.name || field.id || field.type,
        value: field.value,
      })),
    }));
  }
  async function expectUnchangedData() {
    assert.deepEqual(await page.evaluate(() => window.pulse.getSnapshot()), snapshot, 'skin changes must preserve the demo data and its source');
  }

  const snapshot = await page.evaluate(() => window.pulse.getSnapshot());
  assert.equal(snapshot.mode, 'demo', 'screenshots cannot use a live account');
  assert.equal(snapshot.source.sessionFiles, 756);
  assert.equal(snapshot.source.logsOrigin, 'demo');
  await saveSettings({ skinId: 'meter', theme: 'light', language: 'zh', compactMode: false, motionLevel: 'gentle', reducedMotion: false, respectReducedMotion: false, widgetVisible: false, widgetExpanded: false });
  await expectSkin('meter');
  await navigate('overview');
  for (const skin of ['clear', 'meter']) {
    await saveSettings({ skinId: skin, theme: 'light' });
    await expectSkin(skin);
    await expectUnchangedData();
    await captureRoute('overview', `${skin}-overview.png`);
  }

  // Keep a non-default route and any rendered range/search fields selected while
  // switching skins. This also works before individual filter selectors exist.
  await navigate('sessions');
  const selection = await selectionState();
  const preferences = await page.evaluate(() => window.pulse.getSettings());
  for (const skinId of ['clear', 'meter']) {
    const saved = await saveSettings({ skinId });
    await expectSkin(skinId);
    assert.deepEqual(saved, { ...preferences, skinId }, 'a skin patch must preserve every other preference');
    assert.deepEqual(await selectionState(), selection, 'a skin patch must preserve the current route and form selections');
    await page.locator('button[data-route="sessions"][aria-current="page"]').waitFor();
    await expectUnchangedData();
  }
  for (const [route, file] of routes) await captureRoute(route, `${file}.png`);

  await saveSettings({ motionLevel: 'off', reducedMotion: true });
  await page.waitForFunction(() => document.querySelector('.app')?.dataset.motion === 'off');
  const quiet = await page.evaluate(() => window.pulse.getSettings());
  assert.equal(quiet.motionLevel, 'off');
  assert.equal(quiet.reducedMotion, true);
  await saveSettings({ motionLevel: 'gentle', reducedMotion: false, widgetVisible: true, widgetExpanded: false });
  await page.waitForFunction(() => document.querySelector('.app')?.dataset.motion === 'gentle');

  let widget;
  for (let i = 0; i < 50; i++) {
    widget = native.windows().find(w => w.url().includes('/widget'));
    if (widget) break;
    await page.waitForTimeout(200);
  }
  assert(widget, 'the widget must be created by the native settings path');
  watch(widget);
  await widget.waitForSelector('.widget-app .widget-page', { timeout: 20000 });
  const widgetId = await native.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/widget')).id);
  async function widgetBounds(height) {
    const bounds = await native.evaluate(({ BrowserWindow, screen }, id) => {
      const win = BrowserWindow.fromId(id);
      const b = win.getBounds(), area = screen.getDisplayMatching(b).workArea;
      return { ...b, area, fits: b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height };
    }, widgetId);
    // Windows fractional display scaling can round a DIP extent by one pixel.
    assert(Math.abs(bounds.width - 340) <= 1 && Math.abs(bounds.height - height) <= 1 && bounds.fits, 'widget size/placement failed: ' + JSON.stringify(bounds));
    return bounds;
  }
  await widget.locator('.widget-page:not(.expanded)').waitFor();
  await settle(widget);
  await widgetBounds(126);
  await capture(widgetId, 'widget-compact.png');
  await saveSettings({ widgetExpanded: true });
  await widget.locator('.widget-page.expanded').waitFor();
  await settle(widget);
  const bounds = await widgetBounds(276);
  await capture(widgetId, 'widget.png');

  await saveSettings({ skinId: 'clear' }, widget);
  await expectSkin('clear');
  await saveSettings({ skinId: 'meter' });
  await expectSkin('meter');
  assert.equal((await widget.evaluate(() => window.pulse.getSettings())).skinId, 'meter');
  assert.deepEqual(await widgetBounds(276), bounds, 'cross-window skin changes must preserve native widget bounds');
  await expectUnchangedData();
  let blocked = false;
  try { await page.evaluate(() => window.pulse.action('execute-command')); } catch { blocked = true; }
  assert(blocked, 'unknown IPC actions must be rejected');
  assert.deepEqual(errors, [], 'both renderers must complete without page errors');
  fs.writeFileSync(reportFile, JSON.stringify({
    at: new Date().toISOString(), demoIsolationPassed: true, routes: routes.length + 1,
    skins: ['clear', 'meter'], skinPreservesDataPassed: true, skinPreservesPreferencesPassed: true,
    skinPreservesRoutePassed: true, preservedFormControls: selection.fields.length, crossWindowSkinSyncPassed: true,
    motionTogglePassed: true, widgetNativeResizePassed: true, widgetFitsWorkArea: bounds.fits,
    unknownActionRejected: true, rendererErrors: errors, screenshots,
  }, null, 2));
  console.log('Native smoke passed: 8 views, Clear/Meter skins, isolated demo data, preserved selections, motion, widget resize and IPC rejection.');
} finally { await native.close(); }
