import { browser, expect } from '@wdio/globals';
import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const windows = ['main', 'widget', 'pulse-pace'];
const output = process.env.PULSE_NOTICE_TEST_OUTPUT!;
const data = resolve(process.env.PULSE_NOTICE_TEST_DATA!);
const ledger = resolve(data, 'coach-notice-state.json');
if (dirname(ledger) !== data || !data.startsWith(resolve('.local/native-notice-sync') + '\\')) {
  throw new Error('Notice failure injection must stay in this owned fixture');
}
const backup = join(data, 'notice-ledger-before-failure.json');
const evidence: Record<string, unknown> = { source: 'explicit offline debug-e2e synthetic fixture',
  input: 'DOM activation in owned native WebViews; no global input',
  scope: 'real three WebViews, Rust persistence and existing native event; popup remains hidden without a Codex host' };
function record(key: string, value: unknown) {
  evidence[key] = value;
  writeFileSync(join(output, 'native-notice-sync-evidence.json'), JSON.stringify(evidence, null, 2));
}
async function invoke<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.tauri.execute(({ core }, cmd, value) => core.invoke(cmd, value), name, args) as Promise<T>;
}
async function view(label: string) {
  await browser.switchToWindow(label);
  return browser.execute(() => ({ banners: document.querySelectorAll('.coach-reset-notice').length,
    unread: document.querySelectorAll('.coach-notice-actions button').length,
    alerts: [...document.querySelectorAll('.coach-reset-notice [role="alert"]')].map(node => node.textContent),
    events: (window as typeof window & { noticeSyncEvents?: number }).noticeSyncEvents ?? 0 }));
}
async function all(unread: number) {
  const states: Record<string, unknown> = {};
  for (const label of windows) {
    await browser.waitUntil(async () => { const state = await view(label); return state.banners === 1 && state.unread === unread; });
    states[label] = await view(label);
  }
  return states;
}

describe('Notice read state across real native WebViews', () => {
  it('retains unread after a real I/O failure, then broadcasts a durable retry and survives reopen/reload', async () => {
    await browser.switchToWindow('main');
    const paths = await invoke<{ data: string }>('get_pulse_paths');
    record('fixtureBinding', { backendData: paths.data, specData: data });
    expect(resolve(paths.data)).toBe(data);
    await invoke('widget_action', { action: 'details' });
    await invoke('widget_action', { action: 'show' });
    await invoke('widget_action', { action: 'expand' });
    for (const label of windows) {
      await browser.switchToWindow(label);
      await browser.execute(async () => {
        const target = window as typeof window & { noticeSyncEvents?: number;
          __TAURI__: { event: { listen: (name: string, callback: () => void) => Promise<() => void> } } };
        target.noticeSyncEvents = 0;
        await target.__TAURI__.event.listen('pulse-pace-updated', () => { target.noticeSyncEvents = (target.noticeSyncEvents ?? 0) + 1; });
      });
    }
    record('initial', await all(1));
    const original = readFileSync(ledger);
    renameSync(ledger, backup);
    mkdirSync(ledger);
    try {
      await browser.switchToWindow('pulse-pace');
      await browser.execute(() => (document.querySelector('.coach-notice-actions button') as HTMLButtonElement).click());
      await browser.waitUntil(async () => (await view('pulse-pace')).alerts.length === 1);
      record('failedWrite', await all(1));
    } finally {
      // Remove only the exact empty directory created above; preserve the original bytes.
      rmdirSync(ledger);
      renameSync(backup, ledger);
    }
    expect(readFileSync(ledger).equals(original)).toBe(true);
    await invoke('widget_action', { action: 'hide' });
    await browser.switchToWindow('main');
    await browser.execute(() => (document.querySelector('.coach-notice-actions button') as HTMLButtonElement).click());
    const synced = await all(0);
    for (const value of Object.values(synced)) {
      expect((value as { events: number }).events).toBeGreaterThan(0);
      expect((value as { alerts: string[] }).alerts).toHaveLength(0);
    }
    record('durableRetryAndNativeEvents', synced);
    const persisted = JSON.parse(readFileSync(ledger, 'utf8'));
    expect(persisted.seen.some((item: { read: boolean }) => item.read)).toBe(true);
    record('persistedLedger', persisted);
    await invoke('widget_action', { action: 'show' });
    record('hiddenWidgetReopened', await all(0));
    for (const label of windows) { await browser.switchToWindow(label); await browser.refresh(); }
    record('webViewsReloaded', await all(0));
  });
});
