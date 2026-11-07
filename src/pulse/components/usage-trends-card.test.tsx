// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageTrendsCard, UsageTrendTooltip, niceScale } from "./usage-trends-card";
import i18n from "@/i18n";
import type { OverviewResponse } from "@/lib/api";
import { defaultPulsePreferences, updatePulsePreferences } from "@/lib/pulse-appearance";

const daily: OverviewResponse["daily"] = [
  {date:"2026-10-25",inputTokens:100,cachedInputTokens:20,outputTokens:30,totalTokens:130,costUSD:1,fiveHourPercent:150,weeklyPercent:10},
  {date:"2026-10-26",inputTokens:200,cachedInputTokens:40,outputTokens:60,totalTokens:260,costUSD:null,fiveHourPercent:null,weeklyPercent:0},
  {date:"2026-10-27",inputTokens:300,cachedInputTokens:60,outputTokens:90,totalTokens:390,costUSD:3,fiveHourPercent:25,weeklyPercent:5},
];
beforeEach(async()=>{await i18n.changeLanguage("en");await updatePulsePreferences(defaultPulsePreferences);});
describe("Pulse full-range trends",()=>{
  it("uses an opaque tooltip and never counts cached input twice",()=>{
    const {container}=render(<UsageTrendTooltip active payload={[{payload:{date:"2026-10-25",inputTokens:100,cachedInputTokens:20,outputTokens:30,costUSD:null}}]} t={i18n.t}/>);
    expect(container.firstElementChild).toHaveClass("bg-surface");
    expect(screen.getByText("130")).toBeInTheDocument();expect(screen.queryByText("150")).not.toBeInTheDocument();expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("preserves compact tooltip totals from the chart payload",()=>{
    render(<UsageTrendTooltip active compact label="10/25" payload={[{dataKey:"totalTokens",value:120},{dataKey:"costUSD",value:.25}]} t={i18n.t}/>);
    expect(screen.getByText("120")).toBeInTheDocument();expect(screen.getByText("$0.25")).toBeInTheDocument();expect(screen.queryByText(i18n.t("project_modal.input"))).not.toBeInTheDocument();
  });
  it("keeps every day accessible beyond seven days in both skins",async()=>{
    const days=Array.from({length:31},(_,index)=>({...daily[0],date:`2026-10-${String(index+1).padStart(2,"0")}`}));
    const {container}=render(<UsageTrendsCard daily={days} metrics={[]} cacheHitRate={.2}/>);
    expect(container.querySelectorAll(".pulse-trend-day")).toHaveLength(31);expect(screen.getByRole("button",{name:/2026-10-01 · Tokens/})).toBeInTheDocument();
    await act(()=>updatePulsePreferences({skinId:"meter"}));expect(container.querySelectorAll(".pulse-trend-day")).toHaveLength(31);expect(screen.getByRole("button",{name:/2026-10-31 · Tokens/})).toHaveAttribute("aria-pressed","true");
  });
  it("toggles token series without changing selected-day totals",async()=>{
    const user=userEvent.setup();const {container}=render(<UsageTrendsCard daily={daily} metrics={[]} cacheHitRate={.2}/>);
    const input=screen.getByRole("button",{name:"Uncached input"});await user.click(input);expect(input).toHaveAttribute("aria-pressed","false");expect(container.querySelectorAll(".pulse-trend-bar .pulse-series-input")).toHaveLength(0);expect(container.querySelector(".pulse-day-inspector")).toHaveTextContent("390");await user.click(input);expect(container.querySelectorAll(".pulse-trend-bar .pulse-series-input")).toHaveLength(3);
  });
  it("uses independent units and preserves missing quota observations and values over 100%",async()=>{
    const user=userEvent.setup();const {container}=render(<UsageTrendsCard daily={daily} metrics={[]} cacheHitRate={.2}/>);const modes=within(screen.getByRole("group",{name:"Trend view"}));
    await user.click(modes.getByRole("button",{name:"API estimate"}));expect(container.querySelector(".pulse-chart-scale")).toHaveTextContent("$");expect(screen.getByRole("button",{name:"2026-10-26 · API estimate —"})).toBeInTheDocument();expect(container.querySelectorAll(".pulse-series-cost.is-unknown")).toHaveLength(1);
    await user.click(modes.getByRole("button",{name:"Observed quota"}));expect(container.querySelector(".pulse-chart-scale")).toHaveTextContent("200%");expect(container.querySelector(".pulse-chart-scale")).not.toHaveTextContent("$");expect(container.querySelectorAll(".pulse-series-five-hour.is-unknown")).toHaveLength(1);expect(screen.getByRole("button",{name:"2026-10-25 · Observed quota 150%"})).toBeInTheDocument();
    const legend=screen.getByRole("button",{name:"5h usage"});await user.click(legend);expect(legend).toHaveAttribute("aria-pressed","false");await user.click(modes.getByRole("button",{name:"Tokens"}));await user.click(modes.getByRole("button",{name:"Observed quota"}));expect(screen.getByRole("button",{name:"5h usage"})).toHaveAttribute("aria-pressed","false");
  });
  it("distinguishes absent quota observations from a known zero",async()=>{
    const user=userEvent.setup();const {rerender}=render(<UsageTrendsCard daily={[{...daily[0],fiveHourPercent:null,weeklyPercent:null}]} metrics={[]} cacheHitRate={.2}/>);await user.click(screen.getByRole("button",{name:"Observed quota"}));expect(screen.getByRole("status")).toHaveTextContent("No quota data for this period");rerender(<UsageTrendsCard daily={[{...daily[0],fiveHourPercent:0,weeklyPercent:0}]} metrics={[]} cacheHitRate={.2}/>);expect(screen.queryByRole("status")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"2026-10-25 · Observed quota 0%"})).toBeInTheDocument();
  });
  it("preserves date, hidden series and each skin's reading position across appearance changes",async()=>{
    const user=userEvent.setup();const {container}=render(<UsageTrendsCard daily={daily} metrics={[]} cacheHitRate={.2}/>);await user.click(screen.getByRole("button",{name:/2026-10-25 · Tokens/}));await user.click(screen.getByRole("button",{name:"Cached input"}));const scroll=container.querySelector<HTMLElement>(".pulse-chart-scroll")!;scroll.scrollTop=120;fireEvent.scroll(scroll);
    await act(()=>updatePulsePreferences({skinId:"meter",theme:"dark",motionLevel:"off",compactMode:true}));expect(screen.getByRole("button",{name:/2026-10-25 · Tokens/})).toHaveAttribute("aria-pressed","true");expect(screen.getByRole("button",{name:"Cached input"})).toHaveAttribute("aria-pressed","false");await act(()=>updatePulsePreferences({skinId:"clear"}));expect(scroll.scrollTop).toBe(120);expect(document.documentElement.dataset.motion).toBe("off");
  });
  it("supports keyboard date navigation and opens the selected day",async()=>{
    const user=userEvent.setup();const open=vi.fn();render(<UsageTrendsCard daily={daily} metrics={[]} cacheHitRate={.2} onOpenDay={open}/>);screen.getByRole("button",{name:/2026-10-25 · Tokens/}).focus();await user.keyboard("{ArrowRight}");expect(screen.getByRole("button",{name:/2026-10-26 · Tokens/})).toHaveFocus();await user.click(screen.getByRole("button",{name:"View this day’s sessions"}));expect(open).toHaveBeenCalledWith("2026-10-26");
  });
  it("retains the selected mode in full screen and restores focus on Escape",async()=>{
    const user=userEvent.setup();render(<UsageTrendsCard daily={daily} metrics={[]} cacheHitRate={.2}/>);await user.click(screen.getByRole("button",{name:"Observed quota"}));await user.click(screen.getByRole("button",{name:"Full screen"}));const dialog=within(screen.getByRole("dialog",{name:"Daily usage"}));expect(dialog.getByRole("button",{name:"Observed quota"})).toHaveAttribute("aria-pressed","true");expect(document.body.style.overflow).toBe("hidden");await user.keyboard("{Escape}");expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(document.body.style.overflow).toBe("");expect(screen.getByRole("button",{name:"Full screen"})).toHaveFocus();
  });
  it("shows a full data table with unknown costs intact",async()=>{
    const user=userEvent.setup();render(<UsageTrendsCard daily={daily} metrics={[]} cacheHitRate={.2}/>);await user.click(screen.getByRole("button",{name:"Show data table"}));const rows=within(screen.getByRole("table")).getAllByRole("row");expect(rows).toHaveLength(4);expect(rows[2]).toHaveTextContent("2026-10-26");expect(rows[2]).toHaveTextContent("—");
  });
  it("rounds a common scale instead of normalizing every bar",()=>{expect(niceScale(150)).toBe(200);expect(niceScale(2_400_000)).toBe(2_500_000);expect(niceScale(0)).toBe(1);});
});
