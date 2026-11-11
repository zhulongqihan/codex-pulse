// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { syntheticCoachSnapshot, type PaceNoticeState } from "@/lib/pulse-pace";
import { noticeStateCopy } from "@/lib/notice-state-copy";
import { PulsePaceBadgeView, PulsePaceCard } from "./pulse-pace";
import { NoticeStatusDetails } from "./notice-status-details";

const now = Date.parse("2026-11-11T10:00:00Z");
const iso = (offset: number) => new Date(now + offset).toISOString();
const handlers = { onRefresh: vi.fn(), onClose: vi.fn(), onDetails: vi.fn() };
beforeEach(async () => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); await i18n.changeLanguage("en"); });

describe("notice disappearance explanation", () => {
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("keeps all confirmed non-active states inspectable and quiet in %s", language => {
    const { rerender } = render(<NoticeStatusDetails language={language} state={{ status: "unknown", checkedAt: null, validUntil: null }}/>);
    for (const status of ["unknown", "none", "expired", "stale", "unavailable"] as const) {
      rerender(<NoticeStatusDetails language={language} state={{ status, checkedAt: status === "unknown" ? null : iso(0), validUntil: status === "expired" ? iso(-60_000) : null }}/>);
      const details = screen.getByTestId("notice-status-details");
      expect(details).not.toHaveAttribute("open"); expect(within(details).getByText(noticeStateCopy(language, status))).toBeVisible();
      fireEvent.click(within(details).getByText(noticeStateCopy(language, status)));
      expect(within(details).getByText(noticeStateCopy(language, `${status}Detail`))).toBeVisible();
      expect(details.querySelector('time[datetime="' + iso(0) + '"]') != null).toBe(status !== "unknown");
      expect(details).not.toHaveTextContent("undefined"); expect(details).not.toHaveTextContent("Invalid Date");
      fireEvent.click(within(details).getByText(noticeStateCopy(language, status)));
    }
  });
  it("keeps unknown explanation available without quota, and omits it in the compact widget", () => {
    const { rerender } = render(<PulsePaceCard data={null} variant="widget" {...handlers}/>);
    expect(screen.getByTestId("notice-status-details")).toHaveAttribute("data-notice-state", "unknown");
    rerender(<PulsePaceCard data={null} variant="compact" {...handlers}/>);
    expect(screen.queryByTestId("notice-status-details")).not.toBeInTheDocument();
  });
  it("removes the active bell and banner on expiry while leaving an explanation", () => {
    const value = syntheticCoachSnapshot("notice", new Date(now));
    const { rerender } = render(<><PulsePaceCard data={value} {...handlers}/><PulsePaceBadgeView data={value} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).toHaveClass("has-reset-notice"); expect(screen.queryByTestId("notice-status-details")).not.toBeInTheDocument();
    value.coachExtras!.resetNotice!.endAt = iso(-1); value.coachExtras!.resetNotice!.startAt = iso(-60_000);
    rerender(<><PulsePaceCard data={value} {...handlers}/><PulsePaceBadgeView data={value} onToggle={vi.fn()}/></>);
    expect(screen.getByTestId("pace-badge")).not.toHaveClass("has-reset-notice"); expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByTestId("notice-status-details")).toHaveAttribute("data-notice-state", "expired");
  });
  it("prioritizes current unavailability and displays the actual last query and previous deadline", () => {
    const state: PaceNoticeState = { status: "unavailable", checkedAt: iso(-30_000), validUntil: iso(-60_000) };
    render(<NoticeStatusDetails state={state} language="en"/>);
    const details = screen.getByTestId("notice-status-details"); fireEvent.click(within(details).getByText(noticeStateCopy("en", "unavailable")));
    expect(details.querySelectorAll("time")).toHaveLength(2); expect(details.querySelector('time[datetime="' + state.checkedAt + '"]')).toBeVisible();
    expect(details.querySelector('time[datetime="' + state.validUntil + '"]')).toBeVisible();
  });
});
