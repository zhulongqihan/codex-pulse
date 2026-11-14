import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, ArrowUpRight, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RangeSwitcher } from "@/components/range-switcher";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CodexLimitsResponse, ExportFormat, OverviewResponse, RangeKey } from "@/lib/api";
import { formatCompactNumber, formatCurrencyShort, formatNumber, formatPercent } from "@/lib/formatters";
import type { MetricCardData } from "@/lib/usage-dashboard";
import { UsageTrendsCard } from "@/components/usage-trends-card";
import { distinctProjectLabels } from "@/lib/project-reference";
import { usePulseCopy } from "@/lib/pulse-copy";
import { useHomeCopy } from "@/lib/home-copy";
import { useDashboardCopy } from "@/lib/dashboard-copy";
import { currentDateInTimezone } from "@/lib/trend-buckets";
import { getLanguage, languages } from "@/lib/languages";
import { timeZoneLabel } from "@/lib/time-context";
import "./dashboard-hero-card.css";

type DashboardHeroCardProps = {
  overview: OverviewResponse; range: RangeKey; isBusy: boolean; isExporting: ExportFormat | null;
  exportError?: string | null;
  todayOverview?: OverviewResponse | null; todayUnavailable?: boolean; todayStale?: boolean;
  onRangeChange: (value: RangeKey) => void; onExport: (format: ExportFormat) => void;
  metrics: MetricCardData[]; codexLimits: CodexLimitsResponse | null;
  onOpenDay?: (date: string) => void; onOpenToday?: () => void; onOpenAnalysis?: () => void;
  coach?: ReactNode;
  coachFirst?: boolean;
};

export type UsageAnalysisViewProps = Pick<DashboardHeroCardProps,
  "overview" | "range" | "isBusy" | "isExporting" | "exportError" | "onRangeChange" | "onExport" | "metrics" | "onOpenDay"
>;

/** Today is independent of the analysis range and any selected historical day. */
export function DashboardHeroCard({ overview, isBusy, todayOverview = null, todayUnavailable = false, todayStale = false, onOpenToday, onOpenAnalysis, coach, coachFirst = false }: DashboardHeroCardProps) {
  const { t, i18n } = useTranslation();
  const copy = usePulseCopy();
  const home = useHomeCopy();
  const dashboard = useDashboardCopy();
  const todayTimezone = todayOverview?.timezone ?? overview.timezone;
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
  const todayKnown = Boolean(todayRow) && !todayUnavailable;
  const todayUpdated = todayOverview?.updatedAt ? new Date(todayOverview.updatedAt) : null;
  let updatedTime: string | null = null;
  if (todayUpdated && Number.isFinite(todayUpdated.getTime())) {
    const locale = languages[getLanguage(i18n.resolvedLanguage ?? i18n.language)].intlLocale;
    try { updatedTime = todayUpdated.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: todayTimezone }); }
    catch { updatedTime = todayUpdated.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }); }
  }

  return <section data-testid="dashboard-hero" className="pulse-overview pulse-home-overview pulse-dashboard-home">
    {coachFirst ? coach : null}
    <section data-testid="today-summary" className="pulse-today-summary pulse-dashboard-today" aria-labelledby="pulse-today-title" aria-busy={!todayOverview && isBusy}>
      <div className="pulse-dashboard-today-heading">
        <h2 id="pulse-today-title">{home("today")}</h2>
        <time dateTime={todayDate}>{todayDate}</time>
        <span className="pulse-time-context" data-testid="today-timezone">{t("reading_context.statistics_short", { zone: timeZoneLabel(todayTimezone, i18n.resolvedLanguage ?? i18n.language) })}</span>
      </div>
      <div className="pulse-dashboard-today-readings">
        <dl className="pulse-dashboard-today-values">
          <div><dt>{dashboard("todayCost")}</dt><dd data-testid="today-estimate">{todayKnown ? formatCurrencyShort(todayRow!.costUSD) : "—"}</dd><small>{dashboard("estimateNote")}</small></div>
          <div><dt>{dashboard("todayTokens")}</dt><dd data-testid="today-tokens" title={todayKnown ? formatNumber(todayRow!.totalTokens) : undefined}>{todayKnown ? formatCompactNumber(todayRow!.totalTokens) : "—"}</dd><small>{dashboard("separateQuota")}</small></div>
        </dl>
        <div className="pulse-today-actions pulse-dashboard-today-actions">
          {onOpenToday ? <Button type="button" variant="secondary" size="sm" onClick={onOpenToday} disabled={!todayKnown}>{home("todaySessions")}<ArrowRight size={14} aria-hidden="true"/></Button> : null}
          <p role="status" className={todayStale ? "pulse-today-stale" : undefined}>{!todayKnown ? home("todayUnavailable") : todayStale ? home("stale") : updatedTime ? `${dashboard("localLogs")} · ${home("updated")} ${updatedTime}` : home("noUpdated")}</p>
        </div>
      </div>
      {todayKnown ? <details className="pulse-today-breakdown"><summary>{home("todayBreakdown")}</summary><dl>
        <div><dt>{copy("input")}</dt><dd>{formatNumber(todayRow!.inputTokens)}</dd></div>
        <div><dt>{copy("cached")}</dt><dd>{formatNumber(todayRow!.cachedInputTokens)}</dd></div>
        <div><dt>{copy("output")}</dt><dd>{formatNumber(todayRow!.outputTokens)}</dd></div>
        <div><dt>{copy("cache")}</dt><dd>{todayRow!.inputTokens > 0 ? formatPercent(todayRow!.cachedInputTokens / todayRow!.inputTokens) : "—"}</dd></div>
      </dl></details> : null}
    </section>
    {!coachFirst ? coach : null}
    <section className="pulse-dashboard-analysis-entry" aria-labelledby="pulse-analysis-entry-title">
      <div><h2 id="pulse-analysis-entry-title">{dashboard("history")}</h2><p>{dashboard("historyDescription")}</p></div>
      {onOpenAnalysis ? <button type="button" className="pulse-text-button" onClick={onOpenAnalysis}>{dashboard("openAnalysis")}<ArrowRight size={15} aria-hidden="true"/></button> : null}
    </section>
  </section>;
}

