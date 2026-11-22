// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { OverviewResponse } from "../lib/api";
import { dashboardCopy } from "../lib/dashboard-copy";
import { quotaHistoryCopy } from "../lib/quota-history-copy";
import { DashboardHeroCard, UsageAnalysisView } from "./dashboard-hero-card";
import { currentDateInTimezone } from "../lib/trend-buckets";

const overview: OverviewResponse = {
  range: "30d", days: 30, timezone: "UTC", startDate: "2026-10-01", endDate: "2026-10-30", updatedAt: null,
  daily: [], models: [], projects: [],
  totals: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0, avgTokensPerDay: 0, avgCostPerDay: 0, cacheHitRate: 0, costPerMillionTokens: 0 },
};

const props = () => ({ overview, range: "30d", isBusy: false, isExporting: null, onRangeChange: vi.fn(), onExport: vi.fn(), metrics: [] });
const row = (date: string, totalTokens: number, costUSD: number | null) => ({ date, inputTokens: totalTokens, cachedInputTokens: 0, outputTokens: 0, totalTokens, costUSD });
const today = () => currentDateInTimezone("UTC");

function analysis(usage = overview) {
  return <UsageAnalysisView {...props()} overview={usage}/>;
}

function breakdownOverview(rows: Array<{ name: string; tokens: number; cost: number | null }>, totalCost: number | null): OverviewResponse {
  const parts = rows.map(item => ({ inputTokens: item.tokens, cachedInputTokens: 0, outputTokens: 0, totalTokens: item.tokens, costUSD: item.cost }));
  return {
    ...overview,
    totals: { ...overview.totals, inputTokens: rows.reduce((sum, item) => sum + item.tokens, 0), totalTokens: rows.reduce((sum, item) => sum + item.tokens, 0), costUSD: totalCost },
    projects: rows.map((item, index) => ({ ...parts[index], project: `F:/work/${item.name}`, displayName: item.name })),
    models: rows.map((item, index) => ({ ...parts[index], model: item.name, pricingStatus: item.cost == null ? "unavailable" : item.cost === 0 ? "free" : "priced", inputCostPerMillionTokens: null, cachedInputCostPerMillionTokens: null, outputCostPerMillionTokens: null, effectiveCostPerMillionTokens: null })),
    daily: rows.map((_, index) => ({ ...parts[index], date: `2026-10-${String(index + 1).padStart(2, "0")}` })),
  };
}

beforeEach(async () => { await i18n.changeLanguage("en"); });

