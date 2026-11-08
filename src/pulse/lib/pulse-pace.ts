import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type PaceState = "unavailable" | "sampling" | "stale" | "expired" | "idle" | "slow" | "forecast" | "exhausted";
export type PaceRisk = "unknown" | "before_reset" | "near_reset" | "after_reset" | "exhausted";
export type PaceWindow = {
  kind: "session" | "weekly";
  windowMinutes: number | null;
  resetsAt: string | null;
  remainingPercent: number | null;
  state: PaceState;
  sampleCount: number;
  sampleSpanMinutes: number;
  observedMinutes: number | null;
  consumedPercentPoints: number | null;
  rateLowerPerHour: number | null;
  rateUpperPerHour: number | null;
  etaLowerMinutes: number | null;
  etaUpperMinutes: number | null;
  risk: PaceRisk;
  trend: { at: string; remainingPercent: number }[];
};
export type PaceLocalUsage = {
  date: string;
  timezone: string;
  updatedAt: string | null;
  stale?: boolean;
  totalTokens: number;
  projects: { label: string; totalTokens: number; sharePercent: number | null }[];
  models: { label: string; totalTokens: number; sharePercent: number | null }[];
};
export type PaceSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  updatedAt: string | null;
  status: PaceState;
  primaryKind: PaceWindow["kind"] | null;
  reason: string | null;
  windows: PaceWindow[];
  localUsage?: PaceLocalUsage | null;
  refreshFailed?: boolean;
  refreshAfterSeconds?: number;
};
export const paceStates: PaceState[] = ["unavailable", "sampling", "stale", "expired", "idle", "slow", "forecast", "exhausted"];
export function primaryPaceWindow(data: PaceSnapshot | null): PaceWindow | null {
  return data?.windows.find(window => window.kind === data.primaryKind) ?? null;
}
export function hasPaceEstimate(window: PaceWindow | null): window is PaceWindow & { etaLowerMinutes: number; etaUpperMinutes: number } {
  return window?.state === "forecast" && typeof window.etaLowerMinutes === "number" && Number.isFinite(window.etaLowerMinutes)
    && typeof window.etaUpperMinutes === "number" && Number.isFinite(window.etaUpperMinutes)
    && window.etaLowerMinutes >= 0 && window.etaUpperMinutes >= window.etaLowerMinutes;
}
/** Round outward. A range must never imply more precision than the observation. */
export function paceRange(window: PaceWindow | null): { lower: number; upper: number; unit: "h" | "m" } | null {
  if (!hasPaceEstimate(window)) return null;
  if (window.etaLowerMinutes >= 60) return { lower: Math.floor(window.etaLowerMinutes / 60), upper: Math.ceil(window.etaUpperMinutes / 60), unit: "h" };
  return { lower: Math.floor(window.etaLowerMinutes / 5) * 5, upper: Math.max(5, Math.ceil(window.etaUpperMinutes / 5) * 5), unit: "m" };
}
export function compactPaceRange(window: PaceWindow | null): string | null {
  const range = paceRange(window);
  return range ? `≈${range.lower === range.upper ? range.lower : `${range.lower}–${range.upper}`}${range.unit}` : null;
}

