import type { PaceCoachExtras, PaceDailyObservation, PaceNoticeState, PaceResetNotice, PaceSnapshot, PaceWindow } from "./pulse-pace";
import { noticeAllowsActive, noticeHasValidBasis, resolveNoticeState } from "./notice-state";

export type QuotaCoachStatus = "ready" | "unavailable" | "stale" | "failed" | "exhausted" | "expired";
export type QuotaCoachTone = "roomy" | "balanced" | "fast";
export type QuotaPaceCoach = {
  status: QuotaCoachStatus; tone: QuotaCoachTone | null; window: PaceWindow | null;
  remainingPercent: number | null; usedPercent: number | null; elapsedPercent: number | null; remainingTimePercent: number | null;
  resetAt: number | null; startAt: number | null; remainingMinutes: number | null; reference: { unit: "day" | "hour" | "reset"; percentPoints: number } | null;
  hasUnknownWindows: boolean; nearResetWithSurplus: boolean;
  remainingAtReset: { lowerPercent: number; upperPercent: number } | null;
  dailyObservations: PaceDailyObservation[]; observationTimezone: string | null; resetNotice: PaceResetNotice | null;
  noticeState: PaceNoticeState;
};
export type QuotaPaceCoachInput = { windows: PaceWindow[]; now: number; fresh: boolean; failed?: boolean; coachExtras?: PaceCoachExtras };
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const at = (value: string | null | undefined): number | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const result = Date.parse(value); return Number.isFinite(result) ? result : null;
};
function candidate(window: PaceWindow, now: number) {
  const reset = at(window.resetsAt), duration = window.windowMinutes;
  if (!finite(window.remainingPercent) || window.remainingPercent < 0 || window.remainingPercent > 100 || !finite(duration) || duration <= 0 || duration > 5_256_000 || reset == null) return null;
  const minutes = (reset - now) / 60_000;
  if (minutes <= 0 || minutes > duration + 2 || ["unavailable", "stale", "expired"].includes(window.state)) return null;
  const remainingTime = clamp(minutes / duration * 100);
  return { window, reset, minutes, remainingTime, remaining: window.remainingPercent, used: 100 - window.remainingPercent, elapsed: 100 - remainingTime };
}
/** Reading state for the window list; inspecting a window never makes it current. */
export function quotaWindowReadState(window: PaceWindow, now: number, fresh: boolean): "ready" | "unavailable" | "stale" | "expired" | "exhausted" {
  const reset = at(window.resetsAt);
  if (reset != null && reset <= now) return "expired";
  if (!finite(window.remainingPercent) || window.remainingPercent < 0 || window.remainingPercent > 100 || window.state === "unavailable") return "unavailable";
  if (!fresh || window.state === "stale") return "stale";
  if (window.state === "expired") return "expired";
  if (!candidate(window, now)) return "unavailable";
  return window.remainingPercent === 0 ? "exhausted" : "ready";
}
function validNotice(notice: PaceResetNotice | null | undefined, now: number): PaceResetNotice | null {
  if (!noticeHasValidBasis(notice, now)) return null;
  const updated = at(notice.updatedAt), published = at(notice.publishedAt), start = at(notice.startAt), end = at(notice.endAt);
  // Same five-minute source freshness contract as the backend; no invented announcement timestamp.
  if (updated == null || published == null || now - updated > 300_000 || now - updated < -120_000 || published > now + 120_000) return null;
  if ((notice.startAt != null && start == null) || (notice.endAt != null && end == null) || (end != null && end <= now) || (start != null && end != null && end < start)) return null;
  if (end == null && published + 86_400_000 <= now) return null;
  return notice;
}
function dailyForWindow(extras: PaceCoachExtras | undefined, window: PaceWindow, reset: number): PaceDailyObservation[] {
  const observed = extras?.observedWindow;
  if (!observed || observed.kind !== window.kind || observed.windowMinutes !== window.windowMinutes || at(observed.resetsAt) !== reset) return [];
  const records = new Map<string, PaceDailyObservation>();
  for (const row of (extras?.dailyObservations ?? []).slice(-31)) {
    const date = Date.parse(`${row.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== row.date || !finite(row.coveredMinutes) || row.coveredMinutes < 0 || row.coveredMinutes > 26 * 60) continue;
    const consumed = row.coveredMinutes > 0 && finite(row.consumedPercentPoints) && row.consumedPercentPoints >= 0 && row.consumedPercentPoints <= 100 ? row.consumedPercentPoints : null;
    records.set(row.date, { date: row.date, consumedPercentPoints: consumed, coveredMinutes: row.coveredMinutes, partial: row.partial !== false || consumed == null });
  }
  return [...records.values()].sort((left, right) => left.date.localeCompare(right.date));
}
function observationZoneForWindow(extras: PaceCoachExtras | undefined, window: PaceWindow, reset: number): string | null {
  const observed = extras?.observedWindow, zone = extras?.observationTimezone;
  if (observed?.kind !== window.kind || observed.windowMinutes !== window.windowMinutes || at(observed.resetsAt) !== reset || !zone) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return zone; } catch { return null; }
}

/** Remaining quota versus nominal window time, never tokens, request counts, or guaranteed work time. */
export function buildQuotaPaceCoach(input: QuotaPaceCoachInput): QuotaPaceCoach {
  const { windows, now } = input;
  const result: QuotaPaceCoach = {
    status: "unavailable", tone: null, window: null, remainingPercent: null, usedPercent: null, elapsedPercent: null,
    remainingTimePercent: null, resetAt: null, startAt: null, remainingMinutes: null, reference: null, hasUnknownWindows: false,
    nearResetWithSurplus: false, remainingAtReset: null, dailyObservations: [], observationTimezone: null, resetNotice: null,
    noticeState: { status: "unknown", checkedAt: null, validUntil: null },
  };
  if (!Number.isFinite(now)) return result;
  result.resetNotice = noticeAllowsActive(input.coachExtras?.noticeState) ? validNotice(input.coachExtras?.resetNotice, now) : null;
  result.noticeState = resolveNoticeState(input.coachExtras?.noticeState, input.coachExtras?.resetNotice, result.resetNotice != null, now);
  const candidates = windows.map(window => candidate(window, now)).filter((value): value is NonNullable<typeof value> => value != null);
  const known = windows.find(window => finite(window.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100);
  const selected = candidates.sort((left, right) => left.remaining / left.remainingTime - right.remaining / right.remainingTime || left.minutes - right.minutes)[0];
  result.window = selected?.window ?? known ?? windows[0] ?? null;
  if (result.window) {
    result.remainingPercent = finite(result.window.remainingPercent) && result.window.remainingPercent >= 0 && result.window.remainingPercent <= 100 ? result.window.remainingPercent : null;
    result.usedPercent = result.remainingPercent == null ? null : 100 - result.remainingPercent;
    result.resetAt = at(result.window.resetsAt);
    result.remainingMinutes = result.resetAt == null ? null : Math.max(0, (result.resetAt - now) / 60_000);
  }
  result.hasUnknownWindows = candidates.length < windows.length || !windows.some(window => window.kind === "session") || !windows.some(window => window.kind === "weekly");
  if (input.failed) { result.status = "failed"; return result; }
  if (!input.fresh) { result.status = known ? "stale" : "unavailable"; return result; }
  if (!selected) { result.status = windows.some(window => window.state === "stale") ? "stale" : windows.some(window => window.state === "expired" || (at(window.resetsAt) ?? Infinity) <= now) ? "expired" : "unavailable"; return result; }
  result.resetAt = selected.reset; result.remainingMinutes = selected.minutes;
  result.startAt = selected.reset - selected.window.windowMinutes! * 60_000;
  result.remainingTimePercent = selected.remainingTime; result.elapsedPercent = selected.elapsed;
  if (selected.remaining === 0) {
    result.status = "exhausted";
    result.dailyObservations = dailyForWindow(input.coachExtras, selected.window, selected.reset);
    result.observationTimezone = observationZoneForWindow(input.coachExtras, selected.window, selected.reset);
    return result;
  }
  // A genuinely stale known alternative may be tighter; never let a fresh roomy window hide it.
  if (windows.some(window => window.state === "stale" && finite(window.remainingPercent))) { result.status = "stale"; return result; }
  result.status = "ready";
  const difference = selected.used - selected.elapsed;
  result.tone = difference > 5 ? "fast" : difference < -5 ? "roomy" : "balanced";
  // Match the unit to the time actually left, avoiding a huge day/hour extrapolation near reset.
  const unit = selected.minutes < 60 ? "reset" : selected.window.windowMinutes! >= 1440 && selected.minutes >= 1440 ? "day" : "hour";
  result.reference = { unit, percentPoints: unit === "reset" ? selected.remaining : selected.remaining / (selected.minutes / (unit === "day" ? 1440 : 60)) };
  result.nearResetWithSurplus = selected.remaining >= 25 && selected.minutes <= Math.min(1440, selected.window.windowMinutes! * .15);
  const window = selected.window;
  if (window.state === "forecast" && window.sampleCount >= 4 && window.sampleSpanMinutes >= 15 && finite(window.rateLowerPerHour) && window.rateLowerPerHour > 0 && finite(window.rateUpperPerHour) && window.rateUpperPerHour >= window.rateLowerPerHour) {
    const observedAt = at(window.trend.at(-1)?.at);
    if (observedAt != null && now - observedAt >= -120_000 && now - observedAt <= 360_000) {
      result.remainingAtReset = { lowerPercent: clamp(selected.remaining - window.rateUpperPerHour * selected.minutes / 60), upperPercent: clamp(selected.remaining - window.rateLowerPerHour * selected.minutes / 60) };
    }
  }
  result.dailyObservations = dailyForWindow(input.coachExtras, window, selected.reset);
  result.observationTimezone = observationZoneForWindow(input.coachExtras, window, selected.reset);
  return result;
}

export function quotaCoachFromSnapshot(data: PaceSnapshot | null, now: number, failed = false): QuotaPaceCoach {
  const updated = at(data?.updatedAt);
  return buildQuotaPaceCoach({ windows: data?.windows ?? [], now, failed: failed || data?.refreshFailed === true,
    fresh: updated != null && now - updated >= -120_000 && now - updated <= 360_000 && !["stale", "unavailable"].includes(data?.status ?? "unavailable"), coachExtras: data?.coachExtras });
}
