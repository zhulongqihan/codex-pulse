import { useState } from "react";
import { Download, FileSpreadsheet, FileText, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RangeSwitcher } from "@/components/range-switcher";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CodexLimitsResponse, ExportFormat, OverviewResponse, RangeKey } from "@/lib/api";
import { formatCompactNumber, formatCurrencyShort, formatPercent } from "@/lib/formatters";
import type { MetricCardData } from "@/lib/usage-dashboard";
import { UsageTrendsCard } from "@/components/usage-trends-card";
import { projectLabel } from "@/lib/project-reference";
import { usePulseCopy } from "@/lib/pulse-copy";
import dayjs from "dayjs";

type DashboardHeroCardProps = {
  overview: OverviewResponse; range: RangeKey; isBusy: boolean; isExporting: ExportFormat | null;
  exportError?: string | null;
  onRangeChange: (range: RangeKey) => void; onExport: (format: ExportFormat) => void;
  metrics: MetricCardData[]; codexLimits: CodexLimitsResponse | null; onOpenDay?: (date: string) => void;
};

export function DashboardHeroCard({overview, range, isBusy, isExporting, exportError, onRangeChange, onExport, metrics, codexLimits, onOpenDay}: DashboardHeroCardProps) {
  const {t} = useTranslation();
  const copy = usePulseCopy();
  const [activeTab, setActiveTab] = useState<"projects" | "models" | "dates">("projects");
  const [metric, setMetric] = useState<"tokens" | "cost">("tokens");
  const [showAll, setShowAll] = useState(false);
  const totals = overview.totals;
  const items = activeTab === "models" ? (overview.models ?? []).map(item => ({label:item.model, tokens:item.totalTokens, cost:item.costUSD}))
    : activeTab === "projects" ? (overview.projects ?? []).map(item => ({label:projectLabel(item), detail:item.project, tokens:item.totalTokens, cost:item.costUSD}))
    : overview.daily.map(item => ({label:item.date, tokens:item.totalTokens, cost:item.costUSD}));
  const ranked = [...items].sort((a,b) => metric === "tokens" ? b.tokens - a.tokens : a.cost == null ? b.cost == null ? 0 : 1 : b.cost == null ? -1 : b.cost-a.cost);
  const visible = showAll ? ranked : ranked.slice(0,5);
  const denominator = metric === "tokens" ? totals.totalTokens : totals.costUSD;
  const unknownPricing = (overview.models ?? []).filter(model => model.pricingStatus === "unavailable").reduce((sum,model) => sum+model.totalTokens,0);
  const balance = codexLimits?.credits?.unlimited ? t("limits.credits_unlimited") : codexLimits?.credits?.balance?.trim() || (codexLimits?.credits?.hasCredits === false ? "0" : t("limits.credits_unavailable"));
  const expiresAt = codexLimits?.subscriptionExpiresAt ? dayjs(codexLimits.subscriptionExpiresAt) : null;
  const daysLeft = expiresAt?.isValid() ? Math.max(0,Math.ceil(expiresAt.diff(dayjs(),"day",true))) : null;
  return <section data-testid="dashboard-hero" className="pulse-overview">
    <div className="pulse-page-heading"><h1>{copy("overview")}</h1><span>{copy("retain")}</span></div>
    <div className="pulse-range-toolbar"><div><strong>{overview.startDate} — {overview.endDate}</strong><RangeSwitcher value={range} onChange={onRangeChange}/></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" size="sm" disabled={isBusy}><Download size={15}/>{isExporting === null ? t("hero.export") : t("hero.exporting")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onExport("xlsx")}><FileSpreadsheet size={16}/>{t("hero.export_excel")}</DropdownMenuItem><DropdownMenuItem onSelect={() => onExport("markdown")}><FileText size={16}/>{t("hero.export_markdown")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div>
    {exportError ? <p role="alert" data-testid="export-error" className="mb-4 flex flex-wrap gap-x-2 gap-y-1 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-foreground"><strong>{t("export.failed")}</strong><span className="whitespace-pre-wrap break-all">{exportError}</span></p> : null}
    <dl className="pulse-metric-strip">
      <div className="pulse-primary-metric"><dt>{copy("total")}</dt><dd>{formatCompactNumber(totals.totalTokens)} <small>tokens</small></dd></div>
      <div><dt>{copy("input")}</dt><dd>{formatCompactNumber(totals.inputTokens)}</dd></div>
      <div><dt>{copy("cached")}</dt><dd>{formatCompactNumber(totals.cachedInputTokens)}</dd></div>
      <div><dt>{copy("output")}</dt><dd>{formatCompactNumber(totals.outputTokens)}</dd></div>
      <div><dt>{copy("estimate")}</dt><dd>{totals.costUSD == null ? "—" : formatCurrencyShort(totals.costUSD)}</dd><small>{copy("notBill")}</small></div>
    </dl>
    <div className="pulse-fact-row">{metrics.map(item => <span key={item.kind} title={item.detail}>{item.label} <strong>{item.value}</strong></span>)}{unknownPricing > 0 ? <span>{copy("pricingCoverage")} <strong>{formatPercent(totals.totalTokens > 0 ? (totals.totalTokens-unknownPricing)/totals.totalTokens : 0)}</strong> · {copy("partial")}</span> : null}</div>
    <UsageTrendsCard daily={overview.daily} metrics={[]} cacheHitRate={totals.cacheHitRate} onOpenDay={onOpenDay}/>
    <section className="pulse-distribution" aria-labelledby="pulse-distribution-title">
      <div className="pulse-section-heading"><h2 id="pulse-distribution-title">{copy("distribution")}</h2><div className="pulse-segments" role="group" aria-label={copy("distribution")}>{(["projects","models","dates"] as const).map(tab => <button key={tab} type="button" aria-pressed={activeTab===tab} onClick={() => setActiveTab(tab)}>{tab === "projects" ? t("common.project") : tab === "models" ? t("common.model") : copy("dates")}</button>)}</div><div className="pulse-segments" role="group" aria-label={copy("usage")}><button type="button" aria-pressed={metric==="tokens"} onClick={() => setMetric("tokens")}>{copy("tokens")}</button><button type="button" aria-pressed={metric==="cost"} onClick={() => setMetric("cost")}>{copy("estimate")}</button></div></div>
      <div className="pulse-rank-list">{visible.map((item,index) => {
        const value = metric === "tokens" ? item.tokens : item.cost;
        const share = value == null || denominator == null || denominator === 0 ? null : value/denominator;
        return <div className="pulse-rank-row" key={`${item.label}-${index}`}><span className="pulse-rank-label" title={"detail" in item ? String(item.detail) : item.label}>{item.label}</span><span className="pulse-rank-track" aria-hidden="true"><i style={{width:`${Math.min(100,(share??0)*100)}%`}}/></span><strong>{value == null ? "—" : metric === "tokens" ? formatCompactNumber(value) : formatCurrencyShort(value)}</strong><small>{share == null ? "—" : formatPercent(share)}</small></div>;
      })}{visible.length===0 ? <p className="pulse-empty">{copy("noData")}</p> : null}</div>
      {ranked.length > 5 ? <button type="button" className="pulse-text-button" onClick={() => setShowAll(!showAll)}>{showAll ? copy("collapse") : `${copy("all")} (${ranked.length})`} <ArrowUpRight size={14}/></button> : null}
    </section>
    {codexLimits ? <div className="pulse-account-facts">
      {codexLimits.account ? <span>{codexLimits.account}</span> : null}{codexLimits.workspaceName ? <span>{codexLimits.workspaceName}</span> : null}{codexLimits.membershipLevel ? <strong>{codexLimits.membershipLevel}</strong> : null}
      {expiresAt?.isValid() ? <span>{t("limits.subscription_expires",{date:expiresAt.format("YYYY-MM-DD"),timeLeft:t(daysLeft===1?"limits.days_left_one":"limits.days_left_other",{count:daysLeft})})}{codexLimits.subscriptionWillRenew===false ? ` · ${t("limits.auto_renew_off")}` : ""}</span> : null}
      <span data-testid="credits-balance">{t("limits.credits_balance")}: <strong>{balance}</strong>{codexLimits.creditsIsMock ? <span> · <span>{t("limits.credits_mock")}</span></span> : null}</span>
    </div> : null}
  </section>;
}
