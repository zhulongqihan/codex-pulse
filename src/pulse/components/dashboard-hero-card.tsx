import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, ArrowUpRight, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RangeSwitcher } from "@/components/range-switcher";
import { ReadingInfo } from "@/components/reading-info";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ExportFormat, OverviewResponse, RangeKey } from "@/lib/api";
import { formatCompactNumber, formatCurrencyShort, formatNumber, formatPercent } from "@/lib/formatters";
import type { MetricCardData } from "@/lib/usage-dashboard";
import { UsageTrendsCard } from "@/components/usage-trends-card";
import { distinctProjectLabels } from "@/lib/project-reference";
import { usePulseCopy } from "@/lib/pulse-copy";
import { useHomeCopy } from "@/lib/home-copy";
import { useDashboardCopy } from "@/lib/dashboard-copy";
import { quotaHistoryCopy } from "@/lib/quota-history-copy";
import { currentDateInTimezone } from "@/lib/trend-buckets";
import { getLanguage, languages } from "@/lib/languages";
import { timeZoneLabel } from "@/lib/time-context";
import "./dashboard-hero-card.css";

type DashboardHeroCardProps = {
  timezone?: string;
  todayOverview?: OverviewResponse | null; todayLoading?: boolean; todayUnavailable?: boolean; todayStale?: boolean;
  onOpenToday?: () => void; onOpenAnalysis?: () => void;
  coach?: ReactNode;
  quotaHistory?: ReactNode;
  quotaLimits?: ReactNode;
  paperSpread?: boolean;
  localRecovery?: ReactNode;
};

export type UsageAnalysisViewProps = {
  overview: OverviewResponse; range: RangeKey; isBusy: boolean; isExporting: ExportFormat | null;
  exportError?: string | null;
  exportRequiresDesktop?: boolean;
  rangeNotice?: ReactNode;
  onRangeChange: (value: RangeKey) => void; onExport: (format: ExportFormat) => void;
  metrics: MetricCardData[];
  onOpenDay?: (date: string) => void;
};

