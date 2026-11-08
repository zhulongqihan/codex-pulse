// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { PulsePaceSettings } from "./pulse-pace-settings";

const native = vi.hoisted(() => ({ tauri: true, enabled: true, invoke: vi.fn(), update: vi.fn(), events: new Map<string, (event: { payload: unknown }) => void>() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.tauri, invoke: (command: string) => native.invoke(command) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async (name: string, handler: (event: { payload: unknown }) => void) => { native.events.set(name, handler); return () => native.events.delete(name); } }));
vi.mock("@/lib/pulse-appearance", () => ({ usePulsePreferences: () => ({ titlebarEnabled: native.enabled }), usePulsePreferencesError: () => null, updatePulsePreferences: (patch: unknown) => native.update(patch) }));
const status = (reason: string) => ({ enabled: true, supported: true, hostFound: false, badgeVisible: false, reason });
beforeEach(async () => {
  history.replaceState(null, "", "/"); native.tauri = true; native.enabled = true;
  native.events.clear(); native.update.mockReset(); native.invoke.mockReset();
  native.invoke.mockResolvedValue(status("no_codex_window")); await i18n.changeLanguage("en");
});

describe("title bar display settings", () => {
  it("explains missing Codex and follows native display events without polling account usage", async () => {
    const view = render(<PulsePaceSettings/>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Microsoft Store edition"));
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith("get_titlebar_status");
    await act(async () => native.events.get("titlebar-status")?.({ payload: status("host_inactive") }));
    expect(screen.getByRole("status")).toHaveTextContent("Switch to the Codex window");
    fireEvent.click(screen.getByRole("switch"));
    expect(native.update).toHaveBeenCalledExactlyOnceWith({ titlebarEnabled: false });
    view.unmount(); expect(native.events.has("titlebar-status")).toBe(false);
  });

  it("keeps a newer display event when an older initial read completes later", async () => {
    let resolve!: (value: ReturnType<typeof status>) => void;
    native.invoke.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<PulsePaceSettings/>);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledOnce());
    await act(async () => { native.events.get("titlebar-status")?.({ payload: status("ready") }); resolve(status("no_codex_window")); });
    expect(screen.getByRole("status")).toHaveTextContent("visible at the top right");
  });

  it("does not send a native display request from the public synthetic demo", () => {
    history.replaceState(null, "", "/?demo=1"); render(<PulsePaceSettings/>);
    expect(screen.getByRole("status")).toHaveTextContent("does not connect to a local Codex");
    expect(native.invoke).not.toHaveBeenCalled(); expect(native.events.size).toBe(0);
  });

  it("does not expose an unknown native reason as raw implementation text", async () => {
    native.invoke.mockResolvedValueOnce(status("internal_native_reason"));
    render(<PulsePaceSettings/>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Display status is unavailable"));
    expect(screen.getByRole("status")).not.toHaveTextContent("internal_native_reason");
  });
});
