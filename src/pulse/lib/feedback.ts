import { getLanguage, type Language } from "./languages";

export const feedbackStages = ["notSpecified", "demo", "downloaded", "launched", "used"] as const;
export const feedbackAreas = ["notSpecified", "setup", "quota", "pacing", "analysis", "widget", "integration", "other"] as const;
export type FeedbackStage = typeof feedbackStages[number];
export type FeedbackArea = typeof feedbackAreas[number];

const supportedLanguages = ["en", "zh", "zh-Hant", "ja", "ko", "de"] as const;
const repository = "https://github.com/zhulongqihan/codex-pulse";

/** Deliberately reconstruct each field. Never spread account, diagnostics or storage objects. */
export function buildFeedbackSummary(input: unknown): string {
  const value = input !== null && typeof input === "object" ? input as Record<string, unknown> : {};
  const version = typeof value.version === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version) ? value.version : "unknown";
  const language = supportedLanguages.includes(value.language as Language) ? value.language : "en";
  const skin = value.skin === "meter" ? "meter" : "clear";
  const theme = value.theme === "dark" || value.theme === "light" ? value.theme : "system";
  const stage = feedbackStages.includes(value.stage as FeedbackStage) ? value.stage : "notSpecified";
  const area = feedbackAreas.includes(value.area as FeedbackArea) ? value.area : "notSpecified";
  return ["Codex Pulse feedback context", `App version: ${version}`, "Platform: Windows", `UI language: ${language}`, `Style: ${skin}`, `Theme preference: ${theme}`, `Usage stage: ${stage}`, `Area: ${area}`].join("\n");
}

/** These destinations are fixed; no credentials, summary text, paths or account fields enter the URL. */
export function feedbackUrl(kind: "discussion" | "bug" | "guide" | "trust", language: string, version: string): string {
  if (kind === "discussion") return `${repository}/discussions`;
  if (kind === "guide") return `${repository}/blob/main/${getLanguage(language).startsWith("zh") ? "README.md" : "README.en.md"}`;
  if (kind === "trust") return `${repository}/blob/main/docs/TRUST.md${getLanguage(language).startsWith("zh") ? "" : "#english"}`;
  const url = new URL(`${repository}/issues/new`);
  url.searchParams.set("template", "bug_report.yml");
  if (/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) url.searchParams.set("version", version);
  url.searchParams.set("operating_system", "Windows");
  return url.href;
}
