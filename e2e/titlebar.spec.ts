import { $, browser, expect } from '@wdio/globals';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

type Status = { enabled: boolean; supported: boolean; hostFound: boolean; badgeVisible: boolean; popupOpen: boolean;
  reason: string;
  hostRect: { x: number; y: number; width: number; height: number } | null;
  badgeRect: { x: number; y: number; width: number; height: number } | null; dpi: number | null };
const evidence: Record<string, unknown> = {};
const output = process.env.PULSE_TEST_OUTPUT!;
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, payload) => core.invoke(cmd, payload), command, args) as Promise<T>;
}
async function status() { return invoke<Status>('get_titlebar_status'); }
function nativeState() {
  try { return JSON.parse(readFileSync(join(process.env.PULSE_TITLEBAR_CONTROL_DIR!, 'state.json'), 'utf8')); }
  catch { return null; }
}
async function command(action: string, data: Record<string, number> = {}) {
  const directory = process.env.PULSE_TITLEBAR_CONTROL_DIR!;
  const id = randomUUID();
  const temporary = join(directory, `command-${id}.tmp`);
  writeFileSync(temporary, JSON.stringify({ id, action, ...data }));
  await browser.waitUntil(async () => {
    try { renameSync(temporary, join(directory, 'command.json')); return true; } catch { return false; }
  });
  await browser.waitUntil(async () => {
    return nativeState()?.commandId === id;
  });
}
async function visible(value: boolean) {
  try { await browser.waitUntil(async () => (await status()).badgeVisible === value); }
  catch (error) {
    const tracked = await status().catch(() => null);
    const actual = nativeState();
    record('visibility-timeout', { expectedVisible: value, status: tracked, nativeState: actual });
    // Every value comes from the owned synthetic host; no account data or window text.
    console.error('[Pulse native visibility timeout]', JSON.stringify({ expectedVisible: value, reason: tracked?.reason,
      hostRect: tracked?.hostRect, badgeRect: tracked?.badgeRect, workArea: actual?.workArea,
      foreground: actual?.foreground, minimized: actual?.minimized, nativeRect: actual && { x: actual.x, y: actual.y, width: actual.width, height: actual.height } }));
    throw error;
  }
  return status();
}
async function synchronizedGeometry() {
  await browser.waitUntil(async () => {
    const actual = nativeState();
    const tracked = (await status()).hostRect;
    return actual && tracked && ['x', 'y', 'width', 'height'].every(key => actual[key] === tracked[key as keyof typeof tracked]);
  });
  return status();
}
function record(name: string, value: unknown) {
  evidence[name] = value;
  writeFileSync(join(output, 'native-titlebar-evidence.json'), JSON.stringify(evidence, null, 2));
}

