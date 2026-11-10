import { describe, expect, it } from "vitest";
import { buildQuotaPaceCoach, quotaCoachFromSnapshot } from "./quota-pace-coach";
import { formatCoachCountdown, formatCoachNumber, quotaCoachCopy, quotaCoachFeedback } from "./quota-pace-coach-copy";
import type { PaceCoachExtras, PaceResetNotice, PaceWindow } from "./pulse-pace";

const now = Date.parse("2026-11-09T08:00:00Z");
const iso = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
function window(remaining = 80, minutes = 5 * 1440 + 60, duration = 10080, kind: PaceWindow["kind"] = "weekly"): PaceWindow {
  return { kind, windowMinutes: duration, resetsAt: iso(minutes), remainingPercent: remaining, state: "idle", sampleCount: 1, sampleSpanMinutes: 0, observedMinutes: null, consumedPercentPoints: null, rateLowerPerHour: null, rateUpperPerHour: null, etaLowerMinutes: null, etaUpperMinutes: null, risk: "unknown", trend: [] };
}
const build = (windows: PaceWindow[], extra: Partial<Parameters<typeof buildQuotaPaceCoach>[0]> = {}) => buildQuotaPaceCoach({ windows, now, fresh: true, ...extra });
const notice = (): PaceResetNotice => ({ id: "synthetic-notice", summary: "Synthetic schedule under review", sourceUrl: "https://example.org/notice", sourceLabel: "Example third-party feed", startAt: iso(60), endAt: iso(120), publishedAt: iso(-20), updatedAt: iso(-1), isUnread: true, verification: "third_party", scope: "global" });

