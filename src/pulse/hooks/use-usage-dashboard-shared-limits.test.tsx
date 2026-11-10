// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUsageDashboard } from "./use-usage-dashboard";
import type { CodexLimitsResponse } from "@/lib/api";
import "@/i18n";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listeners: new Map<string, (event: { payload: unknown }) => void>() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
  mocks.listeners.set(name, callback);
  return () => { mocks.listeners.delete(name); };
}) }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ isEnabled: vi.fn(async () => false), enable: vi.fn(), disable: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@/hooks/use-codex-forecast", () => ({ useCodexForecast: () => ({ data: null, error: null, isRefreshing: false, refresh: vi.fn() }) }));

function limits(remainingPercent: number, updatedAt = "2026-11-10T01:00:00Z"): CodexLimitsResponse {
  return { session: { remainingPercent, usedPercent: 100 - remainingPercent, windowMinutes: 300, resetsAt: "2099-11-10T06:00:00Z" }, weekly: null,
    updatedAt, source: "synthetic-official", account: "synthetic-user-a", workspaceName: "synthetic-workspace-a", membershipLevel: "fixture" };
}
function overview() {
  const date = new Date().toISOString().slice(0, 10);
  return { range: "1d", days: 1, timezone: "UTC", startDate: date, endDate: date, updatedAt: new Date().toISOString(),
    daily: [{ date, inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, totalTokens: 12, costUSD: 0.01 }],
    totals: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, totalTokens: 12, costUSD: 0.01, avgTokensPerDay: 12, avgCostPerDay: 0.01, cacheHitRate: 0, costPerMillionTokens: 1 }, models: [], projects: [] };
}
beforeEach(() => {
  localStorage.clear(); mocks.listeners.clear(); mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "fetch_overview") return overview();
    if (command === "fetch_codex_limits") return limits(80);
    if (command === "scan_usage") return { importedDays: 1, metrics: { filesParsed: 0, filesReused: 1 } };
    if (command === "fetch_usage_diagnostics") return { status: "ready" };
    if (command === "fetch_codex_reset_history") return [];
    if (command === "get_pulse_paths") return { data: "F:/synthetic/data" };
    if (command === "check_for_updates") return { currentVersion: "0.7.2", latestVersion: "0.7.2", updateAvailable: false };
    return null;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("adopts the sampler's successful quota without new account requests or replacing its read time", async () => {
  const { result, unmount } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.codexLimits?.session?.remainingPercent).toBe(80));
  const requestCount = mocks.invoke.mock.calls.filter(call => call[0] === "fetch_codex_limits").length;
  const shared = limits(70, "2026-11-10T01:01:00Z");
  await act(async () => { mocks.listeners.get("codex-limits-updated")?.({ payload: shared }); });
  expect(result.current.codexLimits).toEqual(shared);
  expect(result.current.codexLimits?.updatedAt).toBe("2026-11-10T01:01:00Z");
  expect(mocks.invoke.mock.calls.filter(call => call[0] === "fetch_codex_limits")).toHaveLength(requestCount);
  await waitFor(() => expect(mocks.invoke.mock.calls.filter(call => call[0] === "update_widget_snapshot").at(-1)?.[1]?.data?.integration?.quotas?.[0]?.remainingPercent).toBe(70));
  unmount();
  expect(mocks.listeners.has("codex-limits-updated")).toBe(false);
});

it("does not let an older in-flight dashboard read overwrite a newer shared success", async () => {
  let finish!: (data: CodexLimitsResponse) => void;
  const fallback = mocks.invoke.getMockImplementation()!;
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => command === "fetch_codex_limits"
    ? new Promise<CodexLimitsResponse>(resolve => { finish = resolve; }) : fallback(command, ...args));
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(mocks.listeners.has("codex-limits-updated")).toBe(true));
  const shared = limits(70, "2026-11-10T01:01:00Z");
  await act(async () => { mocks.listeners.get("codex-limits-updated")!({ payload: shared }); });
  await act(async () => { finish(limits(80)); });
  expect(result.current.codexLimits).toEqual(shared);
  expect(result.current.isLimitsLoading).toBe(false);
});