/** Today is independent of the analysis range and any selected historical day. */
export function DashboardHeroCard({ timezone, todayOverview = null, todayLoading = false, todayUnavailable = false, todayStale = false, onOpenToday, onOpenAnalysis, coach, quotaHistory, quotaLimits, paperSpread = false, localRecovery }: DashboardHeroCardProps) {
  const { t, i18n } = useTranslation();
  const copy = usePulseCopy();
  const home = useHomeCopy();
  const dashboard = useDashboardCopy();
  const todayTimezone = todayOverview?.timezone ?? timezone;
  const [todayDate, setTodayDate] = useState(() => currentDateInTimezone(todayTimezone));
  useEffect(() => {
    const update = () => setTodayDate(currentDateInTimezone(todayTimezone));
    update();
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", update); };
  }, [todayTimezone]);
  // A retained snapshot from yesterday must not become today's zero or usage.
  const todayRow = todayOverview?.daily.find(day => day.date === todayDate);
  const todayKnown = !!todayRow && !todayUnavailable;
  const todayUpdated = todayOverview?.updatedAt ? new Date(todayOverview.updatedAt) : null;
  let updatedTime: string | null = null;
  if (todayUpdated && Number.isFinite(todayUpdated.getTime())) {
    const locale = languages[getLanguage(i18n.resolvedLanguage ?? i18n.language)].intlLocale;
    try { updatedTime = todayUpdated.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: todayTimezone }); }
    catch { updatedTime = todayUpdated.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }); }
  }

  const todayStatus = todayKnown
    ? todayStale ? home("stale") : null
    : todayLoading ? t("loading.preparing_cache") : home("todayUnavailable");
  const today = <section data-testid="today-summary" className="pulse-today-summary pulse-dashboard-today" aria-labelledby="pulse-today-title" aria-busy={todayLoading}>
      <div className="pulse-dashboard-today-heading">
        <h2 id="pulse-today-title">{dashboard("todayLocalUsage")}</h2>
        <div className="pulse-reading-context-label">
          <time dateTime={todayDate}>{todayDate}</time>
          <ReadingInfo label={dashboard("todayLocalUsage")}>
            <p>{dashboard("separateQuota")}</p>
            <p>{dashboard("estimateNote")}</p>
            {todayKnown ? <p>{updatedTime ? `${dashboard("localLogs")} · ${home("updated")} ${updatedTime}` : home("noUpdated")}</p> : null}
            {todayTimezone ? <p data-testid="today-timezone">{t("reading_context.statistics_short", { zone: timeZoneLabel(todayTimezone, i18n.resolvedLanguage ?? i18n.language) })}</p> : null}
          </ReadingInfo>
        </div>
      </div>
      <div className="pulse-dashboard-today-readings">
        <dl className="pulse-dashboard-today-values">
          <div><dt>{dashboard("todayTokens")}</dt><dd data-testid="today-tokens" title={todayKnown ? formatNumber(todayRow.totalTokens) : undefined}>{todayKnown ? formatCompactNumber(todayRow.totalTokens) : "—"}</dd></div>
          <div className="pulse-dashboard-today-cost"><dt>{dashboard("todayCost")}</dt><dd data-testid="today-estimate">{todayKnown ? formatCurrencyShort(todayRow.costUSD) : "—"}</dd></div>
        </dl>
        <div className="pulse-today-actions pulse-dashboard-today-actions">
          {onOpenToday ? <Button type="button" variant="secondary" size="sm" data-testid="open-today-sessions" onClick={onOpenToday} disabled={!todayKnown}>{home("todaySessions")}<ArrowRight size={14} aria-hidden="true"/></Button> : null}
          {todayStatus ? <p role="status" className={todayStale ? "pulse-today-stale" : undefined}>{todayStatus}</p> : null}
        </div>
      </div>
      {todayKnown ? <details className="pulse-today-breakdown"><summary>{home("todayBreakdown")}</summary><dl>
        <div><dt>{copy("input")}</dt><dd>{formatNumber(todayRow!.inputTokens)}</dd></div>
        <div><dt>{copy("cached")}</dt><dd>{formatNumber(todayRow!.cachedInputTokens)}</dd></div>
        <div><dt>{copy("output")}</dt><dd>{formatNumber(todayRow!.outputTokens)}</dd></div>
        <div><dt>{copy("cache")}</dt><dd>{todayRow!.inputTokens > 0 ? formatPercent(todayRow!.cachedInputTokens / todayRow!.inputTokens) : "—"}</dd></div>
      </dl></details> : null}
  </section>;
  const analysis = onOpenAnalysis ? <div className="pulse-dashboard-analysis-entry">
    <button type="button" className="pulse-text-button" onClick={onOpenAnalysis}>{dashboard("openAnalysis")}<ArrowRight size={15} aria-hidden="true"/></button>
  </div> : null;

  return <section data-testid="dashboard-hero" className={`pulse-overview pulse-home-overview pulse-dashboard-home${paperSpread ? " pulse-paper-dashboard-spread" : ""}`}>
    {paperSpread ? <>
      <div className="pulse-paper-dashboard-page pulse-paper-dashboard-page--today">
        {today}
      </div>
      <div className="pulse-paper-dashboard-page pulse-paper-dashboard-page--quota">
        <div className="pulse-paper-quotas">{quotaLimits}</div>
        <div className="pulse-paper-dashboard-page--pacing">{coach}</div>
      </div>
      <div className="pulse-paper-dashboard-page pulse-paper-dashboard-page--history">
        {localRecovery}
        {quotaHistory}
        {analysis}
      </div>
    </> : <>
      {coach}
      {today}
      {localRecovery}
      {quotaHistory}
      {analysis}
    </>}
  </section>;
}

