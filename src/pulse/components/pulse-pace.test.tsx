// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { noticeStateCopy } from "@/lib/notice-state-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { syntheticPaceSnapshot, type PaceResetNotice, type PaceSnapshot } from "@/lib/pulse-pace";
import { formatCoachCountdown, formatCoachReset, quotaCoachBadgeCopy, quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { PulsePaceBadgeView, PulsePaceCard } from "./pulse-pace";
import { readingGuidanceCopy } from "@/lib/reading-guidance-copy";

const now = Date.parse("2026-11-09T08:00:00Z");
const iso = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
beforeEach(async () => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); history.replaceState(null, "", "/"); await i18n.changeLanguage("en"); });
const actions = () => ({ onRefresh: vi.fn(), onClose: vi.fn(), onDetails: vi.fn() });
const timeInfo = (language = "en") => screen.getByRole("button", { name: quotaCoachClarity(language, "explain") });
function cycle(remaining = 80): PaceSnapshot {
  const data = syntheticPaceSnapshot("idle", new Date(now));
  data.primaryKind = "weekly";
  Object.assign(data.windows[0], { state: "unavailable", remainingPercent: null, windowMinutes: null, resetsAt: null });
  Object.assign(data.windows[1], { state: "idle", remainingPercent: remaining, resetsAt: iso(7260), windowMinutes: 10080 });
  return data;
}
const notice = (): PaceResetNotice => ({ id: "synthetic-notice", summary: "Synthetic maintenance under review", sourceUrl: "https://example.org/notice", sourceLabel: "Example third-party feed", startAt: iso(60), endAt: iso(120), publishedAt: iso(-10), updatedAt: iso(-1), isUnread: true, verification: "third_party", scope: "global" });
function withNotice(data = cycle()) { data.coachExtras = { dailyObservations: [], resetNotice: notice() }; return data; }
function recentDepletion(remaining = 77): PaceSnapshot {
  const data = cycle(remaining);
  Object.assign(data.windows[1], { state: "forecast", resetsAt: iso(10080 * 0.71), sampleCount: 7, sampleSpanMinutes: 30, rateLowerPerHour: 2, rateUpperPerHour: 3, trend: [{ at: iso(0), remainingPercent: remaining }] });
  return data;
}

