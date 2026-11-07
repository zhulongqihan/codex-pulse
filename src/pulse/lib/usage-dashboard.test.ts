import { describe, expect, it } from "vitest";
import { getExportFileName } from "./usage-dashboard";
import type { OverviewResponse } from "./api";

describe("range export paths", () => {
  it("uses a Windows-safe name for a custom range and retains both inclusive dates", () => {
    const overview = { startDate: "2026-10-01", endDate: "2026-11-06" } as OverviewResponse;
    for (const format of ["xlsx", "markdown"] as const) {
      const name = getExportFileName("custom:2026-10-01_2026-11-06", overview, format);
      expect(name).not.toMatch(/[<>:"/\\|?*]/);
      expect(name).toContain("2026-10-01_to_2026-11-06");
      expect(name).toMatch(/^codex-pulse-custom-/);
    }
  });
});