describe("focused dashboard", () => {
  it("puts account and today on separate Paper pages, with one details section below", async () => {
    const user = userEvent.setup();
    const onOpenAnalysis = vi.fn(), onOpenToday = vi.fn(), onOpenHistory = vi.fn();
    render(<DashboardHeroCard timezone={overview.timezone} paperSpread
      todayOverview={{ ...overview, daily: [row(today(), 77, 1.2)] }}
      quotaLimits={<h2>Account quota</h2>} coach={<h2>Account pace</h2>}
      coachDetails={<h2>Full pace details</h2>}
      quotaHistory={<button onClick={onOpenHistory}>Open quota records</button>}
      onOpenAnalysis={onOpenAnalysis} onOpenToday={onOpenToday}/>);
    const [quotaPage, todayPage, pacing, details] = screen.getByTestId("dashboard-hero").children;
    expect(quotaPage).toContainElement(screen.getByRole("heading", { name: "Account quota" }));
    expect(pacing).toContainElement(screen.getByRole("heading", { name: "Account pace" }));
    const todaysSessions = within(todayPage as HTMLElement).getByRole("button", { name: "Today's sessions" });
    const quotaRecords = within(todayPage as HTMLElement).getByRole("button", { name: "Open quota records" });
    const usageAnalysis = within(todayPage as HTMLElement).getByRole("button", { name: "Open usage analysis" });
    expect(todayPage.querySelector(".pulse-dashboard-today-values > div:first-child")).toContainElement(screen.getByTestId("today-tokens"));
    expect(todayPage.querySelector(".pulse-today-breakdown")).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByRole("heading", { name: "Full pace details" }));
    await user.click(todaysSessions);
    await user.click(quotaRecords);
    await user.click(usageAnalysis);
    expect(onOpenToday).toHaveBeenCalledOnce();
    expect(onOpenHistory).toHaveBeenCalledOnce();
    expect(onOpenAnalysis).toHaveBeenCalledOnce();
  });

  it("keeps quota first, emphasizes local tokens over the cost estimate and opens separate analysis", async () => {
    const user = userEvent.setup();
    const onOpenAnalysis = vi.fn(), onOpenToday = vi.fn();
    render(<DashboardHeroCard todayOverview={{ ...overview, daily: [row(today(), 77, 1.2)] }} coach={<section data-testid="quota-summary">Account quota</section>} onOpenAnalysis={onOpenAnalysis} onOpenToday={onOpenToday}/>);
    const hero = screen.getByTestId("dashboard-hero");
    expect(hero.firstElementChild).toBe(screen.getByTestId("quota-summary"));
    expect(screen.getByTestId("today-estimate")).toHaveTextContent("$1.20");
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");
    expect(hero.querySelector(".pulse-dashboard-today-values > div:first-child")).toContainElement(screen.getByTestId("today-tokens"));
    expect(screen.getByText("Estimated from model prices; not an actual bill.")).toBeVisible();
    expect(screen.getByText("Counted separately from account quota")).toBeVisible();
    expect(screen.queryByTestId("range-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("usage-trends-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("credits-balance")).not.toBeInTheDocument();
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Simulated data")).not.toBeInTheDocument();
    expect(hero.querySelector(".pulse-today-breakdown")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Open usage analysis" }));
    await user.click(screen.getByRole("button", { name: "Today's sessions" }));
    expect(onOpenAnalysis).toHaveBeenCalledOnce();
    expect(onOpenToday).toHaveBeenCalledOnce();
  });

  it("shows today's independent snapshot and leaves an unknown estimate unknown", () => {
    const date = today();
    const todayOverview = { ...overview, daily: [row(date, 77, null)] };
    render(<DashboardHeroCard todayOverview={todayOverview}/>);
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");
    expect(screen.getByTestId("today-estimate")).toHaveTextContent("—");
  });

  it("keeps unavailable and yesterday-only readings unknown, disables sessions, and preserves a confirmed zero", () => {
    const onOpenToday = vi.fn();
    const { rerender } = render(<DashboardHeroCard {...props()} onOpenToday={onOpenToday}/>);
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: "Today's sessions" })).toBeDisabled();
    const snapshot = { ...overview, daily: [row("2000-01-01", 10, 1)] };
    rerender(<DashboardHeroCard {...props()} todayOverview={snapshot} onOpenToday={onOpenToday}/>);
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
    rerender(<DashboardHeroCard {...props()} todayOverview={{ ...snapshot, daily: [row(today(), 0, 0)] }} todayStale onOpenToday={onOpenToday}/>);
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("0");
    expect(screen.getByTestId("today-estimate")).toHaveTextContent("$0.00");
    expect(screen.getByTestId("today-summary")).toHaveTextContent("Showing the last successful reading");
    expect(screen.getByRole("button", { name: "Today's sessions" })).toBeEnabled();
    rerender(<DashboardHeroCard {...props()} todayOverview={{ ...snapshot, daily: [row(today(), 1, 1)] }} todayUnavailable onOpenToday={onOpenToday}/>);
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: "Today's sessions" })).toBeDisabled();
  });

  it("does not relabel a retained snapshot as today across a source-timezone midnight", () => {
    vi.useFakeTimers(); let cleanup = () => {};
    try {
      vi.setSystemTime(new Date("2026-11-07T00:15:00Z"));
      const snapshot = { ...overview, timezone: "America/Los_Angeles", daily: [row("2026-11-06", 77, 1)] };
      const rendered = render(<DashboardHeroCard {...props()} todayOverview={snapshot}/>); cleanup = rendered.unmount;
      expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");
      expect(screen.getByTestId("today-summary")).toHaveTextContent("2026-11-06");
      expect(screen.getByTestId("today-timezone")).toHaveTextContent("America/Los_Angeles");
      rendered.rerender(<DashboardHeroCard {...props()} todayOverview={{ ...snapshot, timezone: "Asia/Shanghai" }}/>);
      expect(screen.getByTestId("today-summary")).toHaveTextContent("2026-11-07");
      expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
      expect(screen.getByTestId("today-timezone")).toHaveTextContent("Asia/Shanghai");
    } finally { cleanup(); vi.useRealTimers(); }
  });

  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("translates the separated cost and quota wording in %s", async language => {
    await i18n.changeLanguage(language);
    render(<DashboardHeroCard timezone={overview.timezone} onOpenAnalysis={vi.fn()}/>);
    expect(screen.getByText(dashboardCopy(language, "todayCost"))).toBeVisible();
    expect(screen.getByText(dashboardCopy(language, "estimateNote"))).toBeVisible();
    expect(screen.getByRole("button", { name: dashboardCopy(language, "openAnalysis") })).toBeEnabled();
    expect(screen.getByTestId("today-timezone")).not.toHaveTextContent("reading_context");
  });
});

