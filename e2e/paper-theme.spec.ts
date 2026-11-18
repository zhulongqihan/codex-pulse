import { $, browser, expect } from '@wdio/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, payload) => core.invoke(cmd, payload), command, args) as Promise<T>;
}

const widget = '.pulse-widget';
const widgetSettings = 'section[aria-labelledby="pulse-widget-title"]';
const isWidgetVisible = () => invoke<boolean>('plugin:window|is_visible', { label: 'widget' });
const preferences = () => invoke<Record<string, unknown>>('get_pulse_preferences');

async function openAppearance() {
  await $('[data-testid="settings-nav-tab"]').click();
  await $('#settings-tab-appearance').click();
}

async function selectSkin(id: 'clear' | 'meter' | 'paper') {
  const button = $('button.pulse-skin-option:has(.pulse-preview-' + id + ')');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect($('html')).toHaveAttribute('data-skin', id);
}

async function logicalWidgetSize() {
  const label = 'widget';
  const [scale, size] = await Promise.all([
    invoke<number>('plugin:window|scale_factor', { label }),
    invoke<{ width: number; height: number }>('plugin:window|inner_size', { label }),
  ]);
  return { width: size.width / scale, height: size.height / scale };
}

describe('paper theme in the native app', () => {
  it('retains a selected replay and its search while switching through all three settings options', async () => {
    await browser.switchToWindow('main');
    await $('[data-testid="sessions-nav-tab"]').click();
    await $('[data-testid="session-card"]').click();
    const searchButton = $('button[aria-controls="session-detail-search"]');
    await searchButton.waitForEnabled();
    await searchButton.click();
    await expect(searchButton).toHaveAttribute('aria-expanded', 'true');
    const search = $('#session-detail-search input');
    await search.waitForDisplayed();
    await search.setValue('合成');
    await $('[data-testid="session-search-current"]').waitForDisplayed();
    const title = await $('#session-detail-title').getText();
    const before = await preferences();

    for (const skin of ['paper', 'meter', 'clear', 'paper'] as const) {
      await openAppearance();
      await selectSkin(skin);
      await $('button=返回').click();
      await expect($('#session-detail-title')).toHaveText(title);
      await expect(search).toHaveValue('合成');
    }
    expect(await preferences()).toEqual({ ...before, skinId: 'paper' });
    await $('button[aria-label="关闭会话详情"]').click();
  });

  it('follows the main skin, applies an independent override and exercises actual widget geometry and actions', async () => {
    const data = process.env.PULSE_DATA_DIR;
    if (!data) throw new Error('The isolated Pulse fixture data directory is missing');
    const basePath = join(data, 'pulse-preferences.json');
    const titlebarPath = join(data, 'pulse-titlebar-preferences.json');
    const overridePath = join(data, 'pulse-widget-appearance.json');
    const titlebarBytes = () => existsSync(titlebarPath) ? readFileSync(titlebarPath, 'utf8') : null;
    const measurements: Record<string, { width: number; height: number }> = {};
    const expectWidgetSize = async (name: string, acceptsHeight: (height: number) => boolean) => {
      await browser.waitUntil(async () => {
        measurements[name] = await logicalWidgetSize();
        const { width, height } = measurements[name];
        return Math.abs(width - 350) <= 1 && acceptsHeight(height);
      }, { timeoutMsg: `Native widget had unexpected dimensions (${name})` });
    };

    await openAppearance();
    await selectSkin('paper');
    await $('#settings-tab-desktop').click();
    await $('#settings-section-desktop').waitForDisplayed();
    // Resolve this control in the current document each time. The original
    // element reference belongs to the pre-refresh WebView document.
    const style = () => $(widgetSettings + ' select');
    await expect(style()).toHaveValue('follow');
    const checks = await $$(widgetSettings + ' input[type="checkbox"]');
    const expandInSettings = checks[2];
    if (await expandInSettings.isSelected()) {
      await expandInSettings.click();
      await browser.waitUntil(async () => (await preferences()).widgetExpanded === false);
    }
    await $('[data-testid="open-widget"]').click();
    await browser.waitUntil(isWidgetVisible);
    await browser.switchToWindow('widget');
    await expect($(widget)).toHaveAttribute('data-widget-skin', 'paper');
    await expectWidgetSize('paperCollapsed', height => height >= 83 && height < 180);

    // Each webview has its own locale at startup.
    await browser.execute(() => localStorage.setItem('language', 'zh'));
    await browser.refresh();
    const header = $('.pulse-widget-header');
    await expect(header).toHaveAttribute('data-tauri-drag-region');
    await header.$('button[aria-label="展开"]').click();
    await expect($(widget + '.is-expanded')).toBeDisplayed();
    await expectWidgetSize('paperExpanded', height => Math.abs(height - 480) <= 1);

    const pin = $('[data-testid="widget-pin"]');
    const initiallyPinned = (await preferences()).widgetAlwaysOnTop;
    await pin.click();
    await browser.waitUntil(async () => (await preferences()).widgetAlwaysOnTop === !initiallyPinned);
    await expect(pin).toHaveAttribute('aria-pressed', String(!initiallyPinned));
    await pin.waitForEnabled();
    await pin.click();
    await browser.waitUntil(async () => (await preferences()).widgetAlwaysOnTop === initiallyPinned);
    await expect(pin).toHaveAttribute('aria-pressed', String(initiallyPinned));

    await header.$('button[aria-label="收起"]').click();
    await expect($(widget + ':not(.is-expanded)')).toBeDisplayed();
    await expectWidgetSize('paperCollapsedAgain', height => height >= 83 && height < 180);

    await browser.switchToWindow('main');
    const baseBeforeOverride = readFileSync(basePath, 'utf8');
    const titlebarBeforeOverride = titlebarBytes();
    // The embedded driver synthesizes DOM keyboard events and cannot operate
    // the platform option popup. Exercise the actual settings change handler.
    const selectOverride = async (value: 'meter' | 'follow') => {
      await style().execute((element, selected) => {
        (element as HTMLSelectElement).value = String(selected);
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await browser.waitUntil(async () => (await preferences()).widgetSkin === value);
      await expect(style()).toHaveValue(value);
    };
    await selectOverride('meter');
    expect(JSON.parse(readFileSync(overridePath, 'utf8'))).toEqual({ skinId: 'meter' });
    expect(readFileSync(basePath, 'utf8')).toEqual(baseBeforeOverride);
    expect(titlebarBytes()).toEqual(titlebarBeforeOverride);
    await expect($('html')).toHaveAttribute('data-skin', 'paper');
    await browser.switchToWindow('widget');
    await expect($(widget)).toHaveAttribute('data-widget-skin', 'meter');
    await expectWidgetSize('meterOverrideCollapsed', height => Math.abs(height - 180) <= 1);
    await $('[data-testid="widget-hide"]').click();
    await browser.waitUntil(async () => !(await isWidgetVisible()));
    await browser.switchToWindow('main');
    await expect($('html')).toHaveAttribute('data-skin', 'paper');

    // Discard the browser cache so the reloaded controls must read native preferences.
    await browser.execute(() => localStorage.removeItem('codexpulse.appearance.v1'));
    await browser.refresh();
    await expect($('html')).toHaveAttribute('data-skin', 'paper');
    await openAppearance();
    await expect($('button.pulse-skin-option:has(.pulse-preview-paper)')).toHaveAttribute('aria-pressed', 'true');
    await $('#settings-tab-desktop').click();
    await $('#settings-section-desktop').waitForDisplayed();
    await expect(style()).toHaveValue('meter');
    await selectOverride('follow');
    await $('[data-testid="open-widget"]').click();
    await browser.waitUntil(isWidgetVisible);
    await browser.switchToWindow('widget');
    await expect($(widget)).toHaveAttribute('data-widget-skin', 'paper');
    await expectWidgetSize('paperRestoredFollow', height => height >= 83 && height < 180);
    await $('[data-testid="widget-hide"]').click();
    await browser.waitUntil(async () => !(await isWidgetVisible()));
    await browser.switchToWindow('main');
    writeFileSync(join(data, 'paper-theme-native-sizes.json'), JSON.stringify(measurements, null, 2));
  });
});
