// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { CodexLimitsResponse, OverviewResponse } from "../lib/api";
import { DashboardHeroCard } from "./dashboard-hero-card";
import { currentDateInTimezone } from "../lib/trend-buckets";

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

  it("explains the selected period and changes the share denominator with the metric", async () => {
    const user = userEvent.setup();
    render(hero(null, breakdownOverview([
      { name: "high-volume", tokens: 900, cost: 10 },
      { name: "high-cost", tokens: 100, cost: 90 },
    ], 100)));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    const explanation = within(region).getByTestId("distribution-scope");
    expect(explanation).toHaveTextContent("2026-10-01 — 2026-10-30");
    expect(explanation).toHaveTextContent("Share of local tokens in the selected period; separate from account quota.");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("90.0%");
    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    expect(explanation).toHaveTextContent("Share of this period’s API estimate");
    expect(explanation).toHaveTextContent("unknown prices keep shares unknown");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("high-cost");
    expect(region.querySelector(".pulse-rank-row")).toHaveTextContent("90.0%");
  });

  it.each([
    ["en", "Period usage breakdown"], ["zh", "所选时段用量分布"],
    ["zh-Hant", "所選時段用量分布"], ["ja", "選択期間の使用量内訳"],
    ["ko", "선택 기간 사용량 분석"], ["de", "Verteilung im gewählten Zeitraum"],
  ])("labels period scope and actual source time zone in %s", async (language, title) => {
    await i18n.changeLanguage(language);
    render(hero(null, { ...overview, timezone: "America/New_York" }));
    const region = screen.getByRole("region", { name: title });
    expect(within(region).getByTestId("distribution-scope")).toHaveTextContent("2026-10-01 — 2026-10-30");
    expect(screen.getByTestId("today-timezone")).toHaveTextContent("America/New_York");
    expect(screen.getByTestId("today-timezone")).not.toHaveTextContent("reading_context");
    expect(region).not.toHaveTextContent("reading_context");
  });

  it.each(["Project", "Model", "Dates"])("ranks %s by cost and uses total cost shares when token order disagrees", async (dimension) => {
    const user = userEvent.setup();
    render(hero(null, breakdownOverview([
      { name: "high-volume", tokens: 900, cost: 10 },
      { name: "high-cost", tokens: 100, cost: 90 },
    ], 100)));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
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
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
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
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    expect(within(region).getByText("No records in this range")).toBeInTheDocument();
    expect(region.querySelectorAll(".pulse-rank-row")).toHaveLength(0);
  });

  it("keeps explicit zero cost distinct from unknown shares when the total is zero", async () => {
    const user = userEvent.setup();
    render(hero(null, breakdownOverview([{ name: "free-route", tokens: 100, cost: 0 }], 0)));
    const region = screen.getByRole("region", { name: "Period usage breakdown" });
    await user.click(within(region).getByRole("button", { name: /^API estimate$/ }));
    expect(within(region).getByText("$0.00")).toBeInTheDocument();
    expect(region.querySelector(".pulse-rank-row small")).toHaveTextContent("—");
    expect(region).not.toHaveTextContent("NaN");
  });
});

describe("stable today and separate period",()=>{
  beforeEach(async()=>{await i18n.changeLanguage("en");});
  const row=(date:string,totalTokens:number,costUSD:number|null)=>({date,inputTokens:totalTokens,cachedInputTokens:0,outputTokens:0,totalTokens,costUSD});
  const today=()=>currentDateInTimezone("UTC");
  it("keeps today's 77 independent of a 9,999 period and historical hover, then restores the selected day",async()=>{
    const user=userEvent.setup();const date=today();const oneDay={...overview,range:"1d",days:1,startDate:date,endDate:date,daily:[row(date,77,null)],totals:{...overview.totals,totalTokens:77,costUSD:null}};
    const range={...overview,daily:[row("2020-01-01",9999,10),row(date,77,1)],totals:{...overview.totals,totalTokens:9999,costUSD:10}};
    render(<DashboardHeroCard overview={range} todayOverview={oneDay} range="30d" isBusy={false} isExporting={null} onRangeChange={vi.fn()} onExport={vi.fn()} metrics={[]} codexLimits={null}/>);
    expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");expect(screen.getByTestId("today-estimate")).toHaveTextContent("—");expect(screen.getByTestId("range-summary")).toHaveTextContent("9,999");
    const historical=screen.getByRole("button",{name:/2020-01-01 · Tokens/});fireEvent.mouseEnter(historical);
    expect(screen.getByTestId("trend-inspector")).toHaveTextContent("Preview");expect(screen.getByTestId("trend-inspector")).toHaveTextContent("9,999");expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");
    fireEvent.mouseLeave(historical.closest(".pulse-chart-scroll")!);expect(screen.getByTestId("trend-inspector")).toHaveTextContent(date);expect(screen.getByTestId("trend-inspector")).toHaveTextContent("77");
    await user.click(historical);fireEvent.mouseLeave(historical.closest(".pulse-chart-scroll")!);expect(historical).toHaveAttribute("aria-pressed","true");
    await user.click(screen.getByRole("button",{name:"Back to today"}));expect(screen.getByTestId("trend-inspector")).toHaveTextContent(date);expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");
  });
  it("keeps unavailable and yesterday-only readings unknown, while a confirmed zero remains zero",()=>{
    const range={...overview,totals:{...overview.totals,totalTokens:9999}};
    const {rerender}=render(hero(null,range));expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
    const snapshot={...overview,daily:[row("2000-01-01",10,1)]};
    const props={overview:range,range:"30d",isBusy:false,isExporting:null,onRangeChange:vi.fn(),onExport:vi.fn(),metrics:[],codexLimits:null};
    rerender(<DashboardHeroCard {...props} todayOverview={snapshot}/>);expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
    rerender(<DashboardHeroCard {...props} todayOverview={{...snapshot,daily:[row(today(),0,0)]}} todayStale/>);expect(screen.getByTestId("today-tokens")).toHaveTextContent("0");expect(screen.getByTestId("today-estimate")).toHaveTextContent("$0.00");expect(screen.getByTestId("today-summary")).toHaveTextContent("Showing the last successful reading");
  });
  it("does not relabel a retained snapshot as today after midnight in another source timezone",()=>{
    vi.useFakeTimers();let cleanup=()=>{};
    try {
      vi.setSystemTime(new Date("2026-11-07T00:15:00Z"));
      const snapshot={...overview,timezone:"America/Los_Angeles",daily:[row("2026-11-06",77,1)]};
      const props={overview,range:"30d",isBusy:false,isExporting:null,onRangeChange:vi.fn(),onExport:vi.fn(),metrics:[],codexLimits:null};
      const rendered=render(<DashboardHeroCard {...props} todayOverview={snapshot}/>);cleanup=rendered.unmount;
      expect(screen.getByTestId("today-tokens")).toHaveTextContent("77");expect(screen.getByTestId("today-summary")).toHaveTextContent("2026-11-06");
      expect(screen.getByTestId("today-timezone")).toHaveTextContent("America/Los_Angeles");
      rendered.rerender(<DashboardHeroCard {...props} todayOverview={{...snapshot,timezone:"Asia/Shanghai"}}/>);
      expect(screen.getByTestId("today-summary")).toHaveTextContent("2026-11-07");expect(screen.getByTestId("today-tokens")).toHaveTextContent("—");
      expect(screen.getByTestId("today-timezone")).toHaveTextContent("Asia/Shanghai");
    } finally {cleanup();vi.useRealTimers();}
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
