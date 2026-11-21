import { $, browser, expect } from '@wdio/globals';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import type { QuotaHistoryDayResponse, QuotaHistoryResponse, QuotaRecordingPreferences } from '../src/pulse/lib/quota-history';

// All commands run inside the actual offline Tauri app. Only the last scenario
// temporarily seeds an account and its two synthetic quota scopes.
const output = process.env.PULSE_TEST_OUTPUT!;
const evidence: Record<string, unknown> = {};
type StoredPreferences = QuotaRecordingPreferences & { epoch: number };

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, payload) => core.invoke(cmd, payload), command, args) as Promise<T>;
}

function record(name: string, value: unknown) {
  evidence[name] = value;
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'quota-history-native-evidence.json'), JSON.stringify(evidence, null, 2));
}

function storedPreferences(): StoredPreferences {
  return JSON.parse(readFileSync(join(process.env.PULSE_DATA_DIR!, 'quota-recording-preferences.json'), 'utf8'));
}

function insideFixture(path: string, root: string) {
  const child = relative(realpathSync(root), realpathSync(path));
  return child !== '' && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(child);
}

function syntheticAccount(account: string, home: string) {
  const subject = 'synthetic-quota-user';
  const hash = createHash('sha256');
  // Match the existing Rust v1 ledger key for this owned test directory.
  for (const value of ['pulse-quota-pace-v1', account, subject, home]) {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(8);
    length.writeBigUInt64LE(BigInt(bytes.length));
    hash.update(length).update(bytes);
  }
  const claims = Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_user_id: subject },
  })).toString('base64url');
  return {
    identity: hash.digest('hex'),
    auth: {
      auth_mode: 'chatgpt',
      tokens: { account_id: account, access_token: 'synthetic-not-a-credential', id_token: `synthetic.${claims}.invalid` },
    },
  };
}

function syntheticDay(daysAgo: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone });
  let end = Date.now() - daysAgo * 86_400_000;
  if (formatter.format(end - 60_000) !== formatter.format(end)) end += 60_000;
  return { date: formatter.format(end), start: end - 60_000, end };
}

async function rejected(command: string, args: Record<string, unknown>, expected: RegExp | string) {
  // Catch within the webview so rejection of a real Rust command cannot be
  // confused with a WebDriver transport failure.
  const result = await browser.tauri.execute(async ({ core }, cmd, payload) => {
    try { await core.invoke(cmd, payload); return { rejected: false, error: '' }; }
    catch (error) { return { rejected: true, error }; }
  }, command, args);
  expect(result.rejected).toBe(true);
  if (typeof expected === 'string') expect(result.error).toEqual({ code: expected });
  else expect(String(result.error)).toMatch(expected);
  return { command, args, error: result.error };
}

async function focusAndActivate(selector: string, key = 'Enter') {
  const control = $(selector);
  await control.waitForDisplayed();
  await invoke('plugin:window|set_focus', { label: 'main' });
  await control.execute(element => element.focus());
  expect(await control.isFocused()).toBe(true);
  await physicalKey(key);
}

