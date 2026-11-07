import { $, browser, expect } from '@wdio/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const output = process.env.PULSE_TEST_OUTPUT!;
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, payload) => core.invoke(cmd, payload), command, args) as Promise<T>;
}
async function shot(name: string) { mkdirSync(output, { recursive: true }); await browser.saveScreenshot(join(output, `${name}.png`)); }

describe('Pulse native parity', () => {
  it('runs the real Rust scanner with full project identities and cross-day threads', async () => {
    expect(await browser.execute(() => '__TAURI_INTERNALS__' in window)).toBe(true);
    await invoke('scan_usage');
    const overview = await invoke<any>('fetch_overview', { range: '30d' });
    const sessions = await invoke<any[]>('fetch_session_details');
    const monthly = await invoke<any>('fetch_monthly_usage');
    expect(overview.totals.totalTokens).toBeGreaterThan(100000);
    expect(overview.projects.filter((project: any) => project.project.endsWith('/Atlas')).length).toBe(2);
    expect(sessions.length).toBe(18);
    const crossDay = sessions.find(session => session.id === '11111111-1111-4111-8111-000000000003' || session.threadId === '11111111-1111-4111-8111-000000000003');
    expect(crossDay).toBeDefined();
    expect(crossDay.dailyUsage.length).toBe(2);
    const detail = await invoke<any>('fetch_session_detail', { path: crossDay.path });
    expect(detail.rawJsonl).toContain('第二天继续');
    expect(detail.rawJsonl).toContain('function_call_output');
    expect(detail.turns.length).toBeGreaterThan(0);
    expect(overview.totals.avgTokensPerDay).toBeCloseTo(overview.totals.totalTokens / overview.days, 5);
    const paths = await invoke<any>('get_pulse_paths');
    expect(paths.data).toBe(process.env.PULSE_DATA_DIR);
    expect(paths.profile.startsWith(paths.data)).toBe(true);
    expect(paths.logs.startsWith(paths.data)).toBe(true);
    expect(paths.temporary.startsWith(paths.data)).toBe(true);
    writeFileSync(join(output, 'engine-evidence.json'), JSON.stringify({ overview, sessions, monthly, paths, detail }, null, 2));
  });

  it('renders every main route in both skins and preserves selections', async () => {
    await browser.refresh();
    await $('[data-testid="dashboard-nav-tab"]').waitForDisplayed({ timeout: 90000 });
    for (const skin of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId: skin, theme: 'light', motionLevel: 'off' } });
      await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skin);
      for (const route of ['dashboard', 'sessions', 'models', 'daily', 'monthly', 'projects', 'settings']) {
        const tab = $(`[data-testid="${route}-nav-tab"]`);
        await tab.waitForDisplayed(); await tab.click();
        await $('#root').waitForDisplayed();
        expect(await browser.execute(() => document.body.innerText.trim().length)).toBeGreaterThan(100);
        await shot(`${skin}-${route}`);
      }
      await $('[data-testid="models-nav-tab"]').click();
      await $('[data-testid="models-catalog-tab"]').waitForDisplayed();
      await $('[data-testid="models-catalog-tab"]').click();
      await $('[data-testid="pricing-search"]').waitForDisplayed();
      await $('[data-testid="pricing-search"]').setValue('gpt-5');
      await shot(`${skin}-pricing`);
      await $('[data-testid="sessions-nav-tab"]').click();
      await $('[data-testid="session-card"]').waitForDisplayed();
      await $('[data-testid="session-card"]').click();
      await $('[aria-labelledby="session-detail-title"]').waitForDisplayed();
      await $('[aria-label="会话摘要"]').waitForDisplayed();
      await shot(`${skin}-replay`);
      await $('button[aria-label="关闭会话详情"]').click();
    }
  });

  it('keeps search, selected replay and scroll position without data requests on appearance changes', async () => {
    await $('[data-testid="sessions-nav-tab"]').click();
    await $('[data-testid="session-card"]').waitForDisplayed();
    await $('[data-testid="session-card"]').click();
    await $('[aria-label="会话摘要"]').waitForDisplayed();
    await $('button[aria-controls="session-detail-search"]').click();
    const search = $('#session-detail-search input');
    await search.waitForDisplayed();
    await search.setValue('合成');
    await $('[data-testid="session-search-current"]').waitForDisplayed();
    await browser.execute(() => {
      const win = window as any;
      win.pulseCounts = {};
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        for (const command of ['scan_usage', 'refresh_usage_data', 'fetch_codex_limits', 'activate_codex_window']) {
          if (String(input).includes(command)) win.pulseCounts[command] = (win.pulseCounts[command] || 0) + 1;
        }
        return original(input, init);
      };
    });
    await browser.execute(() => { document.querySelector('[data-testid="session-detail-scroll"]')!.scrollTop = 240; });
    await browser.waitUntil(async () => Number(await $('[data-testid="session-detail-scroll"]').getProperty('scrollTop')) > 0);
    const before = await $('[data-testid="session-detail-scroll"]').getProperty('scrollTop');
    for (const skinId of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'dark', compactMode: true, motionLevel: 'off' } });
      await expect(search).toHaveValue('合成');
      expect(await $('[data-testid="session-detail-scroll"]').getProperty('scrollTop')).toBe(before);
      await expect($('[aria-labelledby="session-detail-title"]')).toBeDisplayed();
    }
    expect(await browser.execute(() => (window as any).pulseCounts)).toEqual({});
    await $('button[aria-label="关闭会话详情"]').click();
    await invoke('set_pulse_preferences', { patch: { theme: 'light', compactMode: false } });
  });

  it('remains operable at a narrow window and in dark compact mode', async () => {
    await browser.setWindowSize(1000, 780);
    const accountToggle = $('.pulse-global-actions > button[aria-pressed]');
    if (await accountToggle.getAttribute('aria-pressed') === 'true') await accountToggle.click();
    for (const skinId of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'dark', compactMode: true, motionLevel: 'off' } });
      await $('[data-testid="daily-nav-tab"]').click();
      expect(await browser.execute(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await shot(`${skinId}-dark-compact-narrow`);
      await $('[data-testid="sessions-nav-tab"]').click();
      await $('[data-testid="session-card"]').click();
      await $('#session-compact-navigation').waitForDisplayed();
      expect(await browser.execute(() => {
        const button = document.querySelector('#session-compact-navigation button:last-child')!;
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit === button || button.contains(hit);
      })).toBe(true);
      const turnCount = await browser.execute(() => document.querySelectorAll('#session-turn-selector option').length);
      expect(turnCount).toBeGreaterThan(0);
      await $('#session-turn-selector').selectByIndex(turnCount - 1);
      await $('#session-compact-navigation button:last-child').click();
      expect(await browser.execute(() => {
        const scroll = document.querySelector('[data-testid="session-detail-scroll"]')!;
        return scroll.scrollHeight <= scroll.clientHeight || scroll.scrollTop > 0;
      })).toBe(true);
      await shot(`${skinId}-narrow-replay`);
      await $('button[aria-label="关闭会话详情"]').click();
    }
    await browser.setWindowSize(1440, 920);
    await invoke('set_pulse_preferences', { patch: { theme: 'light', compactMode: false } });
  });

  it('shares preferences and engine across widget and tray, with actual native visibility', async () => {
    await invoke('widget_action', { action: 'show' });
    const windows = await invoke<string[]>('plugin:wdio|list_windows');
    expect(windows).toContain('main'); expect(windows).toContain('widget'); expect(windows).toContain('tray');
    for (const skin of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId: skin } });
      await browser.switchToWindow('widget');
      await $('#root').waitForDisplayed();
      await shot(`${skin}-widget`);
      await invoke('widget_action', { action: 'expand' });
      await $('.pulse-widget.is-expanded').waitForDisplayed();
      await shot(`${skin}-widget-expanded`);
      await invoke('widget_action', { action: 'collapse' });
      await browser.switchToWindow('main');
      await invoke('tray_popover_action', { action: 'rightClick' });
      await browser.switchToWindow('tray');
      await $('.tray-popover').waitForDisplayed();
      await shot(`${skin}-tray`);
      await browser.switchToWindow('main');
      await invoke('tray_popover_action', { action: 'showMain' });
    }
    await invoke('widget_action', { action: 'expand' });
    expect((await invoke<any>('get_pulse_preferences')).widgetExpanded).toBe(true);
    await invoke('widget_action', { action: 'unpin' });
    expect((await invoke<any>('get_pulse_preferences')).widgetAlwaysOnTop).toBe(false);
    await invoke('widget_action', { action: 'pin' });
    expect((await invoke<any>('get_pulse_preferences')).widgetAlwaysOnTop).toBe(true);
    await invoke('widget_action', { action: 'hide' });
    expect((await invoke<any>('get_pulse_preferences')).widgetVisible).toBe(false);
    await invoke('plugin:window|close', { label: 'main' });
    expect(await invoke('plugin:window|is_visible', { label: 'main' })).toBe(false);
    await invoke('widget_action', { action: 'showMain' });
    expect(await invoke('plugin:window|is_visible', { label: 'main' })).toBe(true);
  });
});
