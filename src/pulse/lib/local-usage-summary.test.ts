import { describe, expect, it } from "vitest";
import type { OverviewResponse } from "./api";
import { buildLocalUsageSummary } from "./local-usage-summary";

const now = new Date("2026-11-08T01:00:00Z");
function overview(): OverviewResponse {
  const day = { date: "2026-11-08", inputTokens: 700, cachedInputTokens: 200, outputTokens: 300, totalTokens: 1000, costUSD: 0.2 };
  return { range: "1d", days: 1, timezone: "Asia/Shanghai", startDate: day.date, endDate: day.date, updatedAt: "2026-11-08T00:59:00Z", daily: [day], totals: { ...day, avgTokensPerDay: 1000, avgCostPerDay: 0.2, cacheHitRate: 0.2, costPerMillionTokens: 200 }, models: [], projects: [
    { project: "F:\\private\\Team A\\Atlas", displayName: "Atlas", ...day, totalTokens: 620 },
    { project: "F:\\private\\Team B\\Atlas", displayName: "Atlas", ...day, totalTokens: 380 },
  ] };
}
describe("today's local token sources", () => {
  it("distinguishes identically named projects without exporting absolute roots or equating them to quota", () => {
    const result = buildLocalUsageSummary(overview(), false, now)!;
    expect(result.projects.map(row => row.label)).toEqual(["Team A / Atlas", "Team B / Atlas"]);
    expect(result.projects.map(row => row.sharePercent)).toEqual([62, 38]);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("costUSD");
  });
  it("rejects a selected historical range and previous-day rows instead of presenting them as today", () => {
    expect(buildLocalUsageSummary({ ...overview(), range: "30d" }, false, now)).toBeNull();
    expect(buildLocalUsageSummary(overview(), false, new Date("2026-11-09T01:00:00Z"))).toBeNull();
    expect(buildLocalUsageSummary(null, true, now)).toBeNull();
  });
  it("keeps known zero distinct from missing data and drops incompatible source totals", () => {
    const source = overview(); source.daily[0].totalTokens = 0;
    expect(buildLocalUsageSummary(source, false, now)).toMatchObject({ totalTokens: 0, projects: [] });
    source.daily = [];
    expect(buildLocalUsageSummary(source, false, now)).toBeNull();
  });
  it("honors source timezone and stale state near midnight", () => {
    const source = overview(); source.timezone = "America/Los_Angeles"; source.daily[0].date = "2026-11-07";
    expect(buildLocalUsageSummary(source, true, now)).toMatchObject({ date: "2026-11-07", stale: true });
  });
});
