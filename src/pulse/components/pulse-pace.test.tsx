// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { syntheticPaceSnapshot } from "@/lib/pulse-pace";
import { PulsePaceBadgeView, PulsePaceCard } from "./pulse-pace";

beforeEach(async () => { await i18n.changeLanguage("en"); });
const actions = () => ({ onRefresh: vi.fn(), onClose: vi.fn(), onDetails: vi.fn() });

describe("title bar usage companion", () => {
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
    render(<PulsePaceBadgeView data={syntheticPaceSnapshot("sampling")} onToggle={vi.fn()}/>);
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
    expect(screen.getByText("No local token sources for today")).toBeVisible();
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
