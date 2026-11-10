// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { compactPaceRange, fetchPulsePace, hasPaceEstimate, paceRange, paceStates, primaryPaceWindow, syntheticCoachSnapshot, syntheticPaceSnapshot, usePulsePace } from "./pulse-pace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
beforeEach(() => { vi.mocked(invoke).mockReset(); vi.mocked(listen).mockReset().mockResolvedValue(() => {}); history.replaceState(null, "", "/"); });
afterEach(() => { vi.useRealTimers(); });
const window = () => syntheticPaceSnapshot().windows[0];

describe("quota forecast presentation", () => {
  it("rereads the local snapshot on account-update events without querying the account, then removes its listener", async () => {
    const remove = vi.fn(); let update!: () => void;
    vi.mocked(listen).mockImplementation(async (_event, handler) => { update = handler as () => void; return remove; });
    const initial = syntheticPaceSnapshot(); vi.mocked(invoke).mockResolvedValueOnce(initial);
    const { result, unmount } = renderHook(() => usePulsePace()); await act(async () => {});
    const fresh = { ...initial, updatedAt: new Date(Date.parse(initial.updatedAt!) + 60_000).toISOString() };
    vi.mocked(invoke).mockResolvedValueOnce(fresh); await act(async () => { update(); });
    expect(result.current.data?.updatedAt).toBe(fresh.updatedAt);
    expect(vi.mocked(invoke).mock.calls.every(([command]) => command === "fetch_pulse_pace")).toBe(true);
    unmount(); expect(remove).toHaveBeenCalledOnce();
  });
  it("rounds a forecast outwards without invented decimal precision", () => {
    expect(compactPaceRange({ ...window(), etaLowerMinutes: 121, etaUpperMinutes: 179 })).toBe("≈2–3h");
    expect(compactPaceRange({ ...window(), etaLowerMinutes: 21, etaUpperMinutes: 33 })).toBe("≈20–35m");
    expect(paceRange({ ...window(), etaLowerMinutes: 0, etaUpperMinutes: 2 })).toEqual({ lower: 0, upper: 5, unit: "m" });
  });

  it.each(paceStates.filter(state => state !== "forecast"))("does not manufacture a time estimate for %s", state => {
    expect(compactPaceRange(syntheticPaceSnapshot(state).windows[0])).toBeNull();
  });

  it.each([[NaN, 10], [1, Infinity], [-1, 10], [20, 10]])("rejects malformed estimate %s–%s", (lower, upper) => {
    expect(hasPaceEstimate({ ...window(), etaLowerMinutes: lower, etaUpperMinutes: upper })).toBe(false);
  });

  it("does not silently substitute another quota window when the primary is absent", () => {
    const data = syntheticPaceSnapshot();
    data.primaryKind = null;
    expect(primaryPaceWindow(data)).toBeNull();
    data.primaryKind = "weekly";
    expect(primaryPaceWindow(data)?.windowMinutes).toBe(10080);
  });

  it("uses the public scenario fixture without requesting a local account", async () => {
    history.replaceState(null, "", "/?demo=1&paceScenario=stale#pulse-pace");
    expect((await fetchPulsePace(true)).status).toBe("stale");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("supports approved coach scenarios independently of the legacy forecast demo", async () => {
    const date = new Date("2026-11-09T08:00:00Z");
    expect(syntheticCoachSnapshot("roomy", date).windows[1].remainingPercent).toBe(80);
    expect(syntheticCoachSnapshot("fast", date).windows[1].remainingPercent).toBe(20);
    expect(syntheticCoachSnapshot("balanced", date).windows[1].remainingPercent).toBe(71.4);
    expect(syntheticCoachSnapshot("roomy", date).coachExtras?.dailyObservations[0].consumedPercentPoints).toBeNull();
    history.replaceState(null, "", "/?demo=1&coachScenario=notice#pulse-pace");
    const value = await fetchPulsePace(true);
    expect(value.coachExtras?.resetNotice?.summary).toContain("Synthetic");
    expect(value.coachExtras?.resetNotice?.verification).toBe("third_party");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("deduplicates background reads and gives manual refresh its distinct account command", async () => {
    let resolve!: (data: ReturnType<typeof syntheticPaceSnapshot>) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const a = fetchPulsePace(); const b = fetchPulsePace();
    expect(a).toBe(b);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("fetch_pulse_pace");
    resolve(syntheticPaceSnapshot()); await a;
    vi.mocked(invoke).mockResolvedValueOnce(syntheticPaceSnapshot());
    await fetchPulsePace(true);
    expect(invoke).toHaveBeenLastCalledWith("refresh_pulse_pace");
  });

  it("honors a failed refresh DTO until a genuinely new account observation arrives", async () => {
    vi.useFakeTimers();
    const initial = syntheticPaceSnapshot("forecast", new Date("2026-11-08T06:00:00Z"));
    vi.mocked(invoke).mockResolvedValueOnce(initial);
    const { result } = renderHook(() => usePulsePace());
    await act(async () => {});
    expect(result.current.error).toBe(false);
    vi.mocked(invoke).mockResolvedValueOnce({ ...initial, refreshFailed: true, refreshAfterSeconds: 300 });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBe(true);
    expect(result.current.data?.updatedAt).toBe(initial.updatedAt);
    expect(result.current.data?.refreshAfterSeconds).toBe(300);
    vi.mocked(invoke).mockResolvedValueOnce(initial);
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(result.current.error).toBe(true);
    vi.mocked(invoke).mockResolvedValueOnce(syntheticPaceSnapshot("forecast", new Date("2026-11-08T06:01:00Z")));
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(result.current.error).toBe(false);
  });

  it("does not let an older background response overwrite a newer manual refresh", async () => {
    const initial = syntheticPaceSnapshot("forecast", new Date("2026-11-08T06:00:00Z"));
    let resolve!: (value: typeof initial) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(() => usePulsePace());
    const fresh = syntheticPaceSnapshot("forecast", new Date("2026-11-08T06:01:00Z"));
    vi.mocked(invoke).mockResolvedValueOnce(fresh);
    await act(async () => { await result.current.refresh(); });
    await act(async () => { resolve(initial); });
    expect(result.current.data?.updatedAt).toBe(fresh.updatedAt);
  });

  it("only acknowledges the explicit current notice ID and re-reads local state without refreshing the account", async () => {
    const initial = syntheticPaceSnapshot();
    const now = new Date().toISOString();
    initial.coachExtras = { dailyObservations: [], resetNotice: { id: "notice-a", summary: "Synthetic notice", sourceUrl: "https://example.org/notice", sourceLabel: "Example feed", startAt: null, endAt: null, publishedAt: now, updatedAt: now, isUnread: true, verification: "third_party", scope: "global" } };
    const read = { ...initial, coachExtras: { ...initial.coachExtras, resetNotice: { ...initial.coachExtras.resetNotice!, isUnread: false } } };
    vi.mocked(invoke).mockImplementation(async command => command === "mark_pulse_notice_read" ? undefined : vi.mocked(invoke).mock.calls.some(([name]) => name === "mark_pulse_notice_read") ? read : initial);
    const { result } = renderHook(() => usePulsePace());
    await act(async () => {});
    await act(async () => { await result.current.markNoticeRead("old-notice"); });
    expect(invoke).not.toHaveBeenCalledWith("mark_pulse_notice_read", expect.anything());
    await act(async () => { await result.current.markNoticeRead("notice-a"); });
    expect(invoke).toHaveBeenCalledWith("mark_pulse_notice_read", { id: "notice-a" });
    expect(invoke).not.toHaveBeenCalledWith("refresh_pulse_pace");
    expect(result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
  });

  it("retains an unread notice and exposes an acknowledgement failure", async () => {
    const initial = syntheticPaceSnapshot(), now = new Date().toISOString();
    initial.coachExtras = { dailyObservations: [], resetNotice: { id: "notice-a", summary: "Synthetic notice", sourceUrl: "https://example.org/notice", sourceLabel: "Example feed", startAt: null, endAt: null, publishedAt: now, updatedAt: now, isUnread: true, verification: "third_party", scope: "global" } };
    vi.mocked(invoke).mockImplementation(async command => { if (command === "mark_pulse_notice_read") throw Error("unavailable"); return initial; });
    const { result } = renderHook(() => usePulsePace()); await act(async () => {});
    await act(async () => { await result.current.markNoticeRead("notice-a"); });
    expect(result.current.noticeError).toBe(true); expect(result.current.noticePending).toBe(false);
    expect(result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(true);
  });
});
