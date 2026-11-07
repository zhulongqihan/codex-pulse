// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { CodexLimitsResponse, OverviewResponse } from "../lib/api";
import { DashboardHeroCard } from "./dashboard-hero-card";

const overview: OverviewResponse = {
  range: "30d", days: 30, timezone: "UTC", startDate: "2026-10-01", endDate: "2026-10-30", updatedAt: null,
  daily: [], models: [], projects: [],
  totals: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0, avgTokensPerDay: 0, avgCostPerDay: 0, cacheHitRate: 0, costPerMillionTokens: 0 },
};

const limits: CodexLimitsResponse = {
  session: null, weekly: null, account: "user@example.com", membershipLevel: "plus", updatedAt: "2026-10-22T00:00:00Z", source: "test",
};

function hero(codexLimits: CodexLimitsResponse | null, usage = overview) {
  return <DashboardHeroCard overview={usage} range="30d" isBusy={false} isExporting={null} onRangeChange={vi.fn()} onExport={vi.fn()} metrics={[]} codexLimits={codexLimits} />;
}

function breakdownOverview(rows: Array<{ name: string; tokens: number; cost: number | null }>, totalCost: number | null): OverviewResponse {
  const parts = rows.map(row => ({ inputTokens: row.tokens, cachedInputTokens: 0, outputTokens: 0, totalTokens: row.tokens, costUSD: row.cost }));
  return {
    ...overview,
    totals: { ...overview.totals, inputTokens: rows.reduce((sum, row) => sum + row.tokens, 0), totalTokens: rows.reduce((sum, row) => sum + row.tokens, 0), costUSD: totalCost },
    projects: rows.map((row, index) => ({ ...parts[index], project: `F:/work/${row.name}`, displayName: row.name })),
    models: rows.map((row, index) => ({ ...parts[index], model: row.name, pricingStatus: row.cost == null ? "unavailable" : row.cost === 0 ? "free" : "priced", inputCostPerMillionTokens: null, cachedInputCostPerMillionTokens: null, outputCostPerMillionTokens: null, effectiveCostPerMillionTokens: null })),
    daily: rows.map((_, index) => ({ ...parts[index], date: `2026-10-${String(index + 1).padStart(2, "0")}` })),
  };
}

