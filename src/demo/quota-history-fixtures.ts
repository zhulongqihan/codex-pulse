/** Isolated synthetic account readings. No usage logs, credentials or network requests. */
import type {
  QuotaHistoryDayResponse, QuotaHistoryResponse, QuotaHistorySegment, QuotaRecordingPreferences,
} from "../pulse/lib/quota-history";

const DAY = 86_400_000;
const TIMEZONE = "Asia/Shanghai";
const dateMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateKey = (time: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
};
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(dateMs(date)) && new Date(dateMs(date)).toISOString().slice(0, 10) === date;
type Daily = QuotaHistoryResponse["daily"][number];
type Summary = QuotaHistoryResponse["summaries"][number];

export function createQuotaHistoryDemo(referenceTime = new Date()) {
  const today = dateKey(referenceTime);
  const back = (days: number) => new Date(dateMs(today) - days * DAY).toISOString().slice(0, 10);
  // Shanghai has no clock changes in these synthetic observation dates.
  const at = (days: number, time: string) => new Date(`${back(days)}T${time}:00+08:00`).toISOString();
  const daily: Daily[] = [];
  const segments: QuotaHistorySegment[] = [];
  let enabled = true;

  function day(days: number, consumedPercentPoints: number | null, patch: Partial<Daily> = {}) {
    daily.push({ date: back(days), kind: "session", windowMinutes: 300, consumedPercentPoints,
      coveredMinutes: 8, sampleCount: 2, cycleCount: 1, gapCount: 0, unallocatedCount: 0,
      status: "partial", source: "official", ...patch });
  }
  function segment(days: number, start: string, end: string, usedStart: number, usedEnd: number,
    consumed: number | null, reason: QuotaHistorySegment["reason"], patch: Partial<QuotaHistorySegment> = {}) {
    segments.push({ id: segments.length + 1, kind: "session", windowMinutes: 300,
      resetsAt: at(days, "05:00"), date: back(days), startAt: at(days, start), endAt: at(days, end),
      startUsedPercent: usedStart, endUsedPercent: usedEnd, consumedPercentPoints: consumed,
      coveredMinutes: 0, reason, source: "official", ...patch });
  }
  function observed(days: number, start: number, end: number, patch: Partial<QuotaHistorySegment> = {}) {
    segment(days, "00:02", "00:02", start, start, null, "baseline", patch);
    segment(days, "00:02", "00:10", start, end, end - start, start === end ? "unchanged" : "continuous", { ...patch, coveredMinutes: 8 });
  }

  day(0, 8); observed(0, 20, 28); // Remaining 80% → 72% is 8 percentage points.
  day(0, 3, { kind: "weekly", windowMinutes: 10080 });
  observed(0, 38, 41, { kind: "weekly", windowMinutes: 10080, resetsAt: at(-5, "05:00") });

  day(1, 150, { coveredMinutes: 16, sampleCount: 4, cycleCount: 2 });
  observed(1, 10, 90);
  segment(1, "12:02", "12:02", 0, 0, null, "cycle_changed", { resetsAt: at(1, "17:00") });
  segment(1, "12:02", "12:10", 0, 70, 70, "continuous", { resetsAt: at(1, "17:00"), coveredMinutes: 8 });

  day(2, 4, { coveredMinutes: 0, gapCount: 1 });
  segment(2, "00:02", "00:02", 30, 30, null, "baseline");
  segment(2, "00:02", "04:02", 30, 34, 4, "same_day_gap");

  day(3, 0, { status: "unchanged" }); observed(3, 28, 28);
  day(4, null, { coveredMinutes: 0, sampleCount: 1, status: "insufficient_samples" });
  segment(4, "00:02", "00:02", 20, 20, null, "baseline");

  // The 7pp across midnight is retained once and is never added to either day.
  for (const days of [6, 5]) day(days, null, { coveredMinutes: 0, sampleCount: 1, unallocatedCount: 1, status: "insufficient_samples" });
  segment(6, "23:58", "23:58", 10, 10, null, "baseline", { resetsAt: at(5, "04:00") });
  segment(6, "23:58", "23:58", 10, 17, 7, "cross_day", { date: null, endAt: at(5, "00:02"), resetsAt: at(5, "04:00") });

  function bounds(range: string) {
    const queryToday = dateKey(new Date());
    let start: string; let end = queryToday;
    if (typeof range !== "string") throw new Error("Invalid quota history range");
    if (range.startsWith("custom:")) {
      const parts = range.slice(7).split("_");
      if (parts.length !== 2 || !parts.every(validDate)) throw new Error("Invalid quota history date range");
      [start, end] = parts;
    } else if (range === "all") start = back(6);
    else {
      const match = /^([1-9]\d*)d$/.exec(range);
      const days = match ? Number(match[1]) : 0;
      if (!Number.isSafeInteger(days) || days < 1 || days > 366) throw new Error("Quota history range must contain 1–366 days");
      start = new Date(dateMs(queryToday) - (days - 1) * DAY).toISOString().slice(0, 10);
    }
    const days = (dateMs(end) - dateMs(start)) / DAY + 1;
    if (days < 1 || days > 366 || end > queryToday) throw new Error("Quota history date range must contain 1–366 days without future dates");
    return { start, end };
  }

  function inRange(segment: QuotaHistorySegment, start: string, end: string) {
    if (segment.date !== null) return segment.date >= start && segment.date <= end;
    return dateKey(new Date(segment.startAt)) <= end && dateKey(new Date(segment.endAt)) >= start;
  }

  function preferences(): QuotaRecordingPreferences { return { schemaVersion: 1, enabled, timezone: TIMEZONE }; }
  function setEnabled(value: boolean) {
    if (typeof value !== "boolean") throw new Error("enabled must be a boolean");
    enabled = value;
    return preferences();
  }
  function query(range: string): QuotaHistoryResponse {
    const { start, end } = bounds(range);
    const rows = daily.filter(row => row.date >= start && row.date <= end).map(row => ({ ...row })).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
    const unallocated = segments.filter(segment => segment.date === null && inRange(segment, start, end));
    const summaries = new Map<string, Summary>();
    for (const row of rows) {
      const key = `${row.kind}:${row.windowMinutes}`;
      const summary = summaries.get(key) ?? { kind: row.kind, windowMinutes: row.windowMinutes,
        consumedPercentPoints: null, coveredMinutes: 0, recordedDays: 0, sampleCount: 0, gapCount: 0,
        unallocatedCount: unallocated.filter(segment => segment.kind === row.kind && segment.windowMinutes === row.windowMinutes).length };
      if (row.consumedPercentPoints !== null) {
        summary.consumedPercentPoints = (summary.consumedPercentPoints ?? 0) + row.consumedPercentPoints;
        summary.recordedDays++;
      }
      summary.coveredMinutes += row.coveredMinutes; summary.sampleCount += row.sampleCount; summary.gapCount += row.gapCount;
      summaries.set(key, summary);
    }
    return { schemaVersion: 1, identityRevision: 1, scopeAvailable: true, timezone: TIMEZONE, enabled,
      storageStatus: "ready", readStatus: "ready", updatedAt: referenceTime.toISOString(),
      startDate: start, endDate: end, daily: rows, summaries: [...summaries.values()], unallocatedCount: unallocated.length };
  }

  function queryDay(date: string, kind: string, windowMinutes: number, before?: number | null): QuotaHistoryDayResponse {
    if (!validDate(date) || date > dateKey(new Date())) throw new Error("Invalid quota history date");
    if (kind !== "session" && kind !== "weekly") throw new Error("Invalid quota history kind");
    if (!Number.isSafeInteger(windowMinutes) || windowMinutes <= 0) throw new Error("Invalid quota history windowMinutes");
    if (before != null && (!Number.isSafeInteger(before) || before < 0)) throw new Error("Invalid quota history before cursor");
    const rows = segments.filter(segment => segment.kind === kind && segment.windowMinutes === windowMinutes
      && inRange(segment, date, date) && (before == null || segment.id < before))
      .sort((a, b) => b.id - a.id).map(segment => ({ ...segment }));
    return { schemaVersion: 1, identityRevision: 1, scopeAvailable: true, timezone: TIMEZONE,
      storageStatus: "ready", readStatus: "ready", date, kind, windowMinutes, segments: rows, nextBefore: null };
  }

  function markdown(range: string) {
    const data = query(range);
    const rows = segments.filter(segment => inRange(segment, data.startDate, data.endDate));
    const lines = ["# Codex Pulse — 官方额度合成演示 / Synthetic demo", "", "Synthetic account readings only. Observed changes are measured in percentage points; unknown values remain blank.", "",
      `Timezone: ${TIMEZONE}`, `Range: ${data.startDate} — ${data.endDate}`, "Scope: synthetic current account and source", "",
      "## Daily observations", "", "| Date | Kind | Window minutes | Observed pp | Covered minutes | Samples | Cycles | Gaps | Unallocated | Status | Source |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|"];
    for (const row of data.daily) lines.push(`| ${row.date} | ${row.kind} | ${row.windowMinutes} | ${row.consumedPercentPoints ?? ""} | ${row.coveredMinutes} | ${row.sampleCount} | ${row.cycleCount} | ${row.gapCount} | ${row.unallocatedCount} | ${row.status} | ${row.source} |`);
    function table(title: string, selected: QuotaHistorySegment[]) {
      lines.push("", `## ${title}`, "", "| ID | Date | Kind | Window minutes | Resets at | Start UTC | End UTC | Start used % | End used % | Observed pp | Covered minutes | Reason | Source |",
        "|---:|---|---|---:|---|---|---|---:|---:|---:|---:|---|---|");
      for (const row of selected) lines.push(`| ${row.id} | ${row.date ?? ""} | ${row.kind} | ${row.windowMinutes} | ${row.resetsAt} | ${row.startAt} | ${row.endAt} | ${row.startUsedPercent ?? ""} | ${row.endUsedPercent ?? ""} | ${row.consumedPercentPoints ?? ""} | ${row.coveredMinutes} | ${row.reason} | ${row.source} |`);
    }
    table("Observation segments", rows.filter(row => row.date !== null));
    table("Unallocated cross-day segments", rows.filter(row => row.date === null));
    return lines.join("\n");
  }
  return { preferences, setEnabled, query, queryDay, markdown };
}