/** Public browser fixtures are synthetic; they never invoke a local account request. */
export function syntheticPaceSnapshot(state: PaceState = "forecast", now = new Date()): PaceSnapshot {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const first: PaceWindow = {
    kind: "session", windowMinutes: 300, resetsAt: ago(-240), remainingPercent: 28,
    state, sampleCount: 7, sampleSpanMinutes: 30, observedMinutes: 30, consumedPercentPoints: 6,
    rateLowerPerHour: 10, rateUpperPerHour: 14, etaLowerMinutes: state === "forecast" ? 120 : null,
    etaUpperMinutes: state === "forecast" ? 180 : null, risk: state === "forecast" ? "before_reset" : state === "exhausted" ? "exhausted" : "unknown",
    trend: [34, 33, 32, 31, 30, 29, 28].map((remainingPercent, index) => ({ at: ago(30 - index * 5), remainingPercent })),
  };
  if (state === "sampling") Object.assign(first, { sampleCount: 2, sampleSpanMinutes: 5, consumedPercentPoints: null, observedMinutes: null, trend: first.trend.slice(-2) });
  if (state === "unavailable") Object.assign(first, { remainingPercent: null, resetsAt: null, windowMinutes: null, trend: [], sampleCount: 0, sampleSpanMinutes: 0, observedMinutes: null, consumedPercentPoints: null });
  if (state === "idle" || state === "slow") Object.assign(first, { consumedPercentPoints: 0, trend: first.trend.map(point => ({ ...point, remainingPercent: 28 })) });
  if (state === "exhausted") Object.assign(first, { remainingPercent: 0, trend: first.trend.map((point, index) => ({ ...point, remainingPercent: 6 - index })) });
  if (state === "stale") first.trend = first.trend.map(point => ({ ...point, at: new Date(Date.parse(point.at) - 15 * 60_000).toISOString() }));
  if (state === "expired") first.resetsAt = ago(1);
  return {
    schemaVersion: 1, generatedAt: now.toISOString(), updatedAt: state === "unavailable" ? null : ago(state === "stale" ? 15 : 0),
    status: state, primaryKind: "session", reason: null,
    windows: [first, { ...first, kind: "weekly", windowMinutes: 10080, remainingPercent: 88, resetsAt: ago(-6 * 1440), state: "sampling", sampleCount: 2, sampleSpanMinutes: 10, observedMinutes: null, consumedPercentPoints: null, rateLowerPerHour: null, rateUpperPerHour: null, etaLowerMinutes: null, etaUpperMinutes: null, risk: "unknown", trend: [{ at: ago(10), remainingPercent: 89 }, { at: ago(0), remainingPercent: 88 }] }],
    localUsage: { date: now.toISOString().slice(0, 10), timezone: "UTC", updatedAt: now.toISOString(), totalTokens: 100000,
      projects: [{ label: "Project Atlas", totalTokens: 62000, sharePercent: 62 }, { label: "Documentation", totalTokens: 38000, sharePercent: 38 }],
      models: [{ label: "gpt-6.1", totalTokens: 74000, sharePercent: 74 }, { label: "gpt-6", totalTokens: 26000, sharePercent: 26 }] },
  };
}

const demo = () => new URLSearchParams(location.search).get("demo") === "1";
let pendingRead: Promise<PaceSnapshot> | null = null;
export function fetchPulsePace(refresh = false): Promise<PaceSnapshot> {
  if (demo()) {
    const query = new URLSearchParams(location.search);
    const state = (query.get("paceScenario") ?? query.get("paceState")) as PaceState;
    return Promise.resolve(syntheticPaceSnapshot(paceStates.includes(state) ? state : "forecast"));
  }
  if (refresh) return invoke<PaceSnapshot>("refresh_pulse_pace");
  if (!pendingRead) pendingRead = invoke<PaceSnapshot>("fetch_pulse_pace").finally(() => { pendingRead = null; });
  return pendingRead;
}
export async function titlebarAction(action: "toggle" | "close" | "showMain" | "details") {
  if (demo()) {
    if (action === "toggle") location.hash = "pulse-pace";
    else if (action === "close") location.hash = "pulse-badge";
    else location.hash = "";
    // Each native surface has its own entry point; mirror that in the browser.
    location.reload();
    return;
  }
  await invoke("titlebar_action", { action });
}
export function usePulsePace() {
  const [data, setData] = useState<PaceSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const current = useRef<PaceSnapshot | null>(null);
  const failedAt = useRef<{ updatedAt: string | null } | null>(null);
  const requestRevision = useRef(0);
  const manualPending = useRef(false);
  const mounted = useRef(false);
  const accept = useCallback((value: PaceSnapshot) => {
    if (value.refreshFailed) failedAt.current = { updatedAt: value.updatedAt };
    else if (failedAt.current && value.updatedAt !== failedAt.current.updatedAt) failedAt.current = null;
    current.current = value;
    setData(value);
    setError(failedAt.current !== null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const read = async () => {
      if (manualPending.current) return;
      const ownRevision = ++requestRevision.current;
      try { const value = await fetchPulsePace(); if (active && ownRevision === requestRevision.current) accept(value); }
      catch { if (active && ownRevision === requestRevision.current) { failedAt.current = { updatedAt: current.current?.updatedAt ?? null }; setError(true); } }
    };
    void read();
    const timer = window.setInterval(() => { if (!document.hidden) void read(); }, 20_000);
    const visible = () => { if (!document.hidden) void read(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; mounted.current = false; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [accept]);
  const refresh = useCallback(async () => {
    if (manualPending.current) return;
    manualPending.current = true;
    const ownRevision = ++requestRevision.current;
    setRefreshing(true);
    try { const value = await fetchPulsePace(true); if (mounted.current && ownRevision === requestRevision.current) accept(value); }
    catch { if (mounted.current) { failedAt.current = { updatedAt: current.current?.updatedAt ?? null }; setError(true); } }
    finally { manualPending.current = false; if (mounted.current) setRefreshing(false); }
  }, [accept]);
  return { data, error, refreshing, refresh };
}
