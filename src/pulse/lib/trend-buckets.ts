import type { OverviewResponse } from "./api";

type Day = OverviewResponse["daily"][number];
export type TrendBucket = Day & { startDate: string; endDate: string; count: number };

/** Contiguous groups retain every natural day. A partially priced group stays unknown. */
export function buildTrendBuckets(daily: Day[], maximum = 60): TrendBucket[] {
  const ordered = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const stride = Math.max(1, Math.ceil(ordered.length / Math.max(1, Math.floor(maximum))));
  const result: TrendBucket[] = [];
  for (let index = 0; index < ordered.length; index += stride) {
    const days = ordered.slice(index, index + stride);
    const sum = (key: "inputTokens" | "cachedInputTokens" | "outputTokens" | "totalTokens") => days.reduce((total, day) => total + day[key], 0);
    // Percentages belong to different windows. A group shows a peak, never their sum.
    const quotaPeak = (key: "fiveHourPercent" | "weeklyPercent") => days.some(day => day[key] == null)
      ? null : Math.max(...days.map(day => day[key] as number));
    result.push({ date: days.at(-1)!.date, startDate: days[0].date, endDate: days.at(-1)!.date, count: days.length,
      inputTokens: sum("inputTokens"), cachedInputTokens: sum("cachedInputTokens"), outputTokens: sum("outputTokens"), totalTokens: sum("totalTokens"),
      costUSD: days.some(day => day.costUSD == null) ? null : days.reduce((total, day) => total + day.costUSD!, 0),
      fiveHourPercent: quotaPeak("fiveHourPercent"), weeklyPercent: quotaPeak("weeklyPercent"),
    });
  }
  return result;
}

export function currentDateInTimezone(timezone?: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}-${parts.find(part => part.type === "day")!.value}`;
  } catch { return now.toLocaleDateString("sv-SE"); }
}
