import { UsageRecoveryCard } from "@/components/usage-recovery-card";
import { ScanWaitNotice } from "@/components/scan-wait-notice";
import { CodexForecastCard } from "@/components/codex-forecast-card";
import { CodexLimitsCard, CodexSidebarLimits } from "@/components/codex-limits-card";
import { CodexResetHistoryModal } from "@/components/codex-reset-history";
import { DailyUsageTable } from "@/components/daily-usage-table";
import { DashboardHeroCard } from "@/components/dashboard-hero-card";
import { AppSidebar, clampSidebarWidth } from "@/components/app-sidebar";
import { DashboardHeader, type DashboardView } from "@/components/dashboard-header";
import { LoadingState } from "@/components/loading-state";
import { LogPanel } from "@/components/log-panel";
import { ModelsPage } from "@/components/models-page";
import { MonthlyUsageTable } from "@/components/monthly-usage-table";
import { ProjectUsageCard } from "@/components/project-usage-card";
import { SettingsPage, type SettingsSection } from "@/components/settings-page";
import { PulseAccountDrawer } from "@/components/pulse-account-drawer";
import { PulseGettingStarted } from "@/components/pulse-getting-started";
import { PulseBrandMark } from "@/components/pulse-brand-mark";
import { PulseCoachOverview } from "@/components/pulse-coach-overview";
import { SessionUsageTable } from "@/components/session-usage-table";
import { SessionDetailModal } from "@/components/session-detail-modal";
import { ProjectSessionsModal } from "@/components/project-sessions-modal";
import { RangeSwitcher } from "@/components/range-switcher";
import { useUsageDashboard } from "@/hooks/use-usage-dashboard";
import { buildMetricCards, getRangeLabel } from "@/lib/usage-dashboard";
import { getReleaseNotes } from "@/lib/release-notes";
import type { SessionDetailRow } from "@/lib/api";
import { Activity, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PulseStyleSwitcher } from "@/components/pulse-appearance-controls";
import { usePulseCopy } from "@/lib/pulse-copy";
import { usePulsePreferences } from "@/lib/pulse-appearance";
import { useShellCopy } from "@/lib/shell-copy";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sparkles, X, ChevronDown, ChevronUp, AlertTriangle, ArrowLeft, UserRound, Settings2, MonitorUp, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import "./shell-ux.css";

