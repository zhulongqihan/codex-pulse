import { describe, expect, it } from "vitest";
import { compareKnownCosts, costPerMillion, sumKnownCosts } from "./costs";
import { sortProjects } from "./project-analytics";
import { formatCurrency, formatCurrencyShort } from "./formatters";
import type { OverviewResponse } from "./api";

describe("honest reference cost estimates", () => {
  it("keeps a known zero distinct from missing or invalid prices", () => {
    expect(sumKnownCosts([0, 0])).toBe(0);
    for (const missing of [null, undefined, NaN, Infinity, -1]) {
      expect(sumKnownCosts([12.5, missing])).toBeNull();
    }
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrencyShort(NaN)).toBe("—");
    expect(formatCurrency(0)).not.toBe("—");
    expect(costPerMillion(null, 100)).toBeNull();
    expect(costPerMillion(0, 0)).toBeNull();
    expect(costPerMillion(3, 1_000_000)).toBe(3);
  });

  it("sorts unavailable costs last in both directions without merging identical project names", () => {
    type Project = OverviewResponse["projects"][number];
    const row = (path: string, costUSD: number | null): Project => ({ project: path, displayName: "app", inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2, costUSD });
    const rows = [row("/a/app", null), row("/b/app", 0), row("/c/app", 5)];
    expect(sortProjects(rows, "cost", "asc").map(row => row.project)).toEqual(["/b/app", "/c/app", "/a/app"]);
    expect(sortProjects(rows, "cost", "desc").map(row => row.project)).toEqual(["/c/app", "/b/app", "/a/app"]);
    expect(compareKnownCosts(null, 0, "asc")).toBe(1);
  });
});
