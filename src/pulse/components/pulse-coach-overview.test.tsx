// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { syntheticCoachSnapshot, type PaceSnapshot } from "@/lib/pulse-pace";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { PulseCoachOverview } from "./pulse-coach-overview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const now = Date.parse("2026-11-14T08:00:00Z");
const actions = { onDetails: vi.fn(), onRecover: vi.fn() };

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(invoke).mockReset().mockResolvedValue(syntheticCoachSnapshot("roomy", new Date(now)));
  await i18n.changeLanguage("en");
});

describe("paper workspace pacing", () => {
  it("keeps a stable focus destination for the companion detail action without a separate details region", async () => {
    render(<PulseCoachOverview {...actions} paper/>);
    const region = screen.getByTestId("pulse-coach-overview");
    expect(region).toHaveAttribute("id", "pulse-pace-details");
    expect(region).toHaveAttribute("tabindex", "-1");
    region.focus();
    expect(region).toHaveFocus();
    expect(await within(region).findByTestId("coach-reference")).toBeVisible();
    expect(screen.queryByRole("button", { name: paceSummaryCopy("en", "details") })).not.toBeInTheDocument();
    expect(screen.queryByTestId("pace-popover")).not.toBeInTheDocument();
  });

  it("discloses the no-notice status on demand", async () => {
    render(<PulseCoachOverview {...actions} paper/>);
    await screen.findByTestId("coach-reference");
    const entry = screen.getByText(quotaCoachCopy("en", "notice"), { selector: "summary" });
    expect(entry.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("No current notice")).not.toBeVisible();
    entry.focus();
    expect(entry).toHaveFocus();
    fireEvent.click(entry);
    expect(screen.getByText("No current notice")).toBeVisible();
    fireEvent.click(entry);
    expect(screen.getByText("No current notice")).not.toBeVisible();
  });

  it("starts with the active notice closed and keeps acknowledgement failures inside it", async () => {
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "mark_pulse_notice_read") throw new Error("Unavailable");
      return syntheticCoachSnapshot("notice", new Date(now));
    });
    const user = userEvent.setup();
    render(<PulseCoachOverview {...actions} paper/>);
    const entry = screen.getByText(quotaCoachCopy("en", "notice"), { selector: "summary" });
    expect(entry.closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: "Mark read" })).not.toBeInTheDocument();
    await user.click(entry);
    const notice = await screen.findByRole("note");
    await user.click(within(notice).getByRole("button", { name: "Mark read" }));
    expect(await within(notice).findByRole("alert")).toHaveTextContent(quotaCoachCopy("en", "markFailed"));
    expect(within(notice).getByRole("button", { name: "Mark read" })).toBeEnabled();
    await user.click(entry);
    expect(entry.closest("details")).not.toHaveAttribute("open");
    expect(within(notice).getByRole("alert")).not.toBeVisible();
    expect(entry).toHaveFocus();
    expect(screen.queryByRole("button", { name: quotaCoachFeedback("en", "noticeCompact") })).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("mark_pulse_notice_read", { id: "synthetic-reset-notice-v3" });
  });
});

it.each([false, true])("waits for the backend before showing refresh progress (cooldown %s)", async cooling => {
  const initial = { ...syntheticCoachSnapshot("roomy", new Date(now)), refreshAfterSeconds: cooling ? 30 : undefined };
  let respond!: (snapshot: PaceSnapshot) => void;
  const reply = new Promise<PaceSnapshot>(resolve => { respond = resolve; });
  vi.mocked(invoke).mockImplementation(async command => command === "refresh_pulse_pace" ? reply : initial);
  render(<PulseCoachOverview {...actions} paper={cooling}/>);
  await screen.findByTestId("coach-reference");

  const button = screen.getByRole("button", { name: "Refresh account readings" });
  button.focus();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "refresh_pulse_pace")).toHaveLength(1);
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("aria-busy", "false");
  expect(screen.queryByTestId("coach-refresh-status")).not.toBeInTheDocument();
  if (cooling) expect(screen.getByTestId("coach-refresh-wait")).toHaveTextContent("Cooldown: 30s");
  else expect(screen.queryByTestId("coach-refresh-wait")).not.toBeInTheDocument();

  await act(async () => { respond({ ...initial, refreshQueued: cooling, refreshInFlight: !cooling }); });
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("aria-busy", String(!cooling));
  if (cooling) expect(screen.getByTestId("coach-refresh-wait")).toHaveTextContent("Refreshing in 30s");
  else expect(screen.getByTestId("coach-refresh-status")).toHaveTextContent("Refreshing account readings");
});
