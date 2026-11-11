import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
export type PaceDailyObservation = { date: string; consumedPercentPoints: number | null; coveredMinutes: number; partial: boolean };
export type PaceResetNotice = {
  id: string; summary: string; sourceUrl: string; sourceLabel: string; startAt: string | null; endAt: string | null;
  publishedAt: string; updatedAt: string; isUnread: boolean; verification: "third_party"; scope: "global";
};
export type PaceNoticeState = {
  status: "active" | "expired" | "stale" | "unavailable" | "none" | "unknown";
  checkedAt: string | null;
  validUntil: string | null;
};
export type PaceCoachExtras = {
  observedWindow?: { kind: PaceWindow["kind"]; windowMinutes: number; resetsAt: string } | null;
  observationTimezone?: string | null;
  dailyObservations: PaceDailyObservation[];
  resetNotice: PaceResetNotice | null;
  noticeState?: PaceNoticeState;
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
  coachExtras?: PaceCoachExtras;
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
export type SyntheticCoachScenario = "roomy" | "balanced" | "fast" | "notice" | "stale";
const coachScenarios: SyntheticCoachScenario[] = ["roomy", "balanced", "fast", "notice", "stale"];
const demoReadNotices = new Set<string>();
export function syntheticCoachSnapshot(scenario: SyntheticCoachScenario = "roomy", now = new Date(), noticeStatus?: PaceNoticeState["status"]): PaceSnapshot {
  const data = syntheticPaceSnapshot("idle", now), at = now.getTime();
  const remaining = scenario === "fast" ? 20 : scenario === "balanced" ? 71.4 : 80;
  const reset = new Date(at + 5 * 86_400_000).toISOString();
  Object.assign(data.windows[0], { remainingPercent: null, windowMinutes: null, resetsAt: null, state: "unavailable", trend: [], sampleCount: 0, sampleSpanMinutes: 0, observedMinutes: null, consumedPercentPoints: null });
  Object.assign(data.windows[1], { remainingPercent: remaining, resetsAt: reset, state: scenario === "stale" ? "stale" : "idle", sampleCount: 7, sampleSpanMinutes: 60, observedMinutes: 60, consumedPercentPoints: 0, trend: Array.from({ length: 7 }, (_, index) => ({ at: new Date(at - (6 - index) * 600_000).toISOString(), remainingPercent: remaining })) });
  data.primaryKind = "weekly"; data.status = scenario === "stale" ? "stale" : "idle";
  if (scenario === "stale") data.updatedAt = new Date(at - 600_000).toISOString();
  data.coachExtras = {
    observationTimezone: "UTC",
    observedWindow: { kind: "weekly", windowMinutes: 10080, resetsAt: reset },
    dailyObservations: [
      { date: new Date(at - 2 * 86_400_000).toISOString().slice(0, 10), consumedPercentPoints: null, coveredMinutes: 0, partial: true },
      { date: new Date(at - 86_400_000).toISOString().slice(0, 10), consumedPercentPoints: 1, coveredMinutes: 30, partial: true },
      { date: now.toISOString().slice(0, 10), consumedPercentPoints: 0, coveredMinutes: 15, partial: true },
    ],
    resetNotice: scenario === "notice" ? { id: "synthetic-reset-notice-v3", summary: "Synthetic reset-notice example — not a real announcement.", sourceUrl: "https://example.org/", sourceLabel: "Synthetic third-party example", startAt: new Date(at + 7_200_000).toISOString(), endAt: new Date(at + 10_800_000).toISOString(), publishedAt: new Date(at - 1_200_000).toISOString(), updatedAt: now.toISOString(), isUnread: true, verification: "third_party", scope: "global" } : null,
    noticeState: { status: scenario === "notice" ? "active" : "none", checkedAt: now.toISOString(), validUntil: scenario === "notice" ? new Date(at + 10_800_000).toISOString() : null },
  };
  if (noticeStatus && ["expired", "stale", "unavailable", "none", "unknown"].includes(noticeStatus)) {
    data.coachExtras.resetNotice = null;
    data.coachExtras.noticeState = { status: noticeStatus, checkedAt: noticeStatus === "unknown" ? null : new Date(at - (noticeStatus === "stale" ? 360_000 : 0)).toISOString(), validUntil: ["expired", "unavailable"].includes(noticeStatus) ? new Date(at - 60_000).toISOString() : null };
  }
  return data;
}
let pendingRead: Promise<PaceSnapshot> | null = null;
// An update means a response captured before it can no longer satisfy a local read.
const invalidatePaceRead = () => { pendingRead = null; };
export function fetchPulsePace(refresh = false): Promise<PaceSnapshot> {
  if (demo()) {
    const query = new URLSearchParams(location.search);
    const coachScenario = query.get("coachScenario") as SyntheticCoachScenario;
    if (coachScenarios.includes(coachScenario)) {
      const value = syntheticCoachSnapshot(coachScenario, new Date(), query.get("noticeScenario") as PaceNoticeState["status"]);
      if (value.coachExtras?.resetNotice && demoReadNotices.has(value.coachExtras.resetNotice.id)) value.coachExtras.resetNotice.isUnread = false;
      return Promise.resolve(value);
    }
    const state = (query.get("paceScenario") ?? query.get("paceState")) as PaceState;
    return Promise.resolve(paceStates.includes(state) ? syntheticPaceSnapshot(state) : syntheticCoachSnapshot("roomy"));
  }
  if (refresh) return invoke<PaceSnapshot>("refresh_pulse_pace");
  if (!pendingRead) {
    const request = invoke<PaceSnapshot>("fetch_pulse_pace").finally(() => {
      // An older request may finish after an update has already started a new one.
      if (pendingRead === request) pendingRead = null;
    });
    pendingRead = request;
  }
  return pendingRead;
}
export async function titlebarAction(action: "toggle" | "close" | "showMain" | "details" | "account") {
  if (demo()) {
    if (action === "account" || action === "details") {
      try { sessionStorage.setItem("pulse-demo-companion-action", action); } catch { /* Main view remains reachable without browser storage. */ }
    }
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
  const [noticePending, setNoticePending] = useState(false);
  const [noticeError, setNoticeError] = useState(false);
  const noticeReadPending = useRef(false);
  const current = useRef<PaceSnapshot | null>(null);
  const failedAt = useRef<{ updatedAt: string | null } | null>(null);
  const requestRevision = useRef(0);
  const manualPending = useRef(false);
  const queuedRead = useRef(false);
  const localRead = useRef<(() => Promise<void>) | null>(null);
  const mounted = useRef(false);
  const accept = useCallback((value: PaceSnapshot) => {
    if (current.current?.coachExtras?.resetNotice?.id !== value.coachExtras?.resetNotice?.id || !value.coachExtras?.resetNotice?.isUnread) setNoticeError(false);
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
      if (manualPending.current) { queuedRead.current = true; return; }
      const ownRevision = ++requestRevision.current;
      try { const value = await fetchPulsePace(); if (active && ownRevision === requestRevision.current) accept(value); }
      catch { if (active && ownRevision === requestRevision.current) { failedAt.current = { updatedAt: current.current?.updatedAt ?? null }; setError(true); } }
    };
    localRead.current = read;
    let unlisten: UnlistenFn | undefined;
    // Successful account reads update all companions through a local snapshot read.
    // This event must never issue another account refresh.
    void listen("pulse-pace-updated", () => {
      if (!active) return;
      invalidatePaceRead();
      ++requestRevision.current;
      void read();
    }).then(remove => {
      if (active) { unlisten = remove; void read(); } else remove();
    }).catch(() => { if (active) void read(); /* Polling remains available without native events. */ });
    const timer = window.setInterval(() => { if (!document.hidden) void read(); }, 20_000);
    const visible = () => { if (!document.hidden) { invalidatePaceRead(); void read(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; mounted.current = false; localRead.current = null; queuedRead.current = false; unlisten?.(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [accept]);
  const refresh = useCallback(async () => {
    if (manualPending.current) return;
    manualPending.current = true;
    const ownRevision = ++requestRevision.current;
    setRefreshing(true);
    try { const value = await fetchPulsePace(true); if (mounted.current && ownRevision === requestRevision.current) accept(value); }
    catch { if (mounted.current) { failedAt.current = { updatedAt: current.current?.updatedAt ?? null }; setError(true); } }
    finally {
      manualPending.current = false;
      if (mounted.current) {
        setRefreshing(false);
        if (queuedRead.current) { queuedRead.current = false; await localRead.current?.(); }
      }
    }
  }, [accept]);
  const markNoticeRead = useCallback(async (id: string) => {
    const notice = current.current?.coachExtras?.resetNotice;
    if (noticeReadPending.current || !notice?.isUnread || notice.id !== id) return;
    noticeReadPending.current = true;
    setNoticePending(true); setNoticeError(false);
    try {
      if (demo()) {
        demoReadNotices.add(id);
        const value = current.current;
        if (value?.coachExtras && mounted.current) accept({ ...value, coachExtras: { ...value.coachExtras, resetNotice: { ...notice, isUnread: false } } });
      } else {
        await invoke("mark_pulse_notice_read", { id });
        invalidatePaceRead();
        const ownRevision = ++requestRevision.current;
        const confirmed = current.current;
        if (mounted.current && confirmed?.coachExtras?.resetNotice?.id === id) {
          accept({ ...confirmed, coachExtras: { ...confirmed.coachExtras, resetNotice: { ...confirmed.coachExtras.resetNotice, isUnread: false } } });
        }
        try {
          const value = await fetchPulsePace();
          if (mounted.current && ownRevision === requestRevision.current) accept(value);
        } catch {
          // The write has succeeded: a failed snapshot reread is not an unread-write failure.
          if (mounted.current && ownRevision === requestRevision.current) {
            failedAt.current = { updatedAt: current.current?.updatedAt ?? null }; setError(true);
          }
        }
      }
    } catch { if (mounted.current && current.current?.coachExtras?.resetNotice?.id === id && current.current.coachExtras.resetNotice.isUnread) setNoticeError(true); }
    finally { noticeReadPending.current = false; if (mounted.current) setNoticePending(false); }
  }, [accept]);
  return { data, error, refreshing, refresh, markNoticeRead, noticePending, noticeError };
}
