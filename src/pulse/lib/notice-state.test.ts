import { describe, expect, it } from "vitest";
import { syntheticCoachSnapshot, type PaceNoticeState } from "./pulse-pace";
import { quotaCoachFromSnapshot } from "./quota-pace-coach";

const now = Date.parse("2026-11-11T10:00:00Z");
const iso = (offset: number) => new Date(now + offset).toISOString();
const state = (status: PaceNoticeState["status"], checkedAt: string | null = iso(0), validUntil: string | null = iso(3600_000)): PaceNoticeState => ({ status, checkedAt, validUntil });
const data = () => syntheticCoachSnapshot("notice", new Date(now));

describe("reset notice lifetime independent of account quota", () => {
  it("accepts an active legacy notice but never infers withdrawal from a missing field or null", () => {
    const value = data(); delete value.coachExtras!.noticeState;
    expect(quotaCoachFromSnapshot(value, now).noticeState.status).toBe("active");
    value.coachExtras!.resetNotice = null;
    const result = quotaCoachFromSnapshot(value, now);
    expect(result.noticeState).toEqual({ status: "unknown", checkedAt: null, validUntil: null });
    expect(result.resetNotice).toBeNull();
  });
  it("expires a notice independently of a fresh quota, source check and conflicting metadata deadline", () => {
    const value = data(); value.coachExtras!.resetNotice!.endAt = iso(-1);
    value.coachExtras!.resetNotice!.startAt = iso(-60_000);
    value.coachExtras!.noticeState = state("active");
    const result = quotaCoachFromSnapshot(value, now);
    expect(result.status).toBe("ready"); expect(result.resetNotice).toBeNull(); expect(result.noticeState.status).toBe("expired");
  });
  it("stops an old source being active even when the last query completed recently", () => {
    const value = data(); value.coachExtras!.resetNotice!.updatedAt = iso(-300_001);
    value.coachExtras!.noticeState = state("active");
    const result = quotaCoachFromSnapshot(value, now);
    expect(result.resetNotice).toBeNull(); expect(result.noticeState.status).toBe("stale"); expect(result.noticeState.checkedAt).toBe(iso(0));
  });
  it("limits a notice without an end time to 24 hours from publication", () => {
    const value = data(); value.coachExtras!.resetNotice!.endAt = null;
    value.coachExtras!.resetNotice!.publishedAt = iso(-86_400_000);
    value.coachExtras!.noticeState = state("active", iso(0), null);
    expect(quotaCoachFromSnapshot(value, now).resetNotice).toBeNull(); expect(quotaCoachFromSnapshot(value, now).noticeState.status).toBe("expired");
  });
  it.each(["none", "unavailable"] as const)("does not keep an old %s check current", status => {
    const value = data(); value.coachExtras!.resetNotice = null; value.coachExtras!.noticeState = state(status, iso(-300_001));
    expect(quotaCoachFromSnapshot(value, now).noticeState.status).toBe("stale");
  });
  it("keeps the current failed query visible when the previous notice also expired", () => {
    const value = data(); value.coachExtras!.noticeState = state("unavailable", iso(0), iso(-60_000));
    const result = quotaCoachFromSnapshot(value, now);
    expect(result.resetNotice).toBeNull(); expect(result.noticeState).toEqual(state("unavailable", iso(0), iso(-60_000)));
  });
  it("requires an actual recent successful check for none and never invents its time", () => {
    const value = data(); value.coachExtras!.resetNotice = null;
    for (const checkedAt of [null, "invalid", iso(120_001)]) {
      value.coachExtras!.noticeState = state("none", checkedAt, null);
      expect(quotaCoachFromSnapshot(value, now).noticeState).toEqual(state("unknown", null, null));
    }
    value.coachExtras!.noticeState = state("none", iso(0), null);
    expect(quotaCoachFromSnapshot(value, now).noticeState).toEqual(state("none", iso(0), null));
  });
  it.each([{ sourceUrl: "javascript:alert(1)" }, { verification: "official" }, { scope: "personal" }, { id: "" }, { updatedAt: "invalid" }, { endAt: "invalid" }])("does not explain disappearance using an untrusted raw notice: %j", invalid => {
    const value = data(); delete value.coachExtras!.noticeState;
    Object.assign(value.coachExtras!.resetNotice!, { startAt: iso(-120_000), endAt: iso(-60_000), updatedAt: iso(-360_000) }, invalid);
    const unknown = quotaCoachFromSnapshot(value, now);
    expect(unknown.resetNotice).toBeNull(); expect(unknown.noticeState).toEqual(state("unknown", null, null));
    value.coachExtras!.noticeState = state("expired", iso(0), iso(-60_000));
    expect(quotaCoachFromSnapshot(value, now).noticeState).toEqual(state("expired", iso(0), iso(-60_000)));
  });
});
