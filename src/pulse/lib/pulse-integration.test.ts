import { describe, expect, it } from "vitest";
import type { CodexLimitsResponse, OverviewResponse } from "./api";
import { buildPulseIntegration } from "./pulse-integration";

const now = new Date("2026-11-08T00:15:00Z");
function overview(): OverviewResponse {
  return { range: "2d", days: 2, timezone: "America/Los_Angeles", startDate: "2026-11-06", endDate: "2026-11-07",
    updatedAt: "2026-11-08T00:10:00Z", daily: [
      { date: "2026-11-06", inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, totalTokens: 110, costUSD: 0.01 },
      { date: "2026-11-07", inputTokens: 200, cachedInputTokens: 40, outputTokens: 20, totalTokens: 220, costUSD: null }],
    totals: { inputTokens: 300, cachedInputTokens: 60, outputTokens: 30, totalTokens: 330, costUSD: null,
      avgTokensPerDay: 165, avgCostPerDay: null, cacheHitRate: 0.2, costPerMillionTokens: null },
    models: [], projects: [{ project: "private-project", displayName: "private-workspace", inputTokens: 300,
      cachedInputTokens: 60, outputTokens: 30, totalTokens: 330, costUSD: null }] };
}
function limits(): CodexLimitsResponse {
  return { session: { usedPercent: 27.75, remainingPercent: 72.25, windowMinutes: 300, resetsAt: "2026-11-08T02:00:00Z" },
    weekly: null, updatedAt: "2026-11-08T00:14:00Z", source: "private-source-path", account: "private-account",
    workspaceName: "private-workspace", membershipLevel: "private-membership", resetCreditsAvailableCount: 2 };
}

describe("local companion summary projection", () => {
  it("canonicalizes the published language and resolved theme without exporting presentation extras",()=>{
    const value=buildPulseIntegration(overview(),limits(),false,false,now,{language:"zh-CN",resolvedTheme:"dark",privateAccount:"must-not-export"} as {language:string;resolvedTheme:string});
    expect(value.presentation).toEqual({language:"zh",resolvedTheme:"dark"});expect(JSON.stringify(value)).not.toContain("must-not-export");
    expect(buildPulseIntegration(null,null,true,true,now,{language:"zh-TW",resolvedTheme:"unknown"}).presentation).toEqual({language:"zh-Hant",resolvedTheme:null});
  });
  it("takes the source timezone's current daily row, never the range aggregate or the host date", () => {
    const value = buildPulseIntegration(overview(), limits(), false, false, now);
    expect(value.today).toMatchObject({ date: "2026-11-07", timezone: "America/Los_Angeles", totalTokens: 220, costUSD: null, stale: false });
    expect(value.today.updatedAt).toBe("2026-11-08T00:10:00Z");
    expect(value.quotaUpdatedAt).toBe("2026-11-08T00:14:00Z");
    expect(value.quotas[0]).toEqual({ kind: "session", windowMinutes: 300, remainingPercent: 72.25, resetsAt: "2026-11-08T02:00:00Z" });
    expect(value.quotas[1]).toEqual({ kind: "weekly", windowMinutes: null, remainingPercent: null, resetsAt: null });
    expect(JSON.stringify(value)).not.toContain("private-");
  });

  it("preserves explicit zero and unknown pricing independently", () => {
    const today = overview(); today.daily[1].totalTokens = 0; today.daily[1].costUSD = 0;
    const quota = limits(); quota.session!.remainingPercent = 0;
    const value = buildPulseIntegration(today, quota, false, false, now);
    expect(value.today.totalTokens).toBe(0); expect(value.today.costUSD).toBe(0);
    expect(value.quotas[0].remainingPercent).toBe(0);
    expect(value.today.stale).toBe(false); expect(value.quotaStale).toBe(false);
  });

  it("does not recycle yesterday's totals at midnight and preserves each source's stale state", () => {
    const nextDay = buildPulseIntegration(overview(), limits(), false, true, new Date("2026-11-08T09:00:00Z"));
    expect(nextDay.today.totalTokens).toBeNull(); expect(nextDay.today.costUSD).toBeNull();
    expect(nextDay.today.stale).toBe(true); expect(nextDay.quotaStale).toBe(true);
    const stale = buildPulseIntegration(overview(), limits(), true, false, now);
    expect(stale.today.stale).toBe(true); expect(stale.quotaStale).toBe(false);
    const missing = buildPulseIntegration(null, null, false, false, now);
    expect(missing.today.totalTokens).toBeNull(); expect(missing.today.stale).toBe(true);
    expect(missing.quotaStale).toBe(true);
  });
});
