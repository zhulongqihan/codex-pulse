export type MonthCoverage = "retained" | "partial" | "unavailable";

/** The earliest retained log is evidence of retention, never a claim of complete lifetime history. */
export function monthCoverage(month: string, retainedFrom: string | null | undefined): MonthCoverage {
  // Older clients/fixtures omitted this metadata; new native responses always supply it.
  if (retainedFrom === undefined) return "retained";
  if (retainedFrom === null || month < retainedFrom.slice(0, 7)) return "unavailable";
  if (month === retainedFrom.slice(0, 7) && !retainedFrom.endsWith("-01")) return "partial";
  return "retained";
}
