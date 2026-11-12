// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { syntheticCoachSnapshot, usePulsePace, type PaceSnapshot } from "./pulse-pace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const now = new Date("2026-11-12T05:00:00Z");
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const snapshot = (withNotice = false): PaceSnapshot => {
  const value = syntheticCoachSnapshot(withNotice ? "notice" : "roomy", now);
  value.windows[1].remainingPercent = 37;
  value.refreshFailed = false;
  return value;
};
let update!: () => void;
beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset().mockImplementation(async (_event, callback) => {
    update = callback as () => void; return () => {};
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("companion local snapshot recovery", () => {
  it.each(["broadcast", "visible", "poll"])("clears a recovered local read failure through %s without a new quota observation", async trigger => {
    const value = snapshot();
    vi.mocked(invoke).mockResolvedValueOnce(value).mockRejectedValueOnce(Error("synthetic local snapshot failure")).mockResolvedValueOnce(value);
    const view = renderHook(() => usePulsePace()); await act(async () => {});
    const read = async () => { await act(async () => {
      if (trigger === "broadcast") update();
      else if (trigger === "visible") document.dispatchEvent(new Event("visibilitychange"));
      else vi.advanceTimersByTime(20_000);
    }); };
    await read(); expect(view.result.current.error).toBe(true);
    await read();
    expect(view.result.current.data?.updatedAt).toBe(value.updatedAt);
    expect(view.result.current.data?.refreshFailed).toBe(false);
    expect(view.result.current.error).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("refresh_pulse_pace");
  });

  it("keeps an authoritative backend refresh failure after the local transport recovers", async () => {
    const value = { ...snapshot(), refreshFailed: true, refreshAfterSeconds: 90 };
    vi.mocked(invoke).mockResolvedValueOnce(value).mockRejectedValueOnce(Error("synthetic IPC failure")).mockResolvedValueOnce(value);
    const view = renderHook(() => usePulsePace()); await act(async () => {});
    await act(async () => update()); await act(async () => update());
    expect(view.result.current.error).toBe(true);
    expect(view.result.current.data?.refreshAfterSeconds).toBe(90);
    expect(view.result.current.data?.windows[1].remainingPercent).toBe(37);
  });

  it("accepts the backend clearing its failure without requiring a different account reading timestamp", async () => {
    const healthy = snapshot(), failed = { ...healthy, refreshFailed: true, refreshAfterSeconds: 90 };
    vi.mocked(invoke).mockResolvedValueOnce(failed).mockResolvedValueOnce(healthy);
    const view = renderHook(() => usePulsePace()); await act(async () => {});
    expect(view.result.current.error).toBe(true);
    await act(async () => update());
    expect(view.result.current.data?.updatedAt).toBe(failed.updatedAt);
    expect(view.result.current.error).toBe(false);
  });

  it("ignores a retired manual failure while the newer broadcast snapshot is pending", async () => {
    const initial = snapshot(), manual = deferred<PaceSnapshot>(), fresh = deferred<PaceSnapshot>();
    vi.mocked(invoke).mockResolvedValueOnce(initial).mockImplementationOnce(() => manual.promise).mockImplementationOnce(() => fresh.promise);
    const view = renderHook(() => usePulsePace()); await act(async () => {});
    let refresh!: Promise<void>;
    await act(async () => { refresh = view.result.current.refresh(); });
    await act(async () => update());
    await act(async () => { manual.reject(Error("retired manual failure")); await Promise.resolve(); });
    const pendingError = view.result.current.error;
    await act(async () => { fresh.resolve(initial); await refresh; });
    expect(pendingError).toBe(false);
    expect(view.result.current.error).toBe(false);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "refresh_pulse_pace")).toHaveLength(1);
  });

  it("does not treat an optimistic notice acknowledgement as a recovered snapshot read", async () => {
    const initial = snapshot(true), reread = deferred<PaceSnapshot>();
    vi.mocked(invoke).mockResolvedValueOnce(initial).mockRejectedValueOnce(Error("synthetic local read failure")).mockResolvedValueOnce(undefined).mockImplementationOnce(() => reread.promise);
    const view = renderHook(() => usePulsePace()); await act(async () => {});
    await act(async () => update()); expect(view.result.current.error).toBe(true);
    let acknowledgement!: Promise<void>;
    await act(async () => { acknowledgement = view.result.current.markNoticeRead(initial.coachExtras!.resetNotice!.id); });
    expect(view.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(view.result.current.noticeError).toBe(false);
    expect(view.result.current.error).toBe(true);
    await act(async () => { reread.resolve({ ...initial, coachExtras: { ...initial.coachExtras!, resetNotice: { ...initial.coachExtras!.resetNotice!, isUnread: false } } }); await acknowledgement; });
    expect(view.result.current.error).toBe(false);
  });
});
