import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type PulsePreferences = {
  skinId: "clear" | "meter";
  theme: "system" | "light" | "dark";
  motionLevel: "off" | "gentle" | "full";
  compactMode: boolean;
  respectReducedMotion: boolean;
  widgetVisible: boolean;
  widgetExpanded: boolean;
  widgetAlwaysOnTop: boolean;
  titlebarEnabled: boolean;
};

export const defaultPulsePreferences: PulsePreferences = {
  skinId: "clear", theme: "system", motionLevel: "gentle", compactMode: false,
  respectReducedMotion: true, widgetVisible: false, widgetExpanded: false, widgetAlwaysOnTop: true, titlebarEnabled: true,
};
const storageKey = "codexpulse.appearance.v1";
let preferences = defaultPulsePreferences;
let error: string | null = null;
let initialization: Promise<void> | undefined;
let pending = 0;
let revision = 0;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((subscriber) => subscriber());
const subscribe = (subscriber: () => void) => { subscribers.add(subscriber); return () => { subscribers.delete(subscriber); }; };

export function normalizePulsePreferences(value: unknown): PulsePreferences {
  const data = value && typeof value === "object" ? value as Partial<PulsePreferences> : {};
  return {
    skinId: data.skinId === "meter" ? "meter" : "clear",
    theme: data.theme === "light" || data.theme === "dark" ? data.theme : "system",
    motionLevel: data.motionLevel === "off" || data.motionLevel === "full" ? data.motionLevel : "gentle",
    compactMode: data.compactMode === true,
    respectReducedMotion: data.respectReducedMotion !== false,
    widgetVisible: data.widgetVisible === true,
    widgetExpanded: data.widgetExpanded === true,
    widgetAlwaysOnTop: data.widgetAlwaysOnTop !== false,
    titlebarEnabled: data.titlebarEnabled !== false,
  };
}

export function applyPulsePreferences(value: PulsePreferences) {
  const root = document.documentElement;
  const dark = value.theme === "dark" || (value.theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const reduced = value.respectReducedMotion && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  root.dataset.skin = value.skinId;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.motion = reduced ? "off" : value.motionLevel;
  root.dataset.density = value.compactMode ? "compact" : "comfortable";
  root.classList.toggle("dark", Boolean(dark));
  root.style.colorScheme = dark ? "dark" : "light";
}

function accept(value: unknown) {
  preferences = normalizePulsePreferences(value);
  applyPulsePreferences(preferences);
  try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Native preferences remain authoritative. */ }
  notify();
}

/** One appearance store per webview. No usage scan or account request is made here. */
export function initializePulseAppearance(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    try { accept(JSON.parse(localStorage.getItem(storageKey) ?? "null")); } catch { accept(defaultPulsePreferences); }
    for (const query of ["(prefers-color-scheme: dark)", "(prefers-reduced-motion: reduce)"]) {
      window.matchMedia?.(query).addEventListener("change", () => applyPulsePreferences(preferences));
    }
    window.addEventListener("storage", (event) => {
      if (event.key !== storageKey || !event.newValue || pending > 0) return;
      try { accept(JSON.parse(event.newValue)); } catch { /* Ignore invalid data from older versions. */ }
    });
    if (isTauri()) {
      try {
        await listen<PulsePreferences>("pulse-preferences-changed", ({ payload }) => {
          if (pending === 0) accept(payload);
        });
        accept(await invoke<PulsePreferences>("get_pulse_preferences"));
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); notify(); }
    }
  })();
  return initialization;
}

export async function updatePulsePreferences(patch: Partial<PulsePreferences>) {
  const previous = preferences;
  const ownRevision = ++revision;
  pending += 1;
  error = null;
  accept({ ...preferences, ...patch });
  try {
    if (isTauri()) {
      const saved = await invoke<PulsePreferences>("set_pulse_preferences", { patch });
      if (ownRevision === revision) accept(saved);
    }
  } catch (cause) {
    if (ownRevision === revision) {
      try { accept(isTauri() ? await invoke<PulsePreferences>("get_pulse_preferences") : previous); }
      catch { accept(previous); }
      error = cause instanceof Error ? cause.message : String(cause);
      notify();
    }
  } finally { pending -= 1; }
}

export const usePulsePreferences = () => useSyncExternalStore(subscribe, () => preferences, () => defaultPulsePreferences);
export const usePulsePreferencesError = () => useSyncExternalStore(subscribe, () => error, () => null);

export async function pulseWidgetAction(action: "show" | "hide" | "expand" | "collapse" | "pin" | "unpin" | "showMain" | "quit") {
  if (isTauri()) await invoke("widget_action", { action });
  else {
    const patch: Partial<PulsePreferences> = action === "show" ? { widgetVisible: true }
      : action === "hide" ? { widgetVisible: false } : action === "expand" ? { widgetExpanded: true }
      : action === "collapse" ? { widgetExpanded: false } : action === "pin" ? { widgetAlwaysOnTop: true }
      : action === "unpin" ? { widgetAlwaysOnTop: false } : {};
    await updatePulsePreferences(patch);
  }
}