describe("quota pace coach", () => {
  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("never rounds nonzero measured quota to zero and localizes percentage points in %s", language => {
    expect(formatCoachNumber(.001, language, 1)).toBe(`<${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(.1)}`);
    expect(formatCoachNumber(0, language, 1)).toBe("0");
    expect(quotaCoachFeedback(language, "points", { points: "0" })).not.toContain("{");
    if (language === "zh") expect(quotaCoachFeedback(language, "points", { points: "0.01" })).toBe("0.01个百分点");
  });
  it("explains the approved two states using quota versus nominal time, without needing consumption slopes", () => {
    const roomy = build([window(80)]), fast = build([window(20)]);
    expect(roomy.status).toBe("ready"); expect(roomy.tone).toBe("roomy"); expect(fast.tone).toBe("fast");
    expect(roomy.usedPercent).toBe(20); expect(fast.usedPercent).toBe(80);
    expect(roomy.elapsedPercent).toBeCloseTo(28, 0); expect(roomy.remainingMinutes).toBe(7260);
    expect(roomy.reference?.percentPoints).toBeCloseTo(15.8677, 3); expect(fast.reference?.percentPoints).toBeCloseTo(3.9669, 3);
    expect(roomy.reference?.unit).toBe("day"); expect(roomy.remainingAtReset).toBeNull();
  });
  it("keeps both five-percentage-point neutral boundaries balanced", () => {
    expect(build([window(77, 720, 1000)]).tone).toBe("balanced");
    expect(build([window(67, 720, 1000)]).tone).toBe("balanced");
    expect(build([window(77.1, 720, 1000)]).tone).toBe("roomy");
    expect(build([window(66.9, 720, 1000)]).tone).toBe("fast");
  });
  it("uses the tightest usable window and never lets weekly room hide a depleted short window", () => {
    const short = window(0, 120, 300, "session");
    const result = build([window(80), short]);
    expect(result.status).toBe("exhausted"); expect(result.window?.kind).toBe("session"); expect(result.tone).toBeNull();
    short.remainingPercent = 15;
    expect(build([window(80), short]).window?.kind).toBe("session");
    short.remainingPercent = 90;
    expect(build([window(20), short]).window?.kind).toBe("weekly");
  });
  it("treats an unavailable short-window placeholder as unknown, not as zero or a veto on the known week", () => {
    const missing = { ...window(80, 120, 300, "session"), remainingPercent: null, windowMinutes: null, resetsAt: null, state: "unavailable" as const };
    const result = build([missing, window(80)]);
    expect(result.status).toBe("ready"); expect(result.tone).toBe("roomy"); expect(result.window?.kind).toBe("weekly"); expect(result.hasUnknownWindows).toBe(true);
  });
  it("suppresses recommendations on refresh failure, stale observations and expired windows", () => {
    expect(build([window()], { failed: true }).status).toBe("failed");
    expect(build([window()], { fresh: false }).status).toBe("stale");
    expect(build([window(80, -1)]).status).toBe("expired");
    expect(build([{ ...window(), state: "stale" }, window(80, 120, 300, "session")]).status).toBe("stale");
    for (const result of [build([window()], { failed: true }), build([window()], { fresh: false }), build([window(80, -1)])]) expect(result.tone).toBeNull();
  });
  it("does not derive time progress from unknown or inconsistent duration/reset data", () => {
    for (const item of [{ ...window(), windowMinutes: null }, { ...window(), resetsAt: null }, { ...window(), resetsAt: "tomorrow" }, window(80, 1000, 300), window(Number.NaN)]) {
      const result = build([item]); expect(result.status).toBe("unavailable"); expect(result.elapsedPercent).toBeNull(); expect(result.reference).toBeNull();
    }
    expect(build([]).status).toBe("unavailable"); expect(build([window()], { now: Number.NaN }).tone).toBeNull();
  });
  it("uses hourly rather than daily reference for a short quota window", () => {
    const result = build([window(40, 120, 300, "session")]);
    expect(result.reference).toEqual({ unit: "hour", percentPoints: 20 });
  });
  it("only adds the near-reset surplus hint when both time and remainder support it", () => {
    expect(build([window(60, 600)]).nearResetWithSurplus).toBe(true);
    expect(build([window(10, 600)]).nearResetWithSurplus).toBe(false);
    expect(build([window(80)]).nearResetWithSurplus).toBe(false);
  });
  it("only projects remaining quota with fresh multi-point official slope bounds", () => {
    const item = { ...window(80, 120, 300, "session"), state: "forecast" as const, sampleCount: 7, sampleSpanMinutes: 30, rateLowerPerHour: 10, rateUpperPerHour: 20, trend: [{ at: iso(0), remainingPercent: 80 }] };
    expect(build([item]).remainingAtReset).toEqual({ lowerPercent: 40, upperPercent: 60 });
    for (const changes of [{ sampleCount: 3 }, { sampleSpanMinutes: 10 }, { state: "slow" as const }, { rateLowerPerHour: 0 }, { trend: [{ at: iso(-7), remainingPercent: 80 }] }]) expect(build([{ ...item, ...changes }]).remainingAtReset).toBeNull();
  });
  it("requires the exact observed window before displaying daily coverage, preserving missing versus observed zero", () => {
    const item = window();
    const extras: PaceCoachExtras = { observedWindow: { kind: "weekly", windowMinutes: 10080, resetsAt: item.resetsAt! }, dailyObservations: [
      { date: "2026-11-08", consumedPercentPoints: 0, coveredMinutes: 0, partial: true },
      { date: "2026-11-09", consumedPercentPoints: 0, coveredMinutes: 60, partial: true },
    ], resetNotice: null };
    const result = build([item], { coachExtras: extras });
    expect(result.dailyObservations.map(row => row.consumedPercentPoints)).toEqual([null, 0]);
    expect(result.dailyObservations[1].partial).toBe(true);
    extras.observedWindow!.resetsAt = iso(9999);
    expect(build([item], { coachExtras: extras }).dailyObservations).toEqual([]);
  });
  it("accepts the 25-hour local DST day while rejecting malformed dates and implausible coverage", () => {
    const item = window(); const extras: PaceCoachExtras = { observedWindow: { kind: item.kind, windowMinutes: item.windowMinutes!, resetsAt: item.resetsAt! }, resetNotice: null, dailyObservations: [
      { date: "2026-11-01", consumedPercentPoints: 3, coveredMinutes: 1500, partial: false },
      { date: "2026-02-30", consumedPercentPoints: 2, coveredMinutes: 20, partial: true },
      { date: "2026-11-02", consumedPercentPoints: 4, coveredMinutes: 99999, partial: true },
    ] };
    expect(build([item], { coachExtras: extras }).dailyObservations).toEqual([extras.dailyObservations[0]]);
  });
  it("keeps reset notices third-party and global, drops stale/expired/unsafe notices, and preserves explicit read state", () => {
    const buildNotice = (value: PaceResetNotice) => build([window()], { coachExtras: { dailyObservations: [], resetNotice: value } }).resetNotice;
    expect(buildNotice(notice())?.isUnread).toBe(true);
    expect(buildNotice({ ...notice(), isUnread: false })?.isUnread).toBe(false);
    for (const changes of [{ updatedAt: iso(-6) }, { endAt: iso(-1) }, { sourceUrl: "javascript:alert(1)" }, { verification: "official" as "third_party" }, { scope: "personal" as "global" }, { startAt: "invalid" }]) expect(buildNotice({ ...notice(), ...changes })).toBeNull();
  });
  it("rejects stale/future snapshots even when their stored window says roomy", () => {
    const source = { schemaVersion: 1 as const, generatedAt: iso(0), updatedAt: iso(-7), status: "idle" as const, primaryKind: "weekly" as const, reason: null, windows: [window()] };
    expect(quotaCoachFromSnapshot(source, now).status).toBe("stale");
    source.updatedAt = iso(3); expect(quotaCoachFromSnapshot(source, now).tone).toBeNull();
    source.updatedAt = iso(0); expect(quotaCoachFromSnapshot(source, now).tone).toBe("roomy");
  });
  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("formats complete scope/comparison and countdown messages in %s", language => {
    expect(formatCoachCountdown(7260, language)).not.toMatch(/[{}]/);
    expect(quotaCoachCopy(language, "comparison", { used: 20, elapsed: 28 })).not.toMatch(/[{}]/);
    expect(quotaCoachCopy(language, "scope")).not.toBe("");
  });
});
