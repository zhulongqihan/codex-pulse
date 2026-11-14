import { describe, expect, it } from "vitest";
import { buildFeedbackSummary, feedbackUrl } from "./feedback";

describe("feedback context boundaries", () => {
  it("reconstructs a fixed allowlist instead of serializing caller data", () => {
    const summary = buildFeedbackSummary({
      version: "0.11.0", language: "zh-Hant", skin: "meter", theme: "dark", stage: "used", area: "quota",
      email: "private@example.invalid", quota: 27, account: { token: "private-token" },
      path: "F:/PrivateProject/session.jsonl", session: "private-session", error: "private-error-body", username: "private-user", userAgent: "private-ua",
    });
    expect(summary.split("\n")).toEqual(["Codex Pulse feedback context", "App version: 0.11.0", "Platform: Windows", "UI language: zh-Hant", "Style: meter", "Theme preference: dark", "Usage stage: used", "Area: quota"]);
    for (const forbidden of ["private", "27", "F:/", "@", "token", "session", "userAgent"]) expect(summary).not.toContain(forbidden);
  });
  it("rejects free text inside every exportable field", () => {
    const hostile = "credential@example.invalid\nF:/secret";
    const summary = buildFeedbackSummary({ version: hostile, language: hostile, skin: hostile, theme: hostile, stage: hostile, area: hostile });
    expect(summary).not.toContain(hostile);
    expect(summary).toContain("App version: unknown");
    expect(summary).toContain("UI language: en");
    expect(summary).toContain("Usage stage: notSpecified");
    expect(summary).toContain("Area: notSpecified");
    expect(() => buildFeedbackSummary(null)).not.toThrow();
  });
  it("builds only canonical destinations and encodes a bug-form prefill without including the summary", () => {
    const url = new URL(feedbackUrl("bug", "de", "0.11.0"));
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/zhulongqihan/codex-pulse/issues/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({ template: "bug_report.yml", version: "0.11.0", operating_system: "Windows" });
    expect(new URL(feedbackUrl("bug", "zh", "\nsecret&body=private")).searchParams.has("version")).toBe(false);
    expect(feedbackUrl("discussion", "zh", "0.11.0")).toBe("https://github.com/zhulongqihan/codex-pulse/discussions");
    expect(feedbackUrl("guide", "zh-Hant", "0.11.0")).toContain("/README.md");
    expect(feedbackUrl("guide", "ja", "0.11.0")).toContain("/README.en.md");
    expect(feedbackUrl("trust", "de", "0.11.0")).toContain("/docs/TRUST.md#english");
  });
});
