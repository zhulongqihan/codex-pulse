// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { SessionDetailRow } from "@/lib/api";
import { sessionSearchCopy } from "@/lib/session-list-search-copy";
import { SessionUsageTable } from "./session-usage-table";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
function session(path: string, title: string, date: string, tokens: number, fields: Partial<SessionDetailRow> = {}): SessionDetailRow {
  return { path, sessionId: `${path}.jsonl`, threadName: title, modifiedAtMs: Date.parse(`${date}T12:00:00Z`), sizeBytes: 1024, turnCount: 2,
    inputTokens: tokens - 10, cachedInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: tokens, costUSD: tokens / 1000,
    models: ["gpt-5"], projects: ["/repo/atlas"],
    dailyUsage: [{ date, inputTokens: tokens - 10, cachedInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: tokens, costUSD: tokens / 1000, models: ["gpt-5"], projects: ["/repo/atlas"] }], ...fields };
}
const rows = () => [
  session("recent", "Unrelated recent work", "2026-11-10", 7000),
  session("parent", "Parent task", "2026-11-01", 1100, { agentSessionId: "parent" }),
  session("child-a", "Related first agent", "2026-11-01", 200, { agentSessionId: "child-a", parentSessionId: "parent", agentDepth: 1 }),
  session("child-b", "Needle deep work", "2026-11-02", 300, { agentSessionId: "child-b", parentSessionId: "parent", agentDepth: 1 }),
];
beforeEach(async () => { invoke.mockReset(); await i18n.changeLanguage("en"); });
describe("main session list search", () => {
  it("finds an older child without opening days, preserves its family across dates and recomputes day totals", async () => {
    render(<SessionUsageTable sessions={rows()}/>);
    expect(screen.queryByText("Parent task")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), { target: { value: "needle" } });
    await screen.findByText("Needle deep work");
    expect(screen.getByText("Parent task")).toBeVisible();
    expect(screen.getByText("Related first agent")).toBeVisible();
    expect(screen.queryByText("Unrelated recent work")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-list-search-result")).toHaveTextContent("1 matching groups · 3 loaded sessions");
    const firstDay = document.getElementById("date-group-2026-11-01")!;
    expect(within(firstDay).getByRole("button", { name: /2026-11-01 \(Sunday\)/, expanded: true })).toHaveTextContent("1,300");
    expect(within(firstDay).getByText("Result tokens on this date")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(screen.queryByText("Parent task")).not.toBeInTheDocument());
    expect(screen.getByText("Unrelated recent work")).toBeVisible();
  });
  it("reveals children beyond the collapsed-agent limit and restores date/agent collapse state when cleared", async () => {
    const current = rows().filter(row => row.path !== "recent").map(row => ({ ...row,
      modifiedAtMs: Date.parse(`2026-11-01T${row.path === "child-b" ? "08" : "09"}:00:00Z`),
      dailyUsage: row.dailyUsage.map(day => ({ ...day, date: "2026-11-01" })) }));
    const user = userEvent.setup();render(<SessionUsageTable sessions={current}/>);
    expect(screen.queryByText("Needle deep work")).not.toBeInTheDocument();
    const input = screen.getByRole("searchbox");await user.type(input, "needle");
    expect(await screen.findByText("Needle deep work")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveFocus();expect(input).toHaveValue("");
    await waitFor(() => expect(screen.queryByText("Needle deep work")).not.toBeInTheDocument());
    await user.type(input, "not present");expect(await screen.findByText("No matching session groups")).toBeVisible();
    await user.keyboard("{Escape}");await waitFor(() => expect(input).toHaveValue(""));expect(input).toHaveFocus();
    expect(screen.queryByText("No matching session groups")).not.toBeInTheDocument();
  });
  it("combines search with an existing project filter and preserves that filter on search clear", async () => {
    const clearProject = vi.fn();const data = rows();data[0].projects = ["/repo/other"];data[0].dailyUsage[0].projects = ["/repo/other"];
    render(<SessionUsageTable sessions={data} selectedProject="/repo/atlas" onClearProjectFilter={clearProject}/>);
    const input = screen.getByRole("searchbox");fireEvent.change(input, { target: { value: "Unrelated" } });
    expect(await screen.findByText("No matching session groups")).toBeVisible();
    fireEvent.change(input, { target: { value: "parent" } });expect(await screen.findByText("Parent task")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(clearProject).not.toHaveBeenCalled();expect(screen.queryByText("Unrelated recent work")).not.toBeInTheDocument();
  });
  it("keeps the project-detail embedded list on its existing upstream search", () => {
    render(<SessionUsageTable sessions={rows()} embedded/>);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("labels the loaded-session scope, clear action and empty state in %s", async language => {
    await i18n.changeLanguage(language);render(<SessionUsageTable sessions={rows()}/>);
    const input = screen.getByRole("searchbox", { name: sessionSearchCopy(language, "label") });
    expect(screen.getByText(sessionSearchCopy(language, "scope"))).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "unmatched-query" } });
    expect(await screen.findByText(sessionSearchCopy(language, "empty"))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: sessionSearchCopy(language, "clear") }));
    expect(input).toHaveFocus();expect(input).toHaveValue("");
  });
});
