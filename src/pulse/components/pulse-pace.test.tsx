// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { syntheticPaceSnapshot, type PaceResetNotice, type PaceSnapshot } from "@/lib/pulse-pace";
import { formatCoachCountdown, quotaCoachBadgeCopy, quotaCoachCopy } from "@/lib/quota-pace-coach-copy";
import { PulsePaceBadgeView, PulsePaceCard } from "./pulse-pace";

const now = Date.parse("2026-11-09T08:00:00Z");
const iso = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
beforeEach(async () => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); history.replaceState(null, "", "/"); await i18n.changeLanguage("en"); });
const actions = () => ({ onRefresh: vi.fn(), onClose: vi.fn(), onDetails: vi.fn() });
function cycle(remaining = 80): PaceSnapshot {
  const data = syntheticPaceSnapshot("idle", new Date(now));
  data.primaryKind = "weekly";
  Object.assign(data.windows[0], { state: "unavailable", remainingPercent: null, windowMinutes: null, resetsAt: null });
  Object.assign(data.windows[1], { state: "idle", remainingPercent: remaining, resetsAt: iso(7260), windowMinutes: 10080 });
  return data;
}
const notice = (): PaceResetNotice => ({ id: "synthetic-notice", summary: "Synthetic maintenance under review", sourceUrl: "https://example.org/notice", sourceLabel: "Example third-party feed", startAt: iso(60), endAt: iso(120), publishedAt: iso(-10), updatedAt: iso(-1), isUnread: true, verification: "third_party", scope: "global" });
function withNotice(data = cycle()) { data.coachExtras = { dailyObservations: [], resetNotice: notice() }; return data; }

describe("shared cycle pace card", () => {
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("renders both approved states with the same time and full comparison in %s", async language => {
    await i18n.changeLanguage(language);
    const { rerender } = render(<PulsePaceCard data={cycle(80)} {...actions()}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.getByTestId("coach-countdown")).toHaveTextContent(formatCoachCountdown(7260, language));
    expect(screen.getByTestId("coach-comparison")).toHaveTextContent(quotaCoachCopy(language, "comparison", { used: 20, elapsed: 28 }));
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
    expect(screen.getByText(quotaCoachCopy("en", "scope"), { exact: false })).toBeVisible();
    expect(screen.getByText(quotaCoachCopy("en", "roomyLabel"))).toBeVisible();
    expect(screen.queryByText("343,000,000")).not.toBeInTheDocument();
    expect(screen.queryByText(paceCopy("en", "sessionMissing"))).not.toBeInTheDocument();
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

  it.each(["workspace", "widget", "compact"] as const)("reuses the same metrics without an extra close action in %s", variant => {
    const handlers = actions(); render(<PulsePaceCard data={cycle()} variant={variant} {...handlers}/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.getByTestId("coach-countdown")).toHaveTextContent("5d 1h");
    expect(screen.queryByRole("button", { name: "Close usage rhythm" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" }); expect(handlers.onClose).not.toHaveBeenCalled();
    if (variant === "compact") { expect(screen.queryByTestId("coach-reference")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "View usage details" })).not.toBeInTheDocument(); }
  });

  it("shows a fresh global notice and only marks its explicit ID read from the read button", () => {
    const data = withNotice(), onRead = vi.fn();
    const { rerender } = render(<><PulsePaceCard data={data} {...actions()} onMarkNoticeRead={onRead}/><PulsePaceBadgeView data={data} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent("Reset notice");
    const banner = screen.getByRole("note", { name: "Reset notice" });
    expect(within(banner).getByText(quotaCoachCopy("en", "noticeClass"))).toBeVisible();
    const link = within(banner).getByRole("link", { name: /Example third-party feed/ });
    expect(link).toHaveAttribute("href", "https://example.org/notice");
    expect(within(banner).getByText(quotaCoachCopy("en", "noticeScope"))).toBeVisible();
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

  it("preserves unknown versus recorded zero and hides another window's daily history", () => {
    const data = cycle(); data.coachExtras = { observedWindow: { kind: "weekly", windowMinutes: 10080, resetsAt: data.windows[1].resetsAt! }, resetNotice: null, dailyObservations: [{ date: "2026-11-08", consumedPercentPoints: null, coveredMinutes: 0, partial: true }, { date: "2026-11-09", consumedPercentPoints: 0, coveredMinutes: 30, partial: true }] };
    const { rerender } = render(<PulsePaceCard data={data} {...actions()}/>);
    fireEvent.click(screen.getByText("Daily observations this cycle"));
    expect(screen.getByText("Not observed")).toBeVisible(); expect(screen.getByText("0 pp")).toBeVisible();
    expect(screen.getByText(quotaCoachCopy("en", "dailyNote"))).toBeVisible();
    data.coachExtras.observedWindow!.resetsAt = iso(9999); rerender(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.queryByText("Daily observations this cycle")).not.toBeInTheDocument();
  });

  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("labels demo cards and compact badges without adding a brand word in %s", async language => {
    await i18n.changeLanguage(language); history.replaceState(null, "", "/?demo=1#pulse-pace");
    render(<><PulsePaceCard data={cycle()} {...actions()}/><PulsePaceBadgeView data={cycle()} onToggle={vi.fn()}/></>);
    expect(within(screen.getByTestId("pace-popover")).getByText(paceCopy(language, "demo"))).toBeVisible();
    expect(screen.getByTestId("pace-badge")).toHaveAccessibleName(expect.stringContaining(paceCopy(language, "demo")));
    expect(screen.getByTestId("pace-badge")).not.toHaveTextContent("Pulse");
  });
});