/** Historical exploration has one range shared by totals, trends, distribution and export. */
export function UsageAnalysisView({ overview, range, isBusy, isExporting, exportError, onRangeChange, onExport, metrics, onOpenDay }: UsageAnalysisViewProps) {
  const { t, i18n } = useTranslation();
  const copy = usePulseCopy();
  const home = useHomeCopy();
  const dashboard = useDashboardCopy();
  const [activeTab, setActiveTab] = useState<"projects" | "models" | "dates">("projects");
  const [metric, setMetric] = useState<"tokens" | "cost">("cost");
  const [showAll, setShowAll] = useState(false);
  const totals = overview.totals;
  const projectLabels = useMemo(() => distinctProjectLabels(overview.projects ?? []), [overview.projects]);
  const items = activeTab === "models" ? (overview.models ?? []).map(item => ({ label: item.model, tokens: item.totalTokens, cost: item.costUSD }))
    : activeTab === "projects" ? (overview.projects ?? []).map(item => ({ label: projectLabels.get(item.project)!, detail: item.project, tokens: item.totalTokens, cost: item.costUSD }))
      : overview.daily.map(item => ({ label: item.date, tokens: item.totalTokens, cost: item.costUSD }));
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
      {exportError ? <p role="alert" data-testid="export-error" className="pulse-analysis-export-error"><strong>{t("export.failed")}</strong><span>{exportError}</span></p> : null}
      <div className="pulse-analysis-totals">
        <dl><div><dt>{dashboard("periodCost")}</dt><dd>{formatCurrencyShort(totals.costUSD)}</dd></div><div><dt>{home("periodTokens")}</dt><dd>{formatCompactNumber(totals.totalTokens)}</dd></div></dl>
        <p>{dashboard("estimateNote")}<span className="pulse-time-context" data-testid="analysis-timezone">{t("reading_context.statistics_short", { zone: timeZoneLabel(overview.timezone, i18n.resolvedLanguage ?? i18n.language) })}</span></p>
      </div>
      {unknownPricing > 0 ? <p className="pulse-analysis-pricing" data-testid="analysis-pricing-coverage">{copy("pricingCoverage")} {formatPercent(totals.totalTokens > 0 ? (totals.totalTokens - unknownPricing) / totals.totalTokens : 0)} · {copy("partial")}</p> : null}
      <details className="pulse-period-details"><summary>{home("periodDetails")}</summary><dl className="pulse-period-breakdown">
        <div><dt>{copy("input")}</dt><dd>{formatNumber(totals.inputTokens)}</dd></div>
        <div><dt>{copy("cached")}</dt><dd>{formatNumber(totals.cachedInputTokens)}</dd></div>
        <div><dt>{copy("output")}</dt><dd>{formatNumber(totals.outputTokens)}</dd></div>
        {metrics.filter(item => item.kind !== "tokens").map(item => <div key={item.kind} title={item.detail}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl></details>
    </section>
    <div className="pulse-analysis-trend">
      <UsageTrendsCard daily={overview.daily} retainedFrom={overview.retainedFrom} metrics={[]} cacheHitRate={totals.cacheHitRate} onOpenDay={onOpenDay} todayDate={currentDateInTimezone(overview.timezone)} deferInspection initialMode="cost"/>
    </div>
    <section className="pulse-distribution" aria-labelledby="pulse-distribution-title">
      <div className="pulse-section-heading">
        <h2 id="pulse-distribution-title">{home("periodBreakdown")}</h2>
        <div className="pulse-segments" role="group" aria-label={copy("distribution")}>{(["projects", "models", "dates"] as const).map(tab => <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => { setActiveTab(tab); setShowAll(false); }}>{tab === "projects" ? t("common.project") : tab === "models" ? t("common.model") : copy("dates")}</button>)}</div>
        <div className="pulse-segments" role="group" aria-label={copy("usage")}><button type="button" aria-pressed={metric === "cost"} onClick={() => setMetric("cost")}>{copy("estimate")}</button><button type="button" aria-pressed={metric === "tokens"} onClick={() => setMetric("tokens")}>{copy("tokens")}</button></div>
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
