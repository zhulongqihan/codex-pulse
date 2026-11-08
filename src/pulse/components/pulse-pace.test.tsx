// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { syntheticPaceSnapshot } from "@/lib/pulse-pace";
import { PulsePaceBadgeView, PulsePaceCard } from "./pulse-pace";

beforeEach(async () => { vi.restoreAllMocks(); history.replaceState(null, "", "/"); await i18n.changeLanguage("en"); });
const actions = () => ({ onRefresh: vi.fn(), onClose: vi.fn(), onDetails: vi.fn() });
function weeklyOnly(state: "idle" | "slow" = "idle") {
  const at = Date.parse("2026-11-08T08:00:00Z");
  vi.spyOn(Date, "now").mockReturnValue(at);
  const data = syntheticPaceSnapshot(state, new Date(at));
  data.primaryKind = "weekly";
  Object.assign(data.windows[0], { state: "unavailable", remainingPercent: null, windowMinutes: null, resetsAt: null, trend: [], sampleCount: 0 });
  Object.assign(data.windows[1], { state, remainingPercent: 82, resetsAt: "2026-11-14T13:00:00Z", sampleCount: 13, sampleSpanMinutes: 60, observedMinutes: 60, consumedPercentPoints: state === "idle" ? 0 : .5 });
  Object.assign(data.localUsage!, { totalTokens: 343_000_000, projects: [{ label: "Example project", totalTokens: 343_000_000, sharePercent: 100 }] });
  return data;
}

