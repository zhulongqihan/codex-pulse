import { describe, expect, it } from "vitest";
import { quotaWindowKind } from "./quota-windows";

describe("quota window meaning", () => {
  it("uses the returned duration without guessing from membership or labelling every long window weekly", () => {
    const window = (windowMinutes: number | null) => ({ usedPercent: 0, remainingPercent: 100, resetsAt: null, windowMinutes });
    expect(quotaWindowKind(window(300))).toBe("5h");
    expect(quotaWindowKind(window(10080))).toBe("weekly");
    expect(quotaWindowKind(window(43200))).toBe("monthly");
    for (const duration of [null, 0, 60, 14400, 86400]) expect(quotaWindowKind(window(duration))).toBe("custom");
    expect(quotaWindowKind(null)).toBe("custom");
  });
});
