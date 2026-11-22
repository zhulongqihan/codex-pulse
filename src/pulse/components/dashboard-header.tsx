import { Sparkles, RefreshCcw } from "lucide-react";
import type { OverviewResponse, UpdateCheckResponse } from "@/lib/api";
import type { UpdateInstallStatus, UpdateProgressState } from "@/hooks/use-usage-dashboard";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ReadingInfo } from "@/components/reading-info";
import { formatDuration } from "@/lib/usage-dashboard";
import dayjs from "dayjs";

export type DashboardView = "dashboard" | "analysis" | "models" | "projects" | "daily" | "monthly" | "sessions" | "settings" | "logs";

type DashboardHeaderProps = {
  updateInfo: UpdateCheckResponse | null;
  isUpdateDismissed: boolean;
  updateInstallStatus: UpdateInstallStatus;
  updateProgress: UpdateProgressState;
  onUpgrade: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isBusy: boolean;
  overview: OverviewResponse | null;
  scanMessage: string;
  lastRescanDurationMs: number | null;
  syncFailed?: boolean;
  secondaryRefresh?: boolean;
};

export function DashboardHeader({
  updateInfo,
  isUpdateDismissed,
  updateInstallStatus,
  updateProgress,
  onUpgrade,
  onRefresh,
  isRefreshing,
  isBusy,
  overview,
  scanMessage,
  lastRescanDurationMs,
  syncFailed = false,
  secondaryRefresh = false,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  const syncLabel = syncFailed ? t("recovery.last_scan_failed")
    : overview?.updatedAt ? t("hero.cache_synced") : t("hero.out_of_sync");
  const isInstallingUpdate = updateInstallStatus === "downloading";
  const headerUpgradeLabel = updateInstallStatus === "installed"
    ? t("header.restart_update")
    : isInstallingUpdate
      ? updateProgress.percent === null
        ? t("header.downloading_update")
        : t("header.downloading_update_progress", { percent: updateProgress.percent })
      : t("header.upgrade", { version: updateInfo?.latestVersion });

  const formatUpdatedTime = (timestamp: string) => {
    const updatedAt = dayjs(timestamp);
    const timeStr = updatedAt.format("HH:mm:ss");
    if (updatedAt.isSame(dayjs(), "day")) {
      return t("hero.updated_today", { time: timeStr, defaultValue: `Today at ${timeStr}` });
    }
    return `${updatedAt.format("YYYY-MM-DD")} ${timeStr}`;
  };

  const updatedLabel = overview?.updatedAt
    ? t("hero.last_updated", { time: formatUpdatedTime(overview.updatedAt) })
    : t("hero.last_updated_never");

  return (
    <header className="pb-2">
      <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border/80">
        <div className="min-w-0">
          {updateInfo?.hasUpdate && isUpdateDismissed && (
            <button
              type="button"
              onClick={onUpgrade}
              disabled={isInstallingUpdate}
              className="relative z-20 mb-2 inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              title={t("header.upgrade_title")}
            >
              <Sparkles className="h-3 w-3" />
              {headerUpgradeLabel}
            </button>
          )}
        </div>

        <div className="pb-2 min-w-0 flex flex-1 flex-wrap items-center justify-end gap-2">
          {(overview || syncFailed) && (
            <div data-testid="dashboard-sync-status" className="flex min-w-0 items-center gap-1">
              {syncFailed ? <span role="status" className="text-sm font-medium text-warning">{syncLabel}</span> : null}
              <ReadingInfo label={syncLabel}>
                {scanMessage && scanMessage !== syncLabel ? <p>{scanMessage}</p> : null}
                <p>{updatedLabel}</p>
                {lastRescanDurationMs !== null ? <p>{t("hero.rescan_duration", { duration: formatDuration(lastRescanDurationMs) })}</p> : null}
              </ReadingInfo>
            </div>
          )}
          <Button variant={secondaryRefresh ? "secondary" : "primary"} size="sm" className="relative z-20" onClick={onRefresh} disabled={isBusy} aria-busy={isRefreshing}>
            <RefreshCcw aria-hidden="true" className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {t("hero.rescan", { defaultValue: "Rescan local logs" })}
          </Button>
        </div>
      </div>
    </header>
  );
}
