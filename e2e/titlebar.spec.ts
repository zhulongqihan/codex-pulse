import { $, browser, expect } from '@wdio/globals';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syntheticPaceSnapshot } from '../src/pulse/lib/pulse-pace';

type Status = { enabled: boolean; supported: boolean; hostFound: boolean; badgeVisible: boolean; badgeForeground: boolean; popupOpen: boolean; popupForeground: boolean;
  reason: string;
  hostRect: { x: number; y: number; width: number; height: number } | null;
  badgeRect: { x: number; y: number; width: number; height: number } | null;
  panelRect: { x: number; y: number; width: number; height: number } | null; dpi: number | null };
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
  let acknowledged: ReturnType<typeof nativeState> = null;
  await browser.waitUntil(async () => {
    const state = nativeState();
    if (state?.commandId !== id || state.pendingPhysicalClick || state.pendingMotion) return false;
    acknowledged = state;
    return true;
  });
  // Publishing the next state briefly replaces the file. Keep the exact valid
  // acknowledgement instead of rereading during that replacement window.
  const commandError = acknowledged.commandError;
  if (commandError) throw new Error(`Owned native input was blocked: ${commandError}`);
  return acknowledged;
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
async function nativePopupFocus() {
  let stableSince = 0;
  try {
    await browser.waitUntil(async () => {
      const state = await status();
      if (!state.popupOpen || !state.popupForeground) { stableSince = 0; return false; }
      if (!stableSince) stableSince = Date.now();
      return Date.now() - stableSince >= 500;
    }, { interval: 100 });
  } catch (error) {
    const tracked = await status().catch(() => null);
    const dom = await browser.execute(() => {
      const target = window as typeof window & { pulsePhysicalInputTrace?: unknown[]; pulseNativeFocusEvents?: unknown[] };
      const button = document.querySelector('[data-testid="pace-badge"]');
      const bounds = button?.getBoundingClientRect();
      return { trace: target.pulsePhysicalInputTrace, nativeFocusEvents: target.pulseNativeFocusEvents, viewport: { width: innerWidth, height: innerHeight },
        button: bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        activeTag: document.activeElement?.tagName };
    }).catch(() => null);
    record('popup-focus-timeout', { status: tracked, nativeState: nativeState(), dom });
    console.error('[Pulse native popup focus timeout]', JSON.stringify(tracked));
    throw error;
  }
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
    let noFocusTheft: ReturnType<typeof nativeState> = null;
    await browser.waitUntil(() => {
      const state = nativeState();
      if (state?.foreground !== true) return false;
      noFocusTheft = state;
      return true;
    });
    const captionlessState = await command('captionless');
    await visible(true);
    const captionless = await synchronizedGeometry();
    expect(captionlessState.style & 0x00c00000).toBe(0);
    expect(captionlessState.style & 0x00070000).toBe(0x00070000);
    record('captionless-main-frame', { nativeState: captionlessState, status: captionless });
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
    await command('measure-follow');
    const motion = JSON.parse(readFileSync(join(process.env.PULSE_TITLEBAR_CONTROL_DIR!, 'motion.json'), 'utf8'));
    record('continuous-native-motion', motion);
    console.log('[Pulse owned native motion]', JSON.stringify({ hostMoves: motion.hostMoves, badgeUpdates: motion.badgeUpdates,
      p95ObservedLagMs: motion.p95ObservedLagMs, maxObservedLagMs: motion.maxObservedLagMs, finalSettleMs: motion.finalSettleMs,
      idleOneCoreCpuPercent: motion.idleOneCoreCpuPercent, motionOneCoreCpuPercent: motion.motionOneCoreCpuPercent,
      finalAligned: motion.finalAligned, foregroundPreserved: motion.foregroundPreserved, failure: motion.failure }));
    expect(motion.passed).toBe(true);
    expect(motion.foregroundPreserved).toBe(true);
    expect(motion.badgeUpdates).toBeGreaterThanOrEqual(16);
    expect(motion.p95ObservedLagMs).toBeLessThanOrEqual(100);
    expect(motion.finalAligned).toBe(true);
    await synchronizedGeometry();
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
    await command('restore'); await command('captionless'); await command('activate'); await visible(true);
    // Initialize this WebView's embedded-driver bridge before native input. Return
    // the real foreground to the fixture afterwards; never switch to the popup.
    await browser.switchToWindow('pulse-badge');
    await $('[data-testid="pace-badge"]').waitForDisplayed();
    await command('activate'); await visible(true);
    await browser.execute(async () => {
      const target = window as typeof window & { pulseNativeFocusEvents?: unknown[]; pulseStopFocusEvents?: () => void;
        __TAURI__: { event: { listen: (name: string, handler: (message: { payload: unknown }) => void) => Promise<() => void> } } };
      target.pulseNativeFocusEvents = [];
      target.pulseStopFocusEvents = await target.__TAURI__.event.listen('titlebar-status', message => target.pulseNativeFocusEvents!.push(message.payload));
      const inputTarget = window as typeof window & { pulsePhysicalInputTrace?: unknown[] };
      inputTarget.pulsePhysicalInputTrace = [];
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'focus', 'blur']) {
        document.addEventListener(type, event => inputTarget.pulsePhysicalInputTrace!.push({ type: event.type,
          trusted: event.isTrusted, target: (event.target as HTMLElement)?.tagName, at: performance.now() }), true);
      }
    });
    const nativeStateBeforePhysicalClick = await status();
    expect(nativeStateBeforePhysicalClick.badgeForeground).toBe(false);
    const center = nativeStateBeforePhysicalClick.badgeRect!;
    await command('click-badge', { x: Math.round(center.x + center.width / 2), y: Math.round(center.y + center.height / 2) });
    // Read Win32 foreground state before any driver window switch can activate it.
    const nativeFocusBeforeDriverSwitch = await nativePopupFocus();
    expect(nativeFocusBeforeDriverSwitch.popupForeground).toBe(true);
    const nativeFocusEvents = await browser.execute(() => {
      const target = window as typeof window & { pulseNativeFocusEvents?: { badgeForeground: boolean; popupForeground: boolean; popupOpen: boolean }[]; pulseStopFocusEvents?: () => void };
      target.pulseStopFocusEvents?.();
      return target.pulseNativeFocusEvents ?? [];
    });
    // An old NOACTIVATE badge can sometimes open a popup under a driver. It still
    // fails this native, physical-click activation transition before any switch.
    expect(nativeFocusEvents.some(state => state.badgeForeground)).toBe(true);
    expect(nativeFocusEvents.some(state => state.popupForeground)).toBe(true);
    await browser.switchToWindow('pulse-pace');
    await $('[data-testid="pace-popover"]').waitForDisplayed();
    const clientSize = await invoke<{width: number; height: number}>('plugin:window|inner_size', {label: 'pulse-pace'});
    expect(clientSize).toEqual({width: nativeFocusBeforeDriverSwitch.panelRect!.width,
      height: nativeFocusBeforeDriverSwitch.panelRect!.height});
    const popup = await browser.execute(() => ({ fields: document.querySelectorAll('input,textarea,[contenteditable="true"]').length,
      dailyObservations: document.querySelectorAll('[data-testid="coach-cycle-observations"]').length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      hasButtons: document.querySelectorAll('button').length > 0 }));
    expect(popup.fields).toBe(0); expect(popup.dailyObservations).toBe(0); expect(popup.noHorizontalOverflow).toBe(true); expect(popup.hasButtons).toBe(true);
    await browser.saveScreenshot(join(output, 'native-titlebar-popover.png'));
    const styles: Record<string, unknown> = {};
    for (const skinId of ['clear', 'meter', 'paper']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'light' } });
      await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skinId);
      if (skinId === 'paper') {
        // Only the local reading is synthetic. The actual popup, native input
        // and dismissal commands continue to use the owned Tauri fixture.
        await browser.execute((snapshot) => {
          const target = window as typeof window & { pulseTypographyFetch?: typeof window.fetch;
            __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol: string) => string } };
          const url = target.__TAURI_INTERNALS__.convertFileSrc('fetch_pulse_pace', 'ipc');
          const original = window.fetch;
          target.pulseTypographyFetch = original;
          window.fetch = (input, options) => String(input) === url
            ? Promise.resolve(new Response(JSON.stringify(snapshot), { headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' } }))
            : original.call(window, input, options);
        }, syntheticPaceSnapshot('forecast'));
      }
      try {
        if (skinId === 'paper') {
          await invoke('plugin:event|emit', { event: 'pulse-pace-updated', payload: null });
          const info = $('.coach-reference .pulse-reading-info');
          const tip = $('[role="tooltip"]');
          await info.waitForDisplayed();
          await tip.waitForExist({ reverse: true });
          await info.click();
          await tip.waitForDisplayed();
          const selectors = ['.pulse-pace-header h2', '.coach-window-tag', '.coach-key-readings strong',
            '.coach-countdown', '.coach-reference h3', '.coach-reference strong', '[role="tooltip"]',
            '.pulse-pace-footer time', '.pace-details'];
          for (const selector of selectors) await $(selector).waitForExist();
          const fonts = await browser.execute((required) => required.flatMap(selector => {
            const elements = [...document.querySelectorAll(selector)];
            if (!elements.length) throw new Error(`Missing Paper popover typography target: ${selector}`);
            return elements.map(element => ({ selector, family: getComputedStyle(element).fontFamily }));
          }), selectors);
          record('paper-popover-reading-fonts', fonts);
          for (const font of fonts) {
            expect(font.family).toMatch(/Segoe UI/);
            expect(font.family).not.toMatch(/KaiTi|STKaiti|Georgia|Times New Roman|SimSun|楷体|宋体/i);
          }
          const tipFits = await browser.execute(() => {
            const rect = document.querySelector('[role="tooltip"]')?.getBoundingClientRect();
            return !!rect && rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
          });
          expect(tipFits).toBe(true);
          await browser.keys('Escape');
          await tip.waitForExist({ reverse: true });
          expect((await status()).popupOpen).toBe(true);
        }
        styles[skinId] = await browser.execute(() => ({ skin: document.documentElement.dataset.skin,
          bodyHeight: document.body.scrollHeight, viewport: innerHeight,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          footerVisible: (() => { const footer = document.querySelector('.pulse-pace-footer'); if (!footer) return false;
            const bounds = footer.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight + 1; })() }));
        expect((styles[skinId] as { noHorizontalOverflow: boolean }).noHorizontalOverflow).toBe(true);
        expect((styles[skinId] as { footerVisible: boolean }).footerVisible).toBe(true);
        await browser.saveScreenshot(join(output, `native-titlebar-popover-${skinId}.png`));
      } finally {
        if (skinId === 'paper') {
          await browser.execute(() => {
            const target = window as typeof window & { pulseTypographyFetch?: typeof window.fetch };
            if (!target.pulseTypographyFetch) throw new Error('The Paper typography fetch restore point is missing');
            window.fetch = target.pulseTypographyFetch;
            delete target.pulseTypographyFetch;
          });
          await invoke('plugin:event|emit', { event: 'pulse-pace-updated', payload: null });
        }
      }
    }
    await browser.keys('Escape');
    await browser.waitUntil(async () => !(await status()).popupOpen && nativeState()?.foreground === true);
    record('physical-open-and-escape', { nativeStateBeforePhysicalClick, nativeFocusBeforeDriverSwitch, nativeFocusEvents,
      escapeClosedToHost: true, afterEscape: await status(), nativeAfterEscape: nativeState() });
    // Esc must return native input focus without a fixture activation masking it.
    await visible(true);
    const reopenedCenter = (await status()).badgeRect!;
    await command('click-badge', { x: Math.round(reopenedCenter.x + reopenedCenter.width / 2), y: Math.round(reopenedCenter.y + reopenedCenter.height / 2) });
    await nativePopupFocus();
    const closeCenter = (await status()).badgeRect!;
    await command('toggle-badge', { x: Math.round(closeCenter.x + closeCenter.width / 2), y: Math.round(closeCenter.y + closeCenter.height / 2) });
    await browser.waitUntil(async () => !(await status()).popupOpen && nativeState()?.foreground === true);
    await visible(true);
    const thirdCenter = (await status()).badgeRect!;
    await command('click-badge', { x: Math.round(thirdCenter.x + thirdCenter.width / 2), y: Math.round(thirdCenter.y + thirdCenter.height / 2) });
    await nativePopupFocus();
    await command('focus-other'); await visible(false);
    expect((await status()).popupOpen).toBe(false);
    await command('activate'); await visible(true);
    await browser.switchToWindow('pulse-badge');
    await $('[data-testid="pace-badge"]').waitForDisplayed();
    expect(await browser.execute(() => document.querySelectorAll('input,textarea,[contenteditable="true"]').length)).toBe(0);
    await browser.saveScreenshot(join(output, 'native-titlebar-badge.png'));
    await browser.switchToWindow('main');
    record('native-popup-and-dismissal', { popup, clientSize, nativeStateBeforePhysicalClick, nativeFocusBeforeDriverSwitch, nativeFocusEvents, styles, escapeClosedToHost: true, badgeToggleClosedToHost: true, otherWindowClosed: true, physicalBadgeClicks: nativeState()?.physicalBadgeClicks, state: await status(), inputScope: 'Guarded Win32 SendInput on owned fixture + exact debug image. Real production Codex is a separate acceptance check' });
  });
});
