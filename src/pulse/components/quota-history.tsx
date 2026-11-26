import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, FileText } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { ReadingInfo } from "./reading-info";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { getPulsePaths, type ExportFormat } from "@/lib/api";
import { getExportDialogOptions } from "@/lib/usage-dashboard";
import { getLanguage, languages } from "@/lib/languages";
import { niceScale } from "@/lib/trend-buckets";
import { quotaHistoryCopy, quotaHistorySummaryCopy, type QuotaHistoryCopyKey } from "@/lib/quota-history-copy";
import {
  exportQuotaHistory, fetchQuotaHistoryDay, getQuotaRecordingPreferences, quotaHistoryDays, quotaHistoryReadError,
  setQuotaRecordingEnabled, useQuotaHistory, type QuotaHistoryDaily, type QuotaHistoryDayResponse, type QuotaHistoryResponse,
  type QuotaHistorySegment, type QuotaHistoryReadError, type QuotaKind, type QuotaRecordingPreferences,
} from "@/lib/quota-history";
import "./quota-history.css";

function useCopy() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: QuotaHistoryCopyKey, values?: Record<string, string | number>) => quotaHistoryCopy(language, key, values);
  const numberFormat = new Intl.NumberFormat(languages[getLanguage(language)].intlLocale, { maximumFractionDigits: 4 });
  const number = (value: number) => numberFormat.format(value);
  const points = (value: number | null) => value === null ? "—" : copy("points", { points: number(value) });
  const windowName = (kind: QuotaKind, minutes?: number) => !minutes ? copy(kind) : minutes % 1440 === 0 ? copy("days", { days: number(minutes / 1440) }) : minutes % 60 === 0 ? copy("hours", { hours: number(minutes / 60) }) : copy("duration", { minutes: number(minutes) });
  const time = (value: string, timezone: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleString(languages[getLanguage(language)].intlLocale, { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  return { copy, language, number, points, windowName, time, t };
}
function statusKey(row: QuotaHistoryDaily): QuotaHistoryCopyKey {
  if (row.status === "historical_partial") return "historical";
  if (row.consumedPercentPoints === null) return row.sampleCount === 0 ? "unknown" : "insufficient";
  return row.consumedPercentPoints === 0 ? "unchanged" : "partial";
}
type HistoryNotice = "readFailed" | "unavailable" | "providerReadFailed" | "writeFailed" | "identity" | "paused" | "loading";
type HistoryStatusProps = {
  data: (Pick<QuotaHistoryResponse, "readStatus" | "storageStatus" | "scopeAvailable"> & { enabled?: boolean }) | null;
  error: QuotaHistoryReadError | null;
  loading: boolean;
};

function historyNotices({ data, error, loading }: HistoryStatusProps): HistoryNotice[] {
  const notices: HistoryNotice[] = [];
  const storage = data?.storageStatus;
  const unavailable = error === "storage_unavailable" || (storage && storage !== "ready" && storage !== "write_failed");
  if (error === "local_read_failed") notices.push("readFailed");
  if (unavailable) notices.push("unavailable");
  if (data?.readStatus === "read_failed") notices.push("providerReadFailed");
  if (storage === "write_failed") notices.push("writeFailed");
  if (data && !data.scopeAvailable) notices.push("identity");
  if (data?.enabled === false) notices.push("paused");
  if (loading && !data) notices.push("loading");
  return notices;
}

function noticeRole(notice: HistoryNotice) {
  return notice === "identity" || notice === "paused" || notice === "loading" ? "status" : "alert";
}

function HistoryStatus({ data, error, loading, onRetry }: HistoryStatusProps & { onRetry: () => void }) {
  const { copy } = useCopy();
  return <div className="pulse-quota-status" aria-live="polite">
    {historyNotices({ data, error, loading }).map(notice => (
      <p key={notice} role={noticeRole(notice)}>
        {copy(notice)}{notice === "readFailed" ? <> <button type="button" className="pulse-text-button" onClick={onRetry}>{copy("retry")}</button></> : null}
      </p>
    ))}
  </div>;
}

export function QuotaHistorySummary({ onOpenHistory }: { onOpenHistory: () => void }) {
  const { data, error, loading, refresh } = useQuotaHistory("1d");
  const { copy, language, windowName, points } = useCopy();
  const notices = historyNotices({ data, error, loading });
  const [visibleNotice] = notices;
  return <section data-testid="quota-history-summary" className="pulse-quota-summary" aria-label={copy("today")}>
    <div className="pulse-quota-summary-heading">
      <strong>{copy("today")}</strong>
      <ReadingInfo label={quotaHistorySummaryCopy(language, "info")}>
        {notices.filter(notice => notice !== "loading").map(notice => <p key={notice}>{copy(notice)}</p>)}
        <p>{copy("partial")} · {copy("note")}</p>
        {data?.timezone ? <p>{copy("timezone", { zone: data.timezone })}</p> : null}
      </ReadingInfo>
    </div>
    <dl>{(["weekly", "session"] as const).map(kind => {
      const rows = data?.scopeAvailable ? data.daily.filter(row => row.kind === kind && row.date === data.endDate) ?? [] : [];
      return rows.length ? rows.map(row => <div key={`${kind}-${row.windowMinutes}`}><dt>{windowName(kind, row.windowMinutes)}</dt><dd>{points(row.consumedPercentPoints)}</dd></div>) : <div key={kind}><dt>{windowName(kind)}</dt><dd>—</dd></div>;
    })}</dl>
    <div className="pulse-quota-summary-actions">
      {visibleNotice ? <span role={noticeRole(visibleNotice)}>{quotaHistorySummaryCopy(language, visibleNotice)}</span> : null}
      {visibleNotice === "readFailed" ? <button type="button" className="pulse-text-button" onClick={refresh}>{copy("retry")}</button> : null}
      <button type="button" className="pulse-text-button" data-testid="open-quota-history" onClick={onOpenHistory}>{copy("open")}</button>
    </div>
  </section>;
}

const reasonKeys: Record<string, QuotaHistoryCopyKey> = { baseline: "baseline", continuous: "continuous", unchanged: "unchanged", same_day_gap: "gap", cross_day: "crossDay", counter_decreased: "decreased", cycle_changed: "changed", recording_resumed: "resumed", conflict: "conflict", historical_partial: "historical" };

function QuotaDayDetail({ id, date, kind, minutes, identityRevision, timezone, onClose }: { id: string; date: string; kind: QuotaKind; minutes: number; identityRevision: number; timezone: string; onClose: () => void }) {
  const { copy, points, number, time } = useCopy();
  const [segments, setSegments] = useState<QuotaHistorySegment[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState<QuotaHistoryReadError | null>(null);
  const [status, setStatus] = useState<QuotaHistoryDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [before, setBefore] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    void fetchQuotaHistoryDay(date, kind, minutes, before).then(value => {
      if (!active || value.identityRevision !== identityRevision) return;
      setStatus(value);
      if (!value.scopeAvailable) { setError("local_read_failed"); return; }
      setSegments(previous => before === null ? value.segments : [...previous, ...value.segments.filter(segment => !previous.some(old => old.id === segment.id))]);
      setNextBefore(value.nextBefore);
    }).catch(failure => { if (active) setError(quotaHistoryReadError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, kind, minutes, before, identityRevision, retry]);
  return <section id={id} className="pulse-quota-day" data-testid="quota-day-detail" aria-labelledby={`${id}-title`} aria-busy={loading} onKeyDown={event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  }}>
    <header><h3 id={`${id}-title`} ref={heading} tabIndex={-1}>{copy("details")} · {date}</h3><Button variant="ghost" size="sm" onClick={onClose}>{copy("close")}</Button></header>
    <HistoryStatus data={status} error={error} loading={false} onRetry={() => setRetry(value => value + 1)}/>
    <p>{copy("pageNote")}</p>
    <ol id="quota-day-segments" data-testid="quota-day-segments">{segments.map(segment => <li key={segment.id}>
      <div><strong>{copy(segment.date === null ? "crossDay" : reasonKeys[segment.reason] ?? "partial")}</strong><span>{points(segment.consumedPercentPoints)}</span></div>
      <p><time dateTime={segment.startAt}>{time(segment.startAt, timezone)}</time> — <time dateTime={segment.endAt}>{time(segment.endAt, timezone)}</time></p>
      <dl><div><dt>{copy("start")}</dt><dd>{segment.startUsedPercent === null ? "—" : `${number(segment.startUsedPercent)}%`}</dd></div><div><dt>{copy("end")}</dt><dd>{segment.endUsedPercent === null ? "—" : `${number(segment.endUsedPercent)}%`}</dd></div><div><dt>{copy("coverage", { minutes: number(segment.coveredMinutes) })}</dt><dd>{copy("reset", { time: time(segment.resetsAt, timezone) })}</dd></div></dl>
      {segment.source !== "official" ? <small>{copy(segment.source === "mixed" ? "mixed" : "migrated")}</small> : null}
    </li>)}</ol>
    {loading ? <p role="status">{copy("loading")}</p> : null}
    {!loading && !error && segments.length === 0 ? <p>{copy("unknown")}</p> : null}
    {nextBefore !== null ? <Button variant="secondary" size="sm" onClick={() => setBefore(nextBefore)} disabled={loading}>{copy("more")}</Button> : null}
  </section>;
}

function PaperDailyChart({ rows, width, container, viewportWidth }: {
  rows: QuotaHistoryDaily[];
  width: number;
  container: RefObject<HTMLDivElement | null>;
  viewportWidth: number;
}) {
  const { copy, number, points } = useCopy();
  const titleId = useId();
  const descriptionId = useId();
  const scrollHintId = useId();
  const height = 174;
  const top = 10;
  const baseline = 142;
  const inset = 20;
  const lastIndex = rows.length - 1;
  const step = (width - inset * 2) / rows.length;
  const dateStride = Math.max(1, Math.ceil(58 / step));
  const scale = niceScale(rows.reduce((max, row) => Math.max(max, row.consumedPercentPoints ?? 0), 0));
  const ordinate = (value: number) => baseline - value / scale * (baseline - top);
  const guides = [scale, scale / 2, 0];
  const barWidth = Math.max(2, Math.min(26, step * .62));
  const hasZero = rows.some(row => row.consumedPercentPoints === 0);
  const dateRange = `${rows[0].date}:${rows[lastIndex].date}`;
  const scrollable = viewportWidth > 0 && width > viewportWidth;
  const scrollPosition = useRef({ range: "", left: 0, atLatest: true });

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const position = scrollPosition.current;
    if (position.range !== dateRange) {
      position.range = dateRange;
      position.atLatest = true;
    }
    if (!position.atLatest) return;
    const showLatest = () => {
      if (!position.atLatest) return;
      root.scrollLeft = root.scrollWidth;
      position.left = root.scrollLeft;
    };
    showLatest();
    const frame = requestAnimationFrame(showLatest);
    return () => cancelAnimationFrame(frame);
  }, [container, dateRange, viewportWidth, width]);

  useEffect(() => {
    const root = container.current;
    if (!scrollable || !root) return;
    const dates = root.querySelectorAll(".pulse-quota-chart-date");
    // WebView2 can round a fully visible SVG label just below 1. The inset still guards both edges.
    const visibleRatio = 0.999;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.toggleAttribute("data-in-view", entry.intersectionRatio >= visibleRatio);
      }
    }, { root, rootMargin: "0px -2px", threshold: visibleRatio });
    dates.forEach(date => observer.observe(date));
    return () => {
      observer.disconnect();
      dates.forEach(date => date.removeAttribute("data-in-view"));
    };
  }, [container, dateRange, scrollable, width]);

  return <figure className="pulse-quota-chart--paper">
    <figcaption id={titleId}>{copy("chart")}</figcaption>
    <div className="pulse-quota-chart-plot">
      <div className="pulse-quota-chart-axis" aria-hidden="true" style={{ height, paddingTop: top, paddingBottom: height - baseline }}>
        {guides.map(value => <span key={value}>{number(value)}</span>)}
      </div>
      <div className="pulse-quota-chart-scroll pulse-quota-chart-scroll--paper" ref={container} data-scrollable={scrollable || undefined}
        role={scrollable ? "region" : undefined} tabIndex={scrollable ? 0 : undefined}
        aria-labelledby={scrollable ? titleId : undefined} aria-describedby={scrollable ? scrollHintId : undefined} onScroll={event => {
        const { scrollLeft, scrollWidth, clientWidth } = event.currentTarget;
        const position = scrollPosition.current;
        if (scrollLeft === position.left) return;
        position.left = scrollLeft;
        position.atLatest = scrollWidth - clientWidth - scrollLeft <= 1;
      }}>
        <svg role="img" aria-labelledby={titleId} aria-describedby={descriptionId} data-scale-max={scale} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
          <desc id={descriptionId}>{copy("sumNote")} {copy("table")}</desc>
          {guides.map(value => <line key={value} className="pulse-quota-chart-guide" x1="0" x2={width} y1={ordinate(value)} y2={ordinate(value)} data-baseline={value === 0 || undefined}/>)}
          {rows.map((row, index) => {
            const x = inset + (index + .5) * step;
            const value = row.consumedPercentPoints;
            const observation = value === null ? "missing" : value === 0 ? "zero" : "positive";
            const y = ordinate(value ?? 0);
            const barX = x - barWidth / 2;
            const radius = Math.min(3, barWidth / 2, baseline - y);
            const right = barX + barWidth;
            return <g key={row.date} data-chart-date={row.date} data-observation={observation}>
              <title>{row.date}: {points(value)} · {copy(statusKey(row))}</title>
              <rect className="pulse-quota-chart-hit" x={x - step / 2} y={top} width={step} height={baseline - top + 4}/>
              {observation === "positive" ? <path className="pulse-quota-chart-bar" d={`M${barX} ${baseline}V${y + radius}Q${barX} ${y} ${barX + radius} ${y}H${right - radius}Q${right} ${y} ${right} ${y + radius}V${baseline}Z`}/> : null}
              {observation === "zero" ? <circle className="pulse-quota-chart-zero-dot" cx={x} cy={baseline} r="2.5"/> : null}
              {(lastIndex - index) % dateStride === 0 ? <text className="pulse-quota-chart-date" x={x} y={height - 10} textAnchor="middle">{row.date.slice(5)}</text> : null}
            </g>;
          })}
        </svg>
      </div>
    </div>
    {hasZero || scrollable ? <div className="pulse-quota-chart-footer">
      {hasZero ? <span className="pulse-quota-chart-zero-key">{copy("unchanged")}</span> : null}
      {scrollable ? <span id={scrollHintId}>{copy("chartScroll")}</span> : null}
    </div> : null}
  </figure>;
}

