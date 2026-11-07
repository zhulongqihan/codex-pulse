import type { CodexLimitWindow } from "./api";

export type QuotaWindowKind = "5h" | "weekly" | "monthly" | "custom";

export function quotaWindowKind(window: CodexLimitWindow | null | undefined): QuotaWindowKind {
  const minutes = window?.windowMinutes;
  if (minutes === 300) return "5h";
  if (minutes === 10_080) return "weekly";
  if (minutes != null && minutes >= 40_320 && minutes <= 44_640) return "monthly";
  return "custom";
}

export function quotaWindowLabel(window: CodexLimitWindow | null | undefined, t: (key: string, options?: any) => string): string {
  const kind = quotaWindowKind(window);
  if (kind === "5h") return t("limits.window_5hour");
  if (kind === "weekly") return t("limits.window_weekly");
  if (kind === "monthly") return t("limits.window_monthly");
  const minutes = window?.windowMinutes;
  return minutes != null && Number.isFinite(minutes) && minutes > 0
    ? t("limits.window_minutes", { minutes }) : t("limits.window_unknown");
}
