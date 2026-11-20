// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { syntheticCoachSnapshot } from "@/lib/pulse-pace";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { PulseCoachOverview } from "./pulse-coach-overview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const now = Date.parse("2026-11-14T08:00:00Z");
const actions = { onDetails: vi.fn(), onRecover: vi.fn() };
const split = ({ summary, details }: Parameters<NonNullable<ComponentProps<typeof PulseCoachOverview>["children"]>>[0]) =>
  <><div data-testid="summary-slot">{summary}</div><div data-testid="details-slot">{details}</div></>;

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(invoke).mockReset().mockResolvedValue(syntheticCoachSnapshot("roomy", new Date(now)));
  await i18n.changeLanguage("en");
});

describe("workspace pace slots", () => {
  it("opens one separate details region and returns focus to its summary trigger on close", async () => {
    const user = userEvent.setup();
    render(<PulseCoachOverview {...actions} observationsExpanded={false}>{split}</PulseCoachOverview>);
    const entry = screen.getByRole("button", { name: paceSummaryCopy("en", "details") });
    const details = screen.getByTestId("details-slot");
    expect(entry).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("pace-popover")).not.toBeInTheDocument();
    expect(await within(screen.getByTestId("summary-slot")).findByTestId("coach-reference")).toBeVisible();

    entry.focus();
    await user.keyboard("{Enter}");
    expect(entry).toHaveAttribute("aria-expanded", "true");
    const region = details.firstElementChild;
    expect(region).toHaveAttribute("id", entry.getAttribute("aria-controls"));
    expect(region).toHaveFocus();
    expect(screen.getAllByTestId("pace-popover")).toHaveLength(1);
    expect(screen.getAllByTestId("coach-reference")).toHaveLength(1);
    await user.click(within(details).getByRole("button", { name: "Close usage rhythm" }));
    expect(entry).toHaveFocus();
    expect(entry).toHaveAttribute("aria-expanded", "false");
  });

  it("reopens the observations whenever a new companion request arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PulseCoachOverview {...actions} observationsExpanded={false}>{split}</PulseCoachOverview>);
    await screen.findByTestId("coach-reference");
    rerender(<PulseCoachOverview {...actions} observationsExpanded>{split}</PulseCoachOverview>);
    expect(screen.getByTestId("coach-cycle-observations")).toHaveAttribute("open");
    rerender(<PulseCoachOverview {...actions} observationsExpanded={false}>{split}</PulseCoachOverview>);
    expect(screen.getByTestId("coach-cycle-observations")).toHaveAttribute("open");
    await user.click(within(screen.getByTestId("coach-cycle-observations")).getByText("Observation basis this cycle"));
    expect(screen.getByTestId("coach-cycle-observations")).not.toHaveAttribute("open");
    rerender(<PulseCoachOverview {...actions} observationsExpanded>{split}</PulseCoachOverview>);
    expect(screen.getByTestId("coach-cycle-observations")).toHaveAttribute("open");
    rerender(<PulseCoachOverview {...actions} observationsExpanded={false}>{split}</PulseCoachOverview>);
    fireEvent.click(screen.getByRole("button", { name: "Close usage rhythm" }));
    expect(screen.queryByTestId("pace-popover")).not.toBeInTheDocument();
    rerender(<PulseCoachOverview {...actions} observationsExpanded>{split}</PulseCoachOverview>);
    expect(screen.getByTestId("coach-cycle-observations")).toHaveAttribute("open");
  });

  it("keeps a failed acknowledgement visible in the same unread notice", async () => {
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "mark_pulse_notice_read") throw new Error("Unavailable");
      return syntheticCoachSnapshot("notice", new Date(now));
    });
    const user = userEvent.setup();
    render(<PulseCoachOverview {...actions} observationsExpanded={false}>{split}</PulseCoachOverview>);
    await user.click(await screen.findByRole("button", { name: quotaCoachFeedback("en", "noticeCompact") }));
    const details = screen.getByTestId("details-slot");
    const notice = within(details).getByRole("note");
    await user.click(within(notice).getByRole("button", { name: "Mark read" }));
    expect(await within(notice).findByRole("alert")).toHaveTextContent(quotaCoachCopy("en", "markFailed"));
    expect(within(notice).getByRole("button", { name: "Mark read" })).toBeEnabled();
    await user.click(within(details).getByRole("button", { name: "Close usage rhythm" }));
    expect(screen.getByRole("alert")).toHaveTextContent(quotaCoachCopy("en", "markFailed"));
    expect(screen.getByRole("button", { name: quotaCoachFeedback("en", "noticeCompact") })).toBeVisible();
    expect(invoke).toHaveBeenCalledWith("mark_pulse_notice_read", { id: "synthetic-reset-notice-v3" });
  });
});
