// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preferredWidgetHeight, useWidgetContentSize } from "./use-widget-content-size";

const native = vi.hoisted(() => ({ enabled: true, label: "widget", resize: vi.fn().mockResolvedValue(undefined), onResized: vi.fn(), event: null as (() => void) | null, unlisten: vi.fn(), observe: null as (() => void) | null }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: native.label, setSize: native.resize, onResized: (callback: () => void) => { native.event = callback; return Promise.resolve(native.unlisten); } }) }));
function Harness({ expanded = true, empty = true, revision = "one", failure = vi.fn(), error = false }) {
  const ref = useRef<HTMLElement>(null); useWidgetContentSize(ref, expanded, empty, revision, failure);
  return <main ref={ref}><div className="coach-body"><div>Content</div></div><footer className="pulse-pace-footer"/>{error ? <p className="pulse-error" style={{ margin: 0 }}>Action failed</p> : null}</main>;
}
async function frame() { await act(async () => { vi.runAllTimers(); await Promise.resolve(); }); }
describe("native empty widget size", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  beforeEach(() => {
    vi.useFakeTimers(); native.enabled = true; native.label = "widget"; native.resize.mockReset().mockResolvedValue(undefined); native.unlisten.mockReset(); history.replaceState(null, "", "/");
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { native.observe = callback; } observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(callback, 1)); vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    Object.defineProperty(window, "innerHeight", { value: 480, configurable: true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return { top: this.tagName === "MAIN" ? 0 : this.className === "coach-body" ? 80 : this.tagName === "FOOTER" ? 210 : 80, bottom: this.tagName === "DIV" && !this.className ? 210 : 240, height: this.tagName === "FOOTER" ? 40 : 130, width: 350, x: 0, y: 0, left: 0, right: 350, toJSON() {} }; });
  });
  it("bounds only empty expanded content and retains the existing compact and measured sizes", () => {
    expect(preferredWidgetHeight(false, true, 350)).toBe(180); expect(preferredWidgetHeight(true, false, 250)).toBe(480);
    expect(preferredWidgetHeight(true, true, 100)).toBe(220); expect(preferredWidgetHeight(true, true, 320.2)).toBe(321); expect(preferredWidgetHeight(true, true, 999)).toBe(480); expect(preferredWidgetHeight(true, true, NaN)).toBe(480);
  });
  it("recalculates after native prefs restore 480 and restores 480 when a real zero or stale value arrives", async () => {
    const failure = vi.fn(), view = render(<Harness failure={failure}/>); await frame(); expect(native.resize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 350, height: 252 }));
    Object.defineProperty(window, "innerHeight", { value: 252, configurable: true }); native.event?.(); await frame(); expect(native.resize).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "innerHeight", { value: 480, configurable: true }); native.event?.(); await frame(); expect(native.resize).toHaveBeenCalledTimes(2);
    Object.defineProperty(window, "innerHeight", { value: 252, configurable: true }); view.rerender(<Harness failure={failure} empty={false}/>); await frame(); expect(native.resize).toHaveBeenLastCalledWith(expect.objectContaining({ height: 480 }));
    view.rerender(<Harness failure={failure} empty revision="empty-again"/>); Object.defineProperty(window, "innerHeight", { value: 480, configurable: true }); await frame(); expect(native.resize).toHaveBeenLastCalledWith(expect.objectContaining({ height: 252 }));
    const count = native.resize.mock.calls.length; view.rerender(<Harness failure={failure} expanded={false}/>); await frame(); expect(native.resize).toHaveBeenCalledTimes(count); view.unmount(); expect(native.unlisten).toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
  });
  it("reports a rejected native resize once and does not loop on observer or native resize events", async () => {
    const failure = vi.fn(); native.resize.mockRejectedValue(new Error("Window resize rejected")); render(<Harness failure={failure}/>); await frame(); expect(failure).toHaveBeenCalledOnce();
    native.event?.(); native.observe?.(); await frame(); expect(native.resize).toHaveBeenCalledOnce();
  });
  it("does not lose a backend size reset while the earlier resize promise is still pending", async () => {
    let finish!: () => void; native.resize.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<Harness failure={vi.fn()}/>); await frame(); expect(native.resize).toHaveBeenCalledOnce();
    Object.defineProperty(window, "innerHeight", { value: 252, configurable: true }); native.event?.(); await frame();
    Object.defineProperty(window, "innerHeight", { value: 480, configurable: true }); native.event?.(); await frame(); expect(native.resize).toHaveBeenCalledOnce();
    await act(async () => finish()); await frame(); expect(native.resize).toHaveBeenCalledTimes(2); expect(native.resize).toHaveBeenLastCalledWith(expect.objectContaining({ height: 252 }));
  });
  it("includes an action error outside the card and shrinks again when that error is removed", async () => {
    const failure = vi.fn(), view = render(<Harness failure={failure}/>); await frame();
    Object.defineProperty(window, "innerHeight", { value: 252, configurable: true });
    view.rerender(<Harness failure={failure} error/>); await frame(); await frame();
    const errorHeight = native.resize.mock.calls.at(-1)![0].height; expect(errorHeight).toBeGreaterThan(252); expect(errorHeight).toBeLessThanOrEqual(480);
    Object.defineProperty(window, "innerHeight", { value: errorHeight, configurable: true });
    view.rerender(<Harness failure={failure}/>); await frame(); await frame(); expect(native.resize).toHaveBeenLastCalledWith(expect.objectContaining({ height: 252 }));
  });
  it("leaves browser demos and other native windows alone", async () => {
    history.replaceState(null, "", "/?demo=1"); const view = render(<Harness/>); await frame(); expect(native.resize).not.toHaveBeenCalled(); view.unmount();
    history.replaceState(null, "", "/"); native.label = "main"; render(<Harness/>); await frame(); expect(native.resize).not.toHaveBeenCalled();
  });
});
