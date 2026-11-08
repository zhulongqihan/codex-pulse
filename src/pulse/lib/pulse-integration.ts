import type { CodexLimitsResponse, OverviewResponse } from "./api";
import { currentDateInTimezone } from "./trend-buckets";

/** Raw, identity-free projection for the local Codex companion. */
export type PulseIntegrationData = {
  schemaVersion: 1;
  today: { date: string; timezone: string; totalTokens: number | null; costUSD: number | null; updatedAt: string | null; stale: boolean };
  quotas: { kind: "session" | "weekly"; windowMinutes: number | null; remainingPercent: number | null; resetsAt: string | null }[];
  quotaUpdatedAt: string | null;
  quotaStale: boolean;
};

export function buildPulseIntegration(today: OverviewResponse | null, limits: CodexLimitsResponse | null, todayStale: boolean, quotaStale: boolean, now = new Date()): PulseIntegrationData {
  const timezone = today?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = currentDateInTimezone(timezone, now);
  const row = today?.daily.find(day => day.date === date);
  return {
    schemaVersion: 1,
    today: { date, timezone, totalTokens: row?.totalTokens ?? null, costUSD: row?.costUSD ?? null, updatedAt: today?.updatedAt ?? null, stale: todayStale || !row },
    quotas: (["session", "weekly"] as const).map(kind => {
      const window = limits?.[kind];
      return { kind, windowMinutes: window?.windowMinutes ?? null, remainingPercent: window?.remainingPercent ?? null, resetsAt: window?.resetsAt ?? null };
    }),
    quotaUpdatedAt: limits?.updatedAt ?? null,
    quotaStale: quotaStale || !limits,
  };
}
