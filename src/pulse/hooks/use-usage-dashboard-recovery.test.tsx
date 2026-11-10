// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUsageDashboard } from "./use-usage-dashboard";
import "@/i18n";

const mock = vi.hoisted(() => ({ invoke: vi.fn(), autostart: vi.fn(), enable: vi.fn(), disable: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: (...args: unknown[]) => mock.invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ isEnabled: () => mock.autostart(), enable: () => mock.enable(), disable: () => mock.disable() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@/hooks/use-codex-forecast", () => ({ useCodexForecast: () => ({ data: null, error: null, isRefreshing: false, refresh: vi.fn() }) }));

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); mock.autostart.mockResolvedValue(false);
  mock.invoke.mockImplementation(async (command: string) => {
    const date = new Date().toISOString().slice(0,10);
    if (command === "fetch_overview") return { range: "1d", days: 1, timezone: "UTC", startDate: date, endDate: date, updatedAt: new Date().toISOString(), daily: [{date,inputTokens:1,cachedInputTokens:0,outputTokens:0,totalTokens:1,costUSD:0}], totals:{inputTokens:1,cachedInputTokens:0,outputTokens:0,totalTokens:1,costUSD:0,avgTokensPerDay:1,avgCostPerDay:0,cacheHitRate:0,costPerMillionTokens:0},models:[],projects:[] };
    if (command === "scan_usage") return { importedDays: 1, metrics: { filesParsed: 0, filesReused: 1 } };
    if (command === "fetch_codex_reset_history") return [];
    if (command === "get_pulse_paths") return { data: "F:/synthetic/data" };
    if (command === "check_for_updates") return { currentVersion: "0.8.0", latestVersion: "0.8.0", hasUpdate: false };
    return null;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("retries only reset endpoints through the public dashboard action after normal startup", async () => {
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.isScanning).toBe(false));
  await waitFor(() => expect(result.current.isResetLoading).toBe(false));
  const before = mock.invoke.mock.calls.length;
  await act(async () => { await result.current.handleResetHistoryRefresh(); });
  expect(mock.invoke.mock.calls.slice(before).map(call => call[0]).sort()).toEqual(["fetch_codex_reset_history","fetch_latest_codex_reset"]);
});

it("rechecks autostart read-only after binding repair and clears an old unknown state", async () => {
  mock.autostart.mockRejectedValueOnce(new Error("cannot read startup"));
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.launchAtLoginError).toBe("cannot read startup"));
  expect(result.current.launchAtLoginKnown).toBe(false);
  mock.autostart.mockResolvedValue(true);
  await act(async () => { await result.current.handleLaunchAtLoginRefresh(); });
  expect(result.current.launchAtLogin).toBe(true); expect(result.current.launchAtLoginKnown).toBe(true); expect(result.current.launchAtLoginError).toBeNull();
  expect(mock.enable).not.toHaveBeenCalled(); expect(mock.disable).not.toHaveBeenCalled();
});
