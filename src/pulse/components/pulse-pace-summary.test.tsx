// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { syntheticCoachSnapshot } from "@/lib/pulse-pace";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { PulsePaceSummary } from "./pulse-pace-summary";

const now = Date.parse("2026-11-14T08:00:00Z");
const actions = () => ({ onRefresh: vi.fn(), onDetails: vi.fn(), onRecover: vi.fn() });
beforeEach(async () => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); await i18n.changeLanguage("en"); });
describe("dashboard quota summary", () => {
  it("labels a fresh exhausted reading as current and omits an unknown update time for retained quota", () => {
    const data = syntheticCoachSnapshot("roomy", new Date(now));
    data.windows[1].remainingPercent = 0;
    const { rerender } = render(<PulsePaceSummary data={data} {...actions()}/>);
    expect(screen.getByText(quotaCoachCopy("en", "remaining"))).toBeInTheDocument();
    expect(screen.queryByText(quotaCoachFeedback("en", "last"))).not.toBeInTheDocument();
    rerender(<PulsePaceSummary data={{...data,updatedAt:"invalid-timestamp"}} {...actions()}/>);
    expect(screen.queryByText(paceCopy("en", "never"))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: quotaCoachClarity("en", "explain") }));
    expect(screen.queryByText(paceCopy("en", "never"))).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("shows the existing window and defers full explanations in %s", async language => {
    await i18n.changeLanguage(language);
    render(<PulsePaceSummary data={syntheticCoachSnapshot("roomy", new Date(now))} {...actions()}/>);
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("80");
    expect(screen.getByText(paceSummaryCopy(language, "roomy"))).toBeInTheDocument();
    expect(screen.queryByText(quotaCoachFeedback(language, "unknownWindows"))).not.toBeInTheDocument();
    expect(screen.queryByText(paceSummaryCopy(language, "used"))).not.toBeInTheDocument();
    const info = screen.getByRole("button", { name: quotaCoachClarity(language, "explain") });
    fireEvent.click(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(quotaCoachFeedback(language, "unknownWindows"));
    fireEvent.click(info);
    expect(screen.queryByTestId("coach-reference")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: paceSummaryCopy(language, "details") }));
    expect(screen.getByTestId("coach-reference")).toBeInTheDocument();
  });
  it("shows one failure status and a recovery action with the explanation in the info button", async () => {
    const data = syntheticCoachSnapshot("roomy", new Date(now));
    const handlers = actions();
    render(<PulsePaceSummary data={{...data,refreshFailed:true}} {...handlers}/>);
    expect(screen.getByText(quotaCoachFeedback("en", "last"))).toBeInTheDocument();
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("80");
    expect(screen.queryByText(paceSummaryCopy("en", "roomy"))).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "failed"));
    expect(screen.queryByText(quotaCoachCopy("en", "failedDetail"))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: quotaCoachClarity("en", "explain") }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(quotaCoachCopy("en", "failedDetail"));
    expect(tooltip).toHaveTextContent("20% of quota used at the last reading. 28.6% of the window time elapsed");
    fireEvent.click(screen.getByRole("button", { name: quotaCoachClarity("en", "explain") }));
    fireEvent.click(screen.getByRole("button", { name: quotaCoachFeedback("en", "recover") }));
    expect(handlers.onRecover).toHaveBeenCalledOnce();
  });
  it.each(["stale", "expired"] as const)("preserves the precision of the last %s reading", status => {
    const data = syntheticCoachSnapshot("balanced", new Date(now));
    if (status === "stale") data.updatedAt = new Date(now - 420_000).toISOString();
    else data.windows[1].resetsAt = new Date(now - 60_000).toISOString();
    render(<PulsePaceSummary data={data} {...actions()}/>);
    expect(screen.getByText(quotaCoachFeedback("en", "last"))).toBeVisible();
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("71.4%");
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", status));
    expect(screen.queryByTestId("coach-reference")).not.toBeInTheDocument();
  });
  it("surfaces the projected depletion of a fast cycle before external details open", () => {
    const data = syntheticCoachSnapshot("fast", new Date(now));
    Object.assign(data.windows[1], {
      state: "forecast", rateLowerPerHour: 2, rateUpperPerHour: 3,
    });
    render(<PulsePaceSummary data={data} detailsPlacement="external" expanded={false} {...actions()}/>);
    expect(screen.getByText("Recent observations point to possible depletion before reset.")).toBeVisible();
    expect(screen.queryByTestId("pace-popover")).not.toBeInTheDocument();
  });
  it("does not turn unavailable data into zero or bypass existing cooldown", () => {
    const handlers = actions();
    const data = syntheticCoachSnapshot("roomy", new Date(now));
    const { rerender } = render(<PulsePaceSummary data={null} {...handlers}/>);
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("—");
    rerender(<PulsePaceSummary data={{...data,refreshAfterSeconds:300}} {...handlers}/>);
    expect(screen.getByRole("button", { name: paceCopy("en", "refresh") })).toBeDisabled();
    expect(screen.getByRole("timer")).toHaveTextContent("300");
    expect(handlers.onRefresh).not.toHaveBeenCalled();
  });
  it("keeps a valid unread notice visible and preserves the mark-read action in details", () => {
    const mark = vi.fn();
    render(<PulsePaceSummary data={syntheticCoachSnapshot("notice", new Date(now))} onMarkNoticeRead={mark} {...actions()}/>);
    fireEvent.click(screen.getByRole("button", { name: quotaCoachFeedback("en", "noticeCompact") }));
    expect(mark).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: quotaCoachCopy("en", "markRead") }));
    expect(mark).toHaveBeenCalledWith("synthetic-reset-notice-v3");
  });
});