describe('Pulse attached titlebar in a real owned native host', () => {
  it('follows movement and native window state while leaving other windows uncovered', async () => {
    await invoke('set_pulse_preferences', { patch: { titlebarEnabled: true, theme: 'light', compactMode: false, skinId: 'clear' } });
    await command('activate');
    const initial = await visible(true);
    expect(initial.supported).toBe(true); expect(initial.hostFound).toBe(true);
    expect(initial.badgeRect!.x).toBeGreaterThan(initial.hostRect!.x);
    expect(initial.badgeRect!.x + initial.badgeRect!.width).toBeLessThan(initial.hostRect!.x + initial.hostRect!.width);
    // The watcher's actual native show operation must keep its owned host in the foreground.
    await browser.waitUntil(() => nativeState()?.foreground === true);
    const noFocusTheft = nativeState();
    const workArea = noFocusTheft.workArea;
    expect(workArea.width).toBeGreaterThan(0); expect(workArea.height).toBeGreaterThan(0);
    const width = Math.floor(Math.min(1200, workArea.width * 0.7));
    const height = Math.floor(Math.min(780, workArea.height * 0.72));
    const movement = { x: workArea.x + Math.floor((workArea.width - width) * 0.45),
      y: workArea.y + Math.floor((workArea.height - height) * 0.6), width, height };
    await command('move', movement);
    await visible(true); const moved = await synchronizedGeometry();
    expect(moved.hostRect).toEqual(movement);
    expect(moved.badgeRect!.x).not.toBe(initial.badgeRect!.x);
    await command('minimize'); const minimized = await visible(false);
    expect(minimized.popupOpen).toBe(false);
    await command('restore'); await visible(true); const restored = await synchronizedGeometry();
    await command('maximize'); await visible(true); const maximized = await synchronizedGeometry();
    expect(maximized.hostRect!.width).toBeGreaterThan(restored.hostRect!.width);
    expect(maximized.badgeRect!.x).not.toBe(restored.badgeRect!.x);
    expect(maximized.badgeRect!.y).toBeGreaterThanOrEqual(workArea.y);
    await command('focus-other'); const unrelated = await visible(false);
    expect(unrelated.popupOpen).toBe(false);
    await command('close-host'); await visible(false);
    await browser.waitUntil(async () => !(await status()).hostFound);
    const closed = await status();
    expect(closed.hostFound).toBe(false);
    await command('reopen'); const reopened = await visible(true);
    await command('activate'); await visible(true);
    await invoke('set_pulse_preferences', { patch: { titlebarEnabled: false } }); const disabled = await visible(false);
    expect(disabled.enabled).toBe(false);
    await invoke('set_pulse_preferences', { patch: { titlebarEnabled: true } }); await visible(true);
    record('movement-state-focus-and-preference', { initial, noFocusTheft, workArea, movement, moved, minimized, restored, maximized, unrelated, closed, reopened, disabled });
  });

  it('opens the actual no-composer popup from the badge and supports Escape and outside focus', async () => {
    await command('restore'); await command('activate'); await visible(true);
    await browser.switchToWindow('pulse-badge');
    await $('[data-testid="pace-badge"]').waitForDisplayed();
    expect(await browser.execute(() => document.querySelectorAll('input,textarea,[contenteditable="true"]').length)).toBe(0);
    await browser.saveScreenshot(join(output, 'native-titlebar-badge.png'));
    await $('[data-testid="pace-badge"]').click();
    await browser.waitUntil(async () => (await status()).popupOpen);
    await browser.switchToWindow('pulse-pace');
    await $('[data-testid="pace-popover"]').waitForDisplayed();
    const popup = await browser.execute(() => ({ fields: document.querySelectorAll('input,textarea,[contenteditable="true"]').length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      hasButtons: document.querySelectorAll('button').length > 0 }));
    expect(popup.fields).toBe(0); expect(popup.noHorizontalOverflow).toBe(true); expect(popup.hasButtons).toBe(true);
    await browser.saveScreenshot(join(output, 'native-titlebar-popover.png'));
    const styles: Record<string, unknown> = {};
    for (const skinId of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'light' } });
      await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skinId);
      styles[skinId] = await browser.execute(() => ({ skin: document.documentElement.dataset.skin,
        bodyHeight: document.body.scrollHeight, viewport: innerHeight,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        footerVisible: (() => { const footer = document.querySelector('.pulse-pace-footer'); if (!footer) return false;
          const bounds = footer.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight + 1; })() }));
      expect((styles[skinId] as { noHorizontalOverflow: boolean }).noHorizontalOverflow).toBe(true);
      expect((styles[skinId] as { footerVisible: boolean }).footerVisible).toBe(true);
      await browser.saveScreenshot(join(output, `native-titlebar-popover-${skinId}.png`));
    }
    await browser.keys('Escape');
    await browser.waitUntil(async () => !(await status()).popupOpen);
    await command('activate'); await visible(true);
    await browser.switchToWindow('pulse-badge'); await $('[data-testid="pace-badge"]').click();
    await browser.waitUntil(async () => (await status()).popupOpen);
    await command('focus-other'); await visible(false);
    expect((await status()).popupOpen).toBe(false);
    await command('activate'); await visible(true);
    await browser.switchToWindow('main');
    record('native-popup-and-dismissal', { popup, styles, escapeClosed: true, otherWindowClosed: true, state: await status() });
  });
});