function DailyChart({ rows, paper }: { rows: QuotaHistoryDaily[]; paper: boolean }) {
  const { copy, points } = useCopy();
  const container = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setViewportWidth(Math.floor(element.clientWidth));
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, [paper]);
  const max = Math.max(1, ...rows.map(row => row.consumedPercentPoints ?? 0));
  const width = Math.max(paper ? rows.length * 14 + 40 : rows.length <= 31 ? 300 : rows.length * 16, viewportWidth);
  const height = 180, top = 12, bottom = 145;
  const step = (width - 48) / Math.max(1, rows.length);
  const latestDate = rows.at(-1)?.date;
  useEffect(() => {
    const element = container.current;
    if (element && !paper) element.scrollLeft = element.scrollWidth;
  }, [width, viewportWidth, latestDate, paper]);
  if (paper) return <PaperDailyChart rows={rows} width={width} container={container} viewportWidth={viewportWidth}/>;
  return <div>{rows.length > 31 ? <p className="pulse-quota-chart-hint">{copy("chartScroll")}</p> : null}<div className="pulse-quota-chart-scroll" ref={container} tabIndex={rows.length > 31 ? 0 : undefined} aria-label={rows.length > 31 ? copy("chartScroll") : undefined}><svg role="img" aria-label={copy("chart")} aria-describedby="quota-chart-description" data-scale-max={max} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
    <desc id="quota-chart-description">{copy("sumNote")} {copy("table")}</desc>
    <text x="0" y="12">{max}</text><text x="0" y={bottom}>0</text><line x1="38" x2={width} y1={bottom} y2={bottom}/>
    {rows.map((row, index) => {
      const x = 42 + index * step, barWidth = Math.max(2, Math.min(32, step - 4)), barX = x + (step - barWidth) / 2;
      const value = row.consumedPercentPoints;
      return <g key={row.date}><title>{row.date}: {points(value)} · {copy(statusKey(row))}</title>
        {value === null ? <text x={x + step / 2} y={bottom - 4} textAnchor="middle">—</text> : value === 0 ? <line className="pulse-quota-chart-zero" x1={barX} x2={barX + barWidth} y1={bottom - 1} y2={bottom - 1}/> : <rect x={barX} y={bottom - value / max * (bottom - top)} width={barWidth} height={value / max * (bottom - top)}/>}
        {rows.length <= 14 || index % Math.ceil(rows.length / 10) === 0 || index === rows.length - 1 ? <text x={x + step / 2} y={height - 12} textAnchor="middle">{row.date.slice(5)}</text> : null}
      </g>;
    })}
  </svg></div></div>;
}

