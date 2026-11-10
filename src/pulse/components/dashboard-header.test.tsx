// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { DashboardHeader } from "./dashboard-header";
import type { OverviewResponse } from "@/lib/api";

const overview: OverviewResponse = {
  range: "1d", days: 1, timezone: "Europe/Berlin", startDate: "2026-11-10", endDate: "2026-11-10", updatedAt: "2026-11-10T08:00:00Z",
  daily: [], models: [], projects: [], totals: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0, avgTokensPerDay: 0, avgCostPerDay: 0, cacheHitRate: 0, costPerMillionTokens: 0 },
};

describe("dashboard synchronization header", () => {
  it("retains the complete long status while the refresh action remains named, usable, and busy-safe", async () => {
    await i18n.changeLanguage("de");
    const message = "18 Tage synchronisiert (18 aus dem Cache, 0 ausgewertet) – vollständige Statusmeldung";
    const onRefresh = vi.fn();
    const props = { updateInfo: null, isUpdateDismissed: false, updateInstallStatus: "idle" as const,
      updateProgress: { downloaded: 0, total: null, percent: null, finished: false },
      onUpgrade: vi.fn(), onRefresh, isRefreshing: false, isBusy: false,
      overview, scanMessage: message, lastRescanDurationMs: 1234 };
    const { rerender } = render(<DashboardHeader {...props} />);
    const status = screen.getByTestId("dashboard-sync-status");
    expect(within(status).getByTitle(message)).toHaveTextContent(message);
    expect(within(status).getByTitle(i18n.t("hero.cache_synced"))).toHaveTextContent(i18n.t("hero.cache_synced"));
    const refresh = screen.getByRole("button", { name: i18n.t("hero.rescan") });
    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledOnce();
    rerender(<DashboardHeader {...props} isBusy isRefreshing syncFailed />);
    expect(screen.getByRole("button", { name: i18n.t("hero.rescan") })).toBeDisabled();
    expect(within(status).getByTitle(message)).toHaveTextContent(message);
    expect(within(status).getByTitle(i18n.t("hero.out_of_sync"))).toHaveTextContent(i18n.t("hero.out_of_sync"));
  });
});