describe("title bar usage companion", () => {
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("shows reset, official remaining and actual local totals for a weekly-only unchanged reading in %s", async language => {
    await i18n.changeLanguage(language);
    render(<PulsePaceCard data={weeklyOnly()} {...actions()}/>);
    expect(screen.getByTestId("pace-estimate")).toHaveTextContent(paceCopy(language, "resetDays", { days: 6, hours: 5 }));
    expect(screen.getByText(paceCopy(language, "sessionMissing"))).toBeVisible();
    expect(screen.getByText(paceCopy(language, "idleDetail"))).toBeVisible();
    expect(screen.getByRole("region", { name: paceCopy(language, "official") })).toHaveTextContent("82%");
    expect(screen.getByTestId("pace-token-total")).toHaveTextContent(new Intl.NumberFormat(language).format(343_000_000));
    expect(document.querySelector('time[datetime="2026-11-14T13:00:00Z"]')).toHaveTextContent("2026");
    expect(screen.queryByText("2–3")).not.toBeInTheDocument();
  });

  it("uses fresh local tokens in a non-forecast badge, while retaining warning and forecast priority", () => {
    const data = weeklyOnly();
    const { rerender } = render(<PulsePaceBadgeView data={data} onToggle={vi.fn()}/>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent("343M Token");
    expect(screen.getByTestId("pace-badge")).toHaveAccessibleName(expect.stringContaining("Today’s local tokens: 343,000,000"));
    for (const state of ["stale", "exhausted", "unavailable", "expired"] as const) {
      data.status = state;
      rerender(<PulsePaceBadgeView data={data} onToggle={vi.fn()}/>);
      expect(screen.getByTestId("pace-badge")).not.toHaveTextContent("343M");
      expect(screen.getByTestId("pace-badge")).toHaveTextContent(paceCopy("en", state));
    }
    data.status = "idle";
    rerender(<PulsePaceBadgeView data={data} failed onToggle={vi.fn()}/>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent("Refresh needed");
    rerender(<PulsePaceBadgeView data={syntheticPaceSnapshot()} onToggle={vi.fn()}/>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent("≈2–3h");
  });

  it("never uses stale, invalid-time or previous-day local totals as a badge fallback", () => {
    for (const invalid of ["stale", "timestamp", "day", "number"] as const) {
      const data = weeklyOnly();
      if (invalid === "stale") data.localUsage!.stale = true;
      if (invalid === "timestamp") data.localUsage!.updatedAt = "2026-11-08T07:00:00Z";
      if (invalid === "day") data.localUsage!.date = "2026-11-07";
      if (invalid === "number") data.localUsage!.totalTokens = Number.NaN;
      const view = render(<PulsePaceBadgeView data={data} onToggle={vi.fn()}/>);
      expect(view.getByTestId("pace-badge")).toHaveTextContent(paceCopy("en", "idle"));
      view.unmount();
    }
  });

  it("does not invent a reset or a forecast from local tokens when the reset is missing or invalid", () => {
    const data = weeklyOnly("slow");
    data.windows[1].resetsAt = "invalid";
    render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByText(paceCopy("en", "resetUnknown"))).toBeVisible();
    expect(screen.getByTestId("pace-estimate")).toHaveTextContent(paceCopy("en", "slowHeadline"));
    expect(screen.getByTestId("pace-token-total")).toHaveTextContent("343,000,000");
    expect(screen.queryByText("2–3")).not.toBeInTheDocument();
  });

  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("visibly labels a directly opened synthetic card and accessibly labels its badge in %s", async language => {
    history.replaceState(null, "", "/?demo=1#pulse-pace");
    await i18n.changeLanguage(language);
    render(<><PulsePaceCard data={syntheticPaceSnapshot()} {...actions()}/><PulsePaceBadgeView data={syntheticPaceSnapshot()} onToggle={vi.fn()}/></>);
    const label = paceCopy(language, "demo");
    expect(within(screen.getByTestId("pace-popover")).getByText(label)).toBeVisible();
    const badge = screen.getByTestId("pace-badge");
    expect(badge).toHaveAccessibleName(expect.stringContaining(label));
    expect(badge).toHaveAttribute("title", expect.stringContaining(label));
    expect(badge).not.toHaveTextContent(label);
  });

  it("does not label a regular desktop card as synthetic even when a test fixture supplies its data", () => {
    render(<PulsePaceCard data={syntheticPaceSnapshot()} {...actions()}/>);
    expect(screen.queryByText("Synthetic demo")).not.toBeInTheDocument();
    expect(document.querySelector(".pulse-pace-demo-label")).toBeNull();
  });

  it("keeps the badge compact and labels the specific quota window accessibly", () => {
    const onToggle = vi.fn();
    render(<PulsePaceBadgeView data={syntheticPaceSnapshot()} onToggle={onToggle}/>);
    const badge = screen.getByRole("button", { name: "Open usage rhythm · 5-hour window · ≈2–3h" });
    expect(badge).toHaveTextContent("≈2–3h");
    expect(badge).not.toHaveTextContent("Pulse");
    fireEvent.click(badge); expect(onToggle).toHaveBeenCalledOnce();
  });

  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("renders truthful non-forecast states in %s", async language => {
    await i18n.changeLanguage(language);
    const data = syntheticPaceSnapshot("sampling"); delete data.localUsage;
    render(<PulsePaceBadgeView data={data} onToggle={vi.fn()}/>);
    expect(screen.getByTestId("pace-badge")).toHaveTextContent(paceCopy(language, "sampling"));
    expect(screen.getByTestId("pace-badge")).not.toHaveTextContent("≈");
  });

  it("shows real observation duration and keeps local token attribution distinct from account quota", () => {
    const data = syntheticPaceSnapshot();
    data.windows[0].observedMinutes = 45; data.windows[0].consumedPercentPoints = 2.5;
    render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByText("2–3")).toBeVisible();
    expect(screen.getByText("45 min observed · 2.5 percentage points used")).toBeVisible();
    expect(screen.getByText("Estimate applies to this window; other limits may apply.")).toBeVisible();
    expect(screen.getByText("Local tokens do not attribute account quota.")).toBeVisible();
    const sources = screen.getByRole("region", { name: "Local token sources" });
    expect(within(sources).getByText("62%")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    expect(within(sources).getByText("gpt-6.1")).toBeVisible();
    expect(within(sources).getByText("74%")).toBeVisible();
    expect(within(sources).queryByText("Project Atlas")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Official remaining" })).toHaveTextContent("28%");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("retains the last reading on failure while removing the obsolete estimate", () => {
    render(<PulsePaceCard data={syntheticPaceSnapshot()} failed {...actions()}/>);
    expect(screen.getByTestId("pace-estimate")).toHaveTextContent("Refresh needed");
    expect(screen.getByRole("alert")).toHaveTextContent("last reading is retained");
    expect(screen.getByRole("region", { name: "Official remaining" })).toHaveTextContent("28%");
    expect(screen.queryByText("2–3")).not.toBeInTheDocument();
  });

  it("does not claim to retain a reading when the initial request failed", () => {
    render(<PulsePaceCard data={null} failed {...actions()}/>);
    expect(screen.getByTestId("pace-estimate")).toHaveTextContent("No data");
    expect(screen.getByRole("alert")).not.toHaveTextContent("last reading is retained");
    expect(screen.queryByText("2–3")).not.toBeInTheDocument();
  });

  it("supports keyboard close, details and pending refresh without a composer", () => {
    const handlers = actions();
    render(<PulsePaceCard data={syntheticPaceSnapshot()} refreshing {...handlers}/>);
    expect(screen.getByRole("button", { name: "Close usage rhythm" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Refresh account readings" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" }); expect(handlers.onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "View usage details" })); expect(handlers.onDetails).toHaveBeenCalledOnce();
    expect(document.querySelector("input,textarea,[contenteditable=true]")).toBeNull();
  });

  it("does not invent local sources when no local data was returned", () => {
    const data = syntheticPaceSnapshot(); delete data.localUsage;
    render(<PulsePaceCard data={data} {...actions()}/>);
    expect(screen.getByText("Project/model breakdown unavailable")).toBeVisible();
    expect(screen.queryByText("62%")).not.toBeInTheDocument();
  });

  it("marks outdated local sources with their own update time without invalidating account pace", () => {
    const data = syntheticPaceSnapshot();
    data.localUsage!.stale = true;
    data.localUsage!.updatedAt = "2026-11-08T03:00:00Z";
    render(<PulsePaceCard data={data} {...actions()}/>);
    const sources = screen.getByRole("region", { name: "Local token sources" });
    expect(within(sources).getByRole("status")).toHaveTextContent("Awaiting update");
    expect(sources.querySelector("time")).toHaveAttribute("dateTime", "2026-11-08T03:00:00Z");
    expect(screen.getByTestId("pace-estimate")).toHaveTextContent("2–3");
  });
});
