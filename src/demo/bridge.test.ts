// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ native: false, callback: null as null | ((command: string, args?: Record<string, unknown>) => Promise<unknown>) }));
const mockIPC = vi.hoisted(() => vi.fn((callback) => { state.callback = callback; }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => state.native }));
vi.mock("@tauri-apps/api/mocks", () => ({ mockIPC, mockWindows: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));
import { installDemoBridge } from "./bridge";
import { fetchPulsePace } from "../pulse/lib/pulse-pace";

beforeEach(() => {
  state.native = false;
  state.callback = null;
  mockIPC.mockClear();
  history.replaceState(null, "", "/");
  delete document.documentElement.dataset.demo;
});

describe("explicit browser-only demo transport", () => {
  it("never installs without demo=1 and never replaces native IPC", () => {
    installDemoBridge();
    expect(mockIPC).not.toHaveBeenCalled();
    history.replaceState(null, "", "/?demo=1");
    state.native = true;
    installDemoBridge();
    expect(mockIPC).not.toHaveBeenCalled();
    state.native = false;
    installDemoBridge();
    expect(mockIPC).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.demo).toBe("true");
  });

  it("returns synthetic data while blocking activation, updates and real file operations", async () => {
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
    expect(await state.callback!("fetch_overview", { range: "1d" })).toMatchObject({ days: 1, timezone: "Asia/Shanghai" });
    expect(await state.callback!("fetch_codex_limits")).toMatchObject({ account: "demo@example.invalid", creditsIsMock: true });
    for (const command of ["activate_codex_window", "download_and_install_update", "open_pulse_data_dir", "configure_codex_home", "reveal_in_file_manager", "plugin:autostart|enable", "create_pulse_shortcuts"]) {
      await expect(state.callback!(command)).rejects.toThrow("desktop app only");
    }
    await expect(state.callback!("open_url", { url: "https://chatgpt.com/backend-api/" })).rejects.toThrow("desktop app only");
  });

  it("keeps widget metrics independent of the tray snapshot", async () => {
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
    const widget = await state.callback!("get_widget_snapshot");
    await state.callback!("update_tray", { payload: { popover: { quotas: [], tokens: null, cost: null } } });
    expect(await state.callback!("get_widget_snapshot")).toEqual(widget);
    expect(await state.callback!("get_tray_popover")).toMatchObject({ quotas: [], tokens: null, cost: null });
  });
  it.each(["", "&coachScenario=fast", "&coachScenario=balanced", "&coachScenario=stale", "&paceState=forecast"])("shares the same synthetic quota reading across surfaces for %s", async query => {
    history.replaceState(null, "", `/?demo=1${query}`);
    installDemoBridge();
    const limits = await state.callback!("fetch_codex_limits") as any;
    const pace = await fetchPulsePace();
    for (const window of pace.windows) {
      const limit = limits[window.kind];
      if (window.remainingPercent == null) expect(limit).toBeNull();
      else {
        expect(limit.remainingPercent).toBe(window.remainingPercent);
        expect(limit.windowMinutes).toBe(window.windowMinutes);
        expect(Math.abs(Date.parse(limit.resetsAt) - Date.parse(window.resetsAt!))).toBeLessThan(1000);
      }
    }
  });
});
