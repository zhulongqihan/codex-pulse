import type { SessionDetailRow } from "./api";
import { sessionProjectReferences } from "./project-reference";

type SearchRecord = { path: string; group: string; text: string };
export type SessionSearchIndex = SearchRecord[];

/** The same metadata fields as project_sessions::store_session, without replay text. */
export function indexSessionSearch(sessions: SessionDetailRow[]): SessionSearchIndex {
  const roots = new Map(sessions.map(session => [session.path, session.path]));
  const byAgentId = new Map(sessions.flatMap(session => session.agentSessionId ? [[session.agentSessionId, session.path] as const] : []));
  const root = (path: string) => {
    let current = path;
    while (roots.get(current) !== current) current = roots.get(current)!;
    while (roots.get(path) !== current) {
      const next = roots.get(path)!;
      roots.set(path, current);
      path = next;
    }
    return current;
  };
  for (const session of sessions) {
    const parent = session.parentSessionId ? byAgentId.get(session.parentSessionId) : undefined;
    if (parent) roots.set(root(session.path), root(parent));
  }
  return sessions.map(session => ({
    path: session.path,
    group: root(session.path),
    text: [session.threadName, session.sessionId, ...session.models, ...session.projects,
      ...sessionProjectReferences(session).flatMap(project => [project.displayName, project.codexProjectName])]
      .filter(Boolean).join("\n").toLowerCase(),
  }));
}

/** A hit retains its available family across dates, within the existing project scope. */
export function searchSessionGroups(index: SessionSearchIndex, query: string, scope: Set<string>) {
  const normalized = query.trim().toLowerCase();
  const groups = new Set(index.filter(record => scope.has(record.path) && record.text.includes(normalized)).map(record => record.group));
  const paths = new Set(index.filter(record => scope.has(record.path) && groups.has(record.group)).map(record => record.path));
  return { paths, groupCount: groups.size, sessionCount: paths.size };
}
