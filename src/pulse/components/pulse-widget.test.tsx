// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { PaceSnapshot } from "@/lib/pulse-pace";
import { syntheticPaceSnapshot } from "@/lib/pulse-pace";
import { PulseWidget } from "./pulse-widget";

const state = vi.hoisted(() => ({
  data: null as PaceSnapshot | null, expanded: false,
  action: vi.fn().mockResolvedValue(undefined), details: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pulse-appearance", () => ({
  usePulsePreferences: () => ({ widgetExpanded: state.expanded, widgetAlwaysOnTop: false }),
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
    state.action.mockClear();
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

  it("shares the expanded allocation and preserves explicit native widget controls", () => {
    state.expanded = true;
    render(<PulseWidget/>);
    expect(screen.getByText(/16 percentage points/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Always on top" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide widget" }));
    expect(state.action.mock.calls.map(call => call[0])).toEqual(["showMain", "pin", "collapse", "hide"]);
    fireEvent.click(screen.getByRole("button", { name: "View usage details" }));
    expect(state.details).toHaveBeenCalledWith("details");
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