it("clears old identity values and rejects old success, failure and in-flight responses after a switch", async () => {
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.codexLimits?.session?.remainingPercent).toBe(80));
  await act(async () => { mocks.listeners.get("codex-limits-updated")!({ payload: { ...limits(80), identityRevision: 1 } }); });
  let finish!: (data: CodexLimitsResponse) => void;
  const fallback = mocks.invoke.getMockImplementation()!;
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => command === "fetch_codex_limits"
    ? new Promise<CodexLimitsResponse>(resolve => { finish = resolve; }) : fallback(command, ...args));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handleLimitsRefresh(); });
  await act(async () => { mocks.listeners.get("codex-identity-updated")!({ payload: { revision: 2 } }); });
  expect(result.current.codexLimits).toBeNull();
  expect(result.current.codexLimitsError).toBeNull();
  expect(result.current.isLimitsRefreshing).toBe(false);
  await act(async () => {
    mocks.listeners.get("codex-limits-updated")!({ payload: { ...limits(80), identityRevision: 1 } });
    mocks.listeners.get("codex-limits-failed")!({ payload: { revision: 1, error: "old user error" } });
    finish({ ...limits(80), identityRevision: 1 }); await pending;
  });
  expect(result.current.codexLimits).toBeNull(); expect(result.current.codexLimitsError).toBeNull();
  await act(async () => { mocks.listeners.get("codex-limits-failed")!({ payload: { revision: 2, error: "new user unavailable" } }); });
  expect(result.current.codexLimits).toBeNull(); expect(result.current.codexLimitsError).toBe("new user unavailable");
  await waitFor(() => {
    const data = mocks.invoke.mock.calls.filter(call => call[0] === "update_widget_snapshot").at(-1)?.[1]?.data;
    expect(data.account).toBeNull(); expect(data.quotaIdentityRevision).toBe(2);
    expect(data.integration.quotas.every((quota: { remainingPercent: number | null }) => quota.remainingPercent === null)).toBe(true);
  });
  const next = { ...limits(0), identityRevision: 2, account: "synthetic-user-b", workspaceName: "synthetic-workspace-b" };
  await act(async () => { mocks.listeners.get("codex-limits-updated")!({ payload: next }); });
  expect(result.current.codexLimits).toEqual(next);
});

it("does not let a retired identity activation completion clear a newer identity activation busy state", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.codexLimits).not.toBeNull());
  await act(async () => { mocks.listeners.get("codex-limits-updated")!({ payload: { ...limits(80), identityRevision: 1 } }); });
  const finish: Array<(data: unknown) => void> = [];
  const fallback = mocks.invoke.getMockImplementation()!;
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => command === "activate_codex_window"
    ? new Promise(resolve => finish.push(resolve)) : fallback(command, ...args));
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = result.current.handleActivateCodexWindow(); });
  await act(async () => { mocks.listeners.get("codex-identity-updated")!({ payload: { revision: 2 } }); });
  await act(async () => { second = result.current.handleActivateCodexWindow(); });
  expect(result.current.isWindowActivating).toBe(true);
  await act(async () => { finish[0]({ status: "started", limits: { ...limits(50), identityRevision: 1 } }); await first; });
  expect(result.current.isWindowActivating).toBe(true); expect(result.current.windowActivationStatus).toBeNull();
  await act(async () => { finish[1]({ status: "started", limits: { ...limits(70), identityRevision: 2 } }); await second; });
  expect(result.current.isWindowActivating).toBe(false);
  expect(result.current.codexLimits?.session?.remainingPercent).toBe(70);
});

it("reads the previous update recovery result and acknowledges only after a successful explicit dismiss", async () => {
  const receipt = { id: "a".repeat(64), status: "restored", reason: "synthetic startup failed", attemptedVersion: "0.7.3", recordedAt: null };
  const fallback = mocks.invoke.getMockImplementation()!;
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => command === "fetch_update_recovery_result"
    ? Promise.resolve(receipt) : command === "dismiss_update_recovery_result" ? Promise.reject(new Error("synthetic ack failed")) : fallback(command, ...args));
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.updateRecoveryResult).toEqual(receipt));
  await act(async () => { await result.current.handleDismissUpdateRecovery(); });
  expect(result.current.updateRecoveryResult).toEqual(receipt);
  expect(result.current.updateRecoveryError).toBe("synthetic ack failed");
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => command === "dismiss_update_recovery_result" ? Promise.resolve() : fallback(command, ...args));
  await act(async () => { await result.current.handleDismissUpdateRecovery(); });
  expect(result.current.updateRecoveryResult).toBeNull(); expect(result.current.updateRecoveryError).toBeNull();
});

it("preserves a recovery notice on directory-open failure and lets a read-error-only notice be dismissed locally", async () => {
  const fallback = mocks.invoke.getMockImplementation()!;
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => ["fetch_update_recovery_result", "open_update_records"].includes(command)
    ? Promise.reject(new Error(`synthetic ${command} failure`)) : fallback(command, ...args));
  const { result } = renderHook(useUsageDashboard);
  await waitFor(() => expect(result.current.updateRecoveryError).toContain("fetch_update_recovery_result"));
  await act(async () => { await result.current.handleOpenUpdateRecords(); });
  expect(result.current.updateRecoveryError).toContain("open_update_records");
  await act(async () => { await result.current.handleDismissUpdateRecovery(); });
  expect(result.current.updateRecoveryError).toBeNull();
  expect(mocks.invoke.mock.calls.some(call => call[0] === "dismiss_update_recovery_result")).toBe(false);
});
