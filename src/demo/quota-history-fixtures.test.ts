import { afterEach, describe, expect, it, vi } from "vitest";
import { createQuotaHistoryDemo } from "./quota-history-fixtures";

afterEach(() => vi.useRealTimers());

describe("synthetic ledger date boundary", () => {
  it("rolls queries over Shanghai midnight while preserving dated synthetic observations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T15:55:00Z"));
    const demo = createQuotaHistoryDemo(new Date());
    expect(demo.query("1d")).toMatchObject({ startDate: "2026-11-15", endDate: "2026-11-15" });
    const observations = demo.query("1d").daily;
    vi.setSystemTime(new Date("2026-11-15T16:05:00Z"));
    expect(demo.query("1d")).toMatchObject({ startDate: "2026-11-16", endDate: "2026-11-16", daily: [] });
    expect(demo.query("custom:2026-11-15_2026-11-15").daily).toEqual(observations);
    expect(demo.preferences().timezone).toBe("Asia/Shanghai");
  });
});
