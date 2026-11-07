import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Maximize2, Minimize2, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OverviewResponse } from "@/lib/api";
import { formatCompactNumber, formatCurrencyShort, formatNumber, formatPercent } from "@/lib/formatters";
import type { MetricCardData } from "@/lib/usage-dashboard";
import { usePulseCopy } from "@/lib/pulse-copy";
import { usePulsePreferences } from "@/lib/pulse-appearance";

type Day = OverviewResponse["daily"][number];
type Mode = "tokens" | "cost" | "quota";
type Series = "inputTokens" | "cachedInputTokens" | "outputTokens" | "fiveHourPercent" | "weeklyPercent";
type UsageTrendsCardProps = {
  daily: Day[]; metrics: MetricCardData[]; cacheHitRate: number; chartHeight?: number | string;
  className?: string; title?: string; compact?: boolean; onOpenDay?: (date: string) => void;
};

/** Export kept for embedded project charts. Missing costs remain unknown. */
export function UsageTrendTooltip({active,payload,label,t,compact=false,view="cost"}: any) {
  if (!active || !payload?.length) return null;
  const day = payload[0]?.payload;
  const input = day?.inputTokens ?? payload.find((item:any) => item.dataKey === "inputTokens")?.value ?? 0;
  const cached = day?.cachedInputTokens ?? payload.find((item:any) => item.dataKey === "cachedInputTokens")?.value ?? 0;
  const output = day?.outputTokens ?? payload.find((item:any) => item.dataKey === "outputTokens")?.value ?? 0;
  const cost = day?.costUSD ?? payload.find((item:any) => item.dataKey === "costUSD")?.value;
  const total = day?.totalTokens ?? payload.find((item:any) => item.dataKey === "totalTokens")?.value ?? input+output;
  return <div className="pulse-chart-tooltip bg-surface"><strong>{day?.date ?? label}</strong><dl>
    <div><dt>{t("trends.total_tokens")}</dt><dd>{formatNumber(total)}</dd></div>
    {!compact ? <><div><dt>{t("project_modal.input")}</dt><dd>{formatNumber(input)}</dd></div><div><dt>{t("project_modal.cached")}</dt><dd>{formatNumber(cached)}</dd></div><div><dt>{t("project_modal.output")}</dt><dd>{formatNumber(output)}</dd></div></> : null}
    {view !== "quota" ? <div><dt>{t("common.cost")}</dt><dd>{cost == null ? "—" : formatCurrencyShort(cost)}</dd></div> : <><div><dt>{t("trends.five_hour_usage")}</dt><dd>{day?.fiveHourPercent == null ? "—" : `${formatNumber(day.fiveHourPercent)}%`}</dd></div><div><dt>{t("trends.weekly_monthly_usage")}</dt><dd>{day?.weeklyPercent == null ? "—" : `${formatNumber(day.weeklyPercent)}%`}</dd></div></>}
  </dl></div>;
}

export function niceScale(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return ([1,2,2.5,5,10].find(step => value <= step*magnitude) ?? 10)*magnitude;
}

