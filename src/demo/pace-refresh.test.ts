import { expect, it, vi } from "vitest";
import { syntheticCoachSnapshot } from "../pulse/lib/pulse-pace";
import { decorateDemoPaceRefresh, subscribeDemoPaceRefresh } from "./pace-refresh";

it("starts each idle manual refresh immediately and combines clicks during a reading", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
  const changed = vi.fn();
  const unsubscribe = subscribeDemoPaceRefresh(changed);
  const read = (refresh = false) => decorateDemoPaceRefresh(syntheticCoachSnapshot("stale"), refresh);
  try {
    expect(read()).toMatchObject({ status: "stale", refreshQueued: false, refreshAfterSeconds: 0 });
    expect(read(true)).toMatchObject({ status: "stale", refreshQueued: false, refreshInFlight: true });
    expect(read(true).refreshInFlight).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    const updated = read();
    expect(updated).toMatchObject({ status: "idle", updatedAt: "2026-11-27T10:00:00.300Z", refreshQueued: false, refreshInFlight: false });
    expect(updated.windows.find(window => window.kind === "weekly")?.state).toBe("idle");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(read(true)).toMatchObject({ refreshQueued: false, refreshInFlight: true, refreshAfterSeconds: 0 });
    expect(changed).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(300);
    expect(read()).toMatchObject({ updatedAt: "2026-11-27T10:00:00.600Z", refreshInFlight: false });
    vi.advanceTimersByTime(60_000);
    expect(changed).toHaveBeenCalledTimes(4);
  } finally {
    unsubscribe();
    vi.useRealTimers();
  }
});
