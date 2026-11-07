import { describe, expect, it } from "vitest";
import { account, monthly, overview, projectAnalytics, projectDaySessions, projectSessionDays, replay, sessions, today } from "./fixtures";

describe("synthetic demo data", () => {
  it("conserves totals across daily, model, project and retained-month views", () => {
    const data = overview("30d");
    expect(data.days).toBe(30);
    expect(data.daily).toHaveLength(30);
    expect(data.totals.totalTokens).toBe(540_690);
    expect(data.totals.totalTokens).toBe(data.totals.inputTokens + data.totals.outputTokens);
    for (const rows of [data.daily, data.models, data.projects, monthly().monthly]) {
      expect(rows.reduce((total, row) => total + row.totalTokens, 0)).toBe(data.totals.totalTokens);
    }
    expect(data.totals.avgTokensPerDay).toBe(540_690 / 30);
    expect(monthly().monthly).toHaveLength(12);
    expect(overview("1d").daily).toHaveLength(1);
    expect(monthly().monthly.at(-1)?.month).toBe(today.slice(0, 7));
  });

  it("keeps same-name projects distinct and filters the requested full path", () => {
    const atlas = overview().projects.filter(row => row.displayName === "Atlas");
    expect(atlas).toHaveLength(2);
    expect(new Set(atlas.map(row => row.project)).size).toBe(2);
    for (const item of atlas) {
      const data = projectAnalytics(item.project, "30d");
      expect(data.summary.totalTokens).toBe(item.totalTokens);
      const days = projectSessionDays(item.project, "30d", "");
      expect(days.days.length).toBeGreaterThan(0);
      for (const day of days.days) {
        expect(projectDaySessions(item.project, day.date, "").every(row => row.projects.includes(item.project))).toBe(true);
      }
    }
  });

  it("retains inclusive custom range and zero days without changing monthly history", () => {
    const retainedMonths = monthly();
    const date = overview().startDate;
    const empty = overview(`custom:${date}_${date}`);
    expect(empty.daily).toHaveLength(1);
    expect(empty.totals.totalTokens).toBe(0);
    expect(empty.totals.avgTokensPerDay).toBe(0);
    expect(monthly()).toEqual(retainedMonths);
  });

  it("contains only synthetic source paths and explicit mock account credits", () => {
    expect(sessions).toHaveLength(18);
    expect(sessions.every(row => row.path.startsWith("F:/Demo/Codex/sessions/"))).toBe(true);
    expect(JSON.stringify(sessions)).not.toMatch(/codex\+\+|\.local|C:\\Users|auth\.json/i);
    expect(account().account).toBe("demo@example.invalid");
    expect(account().creditsIsMock).toBe(true);
  });

  it("maps replay items to valid synthetic raw JSONL lines and rejects unknown files", () => {
    const detail = replay(sessions[0].path);
    const lines = detail.rawJsonl.split("\n");
    expect(detail.turns).toHaveLength(2);
    expect(detail.summary.patchCount).toBe(detail.turns.reduce((count, turn) => count + turn.patchResults.length, 0));
    expect(detail.summary.messageCount).toBe(detail.turns.reduce((count, turn) => count + turn.systemMessages.length + turn.userMessages.length + turn.assistantMessages.length, 0));
    expect(lines.every(line => typeof JSON.parse(line) === "object")).toBe(true);
    for (const item of detail.turns.flatMap(turn => turn.items)) {
      expect(item.rawJsonlLineNumbers?.every(line => line >= 1 && line <= lines.length)).toBe(true);
    }
    expect(() => replay("C:/Users/real/.codex/sessions/real.jsonl")).toThrow("Unknown synthetic session");
  });
});
