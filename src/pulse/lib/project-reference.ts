import type { ProjectReference, SessionDetailRow } from "@/lib/api";

export function sessionProjectReferences(session: SessionDetailRow): ProjectReference[] {
  if (session.projectReferences?.length) return session.projectReferences;
  return session.projects.map((path) => ({
    path,
    displayName: path.split(/[\\/]/).filter(Boolean).pop() || path,
  }));
}

export function projectLabel(project: Pick<ProjectReference, "displayName" | "codexProjectName">) {
  return project.codexProjectName || project.displayName;
}

/** Only colliding names need path context; choose the shortest unique suffix. */
export function distinctProjectLabels(projects: Array<Pick<ProjectReference, "displayName" | "codexProjectName"> & {project: string}>) {
  const groups = new Map<string, typeof projects>();
  for (const project of projects) {
    const name = projectLabel(project);
    const group = groups.get(name) ?? [];
    group.push(project); groups.set(name, group);
  }
  const result = new Map<string, string>();
  for (const [name, group] of groups) {
    if (group.length === 1) { result.set(group[0].project, name); continue; }
    const segments = group.map(project => project.project.replaceAll("\\", "/").split("/").filter(Boolean));
    group.forEach((project, index) => {
      const parts = segments[index];
      let depth = Math.min(2, parts.length);
      while (depth < parts.length && segments.some((other, otherIndex) => otherIndex !== index && other.slice(-depth).join("/") === parts.slice(-depth).join("/"))) depth++;
      const suffix = parts.slice(-depth).join("/") || project.project;
      result.set(project.project, suffix.endsWith(name) ? suffix : `${name} · ${suffix}`);
    });
  }
  return result;
}