describe("shared cycle pace card", () => {
  it("shows only the marked reset, usage comparison and last check in the title-bar hint", async () => {
    await i18n.changeLanguage("zh");
    const data = cycle(56), checkedAt = iso(-10), resetsAt = iso(5342);
    data.windows[1].resetsAt = resetsAt;
    data.coachExtras = { dailyObservations: [], resetNotice: null, noticeState: { status: "none", checkedAt, validUntil: null } };
    render(<PulsePaceCard data={data} {...actions()}/>);
    fireEvent.click(timeInfo("zh"));
    const tooltip = await screen.findByRole("tooltip");
    expect(Array.from(tooltip.children, row => row.textContent)).toEqual([
      quotaCoachCopy("zh", "resetAt", { time: formatCoachReset(Date.parse(resetsAt), "zh") }),
      "额度已用44%，周期时间已过47%",
      noticeStateCopy("zh", "checked", { time: formatCoachReset(Date.parse(checkedAt), "zh") }),
    ]);
    expect(tooltip.querySelector("time")).toHaveAttribute("datetime", checkedAt);
  });
  it("omits unavailable lines and hides the title-bar hint when no reading is available", async () => {
    const data = cycle(), checkedAt = iso(-10);
    const handlers = actions();
    const { rerender } = render(<PulsePaceCard data={data} {...handlers}/>);
    fireEvent.click(timeInfo());
    expect((await screen.findByRole("tooltip")).children).toHaveLength(2);
    fireEvent.click(timeInfo());
    rerender(<PulsePaceCard data={null} {...handlers}/>);
    expect(screen.queryByRole("button", { name: quotaCoachClarity("en", "explain") })).not.toBeInTheDocument();
    const empty: PaceSnapshot = { ...data, windows: [], updatedAt: null, coachExtras: { dailyObservations: [], resetNotice: null, noticeState: { status: "none", checkedAt, validUntil: null } } };
    rerender(<PulsePaceCard data={empty} {...handlers}/>);
    fireEvent.click(timeInfo());
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.children).toHaveLength(1);
    expect(tooltip.querySelector("time")).toHaveAttribute("datetime", checkedAt);
  });
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("replaces empty expanded widget placeholders with honest guidance and recovery in %s", async language => {
    await i18n.changeLanguage(language);
    const onRecover = vi.fn(), handlers = actions();
    const { rerender } = render(<PulsePaceCard data={null} variant="widget" onRecover={onRecover} {...handlers}/>);
    expect(screen.queryByTestId("coach-remaining")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-countdown")).not.toBeInTheDocument();
    expect(screen.getByTestId("widget-empty-guide")).toHaveTextContent(readingGuidanceCopy(language, "emptyNext"));
    expect(screen.queryByText(readingGuidanceCopy(language, "emptyObservation"))).not.toBeInTheDocument();
    fireEvent.click(timeInfo(language));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(readingGuidanceCopy(language, "emptyObservation"));
    fireEvent.click(timeInfo(language));
    expect(screen.queryByTestId("coach-cycle-observations")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: quotaCoachFeedback(language, "recover") }));
    expect(onRecover).toHaveBeenCalledOnce();
    rerender(<PulsePaceCard data={null} failed variant="widget" onRecover={onRecover} {...handlers}/>);
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy(language, "failed"));
    fireEvent.click(screen.getByRole("button", { name: paceCopy(language, "refresh") }));
    expect(handlers.onRefresh).toHaveBeenCalledOnce();
    rerender(<PulsePaceCard data={cycle(0)} variant="widget" {...handlers}/>);
    expect(screen.queryByTestId("widget-empty-guide")).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("0%");
    const retained = cycle(80); retained.updatedAt = iso(-10);
    rerender(<PulsePaceCard data={retained} variant="widget" {...handlers}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.queryByTestId("widget-empty-guide")).not.toBeInTheDocument();
  });
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("keeps the nominal time basis and returned windows in the workspace in %s", async language => {
    await i18n.changeLanguage(language);
    const data = cycle(), handlers = actions();
    const { rerender } = render(<PulsePaceCard data={data} variant="workspace" {...handlers}/>);
    expect(screen.queryByText(quotaCoachClarity(language, "timeMethod"))).not.toBeInTheDocument();
    fireEvent.click(timeInfo(language));
    const info = await screen.findByRole("tooltip");
    expect(info).toHaveTextContent(quotaCoachClarity(language, "timeMethod"));
    expect(within(info).getByTestId("coach-time-basis")).toHaveTextContent("→");
    fireEvent.click(timeInfo(language));
    const details = screen.getByTestId("coach-window-details");
    const summary = details.querySelector("summary")!;
    expect(details.tagName).toBe("DETAILS");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    const rows = within(screen.getByTestId("coach-window-list")).getAllByRole("listitem");
    expect(rows).toHaveLength(data.windows.length);
    expect(rows[0]).toHaveAttribute("data-reading-state", "unavailable");
    expect(rows[1]).toHaveAttribute("data-reading-state", "ready");
    expect(within(rows[1]).getByText(quotaCoachClarity(language, "selected"))).toBeVisible();
    expect(handlers.onRefresh).not.toHaveBeenCalled(); expect(handlers.onDetails).not.toHaveBeenCalled();
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    const stale = cycle(); stale.updatedAt = iso(-7);
    rerender(<PulsePaceCard data={stale} variant="workspace" {...handlers}/>);
    expect(within(details).queryByText(quotaCoachClarity(language, "selected"))).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-window-list").querySelector('[data-window-kind="weekly"]')).toHaveAttribute("data-reading-state", "stale");
  });
  it.each([59, 60, 1439, 1440])("uses an understandable reference at %s minutes until a weekly reset", minutes => {
    const data = cycle(); data.windows[1].resetsAt = iso(minutes);
    render(<PulsePaceCard data={data} {...actions()}/>);
    const title = minutes < 60 ? quotaCoachClarity("en", "untilReference") : quotaCoachCopy("en", minutes < 1440 ? "hourReference" : "dayReference");
    expect(screen.getByRole("region", { name: title })).toBeVisible();
    expect(screen.getByTestId("coach-reference")).not.toHaveTextContent("1920");
    if (minutes < 60) expect(screen.getByTestId("coach-reference")).toHaveTextContent("80% remaining");
  });
  it("prioritizes the empty compact state and account recovery, retaining genuine stale and zero readings", () => {
    const empty = { ...cycle(), windows: [], updatedAt: null, reason: "offline" };
    const onRecover = vi.fn();
    const { rerender } = render(<PulsePaceCard data={empty} variant="compact" onRecover={onRecover} {...actions()}/>);
    expect(screen.queryByTestId("coach-remaining")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-countdown")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "unavailable"));
    expect(screen.queryByText(/Offline mode/)).not.toBeInTheDocument();
    const info = screen.getByRole("button", { name: quotaCoachClarity("en", "explain") });
    fireEvent.click(info);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Offline mode");
    fireEvent.click(info);
    fireEvent.click(screen.getByRole("button", { name: "Check account and connection" }));
    expect(onRecover).toHaveBeenCalledOnce();
    const stale = cycle(); stale.updatedAt = iso(-10);
    rerender(<PulsePaceCard data={stale} variant="compact" {...actions()}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.getByText("Last reading")).toBeVisible();
    rerender(<PulsePaceCard data={cycle(0)} variant="compact" {...actions()}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("0%");
  });
  it("keeps compact cooldown and reading age together without a separate footer paragraph", () => {
    const data = { ...cycle(), generatedAt: iso(0), refreshAfterSeconds: 25 };
    render(<PulsePaceCard data={data} variant="compact" {...actions()}/>);
    const wait = screen.getByTestId("coach-refresh-wait");
    expect(wait.tagName).toBe("SPAN");
    expect(wait.parentElement).toHaveTextContent("Read just now");
    expect(wait).toHaveTextContent("Retry in 25s");
    expect(wait).toHaveAttribute("title", expect.stringContaining("retry in 25s"));
    expect(screen.getByRole("button", { name: "Refresh account readings" })).toBeDisabled();
  });
  it("labels retained compact readings, their age and a direct refresh without hiding the failure", () => {
    const data = cycle(); data.updatedAt = iso(-10);
    const handlers = actions(); render(<PulsePaceCard data={data} variant="compact" {...handlers}/>);
    expect(screen.getByText("Last reading")).toBeVisible();
    expect(screen.getByText("Read 10 min ago")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "stale"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh account readings" }));
    expect(handlers.onRefresh).toHaveBeenCalledOnce();
  });
  it("explains the returned refresh gate and reenables refresh when its actual delay passes", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(now); vi.spyOn(Date, "now").mockImplementation(() => new Date().getTime());
      const data = { ...cycle(), generatedAt: iso(0), refreshAfterSeconds: 2 };
      render(<PulsePaceCard data={data} variant="workspace" {...actions()}/>);
      expect(screen.getByRole("button", { name: "Refresh account readings" })).toBeDisabled();
      expect(screen.getByTestId("coach-refresh-wait")).toHaveTextContent("Retry in 2s");
      expect(screen.getByTestId("coach-refresh-wait").tagName).toBe("SPAN");
      expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument();
      fireEvent.click(timeInfo());
      expect(within(screen.getByRole("tooltip")).getByText(/^Updated /)).toHaveAttribute("datetime", data.updatedAt);
      act(() => { vi.advanceTimersByTime(3000); });
      expect(screen.getByRole("button", { name: "Refresh account readings" })).toBeEnabled();
      expect(screen.queryByTestId("coach-refresh-wait")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("keeps account recovery visible and shows the login explanation on demand", async () => {
    const data = cycle(); data.reason = "login_required"; data.windows = []; data.updatedAt = null;
    const onRecover = vi.fn(); render(<PulsePaceCard data={data} variant="workspace" onRecover={onRecover} {...actions()}/>);
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "unavailable"));
    expect(screen.queryByText(/Sign in with the official Codex/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: quotaCoachClarity("en", "explain") }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Sign in with the official Codex");
    fireEvent.click(screen.getByRole("button", { name: quotaCoachClarity("en", "explain") }));
    fireEvent.click(screen.getByRole("button", { name: "Check account and connection" })); expect(onRecover).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("coach-cycle-observations")).not.toBeInTheDocument();
  });
  it("keeps a single qualified notice and the actionable judgment in compact view", () => {
    render(<PulsePaceCard data={withNotice()} variant="compact" {...actions()}/>);
    expect(screen.getAllByText("Third-party notice · unconfirmed")).toHaveLength(1);
    expect(screen.getByText(quotaCoachCopy("en", "roomyAdvice"))).toBeVisible();
  });
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("renders both approved states with the same time and full comparison in %s", async language => {
    await i18n.changeLanguage(language);
    const { rerender } = render(<PulsePaceCard data={cycle(80)} {...actions()}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.getByTestId("coach-countdown")).toHaveTextContent(formatCoachCountdown(7260, language));
    expect(screen.queryByTestId("coach-comparison")).not.toBeInTheDocument();
    fireEvent.click(timeInfo(language));
    expect(within(await screen.findByRole("tooltip")).getByTestId("coach-comparison")).toHaveTextContent(quotaCoachCopy(language, "comparison", { used: 20, elapsed: 28 }));
    fireEvent.click(timeInfo(language));
    expect(screen.getByText(quotaCoachCopy(language, "roomyLabel"))).toBeVisible();
    expect(screen.getByTestId("coach-reference")).toHaveTextContent("16");
    rerender(<PulsePaceCard data={cycle(20)} {...actions()}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("20%");
    expect(screen.getByTestId("coach-countdown")).toHaveTextContent(formatCoachCountdown(7260, language));
    expect(screen.getByText(quotaCoachCopy(language, "fastLabel"))).toBeVisible();
    expect(screen.getByTestId("coach-reference")).toHaveTextContent("4");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not let local tokens replace the quota core or treat a missing short window as exhaustion", () => {
    const data = cycle(); data.localUsage!.totalTokens = 343_000_000;
    render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByText("7-day window")).toBeVisible();
    expect(screen.queryByText(quotaCoachCopy("en", "scope"), { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(quotaCoachCopy("en", "roomyLabel"))).toBeVisible();
    expect(screen.queryByText("343,000,000")).not.toBeInTheDocument();
    expect(screen.queryByText(paceCopy("en", "sessionMissing"))).not.toBeInTheDocument();
  });

  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("keeps the cycle baseline but warns about fresh recent depletion in %s", async language => {
    await i18n.changeLanguage(language);
    const data = recentDepletion();
    const { rerender } = render(<><PulsePaceCard data={data} {...actions()}/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("77%");
    fireEvent.click(timeInfo(language));
    expect(within(await screen.findByRole("tooltip")).getByTestId("coach-comparison")).toHaveTextContent(quotaCoachCopy(language, "comparison", { used: 23, elapsed: 29 }));
    fireEvent.click(timeInfo(language));
    expect(screen.getByTestId("pace-popover")).toHaveClass("tone-roomy", "has-recent-depletion");
    expect(screen.getByTestId("pace-popover")).not.toHaveClass("tone-fast");
    expect(screen.getByText(quotaCoachCopy(language, "recentRiskAdvice"))).toBeVisible();
    expect(screen.getByText(quotaCoachCopy(language, "projectedDepletion"))).toBeVisible();
    expect(screen.queryByText(quotaCoachCopy(language, "roomyAdvice"))).not.toBeInTheDocument();
    expect(screen.getByTestId("pace-popover")).not.toHaveTextContent("0–0%");
    expect(screen.getByTestId("pace-badge")).toHaveTextContent(quotaCoachCopy(language, "recentRisk"));
    rerender(<PulsePaceCard data={data} variant="compact" {...actions()}/>);
    expect(screen.getByTestId("pace-popover")).toHaveClass("has-recent-depletion");
    expect(screen.getByText(quotaCoachCopy(language, "recentRisk"))).toBeVisible();
  });

  it("also warns for a balanced cycle, then restores ordinary guidance when the forecast is unavailable", () => {
    const data = recentDepletion(71);
    const { rerender } = render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByTestId("pace-popover")).toHaveClass("tone-balanced", "has-recent-depletion");
    expect(screen.getByText(quotaCoachCopy("en", "recentRiskAdvice"))).toBeVisible();
    data.windows[1].state = "idle";
    rerender(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByTestId("pace-popover")).not.toHaveClass("has-recent-depletion");
    expect(screen.getByText(quotaCoachCopy("en", "balancedAdvice"))).toBeVisible();
    expect(screen.queryByText(quotaCoachCopy("en", "projectedDepletion"))).not.toBeInTheDocument();
  });

  it("keeps stale/failure and an unread notice ahead of the recent-pace label", () => {
    const data = withNotice(recentDepletion());
    const { rerender } = render(<><PulsePaceCard data={data} {...actions()}/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent("Reset notice");
    expect(screen.getByText(quotaCoachCopy("en", "recentRiskAdvice"))).toBeVisible();
    data.updatedAt = iso(-7);
    rerender(<><PulsePaceCard data={data} {...actions()}/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "stale"));
    expect(screen.queryByText(quotaCoachCopy("en", "recentRiskAdvice"))).not.toBeInTheDocument();
    expect(screen.getByTestId("pace-popover")).not.toHaveClass("has-recent-depletion");
    data.updatedAt = iso(0);
    rerender(<PulsePaceCard data={data} failed {...actions()}/>);
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "failed"));
    expect(screen.queryByText(quotaCoachCopy("en", "recentRiskAdvice"))).not.toBeInTheDocument();
  });

  it.each(["failed", "stale", "exhausted", "expired", "unavailable"] as const)("keeps %s ahead of reassuring pace guidance", status => {
    const data = cycle();
    if (status === "stale") data.updatedAt = iso(-7);
    if (status === "exhausted") data.windows[1].remainingPercent = 0;
    if (status === "expired") data.windows[1].resetsAt = iso(-1);
    if (status === "unavailable") { data.windows[1].remainingPercent = null; data.windows[1].resetsAt = null; }
    render(<><PulsePaceCard data={data} failed={status === "failed"} {...actions()}/><PulsePaceBadgeView data={data} failed={status === "failed"} onToggle={vi.fn()}/></>);
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", status));
    expect(screen.getByTestId("pace-popover")).not.toHaveClass("tone-roomy");
    expect(screen.queryByTestId("coach-reference")).not.toBeInTheDocument();
    expect(screen.getByTestId("pace-badge")).toHaveTextContent(quotaCoachBadgeCopy("en", status));
  });

  it("selects a depleted short window rather than the older weekly primary", () => {
    const data = cycle(); Object.assign(data.windows[0], { windowMinutes: 300, resetsAt: iso(120), remainingPercent: 0, state: "exhausted" });
    render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("0%");
    expect(screen.getByText("5-hour window")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", "exhausted"));
  });

  it("preserves keyboard close, details, and a visibly pending refresh in the popover", () => {
    const handlers = actions(); render(<PulsePaceCard data={cycle()} refreshing {...handlers}/>);
    expect(screen.getByRole("button", { name: "Close usage rhythm" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Refresh account readings" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" }); expect(handlers.onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "View usage details" })); expect(handlers.onDetails).toHaveBeenCalledOnce();
  });
  it("opens reference guidance on hover or keyboard focus and dismisses it before the pace panel", async () => {
    const handlers = actions(), user = userEvent.setup();
    render(<PulsePaceCard data={cycle()} {...handlers}/>);
    const explanation = quotaCoachCopy("en", "referenceNote");
    const reference = within(screen.getByRole("region", { name: quotaCoachCopy("en", "dayReference") }));
    const trigger = reference.getByRole("button", { name: quotaCoachCopy("en", "dayReference") });
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation);
    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    // jsdom does not infer keyboard modality for the focus-visible pseudo-class.
    const matches = trigger.matches.bind(trigger);
    vi.spyOn(trigger, "matches").mockImplementation(selector => selector === ":focus-visible" || matches(selector));
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it.each(["workspace", "widget", "compact"] as const)("reuses the same metrics without an extra close action in %s", variant => {
    const handlers = actions(); render(<PulsePaceCard data={cycle()} variant={variant} {...handlers}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.getByTestId("coach-countdown")).toHaveTextContent("5d 1h");
    expect(screen.queryByRole("button", { name: "Close usage rhythm" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" }); expect(handlers.onClose).not.toHaveBeenCalled();
    if (variant === "compact") { expect(screen.queryByTestId("coach-reference")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "View usage details" })).not.toBeInTheDocument(); }
  });

  it("shows a fresh global notice and only marks its explicit ID read from the read button", async () => {
    const data = withNotice(), onRead = vi.fn();
    const { rerender } = render(<><PulsePaceCard data={data} {...actions()} onMarkNoticeRead={onRead}/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent("Reset notice");
    const banner = screen.getByRole("note", { name: "Reset notice" });
    expect(within(banner).getByText(quotaCoachCopy("en", "noticeClass"))).toBeVisible();
    const link = within(banner).getByRole("link", { name: /Example third-party feed/ });
    expect(link).toHaveAttribute("href", "https://example.org/notice");
    expect(within(banner).queryByText(quotaCoachCopy("en", "noticeScope"))).not.toBeInTheDocument();
    fireEvent.click(within(banner).getByRole("button", { name: quotaCoachCopy("en", "noticeClass") }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(quotaCoachCopy("en", "noticeScope"));
    fireEvent.click(within(banner).getByRole("button", { name: quotaCoachCopy("en", "noticeClass") }));
    expect(onRead).not.toHaveBeenCalled();
    fireEvent.click(within(banner).getByRole("button", { name: "Mark read" }));
    expect(onRead).toHaveBeenCalledExactlyOnceWith("synthetic-notice");
    data.coachExtras!.resetNotice!.isUnread = false;
    rerender(<><PulsePaceCard data={data} {...actions()} onMarkNoticeRead={onRead}/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).not.toHaveTextContent("Reset notice");
    expect(screen.getByRole("note", { name: "Reset notice" })).toHaveTextContent("Read");
  });

  it.each(["failed", "stale", "exhausted", "expired", "unavailable"] as const)("keeps the %s label and an unread notice indicator together", status => {
    const data = withNotice();
    if (status === "stale") data.updatedAt = iso(-7);
    if (status === "exhausted") data.windows[1].remainingPercent = 0;
    if (status === "expired") data.windows[1].resetsAt = iso(-1);
    if (status === "unavailable") { data.windows[1].remainingPercent = null; data.windows[1].resetsAt = null; }
    render(<><PulsePaceCard data={data} failed={status === "failed"} {...actions()}/><PulsePaceBadgeView data={data} failed={status === "failed"} onToggle={vi.fn()}/></>);
    const badge = screen.getByTestId("pace-badge");
    expect(badge).toHaveTextContent(quotaCoachBadgeCopy("en", status));
    expect(badge).toHaveAccessibleName(expect.stringContaining(quotaCoachCopy("en", status)));
    expect(badge).toHaveClass("has-reset-notice");
    expect(badge).toHaveAccessibleName(expect.stringContaining("Reset notice"));
    expect(badge).toHaveAttribute("title", expect.stringContaining("Example third-party feed"));
    expect(screen.getByRole("status")).toHaveTextContent(quotaCoachCopy("en", status));
    expect(screen.getByRole("note", { name: "Reset notice" })).toBeVisible();
  });

  it("reports an explicit notice acknowledgement failure without hiding the quota state", () => {
    const data = withNotice(); data.windows[1].remainingPercent = 0;
    render(<><PulsePaceCard data={data} {...actions()} onMarkNoticeRead={vi.fn()} noticeFailed/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent(quotaCoachBadgeCopy("en", "exhausted"));
    expect(screen.getByRole("alert")).toHaveTextContent(quotaCoachCopy("en", "markFailed"));
    expect(screen.getByRole("note", { name: "Reset notice" })).toBeVisible();
  });

  it("leaves daily observations out of the card even when valid observations were returned", async () => {
    const data = cycle(); data.coachExtras = { observedWindow: { kind: "weekly", windowMinutes: 10080, resetsAt: data.windows[1].resetsAt! }, resetNotice: null, dailyObservations: [{ date: "2026-11-08", consumedPercentPoints: null, coveredMinutes: 0, partial: true }, { date: "2026-11-09", consumedPercentPoints: 0, coveredMinutes: 30, partial: true }] };
    render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.queryByTestId("coach-cycle-observations")).not.toBeInTheDocument();
    fireEvent.click(timeInfo());
    const information = await screen.findByRole("tooltip");
    expect(within(information).queryByText("Not observed")).not.toBeInTheDocument();
    expect(within(information).queryByText("0 pp")).not.toBeInTheDocument();
  });

  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("labels demo cards and compact badges without adding a brand word in %s", async language => {
    await i18n.changeLanguage(language); history.replaceState(null, "", "/?demo=1#pulse-pace");
    render(<><PulsePaceCard data={cycle()} {...actions()}/><PulsePaceBadgeView data={cycle()} onToggle={vi.fn()}/></>);
    expect(within(screen.getByTestId("pace-popover")).getByText(paceCopy(language, "demo"))).toBeVisible();
    expect(screen.getByTestId("pace-badge")).toHaveAccessibleName(expect.stringContaining(paceCopy(language, "demo")));
    expect(screen.getByTestId("pace-badge")).not.toHaveTextContent("Pulse");
  });
});
