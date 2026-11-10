import { compareKnownCosts } from "@/lib/costs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MonthlyUsageResponse } from "@/lib/api";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { monthCoverage, type MonthCoverage } from "@/lib/monthly-coverage";

type MonthlyUsageTableProps = {
  data: MonthlyUsageResponse;
};

type MonthlyRow = MonthlyUsageResponse["monthly"][number];
type MetricField = "totalTokens" | "inputTokens" | "cachedInputTokens" | "outputTokens" | "costUSD";
type SortField = "month" | MetricField;
type SortDirection = "asc" | "desc";
type DerivedMonth = MonthlyRow & { previous: MonthlyRow | null; coverage: MonthCoverage };

type DisplayRow =
  | { type: "active"; month: DerivedMonth }
  | { type: "inactive"; startMonth: string; endMonth: string; months: DerivedMonth[] };

const metricFields: MetricField[] = ["totalTokens", "inputTokens", "cachedInputTokens", "outputTokens", "costUSD"];
const sortFields: SortField[] = ["month", ...metricFields];

function isInactiveMonth(month: MonthlyRow & { coverage?: MonthCoverage }) {
  return (
    (month.coverage === undefined || month.coverage === "retained") &&
    month.inputTokens === 0 &&
    month.cachedInputTokens === 0 &&
    month.outputTokens === 0 &&
    month.totalTokens === 0 &&
    month.costUSD === 0 &&
    month.fiveHourPercent == null &&
    month.weeklyPercent == null
  );
}

function getMonthOrdinal(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

function getPreviousMonth(month: string) {
  const ordinal = getMonthOrdinal(month) - 1;
  const year = Math.floor(ordinal / 12);
  const monthNumber = ordinal % 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

function areConsecutiveMonths(left: string, right: string) {
  return Math.abs(getMonthOrdinal(left) - getMonthOrdinal(right)) === 1;
}

function groupInactiveMonths(monthly: DerivedMonth[]): DisplayRow[] {
  return monthly.reduce<DisplayRow[]>((rows, month) => {
    if (!isInactiveMonth(month)) {
      rows.push({ type: "active", month });
      return rows;
    }

    const previousRow = rows.at(-1);
    if (
      previousRow?.type === "inactive" &&
      areConsecutiveMonths(previousRow.months[previousRow.months.length - 1].month, month.month)
    ) {
      previousRow.months.push(month);
      previousRow.startMonth = month.month < previousRow.startMonth ? month.month : previousRow.startMonth;
      previousRow.endMonth = month.month > previousRow.endMonth ? month.month : previousRow.endMonth;
      return rows;
    }

    rows.push({ type: "inactive", startMonth: month.month, endMonth: month.month, months: [month] });
    return rows;
  }, []);
}

function buildDisplayRows(monthly: DerivedMonth[], field: SortField, direction: SortDirection): DisplayRow[] {
  const monthDescending = (left: DerivedMonth, right: DerivedMonth) => right.month.localeCompare(left.month);

  if (field === "month") {
    const sorted = [...monthly].sort((left, right) => {
      const comparison = left.month.localeCompare(right.month);
      return direction === "asc" ? comparison : -comparison;
    });
    return groupInactiveMonths(sorted);
  }

  const active = monthly.filter((month) => !isInactiveMonth(month)).sort((left, right) => {
    if (left.coverage === "unavailable" && right.coverage !== "unavailable") return 1;
    if (right.coverage === "unavailable" && left.coverage !== "unavailable") return -1;
    if (field === "costUSD") return compareKnownCosts(left.costUSD, right.costUSD, direction) || monthDescending(left, right);
    const comparison = left[field] - right[field];
    return comparison === 0 ? monthDescending(left, right) : direction === "asc" ? comparison : -comparison;
  });
  const inactive = monthly.filter(isInactiveMonth).sort(monthDescending);
  return [...active.map((month): DisplayRow => ({ type: "active", month })), ...groupInactiveMonths(inactive)];
}

function PeakBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
      {label}
    </span>
  );
}

type DeltaLabels = {
  comparison: string;
  new: string;
  unavailable: string;
};