describe("Dashboard cost distribution", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each(["Project", "Model", "Dates"])("ranks %s by cost and uses total cost shares when token order disagrees", async (dimension) => {
    const user = userEvent.setup();
    render(hero(null, breakdownOverview([
      { name: "high-volume", tokens: 900, cost: 10 },
      { name: "high-cost", tokens: 100, cost: 90 },
    ], 100)));
    const region = screen.getByRole("region", { name: "Usage breakdown" });
    await user.click(within(region).getByRole("button", { name: new RegExp(`^${dimension}$`) }));
    const labels = dimension === "Dates" ? ["2026-10-01", "2026-10-02"] : ["high-volume", "high-cost"];
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent(labels[0]);

    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    const rows = Array.from(region.querySelectorAll(".pulse-rank-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(labels[1]);
    expect(within(rows[0] as HTMLElement).getByText("$90.00")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("90.0%")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(labels[0]);
    expect(within(rows[1] as HTMLElement).getByText("$10.00")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("10.0%")).toBeInTheDocument();
    expect(rows[0].querySelector(".pulse-rank-track i")).toHaveStyle({ width: "90%" });
  });

  it.each(["Project", "Model", "Dates"])("keeps unknown %s costs last and does not normalize a partial subtotal to 100 percent", async (dimension) => {
    const user = userEvent.setup();
    render(hero(null, breakdownOverview([
      { name: "missing-price", tokens: 600, cost: null },
      { name: "known-price", tokens: 100, cost: 90 },
      { name: "free-route", tokens: 300, cost: 0 },
    ], null)));
    const region = screen.getByRole("region", { name: "Usage breakdown" });
    await user.click(within(region).getByRole("button", { name: new RegExp(`^${dimension}$`) }));
    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    const rows = Array.from(region.querySelectorAll(".pulse-rank-row"));
    const labels = dimension === "Dates" ? ["2026-10-02", "2026-10-03", "2026-10-01"] : ["known-price", "free-route", "missing-price"];
    expect(rows).toHaveLength(3);
    rows.forEach((row, index) => {
      expect(row).toHaveTextContent(labels[index]);
      expect(row.querySelector("small")).toHaveTextContent("—");
    });
    expect(within(rows[0] as HTMLElement).getByText("$90.00")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("$0.00")).toBeInTheDocument();
    expect(rows[2].querySelector("strong")).toHaveTextContent("—");
    expect(region).not.toHaveTextContent("100.0%");
    expect(region).not.toHaveTextContent("NaN");
    expect(screen.getByText(/Partial estimate/)).toBeInTheDocument();
  });

  it("shows an empty cost distribution without invented rows or shares", async () => {
    const user = userEvent.setup();
    render(hero(null));
    const region = screen.getByRole("region", { name: "Usage breakdown" });
    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    expect(within(region).getByText("No records in this range")).toBeInTheDocument();
    expect(region.querySelectorAll(".pulse-rank-row")).toHaveLength(0);
  });

  it("keeps explicit zero cost distinct from unknown shares when the total is zero", async () => {
    const user = userEvent.setup();
    render(hero(null, breakdownOverview([{ name: "free-route", tokens: 100, cost: 0 }], 0)));
    const region = screen.getByRole("region", { name: "Usage breakdown" });
    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    expect(within(region).getByText("$0.00")).toBeInTheDocument();
    expect(region.querySelector(".pulse-rank-row small")).toHaveTextContent("—");
    expect(region).not.toHaveTextContent("NaN");
  });
});

describe("Dashboard credits balance", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    [{ hasCredits: true, unlimited: false, balance: "1250.500001" }, "1250.500001"],
    [{ hasCredits: false, unlimited: false, balance: "0" }, "0"],
    [{ hasCredits: false, unlimited: false, balance: null }, "0"],
    [{ hasCredits: true, unlimited: false, balance: null }, "Unavailable"],
    [{ hasCredits: true, unlimited: false, balance: " " }, "Unavailable"],
    [{ hasCredits: true, unlimited: true, balance: "100" }, "Unlimited"],
    [null, "Unavailable"],
    [undefined, "Unavailable"],
  ] as const)("displays credits state %j as %s", (credits, expected) => {
    render(hero({ ...limits, credits }));

    expect(screen.getByTestId("credits-balance")).toHaveTextContent(`Credits balance: ${expected}`);
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Simulated data")).not.toBeInTheDocument();
  });

  it("updates the balance and clears the simulated label when real data arrives", () => {
    const { rerender } = render(hero({ ...limits, credits: { hasCredits: true, unlimited: false, balance: "1250.5" }, creditsIsMock: true }));
    expect(screen.getByTestId("credits-balance")).toHaveTextContent("1250.5");
    expect(screen.getByText("Simulated data")).toBeInTheDocument();

    rerender(hero({ ...limits, credits: { hasCredits: false, unlimited: false, balance: "0" } }));
    expect(screen.getByTestId("credits-balance")).toHaveTextContent("Credits balance: 0");
    expect(screen.queryByText("Simulated data")).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Credits balance", "Unavailable", "Simulated data"],
    ["zh", "Credits 余额", "暂不可用", "模拟数据"],
    ["zh-Hant", "Credits 餘額", "暫時無法取得", "模擬資料"],
    ["ja", "クレジット残高", "取得できません", "シミュレーションデータ"],
  ])("translates unknown simulated credits in %s", async (language, label, unavailable, mock) => {
    await i18n.changeLanguage(language);
    render(hero({ ...limits, credits: null, creditsIsMock: true }));

    expect(screen.getByTestId("credits-balance")).toHaveTextContent(`${label}: ${unavailable}`);
    expect(screen.getByText(mock)).toBeInTheDocument();
  });

  it("waits for account data before showing the balance", () => {
    render(hero(null));
    expect(screen.queryByTestId("credits-balance")).not.toBeInTheDocument();
  });
});
