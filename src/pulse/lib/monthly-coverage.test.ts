import { describe, expect, it } from "vitest";
import { monthCoverage } from "./monthly-coverage";

describe("natural-month retention", () => {
  it("distinguishes missing history, a partially retained first month, and later observed months", () => {
    expect(monthCoverage("2026-09", "2026-10-15")).toBe("unavailable");
    expect(monthCoverage("2026-10", "2026-10-15")).toBe("partial");
    expect(monthCoverage("2026-11", "2026-10-15")).toBe("retained");
    expect(monthCoverage("2026-10", "2026-10-01")).toBe("retained");
    expect(monthCoverage("2026-11", null)).toBe("unavailable");
  });
});
