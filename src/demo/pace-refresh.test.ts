import { expect, it, vi } from "vitest";
import { syntheticCoachSnapshot } from "../pulse/lib/pulse-pace";
import { decorateDemoPaceRefresh, subscribeDemoPaceRefresh } from "./pace-refresh";

it("shows one queued refresh and completes it once for repeated clicks", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
  const changed = vi.fn();
  const unsubscribe = subscribeDemoPaceRefresh(changed);
  const read = (refresh = false) => decorateDemoPaceRefresh(syntheticCoachSnapshot("stale"), refresh);
  try {
    expect(read()).toMatchObject({ status: "stale", refreshQueued: false, refreshAfterSeconds: 5 });
    expect(read(true)).toMatchObject({ status: "stale", refreshQueued: true });
    expect(read(true).refreshQueued).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(read(true)).toMatchObject({ refreshQueued: false, refreshInFlight: true });
    vi.advanceTimersByTime(300);
    const updated = read();
    expect(updated).toMatchObject({ status: "idle", updatedAt: "2026-11-27T10:00:05.300Z", refreshQueued: false, refreshInFlight: false });
    expect(updated.windows.find(window => window.kind === "weekly")?.state).toBe("idle");
    expect(changed).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(5_000);
    expect(read().updatedAt).toBe(updated.updatedAt);
    expect(changed).toHaveBeenCalledTimes(3);
  } finally {
    unsubscribe();
    vi.useRealTimers();
  }
});
