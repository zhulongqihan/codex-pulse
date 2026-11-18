// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ native: false, callback: null as null | ((command: string, args?: Record<string, unknown>) => Promise<unknown>) }));
const mockIPC = vi.hoisted(() => vi.fn((callback) => { state.callback = callback; }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => state.native }));
vi.mock("@tauri-apps/api/mocks", () => ({ mockIPC, mockWindows: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));
import { installDemoBridge } from "./bridge";
import { fetchPulsePace } from "../pulse/lib/pulse-pace";
import { today } from "./fixtures";

const dateBack = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  state.native = false;
  state.callback = null;
  mockIPC.mockClear();
  localStorage.clear();
  history.replaceState(null, "", "/");
  delete document.documentElement.dataset.demo;
});

describe("synthetic daily quota ledger", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
  });

  it("returns observed percentage points independently for each real window", async () => {
    const result = await state.callback!("fetch_quota_history", { range: "30d" }) as any;
    expect(result).toMatchObject({ schemaVersion: 1, identityRevision: 1, scopeAvailable: true,
      timezone: "Asia/Shanghai", storageStatus: "ready", readStatus: "ready", startDate: dateBack(29), endDate: today, unallocatedCount: 1 });
    expect(result.daily.find((row: any) => row.date === today && row.kind === "session")).toMatchObject({
      windowMinutes: 300, consumedPercentPoints: 8, coveredMinutes: 8, status: "partial", source: "official" });
    expect(result.daily.find((row: any) => row.date === today && row.kind === "weekly")).toMatchObject({
      windowMinutes: 10080, consumedPercentPoints: 3 });
    expect(result.summaries.find((row: any) => row.kind === "session")).toMatchObject({ consumedPercentPoints: 162, recordedDays: 4, unallocatedCount: 1 });
    expect(result.summaries.find((row: any) => row.kind === "weekly")).toMatchObject({ consumedPercentPoints: 3 });
    expect(JSON.stringify(result)).not.toMatch(/totalTokens|costUSD|demo@example|identityHash|codexHome|auth\.json/);
  });

  it("preserves unknown, unchanged, gaps and more than one cycle in a day", async () => {
    const result = await state.callback!("fetch_quota_history", { range: "7d" }) as any;
    const sessionDay = (back: number) => result.daily.find((row: any) => row.date === dateBack(back) && row.kind === "session");
    expect(sessionDay(1)).toMatchObject({ consumedPercentPoints: 150, cycleCount: 2 });
    expect(sessionDay(2)).toMatchObject({ consumedPercentPoints: 4, coveredMinutes: 0, gapCount: 1 });
    expect(sessionDay(3)).toMatchObject({ consumedPercentPoints: 0, status: "unchanged" });
    expect(sessionDay(4)).toMatchObject({ consumedPercentPoints: null, sampleCount: 1, status: "insufficient_samples" });
    expect(sessionDay(5)).toMatchObject({ consumedPercentPoints: null, unallocatedCount: 1 });
    const empty = await state.callback!("fetch_quota_history", { range: `custom:${dateBack(7)}_${dateBack(7)}` }) as any;
    expect(empty.daily).toEqual([]);
    expect(empty.summaries).toEqual([]);
  });

  it("returns anonymous raw segments with cursors and keeps cross-day changes unallocated", async () => {
    const args = { date: dateBack(1), kind: "session", windowMinutes: 300, before: null };
    const first = await state.callback!("fetch_quota_history_day", args) as any;
    expect(first).toMatchObject({ schemaVersion: 1, identityRevision: 1, date: args.date, kind: "session", windowMinutes: 300 });
    expect(first.segments.reduce((sum: number, segment: any) => sum + (segment.consumedPercentPoints ?? 0), 0)).toBe(150);
    expect(new Set(first.segments.map((segment: any) => segment.resetsAt)).size).toBe(2);
    const lastId = first.segments.at(-1).id;
    const older = await state.callback!("fetch_quota_history_day", { ...args, before: lastId }) as any;
    expect(older.segments).toEqual([]);
    const cross = await state.callback!("fetch_quota_history_day", { date: dateBack(5), kind: "session", windowMinutes: 300 }) as any;
    expect(cross.segments.find((row: any) => row.reason === "cross_day")).toMatchObject({ date: null, consumedPercentPoints: 7, coveredMinutes: 0 });
    await expect(state.callback!("fetch_quota_history_day", { ...args, kind: "invalid" })).rejects.toThrow(/kind/i);
  });

  it("validates inclusive ranges through 366 days without silently clamping", async () => {
    const leap = await state.callback!("fetch_quota_history", { range: "custom:2024-01-01_2024-12-31" }) as any;
    expect(leap).toMatchObject({ startDate: "2024-01-01", endDate: "2024-12-31", daily: [] });
    const year = await state.callback!("fetch_quota_history", { range: "366d" }) as any;
    expect(year.startDate).toBe(dateBack(365));
    for (const range of ["367d", "0d", "custom:2024-01-01_2025-01-01", "custom:2024-02-30_2024-03-01", "custom:2024-01-02_2024-01-01", "custom:2999-01-01_2999-01-01"]) {
      await expect(state.callback!("fetch_quota_history", { range })).rejects.toThrow(/range|date|366/i);
    }
  });

  it("updates only local recording preferences and keeps history readable when disabled", async () => {
    const { emit } = await import("@tauri-apps/api/event");
    expect(await state.callback!("get_quota_recording_preferences")).toMatchObject({ schemaVersion: 1, enabled: true, timezone: "Asia/Shanghai" });
    const before = await state.callback!("fetch_quota_history", { range: "1d" }) as any;
    expect(await state.callback!("set_quota_recording_enabled", { enabled: false })).toMatchObject({ enabled: false });
    expect(await state.callback!("get_quota_recording_preferences")).toMatchObject({ enabled: false });
    expect(emit).toHaveBeenCalledWith("quota-history-updated");
    const after = await state.callback!("fetch_quota_history", { range: "1d" }) as any;
    expect(after.enabled).toBe(false);
    expect(after.daily).toEqual(before.daily);
    await expect(state.callback!("set_quota_recording_enabled", { enabled: "false" })).rejects.toThrow(/enabled/i);
    await state.callback!("set_quota_recording_enabled", { enabled: true });
  });

  it("downloads complete synthetic quota Markdown and keeps XLSX desktop-only", async () => {
    let exported: Blob | undefined;
    const NativeURL = URL;
    vi.stubGlobal("URL", class extends NativeURL {
      static createObjectURL(blob: Blob) { exported = blob; return "blob:quota-demo"; }
      static revokeObjectURL() {}
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      const result = await state.callback!("export_quota_history", { range: "30d", format: "markdown", path: "Quota-demo.md" });
      expect(result).toMatchObject({ path: "Quota-demo.md", format: "markdown", range: "30d" });
      expect(click).toHaveBeenCalledOnce();
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
        reader.readAsText(exported!);
      });
      expect(text).toContain("Synthetic demo");
      expect(text).toContain("Asia/Shanghai");
      expect(text).toContain("150");
      expect(text).toContain("insufficient_samples");
      expect(text).toContain("same_day_gap");
      expect(text).toContain("cross_day");
      expect(text).toContain("Unallocated");
      expect(text).not.toMatch(/totalTokens|costUSD|demo@example|F:\/|auth\.json/);
      await expect(state.callback!("export_quota_history", { range: "30d", format: "xlsx", path: "Quota-demo.xlsx" })).rejects.toThrow("desktop app only");
    } finally { click.mockRestore(); vi.unstubAllGlobals(); }
  });
});

