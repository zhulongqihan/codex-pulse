// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetchPulsePace, syntheticCoachSnapshot, usePulsePace, type PaceSnapshot } from "./pulse-pace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const notice = (read = false, id = "synthetic-reset-notice-v3") => {
  const data = syntheticCoachSnapshot("notice");
  data.coachExtras!.resetNotice!.id = id;
  data.coachExtras!.resetNotice!.isUnread = !read;
  return data;
};
let update!: () => void;
beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset().mockImplementation(async (_event, callback) => {
    update = callback as () => void;
    return () => {};
  });
});

describe("notice read synchronization", () => {
  it("does not reuse a pre-event snapshot, or let its old finally clear a newer read", async () => {
    const before = notice(), after = notice(true), stale = deferred<PaceSnapshot>(), fresh = deferred<PaceSnapshot>();
    vi.mocked(invoke).mockResolvedValueOnce(before).mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => fresh.promise).mockResolvedValue(after);
    const hook = renderHook(() => usePulsePace());
    await act(async () => {});
    await act(async () => update());
    await act(async () => update());
    await act(async () => stale.resolve(before));
    const sharedFresh = fetchPulsePace();
    await act(async () => fresh.resolve(after));
    await sharedFresh;
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === "fetch_pulse_pace")).toHaveLength(3);
    expect(hook.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("refresh_pulse_pace");
  });

  it.each([false, true])("rechecks a read event after a pending manual refresh settles (failure %s)", async fail => {
    const before = notice(), after = notice(true), manual = deferred<PaceSnapshot>();
    vi.mocked(invoke).mockResolvedValueOnce(before).mockImplementationOnce(() => manual.promise).mockResolvedValue(after);
    const hook = renderHook(() => usePulsePace()); await act(async () => {});
    let refresh!: Promise<void>;
    await act(async () => { refresh = hook.result.current.refresh(); });
    await act(async () => update());
    await act(async () => { fail ? manual.reject(Error("offline")) : manual.resolve(before); await refresh; });
    expect(hook.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === "refresh_pulse_pace")).toHaveLength(1);
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === "fetch_pulse_pace")).toHaveLength(2);
  });

  it("keeps a successfully persisted acknowledgement if its follow-up local read fails", async () => {
    const before = notice();
    vi.mocked(invoke).mockResolvedValueOnce(before).mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("snapshot read failed"));
    const hook = renderHook(() => usePulsePace()); await act(async () => {});
    await act(async () => { await hook.result.current.markNoticeRead(before.coachExtras!.resetNotice!.id); });
    expect(hook.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(hook.result.current.noticeError).toBe(false);
  });

  it("does not attach a late acknowledgement failure to a newer notice", async () => {
    const before = notice(), next = notice(false, "different-notice"), write = deferred<undefined>();
    vi.mocked(invoke).mockResolvedValueOnce(before).mockImplementationOnce(() => write.promise).mockResolvedValue(next);
    const hook = renderHook(() => usePulsePace()); await act(async () => {});
    let mark!: Promise<void>;
    await act(async () => { mark = hook.result.current.markNoticeRead(before.coachExtras!.resetNotice!.id); });
    await act(async () => update());
    await act(async () => { write.reject(Error("old notice expired")); await mark; });
    expect(hook.result.current.data?.coachExtras?.resetNotice?.id).toBe("different-notice");
    expect(hook.result.current.noticeError).toBe(false);
  });

  it("registers its listener before the first snapshot and releases late subscriptions", async () => {
    const subscribed = deferred<() => void>(), remove = vi.fn();
    vi.mocked(listen).mockReturnValueOnce(subscribed.promise);
    vi.mocked(invoke).mockResolvedValue(notice());
    const hook = renderHook(() => usePulsePace());
    expect(invoke).not.toHaveBeenCalled();
    await act(async () => subscribed.resolve(remove));
    expect(invoke).toHaveBeenCalledExactlyOnceWith("fetch_pulse_pace");
    hook.unmount(); expect(remove).toHaveBeenCalledOnce();
    const late = deferred<() => void>(), removeLate = vi.fn();
    vi.mocked(listen).mockReturnValueOnce(late.promise);
    const unmounted = renderHook(() => usePulsePace()); unmounted.unmount();
    await act(async () => late.resolve(removeLate));
    expect(removeLate).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("rereads only local state after a hidden view reopens and after remounting", async () => {
    let value = notice();
    vi.mocked(invoke).mockImplementation(async () => value);
    const view = renderHook(() => usePulsePace()); await act(async () => {});
    value = notice(true);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(view.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    view.unmount();
    const reopened = renderHook(() => usePulsePace()); await act(async () => {});
    expect(reopened.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(vi.mocked(invoke).mock.calls.every(([name]) => name === "fetch_pulse_pace")).toBe(true);
  });

  it("keeps an unread notice on a failed durable write and can retry it", async () => {
    const value = notice(); let written = false;
    vi.mocked(invoke).mockImplementation(async name => {
      if (name === "mark_pulse_notice_read") { if (!written) throw Error("write failed"); return undefined; }
      return notice(written);
    });
    const hook = renderHook(() => usePulsePace()); await act(async () => {});
    await act(async () => { await hook.result.current.markNoticeRead(value.coachExtras!.resetNotice!.id); });
    expect(hook.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(true);
    expect(hook.result.current.noticeError).toBe(true);
    written = true;
    await act(async () => { await hook.result.current.markNoticeRead(value.coachExtras!.resetNotice!.id); });
    expect(hook.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(hook.result.current.noticeError).toBe(false);
  });

  it.each([false, true])("clears a failed acknowledgement once another window persists it (late failure %s)", async late => {
    const before = notice(), after = notice(true), write = deferred<undefined>();
    vi.mocked(invoke).mockResolvedValueOnce(before).mockImplementationOnce(() => write.promise).mockResolvedValue(after);
    const hook = renderHook(() => usePulsePace()); await act(async () => {});
    let mark!: Promise<void>;
    await act(async () => { mark = hook.result.current.markNoticeRead(before.coachExtras!.resetNotice!.id); });
    if (!late) await act(async () => { write.reject(Error("write failed")); await mark; });
    await act(async () => update());
    if (late) await act(async () => { write.reject(Error("old write failed")); await mark; });
    expect(hook.result.current.data?.coachExtras?.resetNotice?.isUnread).toBe(false);
    expect(hook.result.current.noticeError).toBe(false);
  });
});
