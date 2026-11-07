import { invoke, isTauri } from "@tauri-apps/api/core";
import i18n from "@/i18n";

const MIGRATION_MARKER = "pulse_legacy_preferences_migrated_v1";
export const REFRESH_MINUTES = [1, 2, 3, 4, 5, 10, 15, 30, 60] as const;

/** Read only the host's sanitized preference allowlist, never the old app's caches or auth. */
export async function migrateLegacyPreferences(): Promise<void> {
  if (!isTauri()) return;
  try {
    if (localStorage.getItem(MIGRATION_MARKER) === "true") return;
    const legacy = await invoke<{ language?: string; refreshMinutes?: number } | null>("get_legacy_preferences") ?? {};
    if (!localStorage.getItem("language") && (legacy.language === "zh" || legacy.language === "en")) {
      localStorage.setItem("language", legacy.language);
      await i18n.changeLanguage(legacy.language);
    }
    if (!localStorage.getItem("auto_refresh_interval_minutes") && legacy.refreshMinutes != null
        && (REFRESH_MINUTES as readonly number[]).includes(legacy.refreshMinutes)) {
      localStorage.setItem("auto_refresh_interval_minutes", String(legacy.refreshMinutes));
    }
    localStorage.setItem(MIGRATION_MARKER, "true");
  } catch {
    // Retain the original file and retry on next launch. A migration read failure
    // must not prevent the local dashboard from opening.
    console.warn("Could not import previous Codex Pulse preferences; original settings were retained.");
  }
}