async function physicalKey(key: string) {
  // The embedded driver dispatches untrusted key events and omits the browser's
  // default Enter/Space button activation or select navigation. Send fixed keys to the
  // sole foreground process with this run's exact debug-e2e image path.
  const virtualKey = { Enter: 0x0d, ' ': 0x20, ArrowRight: 0x27, Home: 0x24 }[key];
  if (virtualKey === undefined) throw new Error('Unsupported quota native test key');
  const expectedBinary = realpathSync(process.env.PULSE_TITLEBAR_EXPECTED_APP_BINARY!);
  const harnessBinary = realpathSync(resolve(process.env.CARGO_TARGET_DIR || 'src-tauri/target', 'debug/codex-pulse.exe'));
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PulseQuotaNativeKey {
  [StructLayout(LayoutKind.Sequential)] public struct Keyboard { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct Mouse { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct Union { [FieldOffset(0)] public Keyboard keyboard; [FieldOffset(0)] public Mouse mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public Union value; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] inputs, int size);
  public static bool Press(ushort key) {
    var down = new Input { type=1, value=new Union { keyboard=new Keyboard { key=key } } };
    var up = new Input { type=1, value=new Union { keyboard=new Keyboard { key=key, flags=2 } } };
    return SendInput(2, new Input[] { down, up }, Marshal.SizeOf(typeof(Input))) == 2;
  }
}
'@
$expected = [IO.Path]::GetFullPath($env:PULSE_TITLEBAR_EXPECTED_APP_BINARY)
$harnessBinary = [IO.Path]::GetFullPath($env:PULSE_QUOTA_HARNESS_APP_BINARY)
if (-not [String]::Equals($expected, $harnessBinary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Expected this harness debug-e2e image' }
$matchesImage = @(Get-Process -Name 'codex-pulse' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and [String]::Equals([IO.Path]::GetFullPath($_.Path), $expected, [StringComparison]::OrdinalIgnoreCase) })
if ($matchesImage.Count -ne 1) { throw 'Expected exactly one owned debug-e2e process' }
[uint32]$foregroundProcess = 0
[void][PulseQuotaNativeKey]::GetWindowThreadProcessId([PulseQuotaNativeKey]::GetForegroundWindow(), [ref]$foregroundProcess)
if ($foregroundProcess -ne $matchesImage[0].Id) { throw 'Foreground is outside the owned debug-e2e process; no key sent' }
if (-not [PulseQuotaNativeKey]::Press([uint16]$env:PULSE_QUOTA_NATIVE_VIRTUAL_KEY)) { throw 'Native key input was rejected' }
`;
  const result = spawnSync(join(process.env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { env: { ...process.env, PULSE_TITLEBAR_EXPECTED_APP_BINARY: expectedBinary, PULSE_QUOTA_HARNESS_APP_BINARY: harnessBinary, PULSE_QUOTA_NATIVE_VIRTUAL_KEY: String(virtualKey) }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.status !== 0) throw new Error(`Guarded native key input failed: ${result.stderr || result.error?.message}`);
}

describe('Official quota history in the real offline Tauri app', () => {
  before(async () => {
    const fixtureRoot = process.env.PULSE_TEST_FIXTURE_ROOT!;
    const data = process.env.PULSE_DATA_DIR!;
    const home = process.env.PULSE_CODEX_HOME!;
    expect(process.env.PULSE_OFFLINE).toBe('1');
    expect(insideFixture(fixtureRoot, resolve('.local/native-parity'))).toBe(true);
    expect(insideFixture(data, fixtureRoot)).toBe(true);
    expect(insideFixture(home, fixtureRoot)).toBe(true);
    expect(process.env.CODEX_HOME).toBe(home);
    expect(existsSync(join(home, 'auth.json'))).toBe(false);
    expect(await browser.execute(() => '__TAURI_INTERNALS__' in window)).toBe(true);
    const paths = await invoke<{ data: string }>('get_pulse_paths');
    expect(resolve(paths.data)).toBe(resolve(data));
    await browser.switchToWindow('main');
    await browser.refresh();
    await $('[data-testid="dashboard-nav-tab"]').waitForDisplayed({ timeout: 90000 });
    const binary = process.env.PULSE_TITLEBAR_EXPECTED_APP_BINARY!;
    record('boundary', {
      fixtureRoot, data, home, offline: true, authFileAbsentAtStart: true,
      actualTauriIpc: true, syntheticHistoryOnlyInScopeScenario: true,
      keyboardInput: 'Guarded Win32 SendInput; exact foreground debug image, only Enter/Space/ArrowRight/Home',
      binary, binaryModifiedAt: statSync(binary).mtime.toISOString(),
      covered: ['real IPC', 'preference file and epoch', 'scope unavailable', 'input rejection', 'native UI and keyboard activation'],
      notCovered: ['authenticated official quota fetch', 'populated segment pagination', 'production installation or upgrade'],
    });
  });

  it('persists disabling and reenabling through real IPC without advancing an unchanged epoch', async () => {
    const original = await invoke<QuotaRecordingPreferences>('get_quota_recording_preferences');
    const baseline = storedPreferences();
    expect(original.schemaVersion).toBe(1);
    expect(original.timezone).not.toBe('');
    expect(baseline.epoch).toBeGreaterThan(0);
    expect(Object.keys(original).sort()).toEqual(['enabled', 'schemaVersion', 'timezone']);
    expect(baseline.enabled).toBe(original.enabled);
    const changes: StoredPreferences[] = [baseline];
    try {
      let expectedEpoch = baseline.epoch;
      let enabled = original.enabled;
      for (const next of [false, false, true, true]) {
        if (next !== enabled) expectedEpoch += 1;
        const returned = await invoke<QuotaRecordingPreferences>('set_quota_recording_enabled', { enabled: next });
        const persisted = storedPreferences();
        expect(returned).toEqual({ ...original, enabled: next });
        expect(await invoke('get_quota_recording_preferences')).toEqual(returned);
        expect(persisted).toEqual({ ...baseline, enabled: next, epoch: expectedEpoch });
        changes.push(persisted);
        enabled = next;
      }
      await browser.refresh();
      await $('[data-testid="dashboard-nav-tab"]').waitForDisplayed();
      expect((await invoke<QuotaRecordingPreferences>('get_quota_recording_preferences')).enabled).toBe(true);
      expect(storedPreferences()).toEqual(changes.at(-1));
      record('preference-persistence', { original, changes, webviewReloadRetained: true, processRestartTested: false });
    } finally {
      await invoke('set_quota_recording_enabled', { enabled: original.enabled });
    }
  });

  it('keeps a one-day unknown history empty and reports unavailable identity explicitly', async () => {
    const preferences = await invoke<QuotaRecordingPreferences>('get_quota_recording_preferences');
    const history = await invoke<QuotaHistoryResponse>('fetch_quota_history', { range: '1d' });
    expect(history.schemaVersion).toBe(1);
    expect(history.scopeAvailable).toBe(false);
    expect(history.hasOtherScopeHistory).toBe(false);
    expect(history.readStatus).toBe('identity_unavailable');
    expect(history.storageStatus).toBe('ready');
    expect(history.timezone).toBe(preferences.timezone);
    expect(history.enabled).toBe(preferences.enabled);
    expect(history.startDate).toBe(history.endDate);
    expect(history.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(history.daily).toEqual([]);
    expect(history.summaries).toEqual([]);
    expect(history.updatedAt).toBeNull();
    const details: QuotaHistoryDayResponse[] = [];
    for (const [kind, windowMinutes] of [['session', 300], ['weekly', 10080]] as const) {
      for (const before of [null, 1]) {
        const detail = await invoke<QuotaHistoryDayResponse>('fetch_quota_history_day', { date: history.endDate, kind, windowMinutes, before });
        expect(detail.scopeAvailable).toBe(false);
        expect(detail.readStatus).toBe('identity_unavailable');
        expect(detail.storageStatus).toBe('ready');
        expect(detail.identityRevision).toBe(history.identityRevision);
        expect(detail.segments).toEqual([]);
        expect(detail.nextBefore).toBeNull();
        details.push(detail);
      }
    }
    record('unknown-without-account', { history, details, fabricatedZeroRows: false });
  });

  it('rejects invalid date ranges and day pagination filters even without an account', async () => {
    const failures: unknown[] = [];
    for (const range of [
      'not-a-range',
      'custom:2025-01-01_2026-01-02',
      'custom:2025-02-30_2025-03-01',
      'custom:2025-03-02_2025-03-01',
    ]) failures.push(await rejected('fetch_quota_history', { range }, 'local_read_failed'));
    const filter = { date: '2025-03-01', kind: 'session', windowMinutes: 300, before: null };
    for (const patch of [
      { kind: 'other' }, { windowMinutes: 0 }, { windowMinutes: 5_256_001 },
      { before: 0 }, { before: -1 },
    ]) failures.push(await rejected('fetch_quota_history_day', { ...filter, ...patch }, 'local_read_failed'));
    failures.push(await rejected('fetch_quota_history_day', { ...filter, date: '2025-02-30' }, 'local_read_failed'));
    failures.push(await rejected('set_quota_recording_enabled', { enabled: 'false' }, /invalid.*enabled|invalid type/i));
    record('invalid-input-rejections', failures);
  });

  it('exposes the official analysis entry and keeps unknown readings distinct from zero in both skins', async () => {
    const checks: unknown[] = [];
    for (const skinId of ['clear', 'meter']) {
      await invoke('set_pulse_preferences', { patch: { skinId, theme: 'light', motionLevel: 'off' } });
      await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skinId);
      await browser.setWindowSize(1440, 920);
      await $('[data-testid="dashboard-nav-tab"]').click();
      const summary = $('[data-testid="quota-history-summary"]');
      await summary.waitForDisplayed();
      await browser.waitUntil(async () => (await summary.getText()).includes('暂时无法确认当前账号'));
      expect(await summary.getText()).toContain('今日观测消耗');
      const unknown = await summary.$$('dd');
      expect(unknown.length).toBe(2);
      for (const reading of unknown) expect(await reading.getText()).toBe('—');
      await focusAndActivate('[data-testid="quota-history-summary"] button');
      await expect($('[data-testid="analysis-nav-tab"]')).toHaveAttribute('aria-selected', 'true');
      await $('[data-testid="quota-history-view"]').waitForDisplayed();
      await expect($('.pulse-analysis-source-tabs button:nth-child(2)')).toHaveText('官方额度记录');
      await expect($('.pulse-analysis-source-tabs button:nth-child(2)')).toHaveAttribute('aria-pressed', 'true');
      await expect($('[data-testid="usage-analysis"]')).not.toBeDisplayed();
      const rangeSelector = '[data-testid="quota-history-view"] .pulse-quota-controls select';
      await focusAndActivate(rangeSelector, 'Home');
      await expect($(rangeSelector)).toHaveValue('1d');
      const current = await invoke<QuotaHistoryResponse>('fetch_quota_history', { range: '1d' });
      await browser.waitUntil(async () => (await $('.pulse-quota-context').getText()).includes(`${current.startDate} — ${current.endDate}`));
      expect(await $('[data-testid="quota-history-view"]').getText()).toContain('暂时无法确认当前账号');
      expect(await $('.pulse-quota-total dd').getText()).toBe('—');
      expect(await $('[data-testid="quota-history-view"]').getText()).toContain('缺样日期保持未知，不作为零消耗日参与统计');
      expect(await $('[data-testid="quota-history-view"]').getText()).toContain('此范围尚未记录额度窗口');
      await expect($('[data-testid="quota-history-view"] table')).not.toBeExisting();
      for (const width of [1440, 1000]) {
        await browser.setWindowSize(width, 780);
        const geometry = await browser.execute(() => ({ width: innerWidth, height: innerHeight, documentFits: document.documentElement.scrollWidth <= innerWidth }));
        expect(geometry.documentFits).toBe(true);
        await browser.saveScreenshot(join(output, `quota-history-${skinId}-${width}-unknown.png`));
        checks.push({ skinId, ...geometry, unknownSummary: ['—', '—'], unknownTotal: '—', identityUnavailableVisible: true });
      }
      await expect($('.pulse-analysis-source-tabs button:first-child')).toHaveText('本机 Token 与参考成本');
      await focusAndActivate('.pulse-analysis-source-tabs button:first-child');
      await $('[data-testid="usage-analysis"]').waitForDisplayed();
      await expect($('[data-testid="quota-history-view"]')).not.toBeDisplayed();
      await focusAndActivate('.pulse-analysis-source-tabs button:nth-child(2)');
      await $('[data-testid="quota-history-view"]').waitForDisplayed();
    }
    record('native-analysis-entry', checks);
  });

  it('lets users reach the data-source recording card and save both states with the keyboard', async () => {
    const original = await invoke<QuotaRecordingPreferences>('get_quota_recording_preferences');
    const checks: unknown[] = [];
    try {
      for (const skinId of ['clear', 'meter']) {
        await invoke('set_pulse_preferences', { patch: { skinId, theme: 'light', motionLevel: 'off' } });
        await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skinId);
        await browser.setWindowSize(1000, 780);
        await focusAndActivate('[data-testid="settings-nav-tab"]');
        await $('#settings-tab-appearance').waitForDisplayed();
        await $('#settings-tab-appearance').execute(element => element.focus());
        for (let steps = 0; steps < 8 && await $('#settings-tab-source').getAttribute('aria-selected') !== 'true'; steps++) {
          await physicalKey('ArrowRight');
        }
        await expect($('#settings-tab-source')).toHaveAttribute('aria-selected', 'true');
        expect(await $('#settings-tab-source').isFocused()).toBe(true);
        const selector = '#settings-section-source [role="switch"][aria-label="记录每日官方额度"]';
        const control = $(selector);
        await control.waitForDisplayed();
        await browser.waitUntil(async () => await control.isEnabled());
        expect(await $('#settings-section-source').getText()).toContain('关闭开关不删除历史');
        const before = storedPreferences();
        for (const key of ['Enter', ' ']) {
          const previous = storedPreferences();
          await focusAndActivate(selector, key);
          await expect(control).toHaveAttribute('aria-checked', String(!previous.enabled));
          await browser.waitUntil(async () => await control.getAttribute('aria-busy') === 'false');
          const persisted = storedPreferences();
          expect(persisted.enabled).toBe(!previous.enabled);
          expect(persisted.epoch).toBe(previous.epoch + 1);
          expect((await invoke<QuotaRecordingPreferences>('get_quota_recording_preferences')).enabled).toBe(persisted.enabled);
          checks.push({ skinId, key: key === ' ' ? 'Space' : key, persisted });
        }
        expect(storedPreferences().enabled).toBe(before.enabled);
        await browser.refresh();
        await $('[data-testid="settings-nav-tab"]').waitForDisplayed();
        expect((await invoke<QuotaRecordingPreferences>('get_quota_recording_preferences')).enabled).toBe(before.enabled);
        await $('[data-testid="settings-nav-tab"]').click();
        await $('#settings-tab-source').click();
        await expect($(selector)).toHaveAttribute('aria-checked', String(before.enabled));
        await $(selector).scrollIntoView({ block: 'center' });
        await browser.saveScreenshot(join(output, `quota-recording-${skinId}-source-keyboard.png`));
      }
      record('native-source-settings-keyboard', { checks, reloadRetained: true, originalRestored: true });
    } finally {
      await invoke('set_quota_recording_enabled', { enabled: original.enabled });
    }
  });

  it('shows a saved-history hint while displaying only the current scope in all three skins', async () => {
    const fixtureRoot = process.env.PULSE_TEST_FIXTURE_ROOT!;
    const home = process.env.PULSE_CODEX_HOME!;
    const data = process.env.PULSE_DATA_DIR!;
    const ledgerPath = join(data, 'quota-history.db');
    const authPath = join(home, 'auth.json');
    expect(process.env.PULSE_OFFLINE).toBe('1');
    expect(insideFixture(fixtureRoot, resolve('.local/native-parity'))).toBe(true);
    expect(insideFixture(home, fixtureRoot)).toBe(true);
    expect(insideFixture(data, fixtureRoot)).toBe(true);
    expect(insideFixture(ledgerPath, data)).toBe(true);
    expect(existsSync(authPath)).toBe(false);

    const original = await invoke<{ skinId: string; theme: string; motionLevel: string }>('get_pulse_preferences');
    const originalSize = await browser.getWindowSize();
    const timezone = storedPreferences().timezone;
    const earlier = syntheticDay(2, timezone);
    const current = syntheticDay(1, timezone);
    const previousAccount = syntheticAccount('synthetic-quota-account-a', home);
    const currentAccount = syntheticAccount('synthetic-quota-account-b', home);
    const db = new DatabaseSync(ledgerPath);
    const inserted: number[] = [];
    const skins: Array<{ skinId: string; total: string; coverage: string }> = [];
    let authCreated = false;
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      expect(db.prepare('SELECT COUNT(*) AS count FROM segments').get()?.count).toBe(0);
      const insert = db.prepare(`
        INSERT INTO segments (identity, kind, minutes, reset, cycle, date, start_date, end_date,
            start_at, end_at, start_used, end_used, consumed, covered, samples, reason, source)
        VALUES (?, 'weekly', 10080, ?, 0, ?, ?, ?, ?, ?, 20, ?, ?, 1, 2, 'continuous', 'official')
      `);
      db.exec('BEGIN IMMEDIATE');
      try {
        const setCycle = db.prepare('UPDATE segments SET cycle = id WHERE id = ?');
        for (const [account, day, points] of [[previousAccount, earlier, 8], [currentAccount, current, 1]] as const) {
          const result = insert.run(account.identity, day.end + 2 * 86_400_000, day.date, day.date, day.date, day.start, day.end, 20 + points, points);
          const id = Number(result.lastInsertRowid);
          inserted.push(id);
          setCycle.run(id);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      writeFileSync(authPath, JSON.stringify(currentAccount.auth), { flag: 'wx' });
      authCreated = true;

      const history = await invoke<QuotaHistoryResponse>('fetch_quota_history', { range: '30d' });
      expect(history.scopeAvailable).toBe(true);
      expect(history.hasOtherScopeHistory).toBe(true);
      expect(history.daily.map(row => [row.date, row.consumedPercentPoints])).toEqual([[current.date, 1]]);
      const earlierDay = await invoke<QuotaHistoryDayResponse>('fetch_quota_history_day', {
        date: earlier.date, kind: 'weekly', windowMinutes: 10080, before: null,
      });
      expect(earlierDay.scopeAvailable).toBe(true);
      expect(earlierDay.segments).toEqual([]);

      for (const skinId of ['clear', 'meter', 'paper']) {
        await invoke('set_pulse_preferences', { patch: { skinId, theme: 'light', motionLevel: 'off' } });
        await browser.setWindowSize(1000, 780);
        await browser.refresh();
        await browser.waitUntil(async () => await browser.execute(() => document.documentElement.dataset.skin) === skinId);
        await $('[data-testid="dashboard-nav-tab"]').click();
        const entry = $('[data-testid="quota-history-summary"] button');
        await entry.waitForDisplayed();
        await entry.click();
        const view = $('[data-testid="quota-history-view"]');
        await view.waitForDisplayed();
        await browser.waitUntil(async () => (await view.getText()).includes('本地还保留其他账号或来源的额度历史'));
        await expect(view.$('.pulse-quota-controls select')).toHaveValue('30d');
        const total = await view.$('.pulse-quota-total dd').getText();
        const coverage = await view.$('.pulse-quota-observed-days').getText();
        expect(total).toBe('1个百分点');
        expect(coverage).toBe('所选 30 天中，有 1 天的样本足以计算观测消耗。');
        expect(await view.getText()).not.toContain('8个百分点');
        const geometry = await browser.execute(() => ({ width: innerWidth, documentFits: document.documentElement.scrollWidth <= innerWidth }));
        expect(geometry.documentFits).toBe(true);
        await browser.saveScreenshot(join(output, `quota-history-${skinId}-separate-scope.png`));
        skins.push({ skinId, total, coverage });
      }
    } finally {
      try {
        const remove = db.prepare('DELETE FROM segments WHERE id = ? AND identity IN (?, ?)');
        for (const id of inserted) remove.run(id, previousAccount.identity, currentAccount.identity);
      } finally {
        db.close();
        if (authCreated) unlinkSync(authPath);
      }
      await invoke('set_pulse_preferences', { patch: {
        skinId: original.skinId, theme: original.theme, motionLevel: original.motionLevel,
      } });
      await browser.setWindowSize(originalSize.width, originalSize.height);
      await browser.refresh();
    }
    const after = await invoke<QuotaHistoryResponse>('fetch_quota_history', { range: '30d' });
    expect(after.scopeAvailable).toBe(false);
    expect(after.hasOtherScopeHistory).toBe(false);
    expect(after.daily).toEqual([]);
    record('present-but-isolated-history', { synthetic: true, offline: true, currentOnly: true,
      previousDayNotDisclosedByIpc: true, restoredAnonymousFixture: true, skins });
  });
});
