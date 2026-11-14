import { $, browser, expect } from '@wdio/globals';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const output = process.env.PULSE_TEST_OUTPUT!;
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, payload) => core.invoke(cmd, payload), command, args) as Promise<T>;
}
async function shot(name: string) { mkdirSync(output, { recursive: true }); await browser.saveScreenshot(join(output, `${name}.png`)); }
async function narrowTodayGeometry() {
  return browser.execute(() => {
    const target = document.querySelector<HTMLElement>('[data-testid="today-tokens"]')!;
    const main = document.querySelector<HTMLElement>('.pulse-main-scroll')!;
    const box = target.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    const brand = document.querySelector('.pulse-brand')!.getBoundingClientRect();
    const actions = document.querySelector('.pulse-global-actions')!.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, outerWidth, outerHeight, dpr: devicePixelRatio,
      availableScreen: { width: screen.availWidth, height: screen.availHeight },
      documentFits: document.documentElement.scrollWidth <= innerWidth,
      todayBox: box.toJSON(), todayCenter: center,
      todayCenterInsideViewport: center.x >= 0 && center.x < innerWidth && center.y >= 0 && center.y < innerHeight,
      todayCenterInsideMain: center.x >= mainBox.left && center.x < mainBox.right && center.y >= mainBox.top && center.y < mainBox.bottom,
      todayUnobscured: hit === target || target.contains(hit),
      hit: hit ? { tag: hit.tagName, id: hit.id, className: hit.getAttribute('class') } : null,
      main: { box: mainBox.toJSON(), scrollTop: main.scrollTop, clientHeight: main.clientHeight, scrollHeight: main.scrollHeight },
      headerOverlap: brand.right > actions.left + 1,
    };
  });
}
const uxEvidence: Record<string, unknown> = {};
function evidence(name: string, value: unknown) {
  uxEvidence[name] = value;
  writeFileSync(join(output, 'ux-evidence.json'), JSON.stringify(uxEvidence, null, 2));
}
async function selectRange(range: string, label: string) {
  const data = await invoke<any>('fetch_overview', { range });
  // The embedded WebDriver click omits pointerdown; exercise Radix's real keyboard path.
  await $('[data-testid="range-summary"] button[aria-label="选择时间范围"]').execute(button => button.focus());
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
async function retainedTodayText(id: 'today-tokens' | 'today-estimate') {
  return browser.execute(testId => document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '', id);
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
  await $('[data-testid="analysis-nav-tab"]').click();
  await $('[data-testid="usage-analysis"]').waitForDisplayed();
  await expect($('[data-testid="today-summary"]')).not.toBeDisplayed();
  const range30 = await selectRange('30d', '最近 30 天');
  const defaultFit = await overviewFits();
  expect(defaultFit.points).toBe(range30.daily.length);
  // Analysis starts without a duplicated daily inspector. A later skin switch
  // preserves the user's selected date through React Activity instead of resetting it.
  if (skin === 'clear') await expect($('[data-testid="trend-inspector"]')).not.toBeExisting();
  const historical = $('.pulse-trend-day');
  await historical.click();
  await $('[data-testid="trend-inspector"]').waitForDisplayed();
  await historical.moveTo();
  // Embedded pointerMove emits only pointermove/mousemove, so complete its missing boundary event.
  // Real pointer hover is covered separately by Chromium; this keeps native component wiring checked.
  await historical.execute(element => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })));
  await expect($('[data-testid="trend-inspector"]')).toHaveAttribute('data-preview', 'true');
  expect(await retainedTodayText('today-tokens')).toBe(baseline.tokens);
  expect(await retainedTodayText('today-estimate')).toBe(baseline.estimate);
  const ranges: Record<string, unknown> = {};
  for (const [range, label] of [['7d', '最近 7 天'], ['365d', '最近 365 天'], ['all', '全部留存记录']]) {
    const data = await selectRange(range, label);
    const fit = await overviewFits();
    expect(await retainedTodayText('today-tokens')).toBe(baseline.tokens);
    expect(await retainedTodayText('today-estimate')).toBe(baseline.estimate);
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
  await $('[data-testid="dashboard-nav-tab"]').click();
  await $('[data-testid="today-summary"]').waitForDisplayed();
  await expect($('[data-testid="usage-trends-card"]')).not.toBeDisplayed();
  await $('[data-testid="today-summary"] button').click();
  await expect($('[data-testid="sessions-nav-tab"]')).toHaveAttribute('aria-selected', 'true');
  await $(`[id="date-group-${baseline.date}"]`).waitForDisplayed();
  await browser.waitUntil(async () => await browser.execute(() => (window as any).pulseDateScrolls.length) > 0);
  const dateScrolls = await browser.execute(() => { (window as any).pulseRestoreDateScroll(); return (window as any).pulseDateScrolls; });
  expect(dateScrolls.at(-1)).toEqual({ id: `date-group-${baseline.date}`, behavior: 'instant', motion: 'off' });
  await $('[data-testid="analysis-nav-tab"]').click();
  await $('[data-testid="usage-analysis"]').waitForDisplayed();
  await selectRange('30d', '最近 30 天');
  await browser.execute(() => { document.querySelector<HTMLElement>('.pulse-main-scroll')!.scrollTop = 0; });
  evidence(`${skin}-today-range`, { baseline, expectedTodayTokens: row.totalTokens, defaultFit, ranges, todaySessionsOpened: true, dateScrolls, embeddedDriverHoverBoundarySynthesized: true });
}

