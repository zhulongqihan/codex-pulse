// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaceDetailsRequest } from "./use-pace-details-request";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), native: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke, isTauri: () => mocks.native }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

beforeEach(() => { mocks.invoke.mockReset(); mocks.listen.mockReset(); mocks.native = true; });
describe("pace detail navigation", () => {
  it("subscribes before consuming a cold-start request and handles later warm requests", async () => {
    const action = { current: vi.fn() }, stop = vi.fn();
    let event: () => void = () => {};
    mocks.listen.mockImplementation(async (_name, handler) => { event = handler; return stop; });
    mocks.invoke.mockResolvedValueOnce(true).mockResolvedValue(false);
    const hook = renderHook(() => usePaceDetailsRequest(action));
    await waitFor(() => expect(action.current).toHaveBeenCalledTimes(1));
    expect(mocks.listen.mock.invocationCallOrder[0]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]);
    action.current = vi.fn();
    act(() => event());
    expect(action.current).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenLastCalledWith("take_pending_pace_details");
    hook.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("ignores a pending reply after unmount and releases a late listener", async () => {
    const action = { current: vi.fn() }, stop = vi.fn();
    let subscribed: (stop: () => void) => void = () => {};
    mocks.listen.mockImplementation(() => new Promise(resolve => { subscribed = resolve; }));
    const hook = renderHook(() => usePaceDetailsRequest(action));
    hook.unmount();
    await act(async () => subscribed(stop));
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(action.current).not.toHaveBeenCalled();
  });
  it("does not repeat a warm action when a delayed startup reply also contains the request", async () => {
    const action = { current: vi.fn() };
    let event: () => void = () => {}, reply: (pending: boolean) => void = () => {};
    mocks.listen.mockImplementation(async (_name, handler) => { event = handler; return () => {}; });
    mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; })).mockResolvedValue(false);
    renderHook(() => usePaceDetailsRequest(action));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    act(() => event());
    expect(action.current).toHaveBeenCalledOnce();
    await act(async () => reply(true));
    expect(action.current).toHaveBeenCalledOnce();
  });
  it("keeps browser previews local and tolerates unavailable native requests", async () => {
    const action = { current: vi.fn() };
    mocks.native = false;
    mocks.listen.mockResolvedValue(() => {});
    const hook = renderHook(() => usePaceDetailsRequest(action));
    await act(async () => {});
    expect(mocks.invoke).not.toHaveBeenCalled();
    hook.unmount();
    mocks.native = true;
    mocks.invoke.mockRejectedValue(new Error("unavailable"));
    renderHook(() => usePaceDetailsRequest(action));
    await act(async () => {});
    expect(action.current).not.toHaveBeenCalled();
  });
});
