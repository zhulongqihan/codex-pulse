import { $, browser, expect } from '@wdio/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const output = process.env.PULSE_TEST_OUTPUT!;
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, payload) => core.invoke(cmd, payload), command, args) as Promise<T>;
}
async function shot(name: string) { mkdirSync(output, { recursive: true }); await browser.saveScreenshot(join(output, `${name}.png`)); }
const uxEvidence: Record<string, unknown> = {};
function evidence(name: string, value: unknown) {
  uxEvidence[name] = value;
  writeFileSync(join(output, 'ux-evidence.json'), JSON.stringify(uxEvidence, null, 2));
}
async function selectRange(range: string, label: string) {
  const data = await invoke<any>('fetch_overview', { range });
  // The embedded WebDriver click omits pointerdown; exercise Radix's real keyboard path.
  await $('.pulse-range-toolbar button[aria-label="选择时间范围"]').execute(button => button.focus());
  await browser.keys('Enter');
  await $('[role="menuitemradio"]').waitForDisplayed();
  evidence('last-range-options', await browser.execute(() => [...document.querySelectorAll('[role="menuitemradio"]')].map(option => option.textContent)));
  const options = await browser.$$('[role="menuitemradio"]');
  let selected = false;
  for (const option of options) {
    if ((await option.getText()).replace(/\s/g, '') !== label.replace(/\s/g, '')) continue;
    await option.click(); selected = true; break;
  }
  expect(selected).toBe(true);
  await browser.waitUntil(async () => (await $('[data-testid="range-summary"]').getText()).includes(`${data.startDate} — ${data.endDate}`));
  await browser.waitUntil(async () => (await $('.pulse-chart-caption').getText()).includes(data.startDate));
  return data;
}
async function overviewFits() {
  await $('[data-testid="usage-trends-card"].is-overview').waitForDisplayed();
  const fit = await browser.execute(() => {
    const scroll = document.querySelector<HTMLElement>('[data-testid="usage-trends-card"] .pulse-chart-scroll')!;
    const plot = document.querySelector<HTMLElement>('.pulse-trend-days')!;
    const buttons = [...plot.querySelectorAll<HTMLButtonElement>('.pulse-trend-day')];
    const bounds = scroll.getBoundingClientRect();
    const caption = document.querySelector('.pulse-chart-caption')!.getBoundingClientRect();
    const bars = [...plot.querySelectorAll<HTMLElement>('.pulse-trend-bar > i')].map(bar => bar.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    const overflowY = getComputedStyle(scroll).overflowY;
    return { documentFits: document.documentElement.scrollWidth <= innerWidth, width: scroll.clientWidth, contentWidth: scroll.scrollWidth,
      height: scroll.clientHeight, contentHeight: scroll.scrollHeight, points: buttons.length,
      overflowY, needsVerticalScrolling: /auto|scroll/.test(overflowY) && scroll.scrollHeight > scroll.clientHeight + 1,
      buttonTop: Math.min(...buttons.map(button => button.getBoundingClientRect().top)),
      buttonBottom: Math.max(...buttons.map(button => button.getBoundingClientRect().bottom)),
      plotTop: bounds.top, plotBottom: bounds.bottom, captionTop: caption.top,
      lowestBar: bars.length ? Math.max(...bars.map(box => box.bottom)) : null,
      firstInBounds: buttons[0].getBoundingClientRect().left >= bounds.left - 1,
      lastInBounds: buttons.at(-1)!.getBoundingClientRect().right <= bounds.right + 1 };
  });
  const fits = (uxEvidence.chartFits as unknown[] | undefined) ?? [];
  fits.push(fit); evidence('chartFits', fits);
  expect(fit.documentFits).toBe(true);
  expect(fit.contentWidth).toBeLessThanOrEqual(fit.width + 1);
  // Visible stroke/axis overscan is not a scrollable chart. Check actual clipping and caption collision.
  expect(fit.needsVerticalScrolling).toBe(false);
  expect(fit.buttonTop).toBeGreaterThanOrEqual(fit.plotTop - 1);
  expect(fit.buttonBottom).toBeLessThanOrEqual(fit.captionTop);
  if (fit.lowestBar !== null) expect(fit.lowestBar).toBeLessThanOrEqual(fit.captionTop);
  expect(fit.firstInBounds).toBe(true); expect(fit.lastInBounds).toBe(true);
  expect(fit.points).toBeGreaterThan(0); expect(fit.points).toBeLessThanOrEqual(60);
  return fit;
}
async function verifyTodayAndRange(skin: string) {
  await $('[data-testid="dashboard-nav-tab"]').click();
  await $('[data-testid="today-summary"]').waitForDisplayed();
  await browser.waitUntil(async () => (await $('[data-testid="today-tokens"]').getText()) !== '—');
  const baseline = { tokens: await $('[data-testid="today-tokens"]').getText(), estimate: await $('[data-testid="today-estimate"]').getText(), date: await $('[data-testid="today-summary"] time').getAttribute('datetime') };
  const today = await invoke<any>('fetch_overview', { range: '1d' });
  const row = today.daily.find((day: any) => day.date === baseline.date);
  expect(row).toBeDefined();
  const exactToday = await $('[data-testid="today-tokens"]').getAttribute('title');
  expect(exactToday).not.toBeNull();
  expect(Number((exactToday ?? '').replace(/\D/g, ''))).toBe(row.totalTokens);
  const range30 = await selectRange('30d', '最近 30 天');
  const defaultFit = await overviewFits();
  expect(defaultFit.points).toBe(range30.daily.length);
  const historical = $('.pulse-trend-day');
  await historical.moveTo();
  // Embedded pointerMove emits only pointermove/mousemove, so complete its missing boundary event.
  // Real pointer hover is covered separately by Chromium; this keeps native component wiring checked.
  await historical.execute(element => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })));
  await expect($('[data-testid="trend-inspector"]')).toHaveAttribute('data-preview', 'true');
  expect(await $('[data-testid="today-tokens"]').getText()).toBe(baseline.tokens);
  expect(await $('[data-testid="today-estimate"]').getText()).toBe(baseline.estimate);
  const ranges: Record<string, unknown> = {};
  for (const [range, label] of [['7d', '最近 7 天'], ['365d', '最近 365 天'], ['all', '全部留存记录']]) {
    const data = await selectRange(range, label);
    const fit = await overviewFits();
    expect(await $('[data-testid="today-tokens"]').getText()).toBe(baseline.tokens);
    expect(await $('[data-testid="today-estimate"]').getText()).toBe(baseline.estimate);
    if (data.daily.length <= 60) expect(fit.points).toBe(data.daily.length);
    ranges[range] = { ...fit, days: data.daily.length, start: data.startDate, end: data.endDate };
  }
  await selectRange('30d', '最近 30 天');
  await browser.execute(() => { document.querySelector<HTMLElement>('.pulse-main-scroll')!.scrollTop = 0; });
  await browser.execute(() => {
    const win = window as any;
    const original = Element.prototype.scrollIntoView;
    win.pulseDateScrolls = [];
    win.pulseRestoreDateScroll = () => { Element.prototype.scrollIntoView = original; };
    Element.prototype.scrollIntoView = function (options) {
      if (this.id.startsWith('date-group-')) win.pulseDateScrolls.push({ id: this.id, behavior: typeof options === 'object' ? options.behavior : null, motion: document.documentElement.dataset.motion });
      return original.call(this, options);
    };
  });
  await $('[data-testid="today-summary"] button').click();
  await expect($('[data-testid="sessions-nav-tab"]')).toHaveAttribute('aria-selected', 'true');
  await $(`[id="date-group-${baseline.date}"]`).waitForDisplayed();
  await browser.waitUntil(async () => await browser.execute(() => (window as any).pulseDateScrolls.length) > 0);
  const dateScrolls = await browser.execute(() => { (window as any).pulseRestoreDateScroll(); return (window as any).pulseDateScrolls; });
  expect(dateScrolls.at(-1)).toEqual({ id: `date-group-${baseline.date}`, behavior: 'instant', motion: 'off' });
  await $('[data-testid="dashboard-nav-tab"]').click();
  await selectRange('30d', '最近 30 天');
  await browser.execute(() => { document.querySelector<HTMLElement>('.pulse-main-scroll')!.scrollTop = 0; });
  evidence(`${skin}-today-range`, { baseline, expectedTodayTokens: row.totalTokens, defaultFit, ranges, todaySessionsOpened: true, dateScrolls, embeddedDriverHoverBoundarySynthesized: true });
}

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
    await browser.setWindowSize(1440, 920);
    await $('[data-testid="dashboard-nav-tab"]').waitForDisplayed({ timeout: 90000 });
    for (const skin of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId: skin, theme: 'light', motionLevel: 'off' } });
      await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skin);
      await verifyTodayAndRange(skin);
      for (const route of ['dashboard', 'sessions', 'models', 'daily', 'monthly', 'projects', 'settings']) {
        const tab = $(`[data-testid="${route}-nav-tab"]`);
        await tab.waitForDisplayed(); await tab.click();
        await $('#root').waitForDisplayed();
        if (route === 'settings') {
          await expect($('#settings-tab-appearance')).toHaveAttribute('aria-selected', 'true');
          await expect($('#settings-section-appearance')).toBeDisplayed();
          await expect($('#settings-section-general')).not.toBeDisplayed();
        }
        expect(await browser.execute(() => document.body.innerText.trim().length)).toBeGreaterThan(100);
        await shot(`${skin}-${route}`);
      }
      await $('[data-testid="models-nav-tab"]').click();
      await $('[data-testid="models-catalog-tab"]').waitForDisplayed();
      await $('[data-testid="models-catalog-tab"]').click();
      await $('[data-testid="pricing-search"]').waitForDisplayed();
      await $('[data-testid="pricing-search"]').setValue('gpt-5');
      await shot(`${skin}-pricing`);
      await $('[data-testid="settings-nav-tab"]').click();
      await $('#settings-tab-menuBar').click();
      await expect($('#settings-section-menuBar')).toBeDisplayed();
      expect(await $('#settings-section-menuBar').getText()).not.toContain('macOS');
      await shot(`${skin}-settings-tray`);
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
    await browser.setWindowSize(1000, 780);
    await $('[data-testid="account-toggle"]').click();
    await $('[data-testid="account-drawer"]').waitForDisplayed();
    await browser.keys('Escape');
    await $('[data-testid="account-drawer"]').waitForExist({ reverse: true });
    await expect($('[aria-labelledby="session-detail-title"]')).toBeDisplayed();
    await expect(search).toHaveValue('合成');
    expect(await $('[data-testid="session-detail-scroll"]').getProperty('scrollTop')).toBe(before);
    await $('[data-testid="settings-nav-tab"]').click();
    await expect($('#settings-tab-appearance')).toHaveAttribute('aria-selected', 'true');
    await $('button=返回').click();
    await expect($('[aria-labelledby="session-detail-title"]')).toBeDisplayed();
    await expect(search).toHaveValue('合成');
    expect(await $('[data-testid="session-detail-scroll"]').getProperty('scrollTop')).toBe(before);
    expect(await browser.execute(() => (window as any).pulseCounts)).toEqual({});
    evidence('replay-preservation', { search: '合成', scrollTop: before, appearanceChanges: true, settingsReturn: true, drawerEscapePreservedReplay: true, dataRequests: {} });
    await $('button[aria-label="关闭会话详情"]').click();
    await browser.setWindowSize(1440, 920);
    await invoke('set_pulse_preferences', { patch: { theme: 'light', compactMode: false } });
    await $('[data-testid="dashboard-nav-tab"]').click();
    await browser.execute(() => {
      const win = window as any;
      const main = document.querySelector<HTMLElement>('.pulse-main-scroll')!;
      win.pulseScrollTrace = [];
      const record = (phase: string, value?: number) => win.pulseScrollTrace.push({ phase, value, top: main.scrollTop, time: performance.now(), theme: document.documentElement.dataset.theme, density: document.documentElement.dataset.density, motion: document.documentElement.dataset.motion, height: main.scrollHeight });
      const native = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
      Object.defineProperty(main, 'scrollTop', { configurable: true, get() { return native.get!.call(this); }, set(value) { record('assignment-before', value); native.set!.call(this, value); record('assignment-after', value); } });
      main.addEventListener('scroll', () => record('scroll-event'));
      document.addEventListener('click', event => {
        const target = event.target as Element;
        if (target.closest('[data-testid="settings-nav-tab"]')) record('settings-click-capture');
        if (target.closest('button')?.textContent?.trim() === '返回') record('back-click-capture');
      }, true);
      record('instrumented');
    });
    const restored: unknown[] = [];
    for (const requested of [0, 600]) {
      const saved = await browser.execute(async (top) => {
        const main = document.querySelector<HTMLElement>('.pulse-main-scroll')!;
        // Cancel the earlier session-date smooth navigation before establishing this case's source position.
        main.scrollTo({ top, behavior: 'instant' });
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return main.scrollTop;
      }, requested);
      if (requested === 0) expect(saved).toBe(0);
      await $('[data-testid="settings-nav-tab"]').click();
      expect(await browser.execute(() => document.querySelector<HTMLElement>('.pulse-main-scroll')!.scrollTop)).toBe(0);
      await expect($('#settings-tab-appearance')).toHaveAttribute('aria-selected', 'true');
      await $('#settings-tab-general').click();
      await expect($('#settings-section-general')).toBeDisplayed();
      await expect($('#settings-section-appearance')).not.toBeDisplayed();
      const back = $('button=返回');
      const location = await back.getLocation();
      await browser.execute(() => { const main = document.querySelector<HTMLElement>('.pulse-main-scroll')!; main.scrollTop = main.scrollHeight; });
      expect(await back.getLocation()).toEqual(location);
      await shot(`settings-scroll-${requested}`);
      await back.click();
      const returned = await browser.execute(async () => {
        const main = document.querySelector<HTMLElement>('.pulse-main-scroll')!;
        const immediate = main.scrollTop;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const frame = main.scrollTop;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const frame2 = main.scrollTop;
        await new Promise(resolve => setTimeout(resolve, 120));
        return { immediate, frame, frame2, settled: main.scrollTop, trace: (window as any).pulseScrollTrace };
      });
      evidence('settings-scroll-debug', { requested, saved, returned });
      expect(returned.immediate).toBe(saved); expect(returned.settled).toBe(saved);
      restored.push({ requested, saved, enteredAtTop: true, returnRestored: true, backStayedVisible: true, returned });
    }
    evidence('settings-scroll', restored);
  });

  it('remains operable at a narrow window and in dark compact mode', async () => {
    const narrowEvidence: unknown[] = [];
    for (const skinId of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'dark', compactMode: true, motionLevel: 'off' } });
      for (const width of [1000, 920]) {
        await browser.setWindowSize(width, 780);
        await $('[data-testid="dashboard-nav-tab"]').click();
        await browser.execute(() => { document.querySelector<HTMLElement>('.pulse-main-scroll')!.scrollTop = 0; });
        const accountToggle = $('[data-testid="account-toggle"]');
        await expect(accountToggle).toHaveAttribute('aria-expanded', 'false');
        expect(await accountToggle.getText()).toContain('账号额度');
        expect(await $('[data-testid="account-drawer"]').isExisting()).toBe(false);
        expect(await $('.pulse-account-rail').isExisting()).toBe(false);
        const geometry = await browser.execute(() => {
          const target = document.querySelector<HTMLElement>('[data-testid="today-tokens"]')!;
          const box = target.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          const brand = document.querySelector('.pulse-brand')!.getBoundingClientRect();
          const actions = document.querySelector('.pulse-global-actions')!.getBoundingClientRect();
          return { width: innerWidth, documentFits: document.documentElement.scrollWidth <= innerWidth, todayUnobscured: hit === target || target.contains(hit), headerOverlap: brand.right > actions.left + 1 };
        });
        expect(geometry.documentFits).toBe(true); expect(geometry.todayUnobscured).toBe(true); expect(geometry.headerOverlap).toBe(false);
        await overviewFits();
        await shot(`${skinId}-narrow-${width}-overview`);
        await accountToggle.click();
        await $('[data-testid="account-drawer"]').waitForDisplayed();
        expect(await browser.execute(() => document.activeElement?.getAttribute('aria-label'))).toBe('关闭账号额度');
        await shot(`${skinId}-narrow-${width}-account`);
        await browser.keys('Escape');
        await $('[data-testid="account-drawer"]').waitForExist({ reverse: true });
        expect(await browser.execute(() => document.activeElement?.getAttribute('data-testid'))).toBe('account-toggle');
        await accountToggle.click();
        await $('[data-testid="account-drawer"]').waitForDisplayed();
        await $('[data-testid="account-backdrop"]').click();
        await $('[data-testid="account-drawer"]').waitForExist({ reverse: true });
        narrowEvidence.push({ skinId, requestedWidth: width, ...geometry, initiallyClosed: true, escapeClosed: true, focusRestored: true, backdropClosed: true });
      }
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
    evidence('narrow', narrowEvidence);
  });

  it('shares preferences and engine across widget and tray, with actual native visibility', async () => {
    await $('[data-testid="help"]').click();
    await $('[data-testid="getting-started"]').waitForDisplayed();
    await $('[data-testid="create-shortcuts"]').waitForDisplayed();
    // Shortcut file creation is covered by the isolated PowerShell harness, never by this host UI run.
    await shot('getting-started');
    await $('[data-testid="open-widget"]').click();
    await browser.waitUntil(async () => (await invoke<any>('get_pulse_preferences')).widgetVisible === true);
    expect(await invoke('plugin:window|is_visible', { label: 'widget' })).toBe(true);
    evidence('newcomer-actions', { helpVisible: true, shortcutActionVisible: true, shortcutActionClicked: false, globalWidgetActionOpenedNativeWindow: true });
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