export function QuotaHistoryView({ paper = false }: { paper?: boolean }) {
  const { copy, points, windowName, number, t } = useCopy();
  const [range, setRange] = useState("30d");
  const [rangeChoice, setRangeChoice] = useState("30d");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [rangeError, setRangeError] = useState(false);
  const { data, error, loading, refresh } = useQuotaHistory(range);
  const [selection, setSelection] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dayDetailId = useId();
  const exportScopeId = useId();
  const restoreDayPosition = useRef<(() => void) | null>(null);
  const closingDay = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportFailed, setExportFailed] = useState<"desktop" | "failed" | null>(null);
  const windows = [...new Map([...(data?.daily ?? []), ...(data?.summaries ?? [])].map(row => [`${row.kind}:${row.windowMinutes}`, { kind: row.kind, minutes: row.windowMinutes }])).entries()];
  const selected = windows.find(([key]) => key === selection) ?? windows[0];
  const kind = selected?.[1].kind ?? "session", minutes = selected?.[1].minutes ?? 300;
  const rows = data?.scopeAvailable && selected ? quotaHistoryDays(data, kind, minutes) : [];
  const known = rows.filter(row => row.consumedPercentPoints !== null);
  const total = known.length ? known.reduce((sum, row) => sum + row.consumedPercentPoints!, 0) : null;
  useEffect(() => { setSelectedDate(null); }, [range, selection, data?.identityRevision]);
  useLayoutEffect(() => {
    if (selectedDate !== null || !closingDay.current) return;
    closingDay.current = false;
    restoreDayPosition.current?.();
    restoreDayPosition.current = null;
  }, [selectedDate]);
  const closeDay = () => {
    closingDay.current = true;
    setSelectedDate(null);
  };
  const openDay = (date: string, trigger: HTMLButtonElement) => {
    if (selectedDate === date) {
      closeDay();
      return;
    }
    const workspace = trigger.closest<HTMLElement>(".pulse-main-scroll");
    const tableScroll = trigger.closest<HTMLElement>(".pulse-quota-table-scroll");
    const top = workspace?.scrollTop ?? 0;
    const left = tableScroll?.scrollLeft ?? 0;
    restoreDayPosition.current = () => {
      if (workspace) workspace.scrollTop = top;
      if (tableScroll) tableScroll.scrollLeft = left;
      trigger.focus({ preventScroll: true });
    };
    setSelectedDate(date);
  };
  const applyCustom = () => {
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
    if (!Number.isFinite(days) || days < 1 || days > 366) { setRangeError(true); return; }
    setRangeError(false); setRange(`custom:${start}_${end}`);
  };
  const exportHistory = async (format: ExportFormat) => {
    if (!data?.scopeAvailable || loading || exporting) return;
    setExportFailed(null); setExportMessage(null);
    if (format === "xlsx" && !isTauri()) { setExportFailed("desktop"); return; }
    setExporting(true);
    try {
      const paths = await getPulsePaths();
      const name = `Pulse-quota-${data.startDate}-${data.endDate}.${format === "xlsx" ? "xlsx" : "md"}`;
      const fileOptions = getExportDialogOptions(format, `${paths.exports.replace(/[\\/]$/, "")}/${name}`, t);
      const title = copy(format === "xlsx" ? "exportTitleXlsx" : "exportTitleMarkdown");
      const path = await save({ ...fileOptions, title });
      if (path) { const result = await exportQuotaHistory(range, format, path); setExportMessage(copy("exported", { path: result.path })); }
    } catch { setExportFailed("failed"); }
    finally { setExporting(false); }
  };
  return <section className="pulse-quota-history" data-testid="quota-history-view" aria-labelledby="quota-history-title">
    <div className="pulse-book-official-notes">
    <header className="pulse-quota-heading"><div><h1 id="quota-history-title">{copy("title")}</h1><p>{copy("note")}</p></div></header>
    <div className="pulse-quota-controls"><label>{copy("range")}<select value={rangeChoice} onChange={event => { const value = event.target.value; setRangeChoice(value); setRangeError(false); if (value !== "custom") setRange(value); }}>
      {["1d", "7d", "14d", "30d", "90d", "180d", "365d"].map(value => <option value={value} key={value}>{t(`ranges.${value}`)}</option>)}<option value="custom">{t("range_switcher.custom_range")}</option>
    </select></label>
    {rangeChoice === "custom" ? <fieldset className="pulse-quota-custom"><legend>{t("range_switcher.custom_range")}</legend><input type="date" aria-label={copy("rangeStart")} value={start} onChange={event => setStart(event.target.value)}/><span aria-hidden="true">—</span><input type="date" aria-label={copy("rangeEnd")} value={end} onChange={event => setEnd(event.target.value)}/><Button variant="secondary" size="sm" onClick={applyCustom}>{t("range_switcher.btn_apply")}</Button></fieldset> : null}
    {windows.length ? <label>{copy("window")}<select value={selected?.[0]} onChange={event => setSelection(event.target.value)}>{windows.map(([key, window]) => <option value={key} key={key}>{copy(window.kind)} · {windowName(window.kind, window.minutes)}</option>)}</select></label> : null}
    <div className="pulse-quota-export">
      <p id={exportScopeId} className="pulse-quota-export-scope">{copy("exportScope")}</p>
      <Button type="button" variant="secondary" size="sm" aria-describedby={exportScopeId} disabled={!data?.scopeAvailable || loading || exporting} onClick={() => void exportHistory("xlsx")}>{paper ? <FileSpreadsheet size={14} aria-hidden="true"/> : null}{copy("exportXlsx")}</Button>
      <Button type="button" variant="secondary" size="sm" aria-describedby={exportScopeId} disabled={!data?.scopeAvailable || loading || exporting} onClick={() => void exportHistory("markdown")}>{paper ? <FileText size={14} aria-hidden="true"/> : null}{copy("exportMarkdown")}</Button>
    </div></div>
    {rangeError ? <p role="alert">{copy("rangeLimit")}</p> : null}
    {exportFailed ? <p role="alert">{copy(exportFailed === "desktop" ? "exportDesktopOnly" : "exportFailed")}</p> : null}{exportMessage ? <p role="status" className="pulse-quota-export-message">{exportMessage}</p> : null}
    <HistoryStatus data={data} error={error} loading={loading} onRetry={refresh}/>
    {data ? <>
      <p className="pulse-quota-context"><span>{copy("scope")}</span><span>{copy("timezone", { zone: data.timezone })}</span><span>{data.startDate} — {data.endDate}</span></p>
      {data.scopeAvailable && data.hasOtherScopeHistory ? <p role="status">{copy("otherScopeHistory")}</p> : null}
      <dl className="pulse-quota-total"><div><dt>{copy("sum")}</dt><dd>{points(total)}</dd></div></dl>
      <p>{rows.length > 0 ? <strong className="pulse-quota-observed-days">{copy("observedDays", { observed: number(known.length), total: number(rows.length) })}</strong> : null}{copy("sumNote")}</p>
      {data.unallocatedCount > 0 ? <p className="pulse-quota-gap">{copy("unallocated", { count: data.unallocatedCount })}</p> : null}
    </> : null}
    </div>
    {data ? <div className="pulse-book-official-records">
      {rows.length ? <><DailyChart rows={rows} paper={paper}/><div className="pulse-quota-table-scroll"><table aria-label={copy("table")}><thead><tr><th>{copy("date")}</th><th>{copy("consumption")}</th><th>{copy("state")}</th><th>{copy("partial")}</th></tr></thead><tbody>{[...rows].reverse().map(row => {
        const expanded = row.date === selectedDate;
        return <Fragment key={row.date}>
          <tr>
            <th scope="row"><button type="button" className="pulse-text-button" aria-expanded={expanded} aria-controls={expanded ? dayDetailId : undefined} onClick={event => openDay(row.date, event.currentTarget)}>{row.date}</button></th>
            <td>{points(row.consumedPercentPoints)}</td>
            <td>{copy(statusKey(row))}{row.gapCount > 0 ? <small>{copy("gaps", { count: row.gapCount })}</small> : null}{row.unallocatedCount > 0 ? <small>{copy("unallocated", { count: row.unallocatedCount })}</small> : null}{row.source !== "official" ? <small>{copy(row.source === "mixed" ? "mixed" : "migrated")}</small> : null}</td>
            <td>{copy("coverage", { minutes: number(row.coveredMinutes) })}<small>{copy("samples", { count: row.sampleCount })} · {copy("cycles", { count: row.cycleCount })}</small></td>
          </tr>
          {expanded ? <tr><td colSpan={4} className="pulse-quota-detail-cell">
            <QuotaDayDetail key={`${kind}:${minutes}:${data.identityRevision}`} id={dayDetailId} date={row.date} kind={kind} minutes={minutes} identityRevision={data.identityRevision} timezone={data.timezone} onClose={closeDay}/>
          </td></tr> : null}
        </Fragment>;
      })}</tbody></table></div></> : <p className="pulse-empty">{copy("noWindows")}</p>}
    </div> : null}
  </section>;
}