function MonthDelta({ current, previous, labels }: { current: number | null; previous: number | null; labels: DeltaLabels }) {
  if (current === null || previous === null || (previous === 0 && current === 0)) {
    return <span className="text-muted-foreground" data-delta aria-label={labels.unavailable}>—</span>;
  }
  if (previous === 0) {
    return <span className="text-muted-foreground" data-delta aria-label={`${labels.comparison}: ${labels.new}`}>{labels.new}</span>;
  }

  const change = (current - previous) / previous;
  if (change === 0) {
    const label = formatPercent(0);
    return <span className="text-muted-foreground" data-delta aria-label={`${labels.comparison}: ${label}`}>{label}</span>;
  }

  const label = formatPercent(change);
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground" data-delta aria-label={`${labels.comparison}: ${label}`}>
      {change > 0 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

function QuotaPercent({ value }: { value?: number | null }) {
  const { t } = useTranslation();
  if (value == null) return <span className="text-muted-foreground" title={t("ux.quota_missing_detail")}>{t("ux.no_quota_samples")}</span>;
  return <span>{value < 0.5 ? "<1%" : `${t("sessions.quota.approx")} ${Math.round(value)}%`}</span>;
}

export function MonthlyUsageTable({ data }: MonthlyUsageTableProps) {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<SortField>("month");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { displayRows, peaks } = useMemo(() => {
    const monthMap = new Map(data.monthly.map((month) => [month.month, month]));
    const nextPeaks: Record<MetricField, number> = {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
    };
    const derived = data.monthly.map((month): DerivedMonth => {
      const coverage = monthCoverage(month.month, data.retainedFrom);
      for (const field of metricFields) {
        if (coverage !== "unavailable") nextPeaks[field] = Math.max(nextPeaks[field], month[field] ?? 0);
      }
      const previous = monthMap.get(getPreviousMonth(month.month));
      return { ...month, coverage, previous: coverage === "retained" && previous && monthCoverage(previous.month, data.retainedFrom) === "retained" ? previous : null };
    });

    return {
      displayRows: buildDisplayRows(derived, sortField, sortDirection),
      peaks: nextPeaks,
    };
  }, [data.monthly, data.retainedFrom, sortDirection, sortField]);

  const peakLabel = t("monthly.peak");
  const deltaLabels: DeltaLabels = {
    comparison: t("monthly.delta.comparison"),
    new: t("monthly.delta.new"),
    unavailable: t("monthly.delta.unavailable"),
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
            <span>{t("monthly.comparison_range", { start: data.startMonth, end: data.endMonth })}</span>
            {data.throughDate ? <span>{t("monthly.through_date", { date: data.throughDate })}</span> : null}
            {data.retainedFrom ? <span title={t("monthly.retention_note")}>{t("monthly.retained_from", { date: data.retainedFrom })}</span> : null}
            <span className="inline-flex items-center gap-3" aria-label={t("monthly.token_legend_label")}>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full pulse-token-input" />{t("monthly.uncached_input")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full pulse-token-cached" />{t("monthly.cached_input")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full pulse-token-output" />{t("monthly.output")}</span>
            </span>
            <span aria-label={t("monthly.cost_legend_label")}>
              {t("monthly.cost_scale")} <span className="text-emerald-600">●</span> ≤⅓ <span className="text-amber-500">●</span> ≤⅔ <span className="text-rose-500">●</span> &gt;⅔
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <label className="shrink-0 text-[12px] text-muted-foreground" htmlFor="monthly-sort">{t("monthly.sort.label")}</label>
            <Select
              value={sortField}
              onValueChange={(value) => {
                setSortField(value as SortField);
                setSortDirection("desc");
              }}
            >
              <SelectTrigger id="monthly-sort" className="h-9 w-[150px]" aria-label={t("monthly.sort.label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortFields.map((field) => <SelectItem key={field} value={field}>{t(`monthly.sort.${field}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-foreground transition hover:bg-muted focus:ring-2 focus:ring-indigo-500"
              aria-label={sortDirection === "desc" ? t("monthly.sort.desc") : t("monthly.sort.asc")}
              title={sortDirection === "desc" ? t("monthly.sort.desc") : t("monthly.sort.asc")}
              onClick={() => setSortDirection((current) => current === "desc" ? "asc" : "desc")}
            >
              {sortDirection === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {displayRows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t("monthly.no_data")}</p>
        ) : (
          <div className="overflow-x-auto px-4 sm:px-6" data-monthly-scroll>
            <table className="min-w-[680px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="w-36 border-b border-border py-3 font-medium">{t("monthly.cols.month")}</th>
                  <th className="border-b border-border px-4 py-3 font-medium">{t("monthly.cols.tokens")}</th>
                  <th className="w-36 border-b border-border px-4 py-3 font-medium">{t("daily.cols.quota")}</th>
                  <th className="w-56 border-b border-border py-3 text-right font-medium">{t("monthly.cols.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  if (row.type === "inactive") {
                    const monthLabel = row.startMonth === row.endMonth
                      ? row.startMonth
                      : t("monthly.month_range", { start: row.startMonth, end: row.endMonth });
                    const usageLabel = row.months.length === 1
                      ? t("monthly.no_usage")
                      : t("monthly.no_usage_months", { count: row.months.length });
                    return (
                      <tr key={`inactive-${row.startMonth}-${row.endMonth}`} className="align-top">
                        <td className="border-b border-border/70 py-4 font-medium text-foreground">{monthLabel}</td>
                        <td className="border-b border-border/70 px-4 py-4"><span className="inline-flex rounded-full bg-muted px-3 py-1 text-[12px] font-medium text-muted-foreground">{usageLabel}</span></td>
                        <td className="border-b border-border/70 px-4 py-4 text-muted-foreground">--</td>
                        <td className="border-b border-border/70 py-4 text-right text-muted-foreground">--</td>
                      </tr>
                    );
                  }

                  const { month } = row;
                  if (month.coverage === "unavailable") {
                    return <tr key={month.month} data-monthly-row={month.month} data-coverage="unavailable" className="align-top">
                      <td className="border-b border-border/70 py-4 font-medium">{month.month}</td>
                      <td className="border-b border-border/70 px-4 py-4 text-muted-foreground">{t("monthly.no_retained_records")}</td>
                      <td className="border-b border-border/70 px-4 py-4 text-muted-foreground">—</td>
                      <td className="border-b border-border/70 py-4 text-right text-muted-foreground">—</td>
                    </tr>;
                  }
                  const nonCachedInput = Math.max(month.inputTokens - month.cachedInputTokens, 0);
                  const totalWidth = peaks.totalTokens > 0 ? month.totalTokens / peaks.totalTokens * 100 : 0;
                  const segmentTotal = nonCachedInput + month.cachedInputTokens + month.outputTokens;
                  const cacheHitRate = month.inputTokens > 0 ? month.cachedInputTokens / month.inputTokens : 0;
                  const costRatio = month.costUSD != null && peaks.costUSD > 0 ? month.costUSD / peaks.costUSD : 0;
                  const costTone = month.costUSD == null ? "unavailable" : month.costUSD === 0
                    ? "zero"
                    : costRatio <= 1 / 3 + Number.EPSILON * 4
                      ? "low"
                      : costRatio <= 2 / 3 + Number.EPSILON * 4
                        ? "medium"
                        : "high";

                  return (
                    <tr key={month.month} className="align-top" data-monthly-row={month.month} data-coverage={month.coverage}>
                      <td className="border-b border-border/70 py-4 font-medium text-foreground">{month.month}{month.coverage === "partial" ? <span className="mt-1 block text-[12px] font-normal text-muted-foreground">{t("monthly.partial_retention")}</span> : null}</td>
                      <td className="border-b border-border/70 px-4 py-4">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2 font-semibold text-foreground" data-metric="totalTokens">
                            {formatNumber(month.totalTokens)}
                            <MonthDelta current={month.totalTokens} previous={month.previous?.totalTokens ?? null} labels={deltaLabels} />
                            {month.totalTokens > 0 && month.totalTokens === peaks.totalTokens ? <PeakBadge label={peakLabel} /> : null}
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-label={t("monthly.total_bar_label", { total: formatNumber(month.totalTokens), percent: formatPercent(totalWidth / 100) })}>
                            <div className="flex h-full overflow-hidden rounded-full" data-token-bar style={{ width: `${totalWidth}%` }}>
                              <span className="h-full pulse-token-input" data-token-segment="uncached" style={{ width: `${segmentTotal > 0 ? nonCachedInput / segmentTotal * 100 : 0}%` }} />
                              <span className="h-full pulse-token-cached" data-token-segment="cached" style={{ width: `${segmentTotal > 0 ? month.cachedInputTokens / segmentTotal * 100 : 0}%` }} />
                              <span className="h-full pulse-token-output" data-token-segment="output" style={{ width: `${segmentTotal > 0 ? month.outputTokens / segmentTotal * 100 : 0}%` }} />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground" aria-label={t("monthly.token_bar_label", { input: formatNumber(nonCachedInput), cached: formatNumber(month.cachedInputTokens), output: formatNumber(month.outputTokens), total: formatNumber(month.totalTokens) })}>
                            <span className="inline-flex items-center gap-1.5" data-metric="inputTokens">{t("monthly.input_including_cache")} <strong className="font-medium text-foreground">{formatNumber(month.inputTokens)}</strong><MonthDelta current={month.inputTokens} previous={month.previous?.inputTokens ?? null} labels={deltaLabels} />{month.inputTokens > 0 && month.inputTokens === peaks.inputTokens ? <PeakBadge label={peakLabel} /> : null}</span>
                            <span className="inline-flex items-center gap-1.5" data-metric="cachedInputTokens">{t("monthly.cached_with_rate", { rate: formatPercent(cacheHitRate) })} <strong className="font-medium text-foreground">{formatNumber(month.cachedInputTokens)}</strong><MonthDelta current={month.cachedInputTokens} previous={month.previous?.cachedInputTokens ?? null} labels={deltaLabels} />{month.cachedInputTokens > 0 && month.cachedInputTokens === peaks.cachedInputTokens ? <PeakBadge label={peakLabel} /> : null}</span>
                            <span className="inline-flex items-center gap-1.5" data-metric="outputTokens">{t("monthly.output")} <strong className="font-medium text-foreground">{formatNumber(month.outputTokens)}</strong><MonthDelta current={month.outputTokens} previous={month.previous?.outputTokens ?? null} labels={deltaLabels} />{month.outputTokens > 0 && month.outputTokens === peaks.outputTokens ? <PeakBadge label={peakLabel} /> : null}</span>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-border/70 px-4 py-4 tabular-nums">
                        <div className="space-y-1 text-[12px]">
                          <div data-quota="fiveHour"><span className="font-medium text-muted-foreground">{t("sessions.quota.five_hour")}</span> <QuotaPercent value={month.fiveHourPercent} /></div>
                          <div data-quota="weekly"><span className="font-medium text-muted-foreground">{t("sessions.quota.weekly")}</span> <QuotaPercent value={month.weeklyPercent} /></div>
                        </div>
                      </td>
                      <td className="border-b border-border/70 py-4 text-right tabular-nums">
                        <div className="ml-auto w-full max-w-48 space-y-2">
                          <div className="flex items-center justify-end gap-2 font-medium text-foreground" data-metric="costUSD">
                            {formatCurrency(month.costUSD)}
                            <MonthDelta current={month.costUSD} previous={month.previous?.costUSD ?? null} labels={deltaLabels} />
                            {month.costUSD != null && month.costUSD > 0 && month.costUSD === peaks.costUSD ? <PeakBadge label={peakLabel} /> : null}
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={t("monthly.cost_bar_label", { cost: formatCurrency(month.costUSD), percent: formatPercent(costRatio) })}>
                            <div
                              className={`h-full rounded-full ${costTone === "low" ? "pulse-token-cached" : costTone === "medium" ? "bg-amber-500" : costTone === "high" ? "bg-rose-500" : "bg-muted-foreground/25"}`}
                              data-cost-bar
                              data-cost-tone={costTone}
                              style={{ width: `${costRatio * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
