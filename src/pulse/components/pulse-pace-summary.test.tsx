// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { syntheticCoachSnapshot } from "@/lib/pulse-pace";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { PulsePaceSummary } from "./pulse-pace-summary";

const now = Date.parse("2026-11-14T08:00:00Z");
const actions = () => ({ onRefresh: vi.fn(), onDetails: vi.fn(), onRecover: vi.fn() });
beforeEach(async () => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); await i18n.changeLanguage("en"); });
describe("dashboard quota summary", () => {
  it("labels a fresh exhausted reading as current and never formats an invalid timestamp", () => {
    const data = syntheticCoachSnapshot("roomy", new Date(now));
    data.windows[1].remainingPercent = 0;
    const { rerender } = render(<PulsePaceSummary data={data} {...actions()}/>);
    expect(screen.getByText(quotaCoachCopy("en", "remaining"))).toBeInTheDocument();
    expect(screen.queryByText(quotaCoachFeedback("en", "last"))).not.toBeInTheDocument();
    rerender(<PulsePaceSummary data={{...data,updatedAt:"invalid-timestamp"}} {...actions()}/>);
    expect(screen.getByText(paceCopy("en", "never"))).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("shows the existing window and defers full explanations in %s", async language => {
    await i18n.changeLanguage(language);
    render(<PulsePaceSummary data={syntheticCoachSnapshot("roomy", new Date(now))} {...actions()}/>);
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("80");
    expect(screen.getByText(paceSummaryCopy(language, "roomy"))).toBeInTheDocument();
    expect(screen.getByText(quotaCoachFeedback(language, "unknownWindows"))).toBeInTheDocument();
    expect(screen.queryByTestId("coach-reference")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: paceSummaryCopy(language, "details") }));
    expect(screen.getByTestId("coach-reference")).toBeInTheDocument();
  });
  it("retains an old reading with recovery instead of current pacing advice", () => {
    const data = syntheticCoachSnapshot("roomy", new Date(now));
    const handlers = actions();
    render(<PulsePaceSummary data={{...data,refreshFailed:true}} {...handlers}/>);
    expect(screen.getByText(quotaCoachFeedback("en", "last"))).toBeInTheDocument();
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("80");
    expect(screen.queryByText(paceSummaryCopy("en", "roomy"))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: quotaCoachFeedback("en", "recover") }));
    expect(handlers.onRecover).toHaveBeenCalledOnce();
  });
  it("does not turn unavailable data into zero or bypass existing cooldown", () => {
    const handlers = actions();
    const data = syntheticCoachSnapshot("roomy", new Date(now));
    const { rerender } = render(<PulsePaceSummary data={null} {...handlers}/>);
    expect(screen.getByTestId("summary-remaining")).toHaveTextContent("—");
    rerender(<PulsePaceSummary data={{...data,refreshAfterSeconds:300}} {...handlers}/>);
    expect(screen.getByRole("button", { name: paceCopy("en", "refresh") })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("300");
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
