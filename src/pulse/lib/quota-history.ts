import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportFormat, ExportResponse } from "./api";

export type QuotaKind = "session" | "weekly";
export type QuotaRecordingPreferences = { schemaVersion: number; enabled: boolean; timezone: string };
export type QuotaHistoryReadError = "local_read_failed" | "storage_unavailable";
/** A generic IPC/legacy mock failure cannot establish whether background recording stopped. */
export function quotaHistoryReadError(error: unknown): QuotaHistoryReadError {
  return typeof error === "object" && error !== null && "code" in error && error.code === "storage_unavailable"
    ? "storage_unavailable" : "local_read_failed";
}
export type QuotaHistoryDaily = {
  date: string; kind: QuotaKind; windowMinutes: number; consumedPercentPoints: number | null;
  coveredMinutes: number; sampleCount: number; cycleCount: number; gapCount: number;
  unallocatedCount: number; status: string; source: string;
};
export type QuotaHistorySummaryRow = {
  kind: QuotaKind; windowMinutes: number; consumedPercentPoints: number | null;
  coveredMinutes: number; recordedDays: number; sampleCount: number; gapCount: number; unallocatedCount: number;
};
export type QuotaHistoryResponse = {
  schemaVersion: number; identityRevision: number; scopeAvailable: boolean; timezone: string; enabled: boolean;
  hasOtherScopeHistory?: boolean;
  storageStatus: string;
  /** Official provider status only; a failed local query rejects the IPC call. */
  readStatus: string; updatedAt: string | null; startDate: string; endDate: string;
  daily: QuotaHistoryDaily[]; summaries: QuotaHistorySummaryRow[]; unallocatedCount: number;
};
export type QuotaHistorySegment = {
  id: number; kind: QuotaKind; windowMinutes: number; resetsAt: string; date: string | null;
  startAt: string; endAt: string; startUsedPercent: number | null; endUsedPercent: number | null;
  consumedPercentPoints: number | null; coveredMinutes: number; reason: string; source: string;
};
export type QuotaHistoryDayResponse = {
  schemaVersion: number; identityRevision: number; scopeAvailable: boolean; timezone: string;
  storageStatus: string; readStatus: string; date: string; kind: QuotaKind; windowMinutes: number;
  segments: QuotaHistorySegment[]; nextBefore: number | null;
};
export const getQuotaRecordingPreferences = () => invoke<QuotaRecordingPreferences>("get_quota_recording_preferences");
export const setQuotaRecordingEnabled = (enabled: boolean) => invoke<QuotaRecordingPreferences>("set_quota_recording_enabled", { enabled });
export const fetchQuotaHistory = (range: string) => invoke<QuotaHistoryResponse>("fetch_quota_history", { range });
export const fetchQuotaHistoryDay = (date: string, kind: QuotaKind, windowMinutes: number, before: number | null = null) =>
  invoke<QuotaHistoryDayResponse>("fetch_quota_history_day", { date, kind, windowMinutes, before });
export const exportQuotaHistory = (range: string, format: ExportFormat, path: string) => invoke<ExportResponse>("export_quota_history", { range, format, path });

/** Fill only display rows. Missing observations remain null, never a measured zero. */
export function quotaHistoryDays(data: QuotaHistoryResponse, kind: QuotaKind, windowMinutes: number): QuotaHistoryDaily[] {
  const existing = new Map(data.daily.filter(row => row.kind === kind && row.windowMinutes === windowMinutes).map(row => [row.date, row]));
  const start = Date.parse(`${data.startDate}T00:00:00Z`), end = Date.parse(`${data.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const rows: QuotaHistoryDaily[] = [];
  for (let at = start; at <= end && rows.length < 366; at += 86_400_000) {
    const date = new Date(at).toISOString().slice(0, 10);
    rows.push(existing.get(date) ?? { date, kind, windowMinutes, consumedPercentPoints: null, coveredMinutes: 0, sampleCount: 0, cycleCount: 0, gapCount: 0, unallocatedCount: 0, status: "unobserved", source: "official" });
  }
  return rows;
}

/** Events reread the local ledger only. Scope revisions fence off retired accounts. */
export function useQuotaHistory(range: string) {
  const [data, setData] = useState<QuotaHistoryResponse | null>(null);
  const [error, setError] = useState<QuotaHistoryReadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const identityRevision = useRef(0);
  const generation = useRef(0);
  const previousRange = useRef(range);
  const refresh = useCallback(() => setReload(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const ownGeneration = ++generation.current;
    if (previousRange.current !== range) { previousRange.current = range; setData(null); setError(null); }
    setLoading(true);
    void fetchQuotaHistory(range).then(value => {
      if (!active || generation.current !== ownGeneration || value.identityRevision < identityRevision.current) return;
      identityRevision.current = value.identityRevision; setData(value); setError(null);
    }).catch(failure => { if (active && generation.current === ownGeneration) setError(quotaHistoryReadError(failure)); })
      .finally(() => { if (active && generation.current === ownGeneration) setLoading(false); });
    return () => { active = false; };
  }, [range, reload]);
  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];
    const add = (promise: Promise<() => void>) => { void promise.then(remove => { if (active) cleanups.push(remove); else remove(); }).catch(() => {}); };
    add(listen("quota-history-updated", () => { if (active) { ++generation.current; refresh(); } }));
    add(listen<{ revision: number }>("codex-identity-updated", event => {
      if (!active || event.payload.revision < identityRevision.current) return;
      identityRevision.current = event.payload.revision; ++generation.current; setData(null); setError(null); refresh();
    }));
    const focused = () => { if (active) refresh(); };
    window.addEventListener("focus", focused);
    // Also rolls the independent today query over the ledger's midnight without network I/O.
    const timer = window.setInterval(focused, 60_000);
    return () => { active = false; cleanups.forEach(remove => remove()); window.removeEventListener("focus", focused); window.clearInterval(timer); };
  }, [refresh]);
  return { data, error, loading, refresh };
}
