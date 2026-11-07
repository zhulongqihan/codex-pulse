// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "@/i18n";
import { migrateLegacyPreferences } from "./legacy-preferences";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe("one-time v0.2 preference import", () => {
  it("preserves a ten-minute interval exactly and imports Chinese before first render", async () => {
    vi.mocked(invoke).mockResolvedValue({ language: "zh", refreshMinutes: 10 });
    await migrateLegacyPreferences();
    expect(localStorage.getItem("language")).toBe("zh");
    expect(i18n.language).toBe("zh");
    expect(localStorage.getItem("auto_refresh_interval_minutes")).toBe("10");
    await migrateLegacyPreferences();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("get_legacy_preferences");
  });

  it("never overwrites preferences already chosen in the new app", async () => {
    localStorage.setItem("language", "de");
    localStorage.setItem("auto_refresh_interval_minutes", "2");
    vi.mocked(invoke).mockResolvedValue({ language: "zh", refreshMinutes: 10 });
    await migrateLegacyPreferences();
    expect(localStorage.getItem("language")).toBe("de");
    expect(localStorage.getItem("auto_refresh_interval_minutes")).toBe("2");
  });

  it("marks a fresh install without legacy preferences as checked", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    await migrateLegacyPreferences();
    await migrateLegacyPreferences();
    expect(localStorage.getItem("language")).toBeNull();
    expect(localStorage.getItem("auto_refresh_interval_minutes")).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("can retry an unavailable host without losing preferences", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ language: "en" });
    await migrateLegacyPreferences();
    expect(localStorage.getItem("pulse_legacy_preferences_migrated_v1")).toBeNull();
    await migrateLegacyPreferences();
    expect(localStorage.getItem("language")).toBe("en");
  });
});
