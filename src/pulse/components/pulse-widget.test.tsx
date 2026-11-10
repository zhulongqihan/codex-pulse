// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { PaceSnapshot } from "@/lib/pulse-pace";
import { syntheticPaceSnapshot } from "@/lib/pulse-pace";
import { pulseCopy } from "@/lib/pulse-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { closeBehaviorCopy } from "@/lib/close-behavior-copy";
import { PulseWidget } from "./pulse-widget";

const state = vi.hoisted(() => ({
  data: null as PaceSnapshot | null, expanded: false, pinned: false,
  action: vi.fn().mockResolvedValue(undefined), details: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pulse-appearance", () => ({
  usePulsePreferences: () => ({ widgetExpanded: state.expanded, widgetAlwaysOnTop: state.pinned }),
  pulseWidgetAction: state.action,
}));
vi.mock("@/lib/pulse-pace", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/pulse-pace")>(),
  titlebarAction: state.details,
  usePulsePace: () => ({ data: state.data, error: false, refreshing: false, refresh: vi.fn(), markNoticeRead: vi.fn(), noticePending: false, noticeError: false }),
}));

describe("desktop widget quota pacing", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    state.expanded = false;
    state.pinned = false;
    state.action.mockReset().mockResolvedValue(undefined);
    state.details.mockClear();
    const now = new Date();
    const data = syntheticPaceSnapshot("idle", now);
    const weekly = data.windows.find(window => window.kind === "weekly")!;
    Object.assign(weekly, { remainingPercent: 80, resetsAt: new Date(now.getTime() + 5 * 86400_000).toISOString(), state: "idle" });
    state.data = { ...data, status: "idle", primaryKind: "weekly", windows: [weekly] };
  });

  it("keeps real quota and reset information visible even with no measurable recent change", () => {
    render(<PulseWidget/>);
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent(/80\s*%/);
    expect(screen.getByTestId("coach-countdown")).toHaveTextContent("5d 0h");
    expect(screen.getByText("Roomy pace")).toBeVisible();
    expect(screen.queryByText("100,000")).not.toBeInTheDocument();
    expect(document.querySelector("[data-tauri-drag-region]")).toBeInTheDocument();
  });

  it("shares the expanded allocation and preserves explicit native widget controls", async () => {
    state.expanded = true;
    render(<PulseWidget/>);
    expect(screen.getByText(/16 percentage points/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pin on top" })); });
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide widget" }));
    expect(state.action.mock.calls.map(call => call[0])).toEqual(["showMain", "pin", "collapse", "hide"]);
    fireEvent.click(screen.getByRole("button", { name: "View usage details" }));
    expect(state.details).toHaveBeenCalledWith("details");
  });

  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("names the next pin action while retaining the actual state and close consequence in %s", async language => {
    await i18n.changeLanguage(language);
    const { rerender } = render(<PulseWidget/>);
    const pin = screen.getByTestId("widget-pin");
    expect(pin).toHaveAccessibleName(pulseCopy(language, "pinAction"));
    expect(pin).toHaveAttribute("title", pulseCopy(language, "pinAction"));
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await act(async () => { fireEvent.click(pin); });
    expect(state.action).toHaveBeenLastCalledWith("pin");
    state.pinned = true; rerender(<PulseWidget/>);
    expect(pin).toHaveAccessibleName(pulseCopy(language, "unpinAction"));
    expect(pin).toHaveAttribute("title", pulseCopy(language, "unpinAction"));
    expect(pin).toHaveAttribute("aria-pressed", "true");
    await act(async () => { fireEvent.click(pin); });
    expect(state.action).toHaveBeenLastCalledWith("unpin");
    const hide = screen.getByTestId("widget-hide");
    expect(hide).toHaveAccessibleDescription(closeBehaviorCopy(language, "hideOnly"));
    expect(hide).toHaveAttribute("title", closeBehaviorCopy(language, "hideOnly"));
    await act(async () => { fireEvent.click(hide); });
    expect(state.action).toHaveBeenLastCalledWith("hide");
    expect(state.action).not.toHaveBeenCalledWith("quit");
    expect(screen.queryByTestId("widget-close-hint")).not.toBeInTheDocument();
    state.expanded = true; rerender(<PulseWidget/>);
    expect(screen.getByTestId("widget-close-hint")).toHaveTextContent(closeBehaviorCopy(language, "widgetHint", { quit: i18n.t("settings.menu_bar_quit") }));
  });

  it("prevents duplicate pin actions while pending and preserves the real state on failure before retry", async () => {
    let reject: (error: Error) => void = () => {};
    state.action.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<PulseWidget/>);
    const pin = screen.getByTestId("widget-pin");
    fireEvent.click(pin); fireEvent.click(pin);
    expect(state.action).toHaveBeenCalledExactlyOnceWith("pin");
    expect(pin).toBeDisabled(); expect(pin).toHaveAttribute("aria-busy", "true");
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await act(async () => { reject(new Error("Synthetic native window failure")); });
    await waitFor(() => expect(pin).toBeEnabled());
    expect(pin).toHaveAttribute("aria-busy", "false"); expect(pin).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(paceCopy("en", "actionFailed"));
    await act(async () => { fireEvent.click(pin); });
    expect(state.action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("makes a new reset notice discoverable while collapsed and removes expired attention", () => {
    const now = Date.now();
    const notice = {
      id: "synthetic-notice", summary: "Synthetic global signal", sourceUrl: "https://codex-reset.com/",
      sourceLabel: "codex-reset.com", startAt: new Date(now + 3600_000).toISOString(),
      endAt: new Date(now + 7200_000).toISOString(), publishedAt: new Date(now - 60_000).toISOString(),
      updatedAt: new Date(now).toISOString(), isUnread: true, verification: "third_party" as const, scope: "global" as const,
    };
    state.data!.coachExtras = { dailyObservations: [], resetNotice: notice };
    const { rerender } = render(<PulseWidget/>);
    fireEvent.click(screen.getByRole("button", { name: "Third-party notice · unconfirmed" }));
    expect(state.action).toHaveBeenCalledWith("expand");
    notice.endAt = new Date(now - 1).toISOString();
    rerender(<PulseWidget/>);
    expect(screen.queryByRole("button", { name: "Third-party notice · unconfirmed" })).not.toBeInTheDocument();
  });
  it("routes account recovery separately from ordinary workspace and pace details", () => {
    state.data!.windows = []; state.data!.updatedAt = null; state.data!.reason = "login_required";
    render(<PulseWidget/>);
    fireEvent.click(screen.getByRole("button", { name: "Check account and connection" }));
    expect(state.details).toHaveBeenCalledWith("account");
    expect(state.action).not.toHaveBeenCalledWith("showMain");
  });
});