const QUICK_START_DISMISSED = "codexpulse.quickstart.dismissed.v1";
function useCompactWindow() {
  const read = () => window.matchMedia?.("(max-width: 1100px)").matches ?? window.innerWidth <= 1100;
  const [compact, setCompact] = useState(read);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 1100px)");
    const update = () => setCompact(read());
    media?.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => { media?.removeEventListener?.("change", update); window.removeEventListener("resize", update); };
  }, []);
  return compact;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const copy = usePulseCopy();
  const shellCopy = useShellCopy();
  const preferences = usePulsePreferences();
  const [accountExpanded, setAccountExpanded] = useState(true);
  const compactWindow = useCompactWindow();
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>("appearance");
  const [settingsEntry, setSettingsEntry] = useState(0);
  const [showQuickStart, setShowQuickStart] = useState(() => { try { return localStorage.getItem(QUICK_START_DISMISSED) !== "true"; } catch { return true; } });
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [desktopAction, setDesktopAction] = useState<"widget" | "shortcuts" | null>(null);
  const [desktopNotice, setDesktopNotice] = useState<string | null>(null);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const contentScroll = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const visitedViews = useRef(new Set<DashboardView>(["dashboard"]));
  const [showNotes, setShowNotes] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar_width");
      return saved !== null && Number.isFinite(Number(saved)) ? clampSidebarWidth(Number(saved)) : 184;
    } catch {
      return 184;
    }
  });
  const [settingsReturnView, setSettingsReturnView] = useState<DashboardView>("dashboard");
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  const [selectedProjectForModal, setSelectedProjectForModal] = useState<{
    project: string;
    displayName: string;
    codexProjectId?: string;
    codexProjectName?: string;
    codexProjectRoot?: string;
    totalTokens: number;
    costUSD: number | null;
  } | null>(null);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);
  const [projectDataRevision, setProjectDataRevision] = useState(0);
  const [selectedSession, setSelectedSession] = useState<SessionDetailRow | null>(null);
  const [isResetHistoryOpen, setIsResetHistoryOpen] = useState(false);
  const {
    view,
    range,
    overview,
    todayOverview,
    isTodayStale,
    monthlyUsage,
    codexLimits,
    codexLimitsError,
    isLimitsRefreshing,
    isWindowActivating,
    windowActivationStatus,
    windowActivationError,
    forecast,
    isScanning,
    hasScanned,
    scanError,
    diagnostics,
    diagnosticsError,
    isLimitsLoading,
    isResetLoading,
    resetError,
    handleCodexHomeChange,
    latestCodexReset,
    recentCodexResets,
    scanMessage,
    error,
    isLoading,
    isMonthlyLoading,
    isRefreshing,
    isResetting,
    isExporting,
    exportError,
    lastRescanDurationMs,
    updateInfo,
    isUpdateChecking,
    updateCheckError,
    updateInstallStatus,
    updateProgress,
    updateInstallError,
    isUpdateDismissed,
    launchAtLogin,
    launchAtLoginKnown,
    launchAtLoginError,
    isLaunchAtLoginUpdating,
    showSessionCredits,
    setShowSessionCredits,
    showLogsTab,
    setShowLogsTab,
    autoRefreshIntervalMinutes,
    setAutoRefreshIntervalMinutes,
    sessions,
    isSessionsLoading,
    handleViewChange,
    handleRangeChange,
    handlePricingRefreshed,
    handleLocalScanComplete,
    handleRefresh,
    handleLimitsRefresh,
    handleActivateCodexWindow,
    handleReset,
    handleExport,
    handleDismissUpdate,
    handleManualUpdateCheck,
    handleUpgrade,
    handleOpenUpdateRelease,
    handleOpenResetCredits,
    handleLaunchAtLoginChange,
    trayTitleShow,
    handleTrayTitleShowChange,
    trayMenuShow,
    handleTrayMenuShowChange,
    trayCountdownUnits,
    handleTrayCountdownUnitChange,
  } = useUsageDashboard();

  const [paceDetailsRequested, setPaceDetailsRequested] = useState(false);
  useEffect(() => {
    if (!paceDetailsRequested || view !== "dashboard") return;
    let frame = 0;
    const focusDetails = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.getElementById("pulse-account-details");
        if (!target || !document.hasFocus()) return;
        target.scrollIntoView({ block: "start", behavior: "auto" });
        target.focus({ preventScroll: true });
        if (document.activeElement === target) setPaceDetailsRequested(false);
      });
    };
    window.addEventListener("focus", focusDetails);
    focusDetails();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("focus", focusDetails); };
  }, [paceDetailsRequested, view]);
  const paceDetails = useRef<() => void>(() => {});
  paceDetails.current = () => {
    setSelectedProjectForModal(null);
    setSelectedSession(null);
    setIsResetHistoryOpen(false);
    setAccountDrawerOpen(false);
    setAccountExpanded(true);
    savedScroll.current = 0;
    setPaceDetailsRequested(true);
    void handleViewChange("dashboard");
  };
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen("pulse-show-pace-details", () => paceDetails.current()).then(unlisten => {
      if (disposed) unlisten();
      else stop = unlisten;
    }).catch(() => { /* The public browser preview has no native window events. */ });
    return () => { disposed = true; stop?.(); };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebar_collapsed", String(sidebarCollapsed));
      localStorage.setItem("sidebar_width", String(sidebarWidth));
    } catch {
      // Keep the sidebar usable when local storage is unavailable.
    }
  }, [sidebarCollapsed, sidebarWidth]);

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", preventContextMenu);
    return () => window.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  const isRateLimitError = !!(
    updateInfo?.releaseNotes?.includes("GitHub API rate limit exceeded") ||
    updateInfo?.releaseNotes?.includes("GitHub API 访问受限")
  );

  const parsedReleaseNotes = useMemo(() => {
    if (!updateInfo?.releaseNotes) return "";
    return getReleaseNotes(updateInfo.releaseNotes, i18n.resolvedLanguage ?? i18n.language);
  }, [updateInfo?.releaseNotes, i18n.language, i18n.resolvedLanguage]);

  const metrics = overview ? buildMetricCards(overview, range, t) : [];
  const projects = overview?.projects ?? [];
  const loadingTitle = overview ? t("loading.loading_range", { range: getRangeLabel(range, t) }) : t("loading.preparing_cache");
  const loadingDescription = overview
    ? t("loading.selected_window_desc")
    : t("loading.cached_snapshot_desc");
  const awaitingFirstScan = !hasScanned && !overview?.updatedAt;
  const showRecovery = !isLoading && (awaitingFirstScan || !!scanError || !!error || (view === "dashboard" && (!overview || overview.totals.totalTokens === 0)));
  const showDashboard = !awaitingFirstScan && overview;
  const isInstallingUpdate = updateInstallStatus === "downloading";
  const isUpdateInstalled = updateInstallStatus === "installed";
  const updateButtonLabel = isUpdateInstalled
    ? t("update.restart_now")
    : isInstallingUpdate
      ? updateProgress.percent === null
        ? t("update.downloading")
        : t("update.downloading_progress", { percent: updateProgress.percent })
      : t("update.upgrade_now");

  visitedViews.current.add(view);
  const previousView = useRef(view);
  useLayoutEffect(() => {
    if (contentScroll.current) {
      if (view === "settings") contentScroll.current.scrollTop = 0;
      else if (previousView.current === "settings") contentScroll.current.scrollTop = savedScroll.current;
    }
    previousView.current = view;
  }, [view]);
  useEffect(() => { if (!compactWindow) setAccountDrawerOpen(false); }, [compactWindow]);
  const navigate = (nextView: DashboardView) => {
    if (nextView === "settings" && view !== "settings") {
      setSettingsReturnView(view);
      savedScroll.current = contentScroll.current?.scrollTop ?? 0;
    }
    if (nextView !== "settings" && view !== "settings") {
      setSelectedProjectForModal(null);
      setSelectedSession(null);
      setIsResetHistoryOpen(false);
    }
    void handleViewChange(nextView);
  };

  const openSettings = (section: SettingsSection = "appearance") => { setSettingsInitialSection(section); setSettingsEntry(value => value + 1); navigate("settings"); };
  const showAccount = () => { if (compactWindow) setAccountDrawerOpen(true); else setAccountExpanded(true); };
  const openHelp = () => { setShowQuickStart(true); setHelpExpanded(true); navigate("dashboard"); savedScroll.current = 0; if (contentScroll.current) contentScroll.current.scrollTop = 0; };
  const dismissQuickStart = () => { setShowQuickStart(false); setHelpExpanded(false); try { localStorage.setItem(QUICK_START_DISMISSED, "true"); } catch { /* The help remains available without storage. */ } };
  async function runDesktopAction(action: "widget" | "shortcuts") {
    if (desktopAction) return;
    setDesktopError(null); setDesktopNotice(null);
    if (new URLSearchParams(location.search).get("demo") === "1" && import.meta.env.MODE !== "e2e") { setDesktopNotice(shellCopy("previewNote")); return; }
    setDesktopAction(action);
    try {
      if (action === "widget") { await invoke("widget_action", { action: "show" }); setDesktopNotice(shellCopy("widgetVisible")); }
      else { await invoke("create_pulse_shortcuts"); setDesktopNotice(shellCopy("shortcutsDone")); }
    } catch (cause) { setDesktopError(`${shellCopy(action === "widget" ? "widgetError" : "shortcutsError")}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    finally { setDesktopAction(null); }
  }
  const quotaSummary = [codexLimits?.session, codexLimits?.weekly].filter(window => window != null).map(window => `${Math.round(window.remainingPercent)}%`).join(" / ");
  const accountPanel = <>
    <div className="pulse-account-identity"><UserRound size={20} aria-hidden="true"/><div><strong>{codexLimits?.account ?? copy("unknown")}</strong><p>{codexLimits?.membershipLevel ?? "—"}{codexLimits?.workspaceName ? ` · ${codexLimits.workspaceName}` : ""}</p></div></div>
    <CodexSidebarLimits compact={false} limits={codexLimits} error={codexLimitsError} isLimitsRefreshing={isLimitsRefreshing} isWindowActivating={isWindowActivating} windowActivationStatus={windowActivationStatus} windowActivationError={windowActivationError} onRefreshLimits={() => void handleLimitsRefresh()} onActivateWindow={() => void handleActivateCodexWindow()}/>
    <p className="pulse-source-note">{copy("accountNote")}</p>
    <button type="button" className="pulse-text-button" onClick={() => paceDetails.current()}>{copy("details")} →</button>
  </>;

  return (
    <div className="pulse-app relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="pulse-topbar">
        <div className="pulse-brand"><PulseBrandMark size={28}/><strong>Pulse</strong>{document.documentElement.dataset.demo === "true" ? <span className="pulse-demo-label">{copy("sample")}</span> : null}<span className="pulse-page-label">{t(`common.${view === "models" ? "model" : view === "projects" ? "project" : view}`)}</span></div>
        <div className="pulse-global-actions"><PulseStyleSwitcher/>
          <button type="button" data-testid="open-widget" className="pulse-shell-action pulse-widget-action" disabled={desktopAction !== null} aria-busy={desktopAction === "widget"} onClick={() => void runDesktopAction("widget")}><MonitorUp size={16}/><span>{shellCopy(desktopAction === "widget" ? "widgetBusy" : preferences.widgetVisible ? "widgetVisible" : "widget")}</span></button>
          <button type="button" data-testid="account-toggle" className="pulse-shell-action" aria-label={shellCopy("account")} aria-expanded={compactWindow ? accountDrawerOpen : accountExpanded} aria-controls={compactWindow ? "pulse-account-drawer" : "pulse-account-rail"} onClick={() => compactWindow ? setAccountDrawerOpen(true) : setAccountExpanded(value => !value)}><UserRound size={17}/><span>{shellCopy("account")}</span>{compactWindow && quotaSummary ? <small className="pulse-account-summary">{quotaSummary} {shellCopy("remaining")}</small> : null}</button>
          <button type="button" data-testid="help" className="pulse-shell-action pulse-help-action" onClick={openHelp} aria-label={shellCopy("help")} title={shellCopy("help")}><CircleHelp size={17}/><span>{shellCopy("help")}</span></button>
          <button type="button" className="pulse-icon-button" aria-label={copy("appearance")} title={t("common.settings")} onClick={() => openSettings()}><Settings2 size={18}/></button>
        </div>
      </header>
      {(!showQuickStart || view !== "dashboard") && (desktopError || desktopNotice) ? <p className={`pulse-shell-notice ${desktopError ? "pulse-error" : ""}`} role={desktopError ? "alert" : "status"}>{desktopError ?? desktopNotice}</p> : null}
      <div className="pulse-workspace">
      <div data-tauri-drag-region aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-[var(--window-controls-height)] select-none" />
      {true ? (
        <AppSidebar
          view={view}
          onViewChange={next => next === "settings" ? openSettings() : navigate(next)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          showLogsTab={showLogsTab}
          limits={null}
        />
      ) : null}
      <div className="pulse-main-column relative flex min-w-0 flex-1 flex-col bg-background">
      <div aria-hidden="true" className="h-[var(--window-controls-height)] shrink-0" />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden [container-type:inline-size] [container-name:app-content]" data-app-content>
      {view === "settings" ? (
        <div className="mx-auto w-full max-w-layout shrink-0 px-6 pt-4 content-sm:px-8 content-lg:px-10">
          <header className="flex items-center gap-3 border-b border-border/80 pb-3">
            <Button variant="secondary" size="sm" onClick={() => navigate(settingsReturnView === "logs" && !showLogsTab ? "dashboard" : settingsReturnView)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("common.back")}
            </Button>
          </header>
        </div>
      ) : null}
      <div
        ref={contentScroll}
        className="min-h-0 flex-1 overflow-y-auto pulse-main-scroll"
        aria-hidden={view !== "settings" && (selectedProjectForModal || selectedSession || isResetHistoryOpen) ? "true" : undefined}
        inert={view !== "settings" && (selectedProjectForModal || selectedSession || isResetHistoryOpen) ? true : undefined}
      >
      <div className={`relative mx-auto flex min-h-full w-full max-w-layout flex-col px-6 pb-8 content-sm:px-8 content-lg:px-10 ${view === "settings" ? "pt-0" : "pt-4"}`}>

        {view !== "settings" ? <DashboardHeader
          updateInfo={updateInfo}
          isUpdateDismissed={isUpdateDismissed}
          updateInstallStatus={updateInstallStatus}
          updateProgress={updateProgress}
          onUpgrade={() => void handleUpgrade()}
          onRefresh={() => void handleRefresh()}
          isRefreshing={isRefreshing || isScanning}
          isBusy={isLoading || isScanning || isRefreshing || isResetting || isExporting !== null}
          overview={overview}
          scanMessage={scanError ? t("recovery.last_scan_failed") : scanMessage}
          syncFailed={!!scanError}
          lastRescanDurationMs={lastRescanDurationMs}
        /> : null}

        <main className={view === "dashboard" ? "flex-1 py-3" : "flex-1 py-6"}>
          {updateInfo?.hasUpdate && !isUpdateDismissed ? (
            <div className="pulse-update-banner mb-6 rounded-lg border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      {t("update.new_version", { version: updateInfo.latestVersion })}
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-medium text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">
                        {t("update.latest_badge")}
                      </span>
                    </h3>
                    <p className="text-sm text-muted-foreground leading-normal">
                      {t("update.banner_text", { currentVersion: updateInfo.currentVersion })}
                      {updateInfo.releaseName ? ` "${updateInfo.releaseName}"` : ""}
                    </p>

                    {updateInfo.releaseNotes ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition"
                          onClick={() => setShowNotes(!showNotes)}
                        >
                          {showNotes ? (
                            <>
                              {t("update.hide_release_notes")} <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              {t("update.view_release_notes")} <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </button>

                        {showNotes ? (
                          isRateLimitError ? (
                            <div className="mt-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300 leading-normal flex items-start gap-2 select-text font-sans">
                              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="whitespace-pre-wrap">
                                {t("update.rate_limit_error")}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-indigo-50/50 dark:bg-black/25 p-3 text-xs text-muted-foreground border border-indigo-100 dark:border-white/5 font-mono whitespace-pre-wrap leading-relaxed select-text">
                              {parsedReleaseNotes}
                            </div>
                          )
                        ) : null}
                      </div>
                    ) : null}
                    {updateInstallError ? (
                      <div className="pt-2 text-xs text-error dark:text-red-400">
                        {updateInstallError}
                        {updateInfo.releaseUrl ? (
                          <button
                            type="button"
                            className="ml-2 font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                            onClick={() => void handleOpenUpdateRelease()}
                          >
                            {t("update.view_release")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {isInstallingUpdate ? (
                      <div className="pt-2">
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-500/15"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={updateProgress.percent ?? undefined}
                        >
                          <div
                            className={`h-full rounded-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-400 ${
                              updateProgress.percent === null ? "w-1/2 animate-pulse" : ""
                            }`}
                            style={updateProgress.percent === null ? undefined : { width: `${updateProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                    onClick={() => void handleUpgrade()}
                    disabled={isInstallingUpdate}
                  >
                    {updateButtonLabel}
                  </Button>
                  <button
                    type="button"
                    onClick={handleDismissUpdate}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-indigo-100/50 dark:hover:bg-white/5 hover:text-foreground transition"
                    aria-label={t("update.dismiss_aria")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <ScanWaitNotice active={isLoading || isScanning} diagnostics={diagnostics} />
          {showRecovery && view !== "settings" ? (
            <UsageRecoveryCard
              scanning={isScanning}
              pending={awaitingFirstScan && isScanning}
              error={scanError || error}
              diagnostics={diagnostics}
              diagnosticsError={diagnosticsError}
              hasCachedData={!!overview?.updatedAt}
              busy={isRefreshing || isResetting}
              onRetry={() => void handleRefresh()}
              onDetect={() => void handleCodexHomeChange(false)}
              onChoose={() => void handleCodexHomeChange(true)}
              onExpandRange={() => void handleRangeChange("365d")}
            />
          ) : null}

          {isLoading ? <LoadingState title={loadingTitle} description={loadingDescription} /> : null}

          {view === "monthly" && isMonthlyLoading ? (
            <LoadingState title={t("loading.loading_monthly")} description={t("loading.natural_month_desc")} />
          ) : null}

          {view === "sessions" && isSessionsLoading ? (
            <LoadingState title={t("loading.loading_sessions")} description={t("loading.session_logs_desc")} />
          ) : null}

          {visitedViews.current.has("dashboard") ? (
            <Activity mode={view === "dashboard" ? "visible" : "hidden"}>
            <div className="space-y-5">
              {showQuickStart ? <PulseGettingStarted expanded={helpExpanded} onExpand={() => setHelpExpanded(value => !value)} localReady={!!overview?.updatedAt || diagnostics?.status === "ready"} accountReady={!!codexLimits} source={diagnostics?.codexHome} busy={desktopAction !== null} notice={desktopNotice} error={desktopError} onSource={() => openSettings("source")} onAccount={showAccount} onWidget={() => void runDesktopAction("widget")} onShortcuts={() => void runDesktopAction("shortcuts")} onDismiss={dismissQuickStart}/> : null}
              {!showDashboard || !overview ? <PulseCoachOverview onDetails={() => paceDetails.current()}/> : null}
              {showDashboard && overview ? <DashboardHeroCard
                overview={overview}
                  todayOverview={todayOverview}
                  todayUnavailable={!isLoading && !todayOverview}
                  todayStale={isTodayStale}
                  onOpenToday={() => { const today = new Intl.DateTimeFormat("sv-SE", { timeZone: todayOverview?.timezone || overview.timezone }).format(new Date()); setSelectedSessionDate(today); void handleRangeChange("1d"); void handleViewChange("sessions"); }}
                range={range}
                isBusy={isLoading || isRefreshing || isResetting || isExporting !== null}
                isExporting={isExporting}
                exportError={exportError}
                onRangeChange={handleRangeChange}
                onExport={(format) => void handleExport(format)}
                metrics={metrics}
                codexLimits={codexLimits}
                coach={<PulseCoachOverview onDetails={() => paceDetails.current()}/>}
                onOpenDay={(date) => { setSelectedSessionDate(date); void handleViewChange("sessions"); }}
              /> : null}

              <section id="pulse-account-details" className="pulse-account-details" tabIndex={-1} aria-labelledby="pulse-account-details-heading">
                <h2 id="pulse-account-details-heading">{copy("details")}</h2>
                <CodexLimitsCard
                  limits={codexLimits}
                  isLimitsLoading={isLimitsLoading}
                  limitsError={codexLimitsError}
                  isResetLoading={isResetLoading}
                  resetError={resetError}
                  latestReset={latestCodexReset}
                  recentResets={recentCodexResets}
                  onOpenResetHistory={() => setIsResetHistoryOpen(true)}
                  onOpenResetCredits={() => void handleOpenResetCredits()}
                />
              </section>
              <CodexForecastCard {...forecast} resets={recentCodexResets} onRefresh={() => void forecast.refresh()} />
            </div>
            </Activity>
          ) : null}

          {visitedViews.current.has("models") && overview ? (
            <Activity mode={view === "models" ? "visible" : "hidden"}>
            <ModelsPage models={overview.models} range={range} onRangeChange={handleRangeChange} onPricingRefreshed={handlePricingRefreshed} />
            </Activity>
          ) : null}

          {visitedViews.current.has("projects") && overview ? (
            <Activity mode={view === "projects" ? "visible" : "hidden"}>
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">{t("projects.title")}</h2>
                  <p className="text-sm text-muted-foreground">{t("projects.subtitle")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <RangeSwitcher value={range} onChange={handleRangeChange} />
                </div>
              </div>
              <ProjectUsageCard
                projects={projects}
                projectDaily={overview.projectDaily}
                onProjectClick={(proj) => setSelectedProjectForModal(proj)}
              />
            </div>
            </Activity>
          ) : null}

          {visitedViews.current.has("daily") && overview ? (
            <Activity mode={view === "daily" ? "visible" : "hidden"}>
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">{t("daily.title", { defaultValue: "Daily Usage Details" })}</h2>
                  <p className="text-sm text-muted-foreground">{t("daily.subtitle")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <RangeSwitcher value={range} onChange={handleRangeChange} />
                </div>
              </div>
              <DailyUsageTable
                range={range}
                daily={overview.daily}
                onRowClick={(date) => {
                  setSelectedSessionDate(date);
                  void handleViewChange("sessions");
                }}
              />
            </div>
            </Activity>
          ) : null}

          {visitedViews.current.has("monthly") && monthlyUsage ? (
            <Activity mode={view === "monthly" ? "visible" : "hidden"}>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">{t("monthly.title")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("monthly.subtitle", { start: monthlyUsage.startMonth, end: monthlyUsage.endMonth, tz: monthlyUsage.timezone })}
                </p>
              </div>
              <MonthlyUsageTable data={monthlyUsage} />
            </div>
            </Activity>
          ) : null}

          {visitedViews.current.has("sessions") && (!isSessionsLoading || sessions.length > 0) ? (
            <Activity mode={view === "sessions" ? "visible" : "hidden"}>
            <SessionUsageTable
              sessions={sessions}
              showSessionCredits={showSessionCredits}
              creditsActive={view === "sessions" && !selectedProjectForModal && !selectedSession && !isResetHistoryOpen}
              initialExpandedDate={selectedSessionDate}
              selectedProject={selectedProjectFilter}
              onClearProjectFilter={() => setSelectedProjectFilter(null)}
              onSessionClick={setSelectedSession}
            />
            </Activity>
          ) : null}

          {!isLoading && view === "settings" ? (
            <SettingsPage
              key={settingsEntry}
              initialSection={settingsInitialSection}
              isResetting={isResetting}
              isDisabled={isLoading || isMonthlyLoading || isRefreshing || isResetting || isExporting !== null}
              onReset={() => void handleReset()}
              updateInfo={updateInfo}
              isUpdateChecking={isUpdateChecking}
              updateCheckError={updateCheckError}
              updateInstallStatus={updateInstallStatus}
              updateProgress={updateProgress}
              updateInstallError={updateInstallError}
              onCheckUpdates={() => void handleManualUpdateCheck()}
              onUpgrade={() => void handleUpgrade()}
              onOpenUpdateRelease={() => void handleOpenUpdateRelease()}
              launchAtLogin={launchAtLogin}
              launchAtLoginKnown={launchAtLoginKnown}
              launchAtLoginError={launchAtLoginError}
              isLaunchAtLoginUpdating={isLaunchAtLoginUpdating}
              onLaunchAtLoginChange={(enabled) => void handleLaunchAtLoginChange(enabled)}
              showSessionCredits={showSessionCredits}
              onShowSessionCreditsChange={setShowSessionCredits}
              showLogsTab={showLogsTab}
              onShowLogsTabChange={setShowLogsTab}
              autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
              onAutoRefreshIntervalChange={setAutoRefreshIntervalMinutes}
              trayTitleShow={trayTitleShow}
              onTrayTitleShowChange={handleTrayTitleShowChange}
              trayMenuShow={trayMenuShow}
              onTrayMenuShowChange={handleTrayMenuShowChange}
              trayCountdownUnits={trayCountdownUnits}
              onTrayCountdownUnitChange={handleTrayCountdownUnitChange}
              codexLimits={codexLimits}
              diagnostics={diagnostics}
              onChooseSource={() => void handleCodexHomeChange(true)}
              onDetectSource={() => void handleCodexHomeChange(false)}
              operationError={scanError || error}
            />
          ) : null}

          <div className={!isLoading && view === "logs" ? "block" : "hidden"}>
            <LogPanel isActive={!isLoading && view === "logs"} />
          </div>


        </main>
      </div>
      </div>
      {selectedProjectForModal && (
        <div hidden={view === "settings"} inert={view === "settings"}>
        <ProjectSessionsModal
          project={selectedProjectForModal}
          showSessionCredits={showSessionCredits}
          range={range}
          onSessionClick={setSelectedSession}
          isActive={view !== "settings" && !selectedSession && !isResetHistoryOpen && !accountDrawerOpen}
          dataRevision={projectDataRevision}
          onScanComplete={handleLocalScanComplete}
          onClose={() => setSelectedProjectForModal(null)}
          onGoToSessions={(projectPath) => {
            setSelectedProjectForModal(null);
            setSelectedProjectFilter(projectPath);
            setSelectedSessionDate(null);
            void handleViewChange("sessions");
          }}
        />
        </div>
      )}
      {selectedSession && (
        <div hidden={view === "settings"} inert={view === "settings"}>
        <SessionDetailModal
          session={selectedSession}
          isActive={view !== "settings" && !accountDrawerOpen}
          showSessionCredits={showSessionCredits}
          onScanComplete={async (session, previousPath, scan) => {
            setProjectDataRevision((value) => value + 1);
            await handleLocalScanComplete(scan, session, previousPath);
          }}
          onClose={() => setSelectedSession(null)}
        />
        </div>
      )}
      {view !== "settings" && isResetHistoryOpen ? (
        <CodexResetHistoryModal isActive={!accountDrawerOpen} onClose={() => setIsResetHistoryOpen(false)} />
      ) : null}
      </div>
      </div>
      {!compactWindow && accountExpanded && view !== "settings" && view !== "logs" ? <aside id="pulse-account-rail" className="pulse-account-rail" aria-label={copy("account")}>
        <h2>{copy("account")}</h2>
        {accountPanel}
      </aside> : null}
      </div>
      {compactWindow && accountDrawerOpen ? <PulseAccountDrawer onClose={() => setAccountDrawerOpen(false)}>{accountPanel}</PulseAccountDrawer> : null}
      <footer className="pulse-statusbar"><span>{copy("local")} · {diagnostics?.filesFound ?? "—"} {t("session.file", {defaultValue: "logs"})}</span><span title={diagnostics?.codexHome}>{diagnostics?.runtime ?? "Codex"}</span><span>{overview?.timezone ?? ""}</span><span className="pulse-statusbar-end">{copy("motion")} {copy(preferences.motionLevel)}</span></footer>
    </div>
  );
}
