import type { OverviewResponse } from "./api";
import { currentDateInTimezone } from "./trend-buckets";

export type LocalUsageSummary = {
  date: string; timezone: string; updatedAt: string | null; stale: boolean; totalTokens: number;
  projects: { label: string; totalTokens: number; sharePercent: number }[];
  models: { label: string; totalTokens: number; sharePercent: number }[];
};

/** A local-only explanation of today's tokens, never an allocation of account quota. */
export function buildLocalUsageSummary(source: OverviewResponse | null, stale: boolean, now = new Date()): LocalUsageSummary | null {
  if (!source || source.range !== "1d") return null;
  const date = currentDateInTimezone(source.timezone, now);
  const day = source.daily.find(row => row.date === date);
  if (!day || !Number.isSafeInteger(day.totalTokens) || day.totalTokens < 0) return null;
  const projectName = (path: string) => path.replace(/\\/g, "/").split("/").filter(part => part && !/^[A-Za-z]:$/.test(part)).slice(-2).join(" / ").slice(0, 96);
  const rows = (items: { label: string; totalTokens: number }[]) => items
    .filter(row => row.label && Number.isSafeInteger(row.totalTokens) && row.totalTokens > 0 && row.totalTokens <= day.totalTokens)
    .sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 3)
    .map(row => ({ ...row, sharePercent: row.totalTokens / day.totalTokens * 100 }));
  return {
    date, timezone: source.timezone, updatedAt: source.updatedAt, stale, totalTokens: day.totalTokens,
    projects: rows(source.projects.map(row => ({ label: projectName(row.project), totalTokens: row.totalTokens }))),
    models: rows(source.models.map(row => ({ label: row.model.slice(0, 96), totalTokens: row.totalTokens }))),
  };
}