/** Historical exploration has one range shared by totals, trends, distribution and export. */
export function UsageAnalysisView({ overview, range, isBusy, isExporting, exportError, exportRequiresDesktop, rangeNotice, onRangeChange, onExport, metrics, onOpenDay }: UsageAnalysisViewProps) {
  const { t, i18n } = useTranslation();
  const copy = usePulseCopy();
  const home = useHomeCopy();
  const dashboard = useDashboardCopy();
  const [activeTab, setActiveTab] = useState<"projects" | "models" | "dates">("projects");
  const [metric, setMetric] = useState<"tokens" | "cost">("tokens");
  const [showAll, setShowAll] = useState(false);
  const totals = overview.totals;
  const retainedFrom = overview.retainedFrom;
  const hasRetainedUsage = retainedFrom !== null && (retainedFrom === undefined || retainedFrom <= overview.endDate);
  const hasPartialCoverage = hasRetainedUsage && retainedFrom !== undefined && retainedFrom > overview.startDate;
  const projectLabels = useMemo(() => distinctProjectLabels(overview.projects ?? []), [overview.projects]);
  const items = activeTab === "models" ? (overview.models ?? []).map(item => ({ label: item.model, tokens: item.totalTokens, cost: item.costUSD }))
    : activeTab === "projects" ? (overview.projects ?? []).map(item => ({ label: projectLabels.get(item.project)!, detail: item.project, tokens: item.totalTokens, cost: item.costUSD }))
      : overview.daily.filter(item => retainedFrom === undefined || (retainedFrom !== null && item.date >= retainedFrom))
          .map(item => ({ label: item.date, tokens: item.totalTokens, cost: item.costUSD }));
  const ranked = [...items].sort((a, b) => metric === "tokens" ? b.tokens - a.tokens : a.cost == null ? b.cost == null ? 0 : 1 : b.cost == null ? -1 : b.cost - a.cost);
  const visible = showAll ? ranked : ranked.slice(0, 5);
  const denominator = metric === "tokens" ? totals.totalTokens : totals.costUSD;
  const unknownPricing = (overview.models ?? []).filter(model => model.pricingStatus === "unavailable").reduce((sum, model) => sum + model.totalTokens, 0);

  return <section data-testid="usage-analysis" className="pulse-overview pulse-usage-analysis" aria-labelledby="pulse-analysis-title">
    <section data-testid="range-summary" className="pulse-period-summary" aria-label={home("period")}>
      <header className="pulse-analysis-heading">
        <div><h1 id="pulse-analysis-title">{dashboard("analysis")}</h1><p>{dashboard("localLogs")} · {overview.startDate} — {overview.endDate}</p></div>
        <div className="pulse-analysis-actions">
          <RangeSwitcher value={range} onChange={onRangeChange} timezone={overview.timezone}/>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" size="sm" disabled={isBusy || isExporting !== null}><Download size={15} aria-hidden="true"/>{isExporting === null ? t("hero.export") : t("hero.exporting")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onExport("xlsx")}><FileSpreadsheet size={16} aria-hidden="true"/>{t("hero.export_excel")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("markdown")}><FileText size={16} aria-hidden="true"/>{t("hero.export_markdown")}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </div>
      </header>
      {rangeNotice}
      {exportRequiresDesktop ? <p role="status" className="pulse-analysis-note">{quotaHistoryCopy(i18n.resolvedLanguage ?? i18n.language, "exportDesktopOnly")}</p> : null}
      {exportError ? <p role="alert" data-testid="export-error" className="pulse-analysis-export-error"><strong>{t("export.failed")}</strong><span>{exportError}</span></p> : null}
      {!hasRetainedUsage || hasPartialCoverage ? <p className="pulse-analysis-note" data-testid="analysis-retention-coverage">{hasPartialCoverage
        ? t("analysis_review.coverage_partial", { date: retainedFrom })
        : t("analysis_review.coverage_unavailable")}</p> : null}
      <div className="pulse-analysis-totals">
        <dl>
          <div><dt>{home("periodTokens")}</dt><dd>{hasRetainedUsage ? formatCompactNumber(totals.totalTokens) : "—"}</dd></div>
          <div>
            <dt className="pulse-reading-context-label">{dashboard("periodCost")}<ReadingInfo label={dashboard("periodCost")}>{dashboard("estimateNote")}</ReadingInfo></dt>
            <dd>{hasRetainedUsage ? formatCurrencyShort(totals.costUSD) : "—"}</dd>
          </div>
        </dl>
        <p className="pulse-time-context" data-testid="analysis-timezone">{t("reading_context.statistics_short", { zone: timeZoneLabel(overview.timezone, i18n.resolvedLanguage ?? i18n.language) })}</p>
      </div>
      {unknownPricing > 0 ? <p className="pulse-analysis-pricing" data-testid="analysis-pricing-coverage">{copy("pricingCoverage")} {formatPercent(totals.totalTokens > 0 ? (totals.totalTokens - unknownPricing) / totals.totalTokens : 0)} · {copy("partial")}</p> : null}
      {hasRetainedUsage ? <details className="pulse-period-details"><summary>{home("periodDetails")}</summary><dl className="pulse-period-breakdown">
        <div><dt>{copy("input")}</dt><dd>{formatNumber(totals.inputTokens)}</dd></div>
        <div><dt>{copy("cached")}</dt><dd>{formatNumber(totals.cachedInputTokens)}</dd></div>
        <div><dt>{copy("output")}</dt><dd>{formatNumber(totals.outputTokens)}</dd></div>
        {metrics.filter(item => item.kind !== "tokens").map(item => <div key={item.kind} title={item.detail}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl></details> : null}
    </section>
    <div className="pulse-analysis-trend">
      <UsageTrendsCard daily={overview.daily} retainedFrom={overview.retainedFrom} metrics={[]} cacheHitRate={totals.cacheHitRate} onOpenDay={onOpenDay} todayDate={currentDateInTimezone(overview.timezone)} deferInspection localQuotaRangeDays={overview.days}/>
    </div>
    <section className="pulse-distribution" aria-labelledby="pulse-distribution-title">
      <div className="pulse-section-heading">
        <h2 id="pulse-distribution-title">{home("periodBreakdown")}</h2>
        <div className="pulse-segments" role="group" aria-label={copy("distribution")}>{(["projects", "models", "dates"] as const).map(tab => <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => { setActiveTab(tab); setShowAll(false); }}>{tab === "projects" ? t("common.project") : tab === "models" ? t("common.model") : copy("dates")}</button>)}</div>
        <div className="pulse-segments" role="group" aria-label={copy("usage")}><button type="button" aria-pressed={metric === "tokens"} onClick={() => setMetric("tokens")}>{copy("tokens")}</button><button type="button" aria-pressed={metric === "cost"} onClick={() => setMetric("cost")}>{copy("estimate")}</button></div>
      </div>
      <p className="pulse-distribution-scope" data-testid="distribution-scope"><span>{overview.startDate} — {overview.endDate}</span><span>{t(metric === "tokens" ? "reading_context.distribution_tokens" : "reading_context.distribution_cost")}</span></p>
      <div className="pulse-rank-list">{visible.map((item, index) => {
        const value = metric === "tokens" ? item.tokens : item.cost;
        const share = value == null || denominator == null || denominator === 0 ? null : value / denominator;
        return <div className="pulse-rank-row" key={`${item.label}-${index}`}>
          <span className="pulse-rank-label" title={"detail" in item ? String(item.detail) : item.label}>{item.label}</span>
          <span className="pulse-rank-track" aria-hidden="true"><i style={{ width: `${Math.min(100, (share ?? 0) * 100)}%` }}/></span>
          <strong>{value == null ? "—" : metric === "tokens" ? formatCompactNumber(value) : formatCurrencyShort(value)}</strong><small>{share == null ? "—" : formatPercent(share)}</small>
        </div>;
      })}{visible.length === 0 ? <p className="pulse-empty">{copy("noData")}</p> : null}</div>
      {ranked.length > 5 ? <button type="button" className="pulse-text-button" onClick={() => setShowAll(previous => !previous)}>{showAll ? copy("collapse") : `${copy("all")} (${ranked.length})`}<ArrowUpRight size={14} aria-hidden="true"/></button> : null}
    </section>
  </section>;
}
