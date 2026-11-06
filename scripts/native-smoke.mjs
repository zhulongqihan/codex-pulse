import fs from 'node:fs';
import path from 'node:path';
import { _electron } from '@playwright/test';
import electronBinary from 'electron';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.TEMP = path.resolve('.local/temp'); env.TMP = env.TEMP;
const errors = [];
const native = await _electron.launch({ executablePath: electronBinary, args: [process.cwd(), '--demo', '--capture'], cwd: process.cwd(), env, timeout: 30000 });
try {
  const page = await native.firstWindow();
  async function capture(view, filename) {
    const encoded = await native.evaluate(async ({ BrowserWindow }, view) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/' + view));
      const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      return image.toPNG().toString('base64');
    }, view);
    fs.writeFileSync(filename, Buffer.from(encoded, 'base64'));
  }
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.app', { timeout: 20000 });
  await native.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1440, 1024);
    win.showInactive();
  });
  const snapshot = await page.evaluate(() => window.pulse.getSnapshot());
  if (snapshot.mode !== 'demo' || snapshot.source.sessionFiles !== 756) throw new Error('Screenshot isolation failed');
  fs.mkdirSync('docs/screenshots', { recursive: true });
  for (const [route, file] of [['overview', 'overview'], ['daily', 'day'], ['models', 'models'], ['projects', 'projects'], ['sessions', 'sessions'], ['settings', 'settings']]) {
    await native.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1024));
    await page.evaluate(route => { location.hash = '/' + route; }, route);
    await page.waitForTimeout(400);
    await page.locator(`.sidebar a[href="#/${route}"][aria-current="page"]`).waitFor();
    // Hidden native capture does not advance compositor transitions between frames.
    await page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); }));
    const height = await page.evaluate(() => Math.min(3600, Math.max(1024, document.documentElement.scrollHeight)));
    await native.evaluate(({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0].setContentSize(1440, height), height);
    await page.waitForTimeout(100);
    if (await page.locator('.app').count() !== 1) throw new Error('Route failed: ' + route);
    await capture(route, `docs/screenshots/${file}.png`);
  }
  const toggle = page.getByRole('switch', { name: '动效开关', exact: true });
  if (await toggle.count() === 1) await toggle.click();
  else await page.evaluate(() => window.pulse.saveSettings({ motionLevel: 'off', reducedMotion: true }));
  await page.waitForTimeout(150);
  if (await page.locator('.app').getAttribute('data-motion') !== 'off') throw new Error('Motion off not applied');
  await page.evaluate(() => window.pulse.saveSettings({ motionLevel: 'gentle', reducedMotion: false, widgetVisible: true, widgetExpanded: false }));
  let widget;
  for (let i = 0; i < 25; i++) {
    widget = native.windows().find(w => w.url().includes('/widget'));
    if (widget) break;
    await page.waitForTimeout(200);
  }
  if (!widget) throw new Error('Widget not created');
  widget.on('pageerror', error => errors.push(error.message));
  await widget.waitForSelector('.widget-app');
  await widget.waitForTimeout(250);
  await capture('widget', 'docs/screenshots/widget-compact.png');
  await page.evaluate(() => window.pulse.saveSettings({ widgetExpanded: true }));
  await widget.waitForTimeout(300);
  await capture('widget', 'docs/screenshots/widget.png');
  const bounds = await native.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/widget'));
    const b = w.getBounds(), area = screen.getDisplayMatching(b).workArea;
    return { ...b, area, fits: b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height };
  });
  // Windows fractional display scaling can round a DIP extent by one pixel.
  if (Math.abs(bounds.width - 340) > 1 || Math.abs(bounds.height - 276) > 1 || !bounds.fits) throw new Error('Widget size/placement failed: ' + JSON.stringify(bounds));
  let blocked = false;
  try { await page.evaluate(() => window.pulse.action('execute-command')); } catch { blocked = true; }
  if (!blocked) throw new Error('Unknown IPC action was not rejected');
  if (errors.length) throw new Error('Renderer errors: ' + errors.join('; '));
  fs.writeFileSync('.local/native-smoke.json', JSON.stringify({ at: new Date().toISOString(), demoIsolationPassed: true, routes: 7, motionTogglePassed: true, widgetNativeResizePassed: true, widgetFitsWorkArea: bounds.fits, unknownActionRejected: true, rendererErrors: errors, screenshots: fs.readdirSync('docs/screenshots') }, null, 2));
  console.log('Native smoke passed: 7 views, isolated demo data, motion toggle, widget resizing and IPC rejection.');
} finally { await native.close(); }