describe("explicit browser-only demo transport", () => {
  it("restores saved paper and widget styles before installing the synthetic transport", async () => {
    localStorage.setItem("codexpulse.appearance.v1", JSON.stringify({skinId:"paper",widgetSkin:"meter",theme:"dark",motionLevel:"off",compactMode:true,privateInfo:"not-a-preference"}));
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
    const value = await state.callback!("get_pulse_preferences");
    expect(value).toMatchObject({skinId:"paper",widgetSkin:"meter",theme:"dark",motionLevel:"off",compactMode:true});
    expect(JSON.stringify(value)).not.toContain("not-a-preference");
  });

  it("persists a selected style and restores it after reinstalling the demo bridge", async () => {
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
    expect(await state.callback!("get_pulse_preferences")).toMatchObject({skinId:"clear",widgetSkin:"follow"});
    await state.callback!("set_pulse_preferences", {patch:{skinId:"paper",widgetSkin:"clear",theme:"dark",compactMode:true}});
    expect(JSON.parse(localStorage.getItem("codexpulse.appearance.v1")!)).toMatchObject({skinId:"paper",widgetSkin:"clear",theme:"dark",compactMode:true});
    installDemoBridge();
    expect(await state.callback!("get_pulse_preferences")).toMatchObject({skinId:"paper",widgetSkin:"clear",theme:"dark",compactMode:true});
    await state.callback!("set_pulse_preferences", {patch:{skinId:"meter"}});
    installDemoBridge();
    expect(await state.callback!("get_pulse_preferences")).toMatchObject({skinId:"meter",widgetSkin:"clear",theme:"dark",compactMode:true});
  });

  it("normalizes unknown saved styles and recovers malformed JSON without importing extra data", async () => {
    history.replaceState(null, "", "/?demo=1");
    localStorage.setItem("codexpulse.appearance.v1", JSON.stringify({skinId:"old-style",widgetSkin:"unknown",theme:"light",motionLevel:"off"}));
    installDemoBridge();
    expect(await state.callback!("get_pulse_preferences")).toMatchObject({skinId:"clear",widgetSkin:"follow",theme:"light",motionLevel:"off"});
    localStorage.setItem("codexpulse.appearance.v1", "{malformed-json");
    installDemoBridge();
    expect(await state.callback!("get_pulse_preferences")).toMatchObject({skinId:"clear",widgetSkin:"follow",theme:"system",motionLevel:"gentle"});
  });

  it("does not claim a saved appearance when browser storage rejects the write", async () => {
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
    const before = structuredClone(await state.callback!("get_pulse_preferences"));
    const rejectWrite = vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("browser storage is read-only");});
    try {
      await expect(state.callback!("set_pulse_preferences",{patch:{skinId:"paper",widgetSkin:"meter"}})).rejects.toThrow("browser storage is read-only");
      expect(await state.callback!("get_pulse_preferences")).toEqual(before);
    } finally { rejectWrite.mockRestore(); }
  });

  it("does not read appearance storage outside the explicit browser demo",()=>{
    const read = vi.spyOn(Storage.prototype,"getItem");
    try {
      installDemoBridge();
      history.replaceState(null, "", "/?demo=1");
      state.native=true;
      installDemoBridge();
      expect(read).not.toHaveBeenCalled();
    } finally { read.mockRestore(); }
  });

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
  it("publishes the same raw today totals to the widget, tray and dashboard", async () => {
    history.replaceState(null, "", "/?demo=1");
    installDemoBridge();
    const home = await state.callback!("fetch_overview",{range:"1d"}) as any;
    expect(home.totals.totalTokens).toBe(13600);
    expect(home.totals.costUSD.toFixed(2)).toBe("0.04");
    for(const command of ["get_widget_snapshot","get_tray_popover"]){
      const companion = await state.callback!(command) as any;
      expect(companion.integration?.today).toMatchObject({date:today,timezone:home.timezone,totalTokens:home.totals.totalTokens,costUSD:home.totals.costUSD,stale:false});
      expect(JSON.stringify(companion.integration)).not.toMatch(/demo@example|membershipLevel|workspaceName|codexHome/);
    }
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