describe('Pulse native parity', () => {
  it('runs the real Rust scanner with full project identities and cross-day threads', async () => {
    expect(await browser.execute(() => '__TAURI_INTERNALS__' in window)).toBe(true);
    const installation = await invoke<any>('inspect_pulse_installation');
    expect(installation.supported).toBe(true);
    expect(installation.entries.map((entry: any) => entry.id).sort()).toEqual(['codexPlugin', 'desktop', 'startMenu', 'startup']);
    expect(typeof installation.snapshotId).toBe('string');
    expect(installation.snapshotId.length).toBeGreaterThan(0);
    expect(installation.entries.every((entry: any) => ['current', 'notConfigured', 'stale', 'otherInstallation', 'unavailable'].includes(entry.status))).toBe(true);
    evidence('installation-read-only-inspection', { ...installation, repairsRequested: false });
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
      if (skin === 'clear') {
        const path = join(process.env.PULSE_DATA_DIR!, 'integration-snapshot.json');
        await browser.waitUntil(async () => existsSync(path));
        const today = await invoke<any>('fetch_overview', { range: '1d' });
        const snapshot = JSON.parse(readFileSync(path, 'utf8'));
        const row = today.daily.find((day: any) => day.date === snapshot.today.date);
        expect(snapshot.schemaVersion).toBe(1);
        expect(snapshot.today.totalTokens).toBe(row.totalTokens);
        expect(snapshot.today.costUSD).toBe(row.costUSD);
        expect(snapshot.account).toBeUndefined();
        expect(snapshot.workspace).toBeUndefined();
        expect(snapshot.quotas.every((quota: any) => !('account' in quota))).toBe(true);
        evidence('native-integration-producer', { schemaVersion: snapshot.schemaVersion, todayMatchesScanner: true, identityFieldsAbsent: true });
      }
      for (const route of ['dashboard', 'analysis', 'sessions', 'models', 'daily', 'monthly', 'projects', 'settings']) {
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

  it('searches loaded session groups and restores the list with Escape in both skins', async () => {
    const sessions = await invoke<any[]>('fetch_session_details');
    const target = sessions.find(session => session.sessionId && !session.parentSessionId)!;
    expect(target).toBeDefined();
    const checks: unknown[] = [];
    for (const skinId of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'light', motionLevel: 'off' } });
      await $('[data-testid="sessions-nav-tab"]').click();
      const search = $('[data-testid="session-list-search"] input');
      await search.waitForDisplayed();
      await search.setValue(target.sessionId);
      await $('[data-testid="session-list-search-result"]').waitForDisplayed();
      await $('[data-testid="session-card"]').waitForDisplayed();
      const result = await $('[data-testid="session-list-search-result"]').getText();
      expect(result).toContain('1 个匹配组');
      await search.setValue('__pulse_native_search_no_match__');
      await $('h3=没有匹配的会话组').waitForDisplayed();
      expect(await browser.$$('[data-testid="session-card"]').length).toBe(0);
      await search.click();
      await browser.keys('Escape');
      await expect(search).toHaveValue('');
      await $('[data-testid="session-card"]').waitForDisplayed();
      checks.push({ skinId, metadataQueryMatchedOneGroup: true, noResultsExplicit: true, escapeRestored: true, result });
      await shot(`${skinId}-session-list-search`);
    }
    evidence('session-list-search', checks);
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
      await $('#settings-tab-desktop').click();
      await expect($('#settings-section-desktop')).toBeDisplayed();
      await expect($('[data-testid="add-to-codex"]')).toBeDisplayed();
      await expect($('[data-testid="add-to-codex"]')).toBeEnabled();
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
        const geometryBefore = await narrowTodayGeometry();
        const geometryKey = `${skinId}-narrow-${width}-geometry`;
        evidence(geometryKey, { requestedWidth: width, requestedHeight: 780, beforeScroll: geometryBefore });
        // Narrow windows prioritize pace. Bring today's reading into its real
        // scroll viewport before testing occlusion, rather than requiring it above the fold.
        await browser.execute(() => {
          document.querySelector<HTMLElement>('[data-testid="today-tokens"]')!
            .scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        });
        let geometry = await narrowTodayGeometry();
        await browser.waitUntil(async () => {
          const next = await narrowTodayGeometry();
          const stable = Math.abs(next.todayCenter.x - geometry.todayCenter.x) < 0.5
            && Math.abs(next.todayCenter.y - geometry.todayCenter.y) < 0.5
            && Math.abs(next.main.scrollTop - geometry.main.scrollTop) < 0.5;
          geometry = next;
          evidence(geometryKey, { requestedWidth: width, requestedHeight: 780, beforeScroll: geometryBefore, afterScroll: geometry });
          return stable;
        }, { timeout: 5000, interval: 100, timeoutMsg: 'Today reading geometry did not settle after scrolling' });
        expect(geometry.todayCenterInsideViewport).toBe(true); expect(geometry.todayCenterInsideMain).toBe(true);
        expect(geometry.documentFits).toBe(true); expect(geometry.todayUnobscured).toBe(true); expect(geometry.headerOverlap).toBe(false);
        await shot(`${skinId}-narrow-${width}-dashboard`);
        await $('[data-testid="analysis-nav-tab"]').click();
        await $('[data-testid="usage-analysis"]').waitForDisplayed();
        await overviewFits();
        await shot(`${skinId}-narrow-${width}-analysis`);
        await $('[data-testid="dashboard-nav-tab"]').click();
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
        narrowEvidence.push({ skinId, requestedWidth: width, requestedHeight: 780, beforeScroll: geometryBefore, ...geometry, initiallyClosed: true, escapeClosed: true, focusRestored: true, backdropClosed: true });
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
    const widgetSizes: Record<string, unknown> = {};
    async function verifyWidgetClient(name: string, height: 180 | 'expanded') {
      const nativeClient = async () => {
        const [scaleFactor, physicalClient] = await Promise.all([
          invoke<number>('plugin:window|scale_factor', { label: 'widget' }),
          invoke<{ width: number; height: number }>('plugin:window|inner_size', { label: 'widget' }),
        ]);
        return { scaleFactor, physicalClient, logicalClient: { width: physicalClient.width / scaleFactor, height: physicalClient.height / scaleFactor } };
      };
      try {
        await browser.waitUntil(async () => {
          const size = await nativeClient();
          const layout = await browser.execute(() => {
            const empty = document.querySelector('[data-testid="widget-empty-guide"]');
            const body = document.querySelector('.coach-body'), footer = document.querySelector('.pulse-pace-footer');
            const last = body?.lastElementChild?.getBoundingClientRect(), foot = footer?.getBoundingClientRect();
            return { empty: empty !== null, blank: last && foot ? Math.max(0, foot.top - last.bottom) : null };
          });
          const expected = height === 180 ? 180 : layout.empty ? null : 480;
          const heightMatches = expected != null ? Math.abs(size.physicalClient.height - Math.round(expected * size.scaleFactor)) <= 1
            : size.logicalClient.height >= 220 - 1 / size.scaleFactor && size.logicalClient.height <= 480 + 1 / size.scaleFactor
              && layout.blank != null && layout.blank <= 20;
          return size.scaleFactor > 0 && Math.abs(size.physicalClient.width - Math.round(350 * size.scaleFactor)) <= 1 && heightMatches;
        });
      } catch (error) {
        const [outerSize, preferences, dom] = await Promise.all([
          invoke('plugin:window|outer_size', { label: 'widget' }),
          invoke('get_pulse_preferences'),
          browser.execute(() => ({ viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio,
            elements: ['.pulse-widget', '.pulse-widget-header', '.pulse-widget-coach-content', '.quota-coach-card', '.coach-core', '.pulse-pace-footer'].map(selector => {
              const element = document.querySelector<HTMLElement>(selector); const bounds = element?.getBoundingClientRect();
              return { selector, className: element?.className, bounds: bounds?.toJSON(), clientHeight: element?.clientHeight,
                scrollHeight: element?.scrollHeight, overflowY: element ? getComputedStyle(element).overflowY : null };
            }) })),
        ]);
        widgetSizes[name] = { expectedLogicalClient: { width: 350, height }, actual: await nativeClient(), outerSize, preferences, dom };
        evidence('widget-native-client-sizes', widgetSizes);
        throw error;
      }
      const size = await nativeClient();
      const content = await browser.execute(() => {
        const main = document.querySelector<HTMLElement>('.pulse-widget')!;
        const scroll = document.querySelector<HTMLElement>('.pulse-widget-coach-content')!;
        const footer = document.querySelector<HTMLElement>('.pulse-pace-footer');
        const hit = (element: Element) => {
          const box = element.getBoundingClientRect();
          const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0
            && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
            && (target === element || (target !== null && element.contains(target)));
        };
        const mainBounds = main.getBoundingClientRect();
        const readings = [...document.querySelectorAll('.coach-key-readings > div')];
        const state = document.querySelector('.coach-state');
        const recover = document.querySelector('.coach-recover');
        const actions = [...document.querySelectorAll('.pulse-widget-header > button')];
        const emptyGuide = document.querySelector('[data-testid="widget-empty-guide"]');
        const body = document.querySelector('.coach-body'), lastBodyChild = body?.lastElementChild?.getBoundingClientRect();
        const footerBounds = footer?.getBoundingClientRect();
        return { viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio,
          documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
          mainFits: mainBounds.left >= -1 && mainBounds.top >= -1 && mainBounds.right <= innerWidth + 1 && mainBounds.bottom <= innerHeight + 1,
          contentFitsWidth: scroll.scrollWidth <= scroll.clientWidth + 1,
          readings: readings.length, readingsHit: readings.length === 2 && readings.every(hit),
          recoveryHit: state !== null && recover !== null && hit(state) && hit(recover),
          emptyGuide: emptyGuide !== null,
          blankBeforeFooter: lastBodyChild && footerBounds ? Math.max(0, footerBounds.top - lastBodyChild.bottom) : null,
          headerActions: actions.length, headerActionsHit: actions.length >= 4 && actions.every(hit),
          pinTarget: (() => { const button = document.querySelector('[data-testid="widget-pin"]')!; const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed') }; })(),
          footerExists: footer !== null, footerHit: footer !== null && hit(footer),
          footerActionsHit: footer !== null && [...footer.querySelectorAll('button')].every(hit) };
      });
      widgetSizes[name] = { expectedLogicalClient: { width: 350, height }, ...size, content };
      evidence('widget-native-client-sizes', widgetSizes);
      expect(Math.abs(size.logicalClient.width - 350)).toBeLessThanOrEqual(1 / size.scaleFactor);
      if (height === 180 || !content.emptyGuide) {
        const expectedHeight = height === 180 ? 180 : 480;
        expect(Math.abs(size.logicalClient.height - expectedHeight)).toBeLessThanOrEqual(1 / size.scaleFactor);
        expect(Math.abs(content.viewport.height - expectedHeight)).toBeLessThanOrEqual(1);
      } else {
        expect(size.logicalClient.height).toBeGreaterThanOrEqual(220 - 1 / size.scaleFactor);
        expect(size.logicalClient.height).toBeLessThanOrEqual(480 + 1 / size.scaleFactor);
        expect(content.blankBeforeFooter).not.toBeNull();
        expect(content.blankBeforeFooter!).toBeLessThanOrEqual(20);
        expect(content.readings).toBe(0);
      }
      expect(Math.abs(content.viewport.width - 350)).toBeLessThanOrEqual(1);
      expect(Math.abs(content.viewport.height - size.logicalClient.height)).toBeLessThanOrEqual(1);
      expect(content.documentFits).toBe(true); expect(content.mainFits).toBe(true);
      expect(content.contentFitsWidth).toBe(true);
      expect([0, 2]).toContain(content.readings);
      if (content.readings === 2) expect(content.readingsHit).toBe(true);
      else expect(content.recoveryHit).toBe(true);
      expect(content.headerActionsHit).toBe(true);
      expect(content.pinTarget.width).toBeGreaterThanOrEqual(32);
      expect(content.pinTarget.height).toBeGreaterThanOrEqual(32);
      expect(content.footerExists).toBe(true);
      expect(content.footerHit).toBe(true); expect(content.footerActionsHit).toBe(true);
    }
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
      await invoke('set_pulse_preferences', { patch: { skinId: skin, widgetAlwaysOnTop: true } });
      await browser.switchToWindow('widget');
      // Each webview initializes its own locale. Set the fixture language before checking translated actions.
      await browser.execute(() => localStorage.setItem('language', 'zh'));
      await browser.refresh();
      await $('#root').waitForDisplayed();
      await browser.waitUntil(async () => await $('[data-testid="widget-pin"]').getAttribute('aria-label') === '取消置顶');
      evidence(`${skin}-widget-locale`, await browser.execute(() => ({ language: document.documentElement.lang, storedLanguage: localStorage.getItem('language') })));
      await invoke('widget_action', { action: 'collapse' });
      await $('.pulse-widget:not(.is-expanded)').waitForDisplayed();
      await verifyWidgetClient(`${skin}-collapsed`, 180);
      await shot(`${skin}-widget`);
      await invoke('widget_action', { action: 'expand' });
      await $('.pulse-widget.is-expanded').waitForDisplayed();
      await verifyWidgetClient(`${skin}-expanded`, 'expanded');
      const pin = $('[data-testid="widget-pin"]');
      expect(await pin.getAttribute('aria-label')).toBe('取消置顶');
      await pin.click();
      await browser.waitUntil(async () => (await invoke<any>('get_pulse_preferences')).widgetAlwaysOnTop === false);
      await browser.waitUntil(async () => await pin.getAttribute('aria-label') === '置顶');
      expect(await pin.getAttribute('aria-pressed')).toBe('false');
      await pin.waitForEnabled();
      await pin.click();
      await browser.waitUntil(async () => (await invoke<any>('get_pulse_preferences')).widgetAlwaysOnTop === true);
      await browser.waitUntil(async () => await pin.getAttribute('aria-label') === '取消置顶');
      await verifyWidgetClient(`${skin}-expanded-after-pin`, 'expanded');
      await shot(`${skin}-widget-expanded`);
      await invoke('widget_action', { action: 'collapse' });
      await $('.pulse-widget:not(.is-expanded)').waitForDisplayed();
      await verifyWidgetClient(`${skin}-collapsed-after-expanded`, 180);
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
