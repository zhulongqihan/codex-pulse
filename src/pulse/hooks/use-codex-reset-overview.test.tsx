// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCodexResetHistory, fetchLatestCodexReset, scanUsage, type CodexResetAnnouncement } from "@/lib/api";
import { useCodexResetOverview } from "./use-codex-reset-overview";

vi.mock("@/lib/api", () => ({ fetchCodexResetHistory: vi.fn(), fetchLatestCodexReset: vi.fn(), scanUsage: vi.fn() }));
const row = (id: string): CodexResetAnnouncement => ({ id, resetType: "regular", announcedAt: "2026-11-10T00:00:00Z", text: id, source: { url: "https://example.org/" } });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

describe("reset-only overview recovery", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(fetchLatestCodexReset).mockResolvedValue(row("latest")); vi.mocked(fetchCodexResetHistory).mockResolvedValue([row("history")]); });

  it("deduplicates repeated retries into only the two reset requests, without scanning local logs", async () => {
    const latest = deferred<CodexResetAnnouncement | null>(), history = deferred<CodexResetAnnouncement[]>();
    vi.mocked(fetchLatestCodexReset).mockReturnValue(latest.promise); vi.mocked(fetchCodexResetHistory).mockReturnValue(history.promise);
    const { result } = renderHook(() => useCodexResetOverview(30));
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = result.current.refresh(); second = result.current.refresh(); });
    expect(first).toBe(second); expect(result.current.isLoading).toBe(true);
    expect(fetchLatestCodexReset).toHaveBeenCalledTimes(1); expect(fetchCodexResetHistory).toHaveBeenCalledExactlyOnceWith(30);
    await act(async () => { latest.resolve(row("latest")); history.resolve([row("history")]); await first; });
    expect(result.current.isLoading).toBe(false); expect(result.current.error).toBeNull(); expect(scanUsage).not.toHaveBeenCalled();
  });

  it("recovers after initial failure and does not cache the rejected request forever", async () => {
    vi.mocked(fetchLatestCodexReset).mockRejectedValueOnce(new Error("reset service offline"));
    vi.mocked(fetchCodexResetHistory).mockRejectedValueOnce(new Error("history offline"));
    const { result } = renderHook(() => useCodexResetOverview(30));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBe("reset service offline"); expect(result.current.latest).toBeNull();
    await act(async () => { await result.current.refresh(); });
    expect(result.current.latest?.id).toBe("latest"); expect(result.current.history?.[0].id).toBe("history");
    expect(result.current.error).toBeNull(); expect(fetchCodexResetHistory).toHaveBeenCalledTimes(2); expect(scanUsage).not.toHaveBeenCalled();
  });

  it("keeps the last history and its error when a successful latest request finishes first", async () => {
    const { result } = renderHook(() => useCodexResetOverview(30));
    await act(async () => { await result.current.refresh(); });
    const latest = deferred<CodexResetAnnouncement | null>(), history = deferred<CodexResetAnnouncement[]>();
    vi.mocked(fetchLatestCodexReset).mockReturnValue(latest.promise); vi.mocked(fetchCodexResetHistory).mockReturnValue(history.promise);
    let request!: Promise<void>; act(() => { request = result.current.refresh(); });
    await act(async () => latest.resolve(row("new latest"))); expect(result.current.isLoading).toBe(true);
    await act(async () => { history.reject(new Error("history failed")); await request; });
    expect(result.current.latest?.id).toBe("new latest"); expect(result.current.history?.[0].id).toBe("history"); expect(result.current.error).toBe("history failed");
  });

  it("rejects an older range response even if its slow success arrives after the new range", async () => {
    const oldLatest = deferred<CodexResetAnnouncement | null>(), oldHistory = deferred<CodexResetAnnouncement[]>();
    vi.mocked(fetchLatestCodexReset).mockReturnValueOnce(oldLatest.promise); vi.mocked(fetchCodexResetHistory).mockReturnValueOnce(oldHistory.promise);
    const { result, rerender } = renderHook(({ days }) => useCodexResetOverview(days), { initialProps: { days: 30 } });
    let old!: Promise<void>; act(() => { old = result.current.refresh(); });
    rerender({ days: 7 }); await act(async () => { await result.current.refresh(); });
    await act(async () => { oldLatest.resolve(row("old")); oldHistory.resolve([row("old")]); await old; });
    expect(result.current.latest?.id).toBe("latest"); expect(result.current.history?.[0].id).toBe("history"); expect(result.current.isLoading).toBe(false);
  });
});