export function QuotaRecordingSettings({ disabled = false }: { disabled?: boolean }) {
  const { copy } = useCopy();
  const [preferences, setPreferences] = useState<QuotaRecordingPreferences | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState<"read" | "save" | "storage_unavailable" | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; let remove: (() => void) | undefined;
    void listen("quota-history-updated", () => { if (active) setRevision(value => value + 1); }).then(unlisten => { if (active) remove = unlisten; else unlisten(); }).catch(() => {});
    return () => { active = false; remove?.(); };
  }, []);
  useEffect(() => {
    let active = true;
    void getQuotaRecordingPreferences().then(value => { if (active) { setPreferences(value); setError(null); } }).catch(failure => {
      if (active) { setPreferences(null); setError(quotaHistoryReadError(failure) === "storage_unavailable" ? "storage_unavailable" : "read"); }
    });
    return () => { active = false; };
  }, [revision]);
  const toggle = async () => {
    if (!preferences || pending) return;
    setPending(true); setError(null);
    try { setPreferences(await setQuotaRecordingEnabled(!preferences.enabled)); }
    catch (failure) {
      if (quotaHistoryReadError(failure) === "storage_unavailable") { setPreferences(null); setError("storage_unavailable"); }
      else setError("save");
    }
    finally { setPending(false); }
  };
  return <Card className="pulse-quota-settings"><CardHeader><CardTitle>{copy("record")}</CardTitle><CardDescription id="quota-recording-note">{copy("recordNote")}</CardDescription></CardHeader><CardContent>
    <div className="pulse-quota-setting-row"><p>{copy("timezone", { zone: preferences?.timezone ?? "—" })}</p><button type="button" role="switch" aria-label={copy("record")} aria-checked={preferences?.enabled ?? false} aria-describedby="quota-recording-note" aria-busy={pending} disabled={disabled || pending || !preferences} onClick={() => void toggle()} className="pulse-quota-switch"><span/></button></div>
    {error ? <p role="alert">{copy(error === "storage_unavailable" ? "unavailable" : error === "save" ? "preferenceFailed" : "preferenceReadFailed")} <button type="button" className="pulse-text-button" onClick={() => setRevision(value => value + 1)} disabled={pending}>{copy("retrySettings")}</button></p> : null}
  </CardContent></Card>;
}