export function UsageTrendsCard({daily,metrics,cacheHitRate,chartHeight,className="",title,compact=false,onOpenDay}:UsageTrendsCardProps) {
  const {t} = useTranslation();
  const copy = usePulseCopy();
  const {skinId} = usePulsePreferences();
  const [mode,setMode] = useState<Mode>("tokens");
  const [selectedDate,setSelectedDate] = useState<string | null>(daily.at(-1)?.date ?? null);
  const [hidden,setHidden] = useState<Set<Series>>(() => new Set());
  const [fullscreen,setFullscreen] = useState(false);
  const [table,setTable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  const scrollPositions = useRef<Record<string,{top:number;left:number}>>({});
  const scopeRef = useRef("");
  const rangeIdentity = `${daily[0]?.date ?? ""}:${daily.at(-1)?.date ?? ""}:${daily.length}`;
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (scopeRef.current !== rangeIdentity) { scopeRef.current = rangeIdentity; scrollPositions.current = {}; }
    const position = scrollPositions.current[skinId];
    if (position) { node.scrollTop = position.top; node.scrollLeft = position.left; }
    else {
      // Start at the selected/latest day while retaining every day in the range.
      node.scrollTop = node.scrollHeight;
      node.scrollLeft = node.scrollWidth;
    }
  },[rangeIdentity,skinId,table,fullscreen]);
  const selected = daily.find(day => day.date===selectedDate) ?? daily.at(-1);
  const isMeter = skinId === "meter" && !compact;
  const series: {key:Series; label:string; style:string}[] = mode === "quota"
    ? [{key:"fiveHourPercent",label:t("trends.five_hour_usage"),style:"five-hour"},{key:"weeklyPercent",label:t("trends.weekly_monthly_usage"),style:"long-window"}]
    : [{key:"inputTokens",label:copy("uncached"),style:"input"},{key:"cachedInputTokens",label:copy("cached"),style:"cached"},{key:"outputTokens",label:copy("output"),style:"output"}];
  const valueFor = (day:Day,key:Series):number | null => key === "inputTokens" ? Math.max(0,day.inputTokens-day.cachedInputTokens) : day[key] ?? null;
  const valueOf = (day:Day):number | null => mode === "cost" ? day.costUSD : mode === "tokens" ? day.totalTokens
    : day.fiveHourPercent == null && day.weeklyPercent == null ? null : Math.max(day.fiveHourPercent ?? 0,day.weeklyPercent ?? 0);
  const max = niceScale(daily.reduce((top,day) => Math.max(top,valueOf(day) ?? 0),0));
  const format = (value:number | null | undefined) => value == null ? "—" : mode === "cost" ? formatCurrencyShort(value) : mode === "quota" ? `${formatNumber(value)}%` : formatCompactNumber(value);
  const toggle = (key:Series) => setHidden(current => { const next=new Set(current); if(next.has(key))next.delete(key);else next.add(key); return next; });
  useEffect(() => {
    if(!fullscreen) { if (wasFullscreen.current) fullscreenButton.current?.focus(); wasFullscreen.current=false; return; }
    wasFullscreen.current=true;
    fullscreenButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event:globalThis.KeyboardEvent) => { if(event.key === "Escape")setFullscreen(false); };
    window.addEventListener("keydown",key); return () => { window.removeEventListener("keydown",key); document.body.style.overflow = previousOverflow; };
  },[fullscreen]);
  function navigate(event:KeyboardEvent<HTMLButtonElement>,index:number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? daily.length-1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? Math.max(0,index-1)
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? Math.min(daily.length-1,index+1) : null;
    if(next===null)return;
    event.preventDefault();setSelectedDate(daily[next].date);
    const root=event.currentTarget.parentElement;
    (root?.querySelectorAll<HTMLButtonElement>(".pulse-trend-day")[next])?.focus();
  }
  const plot = <section data-testid="usage-trends-card" className={`pulse-trends ${isMeter ? "pulse-trends-meter" : "pulse-trends-clear"} ${compact ? "is-compact" : ""} ${className}`}>
    <div className="pulse-trend-main">
      <div className="pulse-section-heading"><h2 className={compact ? "sr-only" : undefined}>{title ?? copy("trend")}</h2><div className="pulse-segments" role="group" aria-label={t("trends.view_label")}>{(["tokens","cost","quota"] as const).map(value => <button type="button" key={value} aria-pressed={mode===value} onClick={() => setMode(value)}>{copy(value === "cost" ? "estimate" : value)}</button>)}</div>
      {!compact ? <><button type="button" className="pulse-icon-button" aria-label={copy("showTable")} aria-pressed={table} onClick={() => setTable(!table)}><Table2 size={16}/></button><button ref={fullscreenButton} type="button" className="pulse-icon-button" aria-label={copy(fullscreen?"exitFullscreen":"fullscreen")} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></> : null}</div>
      <div className="pulse-chart-legend" role="group" aria-label={t("trends.legend_label")}>{mode!=="cost" ? series.map(item => <button key={item.key} type="button" aria-pressed={!hidden.has(item.key)} onClick={() => toggle(item.key)}><i className={`pulse-series-${item.style}`} aria-hidden="true"/>{item.label}</button>) : <span>{copy("estimate")} · USD</span>}</div>
      {mode === "quota" && !daily.some(day => day.fiveHourPercent != null || day.weeklyPercent != null) ? <p role="status" className="pulse-source-note">{t("trends.quota_no_data")}</p> : null}
      {daily.length === 0 ? <p className="pulse-empty">{copy("noData")}</p> : table ? <div className="pulse-chart-table"><table><thead><tr><th>{copy("dates")}</th><th>{copy("total")}</th><th>{copy("input")}</th><th>{copy("cached")}</th><th>{copy("output")}</th><th>{copy("estimate")}</th></tr></thead><tbody>{daily.map(day => <tr key={day.date}><td><button type="button" onClick={() => setSelectedDate(day.date)}>{day.date}</button></td><td>{formatNumber(day.totalTokens)}</td><td>{formatNumber(day.inputTokens)}</td><td>{formatNumber(day.cachedInputTokens)}</td><td>{formatNumber(day.outputTokens)}</td><td>{day.costUSD == null ? "—" : formatCurrencyShort(day.costUSD)}</td></tr>)}</tbody></table></div>
      : <div ref={scrollRef} onScroll={event => { scrollPositions.current[skinId] = {top:event.currentTarget.scrollTop,left:event.currentTarget.scrollLeft}; }} className="pulse-chart-scroll" style={typeof chartHeight==="number" ? {maxHeight:chartHeight} : undefined}>
        <div className="pulse-chart-scale"><span>0</span><span>{format(max/2)}</span><span>{format(max)}</span></div>
        <div className="pulse-trend-days" style={isMeter ? {minWidth:Math.max(320,daily.length*46)} : undefined}>
          {daily.map((day,index) => {
            const value=valueOf(day);
            const slices = mode === "cost" ? [{key:"cost",amount:day.costUSD,style:"cost"}]
              : series.filter(item=>!hidden.has(item.key)).map(item=>({key:item.key,amount:valueFor(day,item.key),style:item.style}));
            return <button type="button" className="pulse-trend-day" key={day.date} aria-pressed={selected?.date===day.date} aria-label={`${day.date} · ${copy(mode === "cost" ? "estimate" : mode)} ${format(value)}`} onClick={()=>setSelectedDate(day.date)} onMouseEnter={()=>setSelectedDate(day.date)} onFocus={()=>setSelectedDate(day.date)} onKeyDown={event=>navigate(event,index)}>
              <span className="pulse-trend-date">{day.date.slice(5).replace("-","/")}</span><span className={`pulse-trend-bar ${mode==="quota"?"pulse-quota-bars":""}`} aria-hidden="true">
                {slices.map(slice => <i key={slice.key} className={`pulse-series-${slice.style} ${slice.amount == null ? "is-unknown" : ""}`} style={{"--amount":`${Math.max(0,(slice.amount??0)/max)*100}%`} as CSSProperties}/>)}
              </span><strong>{format(value)}</strong>
            </button>;
          })}
        </div>
      </div>}
      <div className="pulse-chart-caption"><span>{copy("fullRange")} · {daily.length} {copy("days")}</span><span>{mode === "tokens" ? copy("input") : mode === "cost" ? copy("notBill") : t("trends.quota_note")}</span></div>
    </div>
    {!compact && selected ? <aside className="pulse-day-inspector"><header><strong>{selected.date.slice(-2)}</strong><div><b>{selected.date}</b><span>{copy("selectedDay")}</span></div></header><dl>
      <div><dt>{copy("total")}</dt><dd>{formatCompactNumber(selected.totalTokens)}</dd></div><div><dt>{copy("estimate")}</dt><dd>{selected.costUSD == null ? "—" : formatCurrencyShort(selected.costUSD)}</dd></div><div><dt>{copy("input")}</dt><dd>{formatCompactNumber(selected.inputTokens)}</dd></div><div><dt>{copy("cached")}</dt><dd>{formatCompactNumber(selected.cachedInputTokens)}</dd></div><div><dt>{copy("output")}</dt><dd>{formatCompactNumber(selected.outputTokens)}</dd></div><div><dt>{copy("cache")}</dt><dd>{selected.inputTokens > 0 ? formatPercent(selected.cachedInputTokens/selected.inputTokens) : "—"}</dd></div>
      {mode==="quota" ? <><div><dt>{t("trends.five_hour_usage")}</dt><dd>{selected.fiveHourPercent == null ? "—" : `${formatNumber(selected.fiveHourPercent)}%`}</dd></div><div><dt>{t("trends.weekly_monthly_usage")}</dt><dd>{selected.weeklyPercent == null ? "—" : `${formatNumber(selected.weeklyPercent)}%`}</dd></div></> : null}
    </dl>{onOpenDay ? <button type="button" className="pulse-text-button" onClick={()=>onOpenDay(selected.date)}>{copy("todaySessions")}<ArrowRight size={14}/></button> : null}</aside> : null}
    {metrics.length>0 ? <div className="pulse-fact-row">{metrics.map(metric=><span key={metric.kind} title={metric.detail}>{metric.label}<strong>{metric.value}</strong></span>)}<span>{copy("cache")} {formatPercent(cacheHitRate)}</span></div> : null}
  </section>;
  return fullscreen ? createPortal(<div className="pulse-chart-fullscreen" onKeyDown={event => {
    if (event.key !== "Tab") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0]; const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
  }} role="dialog" aria-modal="true" aria-label={title ?? copy("trend")}>{plot}</div>,document.body) : plot;
}
