import { describe, expect, it } from "vitest";
import type { CodexLimitsResponse } from "./api";
import { hasReturnedQuota } from "./first-use";

const account: CodexLimitsResponse = { session: null, weekly: null, updatedAt: "2026-11-14T09:00:00Z", source: "synthetic" };
describe("first usable quota reading", () => {
  it("does not infer quota from a successful account response without windows", () => {
    expect(hasReturnedQuota(null)).toBe(false);
    expect(hasReturnedQuota(account)).toBe(false);
  });
  it("accepts a weekly-only reading, including zero remaining, without a forecast", () => {
    expect(hasReturnedQuota({ ...account, weekly: { usedPercent: 100, remainingPercent: 0, windowMinutes: 10080, resetsAt: null } })).toBe(true);
  });
  it.each([NaN, Infinity, -1, 101])("does not treat invalid remaining percentage %s as a valid reading", remainingPercent => {
    expect(hasReturnedQuota({ ...account, weekly: { usedPercent: 20, remainingPercent, windowMinutes: 10080, resetsAt: null } })).toBe(false);
  });
});
