import { describe, expect, it } from "vitest";
import { localTimeZone, timeZoneLabel } from "./time-context";

describe("time context labels", () => {
  it("keeps an explicit statistics zone separate from the runtime local zone", () => {
    const label = timeZoneLabel("Asia/Shanghai", "en", Date.parse("2026-11-07T00:15:00Z"));
    expect(label).toBe("Asia/Shanghai (UTC+8)");
    expect(localTimeZone()).toEqual(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("uses the displayed instant for daylight-saving offsets", () => {
    expect(timeZoneLabel("America/Los_Angeles", "en", Date.parse("2026-07-01T00:00:00Z"))).toContain("UTC-7");
    expect(timeZoneLabel("America/Los_Angeles", "en", Date.parse("2026-12-01T00:00:00Z"))).toContain("UTC-8");
  });

  it("does not silently substitute another zone for an unsupported label or invalid time", () => {
    expect(timeZoneLabel("not-a-timezone", "en")).toBe("not-a-timezone");
    expect(timeZoneLabel("Asia/Shanghai", "en", NaN)).toBe("Asia/Shanghai");
  });
});
