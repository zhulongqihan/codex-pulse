import { describe, expect, it } from "vitest";
import type { SessionDetailRow } from "./api";
import { indexSessionSearch, searchSessionGroups } from "./session-list-search";

const row = (path: string, fields: Partial<SessionDetailRow> = {}): SessionDetailRow => ({
  path, sessionId: `${path}.jsonl`, threadName: null, models: [], projects: [], ...fields,
} as SessionDetailRow);
const search = (rows: SessionDetailRow[], query: string, paths = rows.map(row => row.path)) => searchSessionGroups(indexSessionSearch(rows), query, new Set(paths));
describe("loaded session group search", () => {
  it("uses the project-detail metadata fields, including fallback IDs and named project references", () => {
    const rows = [row("one", { threadName: "Fix rendering", models: ["GPT-5"], projects: ["F:/work/Atlas"], projectReferences: [{ path: "F:/work/Atlas", displayName: "Atlas folder", codexProjectName: "产品研究" }] }), row("two")];
    for (const query of [" FIX RENDERING ", "one.jsonl", "gpt-5", "work/atlas", "Atlas folder", "产品研究"]) {
      expect([...search(rows, query).paths], query).toEqual(["one"]);
    }
    expect(search(rows, "not present").groupCount).toBe(0);
  });
  it("keeps parents and all related descendants across dates even when only a deep child matches", () => {
    const rows = [row("child", { threadName: "Needle", agentSessionId: "c", parentSessionId: "p" }), row("root", { agentSessionId: "p" }), row("grandchild", { agentSessionId: "g", parentSessionId: "c" }), row("unrelated")];
    const result = search(rows, "needle");
    expect(result.paths).toEqual(new Set(["child", "root", "grandchild"]));
    expect(result.groupCount).toBe(1);
    expect(result.sessionCount).toBe(3);
  });
  it("keeps existing filters authoritative and does not match a hidden member from another project", () => {
    const rows = [row("root", { agentSessionId: "p" }), row("child", { threadName: "Needle", parentSessionId: "p" })];
    expect(search(rows, "needle", ["root"]).paths.size).toBe(0);
    expect(search(rows, "root", ["root"]).paths).toEqual(new Set(["root"]));
  });
  it("handles missing parents and malformed cycles without dropping or looping through loaded rows", () => {
    const rows = [row("a", { agentSessionId: "a", parentSessionId: "b" }), row("b", { agentSessionId: "b", parentSessionId: "a" }), row("orphan", { parentSessionId: "missing" })];
    expect(search(rows, "a.jsonl").paths).toEqual(new Set(["a", "b"]));
    expect(search(rows, "orphan").paths).toEqual(new Set(["orphan"]));
  });
});