describe("usage analysis", () => {
  it("defaults both the trend and distribution to tokens and can rank by estimated cost", async () => {
    const user = userEvent.setup();
    render(analysis(breakdownOverview([{ name: "high-volume", tokens: 900, cost: 10 }, { name: "high-cost", tokens: 100, cost: 90 }], 100)));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    const explanation = within(region).getByTestId("distribution-scope");
    expect(explanation).toHaveTextContent("2026-10-01 — 2026-10-30");
    expect(explanation).toHaveTextContent("Share of local tokens in the selected period; separate from account quota.");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("high-volume");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("90.0%");
    expect(within(region).getByRole("button", { name: "Tokens" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("group", { name: "Trend view" })).getByRole("button", { name: "Tokens" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("range-summary").querySelector(".pulse-analysis-totals dt")).toHaveTextContent("Period tokens");
    await user.click(within(region).getByRole("button", { name: "API estimate" }));
    expect(explanation).toHaveTextContent("Share of this period’s API estimate");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("high-cost");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("90.0%");
    expect(screen.queryByTestId("today-summary")).not.toBeInTheDocument();
  });

  it("shows local estimates for the selected period, including quota-only dates and known zero", async () => {
    const user = userEvent.setup();
    const daily = [
      { ...row("2026-10-01", 0, null), fiveHourPercent: 150.5 },
      { ...row("2026-10-02", 100, 1), fiveHourPercent: 2, weeklyPercent: 0 },
      row("2026-10-03", 100, 1),
    ];
    const { rerender } = render(analysis({ ...overview, daily, retainedFrom: "2026-10-02" }));
    const mode = screen.getByRole("button", { name: "Local quota estimate" });
    expect(mode).toHaveAttribute("aria-pressed", "false");
    mode.focus();
    await user.keyboard("{Enter}");
    expect(mode).toHaveFocus();
    const summary = screen.getByRole("group", { name: "Sum of recorded portions" });
    expect(summary).toHaveTextContent("5-hour window152.5 ppDays observed (2/30)");
    expect(summary).toHaveTextContent("7-day window0 ppDays observed (1/30)");
    expect(summary).toHaveTextContent("local session logs");
    expect(summary).toHaveTextContent("other devices");
    expect(screen.getByRole("button", { name: "2026-10-01 · Local quota estimate 150.5 pp" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show data table" }));
    const table = within(screen.getByRole("table"));
    expect(table.getByRole("columnheader", { name: "5-hour window" })).toBeVisible();
    expect(table.getByText("150.5 pp")).toBeVisible();
    expect(table.getByText("0 pp")).toBeVisible();
    expect(table.getAllByText("No samples")).toHaveLength(3);

    rerender(analysis({ ...overview, daily: [daily[2]], days: 7 }));
    expect(within(summary).getAllByText("Not observed")).toHaveLength(2);
    expect(within(summary).getAllByText("Days observed (0/7)")).toHaveLength(2);
    expect(within(summary).queryByText("0 pp")).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Period usage breakdown"], ["zh", "所选时段用量分布"], ["zh-Hant", "所選時段用量分布"],
    ["ja", "選択期間の使用量内訳"], ["ko", "선택 기간 사용량 분석"], ["de", "Verteilung im gewählten Zeitraum"],
  ])("labels period scope and source timezone in %s", async (language, title) => {
    await i18n.changeLanguage(language);
    render(analysis({ ...overview, timezone: "America/New_York" }));
    expect(screen.getByRole("heading", { name: dashboardCopy(language, "analysis"), level: 1 })).toBeVisible();
    const region = screen.getByRole("region", { name: title });
    expect(within(region).getByTestId("distribution-scope")).toHaveTextContent("2026-10-01 — 2026-10-30");
    expect(screen.getByTestId("analysis-timezone")).toHaveTextContent("America/New_York");
    expect(screen.getByTestId("analysis-timezone")).not.toHaveTextContent("reading_context");
    expect(region).not.toHaveTextContent("reading_context");
    await userEvent.click(screen.getByRole("button", { name: quotaHistoryCopy(language, "localEstimate") }));
    expect(screen.getByText(quotaHistoryCopy(language, "localEstimateNote"))).toBeVisible();
  });

  it.each(["Project", "Model", "Dates"])("ranks %s by actual costs when token order disagrees", async dimension => {
    const user = userEvent.setup();
    render(analysis(breakdownOverview([{ name: "high-volume", tokens: 900, cost: 10 }, { name: "high-cost", tokens: 100, cost: 90 }], 100)));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    await user.click(within(region).getByRole("button", { name: "API estimate" }));
    await user.click(within(region).getByRole("button", { name: new RegExp(`^${dimension}$`) }));
    const rows = Array.from(region.querySelectorAll(".pulse-rank-row"));
    const labels = dimension === "Dates" ? ["2026-10-02", "2026-10-01"] : ["high-cost", "high-volume"];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(labels[0]);
    expect(rows[1]).toHaveTextContent(labels[1]);
    expect(within(rows[0] as HTMLElement).getByText("$90.00")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("90.0%")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("$10.00")).toBeInTheDocument();
    expect(rows[0].querySelector(".pulse-rank-track i")).toHaveStyle({ width: "90%" });
  });

  it.each(["Project", "Model", "Dates"])("keeps unknown %s costs last without turning the known subtotal into 100 percent", async dimension => {
    const user = userEvent.setup();
    render(analysis(breakdownOverview([{ name: "missing-price", tokens: 600, cost: null }, { name: "known-price", tokens: 100, cost: 90 }, { name: "free-route", tokens: 300, cost: 0 }], null)));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    await user.click(within(region).getByRole("button", { name: "API estimate" }));
    await user.click(within(region).getByRole("button", { name: new RegExp(`^${dimension}$`) }));
    const rows = Array.from(region.querySelectorAll(".pulse-rank-row"));
    const labels = dimension === "Dates" ? ["2026-10-02", "2026-10-03", "2026-10-01"] : ["known-price", "free-route", "missing-price"];
    expect(rows).toHaveLength(3);
    rows.forEach((item, index) => { expect(item).toHaveTextContent(labels[index]); expect(item.querySelector("small")).toHaveTextContent("—"); });
    expect(within(rows[0] as HTMLElement).getByText("$90.00")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("$0.00")).toBeInTheDocument();
    expect(rows[2].querySelector("strong")).toHaveTextContent("—");
    expect(region).not.toHaveTextContent("100.0%");
    expect(region).not.toHaveTextContent("NaN");
    expect(screen.getByTestId("analysis-pricing-coverage")).toHaveTextContent(/Partial estimate/);
    expect(within(screen.getByTestId("range-summary")).getByText("Period API cost estimate").nextElementSibling).toHaveTextContent("—");
  });

  it("shows an empty distribution without invented rows or shares and keeps an explicit zero distinct from unknown", async () => {
    const { rerender } = render(analysis());
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    expect(within(region).getByText("No records in this range")).toBeInTheDocument();
    expect(region.querySelectorAll(".pulse-rank-row")).toHaveLength(0);
    rerender(analysis(breakdownOverview([{ name: "free-route", tokens: 100, cost: 0 }], 0)));
    await userEvent.click(within(region).getByRole("button", { name: "API estimate" }));
    expect(within(region).getByText("$0.00")).toBeInTheDocument();
    expect(region.querySelector(".pulse-rank-row small")).toHaveTextContent("—");
    expect(region).not.toHaveTextContent("NaN");
  });

  it("changes the requested range and exports each supported format without hiding export failures", async () => {
    const user = userEvent.setup();
    const handlers = props();
    render(<UsageAnalysisView {...handlers} exportError="Synthetic destination unavailable"/>);
    await user.click(screen.getByRole("button", { name: "Select time range" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Last 7 Days" }));
    expect(handlers.onRangeChange).toHaveBeenCalledExactlyOnceWith("7d");
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Excel (.xlsx)" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Markdown (.md)" }));
    expect(handlers.onExport.mock.calls.map(call => call[0])).toEqual(["xlsx", "markdown"]);
    expect(screen.getByTestId("export-error")).toHaveTextContent("Synthetic destination unavailable");
    expect(screen.getByTestId("usage-trends-card")).toBeVisible();
  });

  it("updates all historical summaries and rankings from the new snapshot while retaining full-list access", async () => {
    const user = userEvent.setup();
    const first = breakdownOverview(Array.from({ length: 7 }, (_, index) => ({ name: `project-${index}`, tokens: 100, cost: index + 1 })), 28);
    const { rerender } = render(analysis(first));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    expect(region.querySelectorAll(".pulse-rank-row")).toHaveLength(5);
    await user.click(within(region).getByRole("button", { name: "Show all (7)" }));
    expect(region.querySelectorAll(".pulse-rank-row")).toHaveLength(7);
    const next = { ...breakdownOverview([{ name: "new-period", tokens: 222, cost: 4 }], 4), startDate: "2026-10-24", days: 7 };
    rerender(<UsageAnalysisView {...props()} range="7d" overview={next}/>);
    expect(screen.getByTestId("range-summary")).toHaveTextContent("2026-10-24 — 2026-10-30");
    expect(screen.getByTestId("range-summary")).toHaveTextContent("222");
    expect(within(region).getByTestId("distribution-scope")).toHaveTextContent("2026-10-24 — 2026-10-30");
    expect(region.querySelectorAll(".pulse-rank-row")).toHaveLength(1);
    expect(region).toHaveTextContent("new-period");
  });
});
