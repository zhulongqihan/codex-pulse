import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Maximize2, Minimize2, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OverviewResponse } from "@/lib/api";
import { formatCompactNumber, formatCurrencyShort, formatNumber, formatPercent } from "@/lib/formatters";
import type { MetricCardData } from "@/lib/usage-dashboard";
import { usePulseCopy } from "@/lib/pulse-copy";
import { usePulsePreferences } from "@/lib/pulse-appearance";
import { useHomeCopy } from "@/lib/home-copy";
import { buildTrendBuckets, currentDateInTimezone, type TrendBucket } from "@/lib/trend-buckets";

type Day = OverviewResponse["daily"][number];
type Mode = "tokens" | "cost" | "quota";
type Series = "inputTokens" | "cachedInputTokens" | "outputTokens" | "fiveHourPercent" | "weeklyPercent";
type UsageTrendsCardProps = {
  daily: Day[]; metrics: MetricCardData[]; cacheHitRate: number; chartHeight?: number | string;
  className?: string; title?: string; compact?: boolean; onOpenDay?: (date: string) => void; todayDate?: string; retainedFrom?: string | null;
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

export function UsageTrendsCard({daily,metrics,cacheHitRate,chartHeight,className="",title,compact=false,onOpenDay,todayDate,retainedFrom}:UsageTrendsCardProps) {
  const {t} = useTranslation();
  const copy = usePulseCopy();
  const home = useHomeCopy();
  const {skinId} = usePulsePreferences();
  const [mode,setMode] = useState<Mode>("tokens");
  const [selectedDate,setSelectedDate] = useState<string | null>(daily.at(-1)?.date ?? null);
  const [hoveredDate,setHoveredDate] = useState<string | null>(null);
  const [hidden,setHidden] = useState<Set<Series>>(() => new Set());
  const [fullscreen,setFullscreen] = useState(false);
  const [table,setTable] = useState(false);
  const [detail,setDetail] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  const scrollPositions = useRef<Record<string,{top:number;left:number}>>({});
  const scopeRef = useRef("");
  const rangeIdentity = `${daily[0]?.date ?? ""}:${daily.at(-1)?.date ?? ""}:${daily.length}`;
  const items = useMemo(() => buildTrendBuckets(daily, detail ? daily.length || 1 : 60), [daily, detail]);
  const selected = items.find(day => selectedDate != null && selectedDate >= day.startDate && selectedDate <= day.endDate) ?? items.at(-1);
  const preview = items.find(day => day.date === hoveredDate);
  const inspected = preview ?? selected;
  const today = todayDate ?? currentDateInTimezone();
  const hasToday = daily.some(day => day.date === today);
  const isMeter = skinId === "meter" && !compact;
  const viewKey = `${skinId}:${detail}:${table}:${fullscreen}`;
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (scopeRef.current !== rangeIdentity) { scopeRef.current = rangeIdentity; scrollPositions.current = {}; }
    const position = scrollPositions.current[viewKey];
    node.scrollTop = position?.top ?? (detail ? node.scrollHeight : 0);
    node.scrollLeft = position?.left ?? (detail && isMeter ? node.scrollWidth : 0);
  },[rangeIdentity,viewKey,detail,isMeter]);
  const series: {key:Series; label:string; style:string}[] = mode === "quota"
    ? [{key:"fiveHourPercent",label:t("trends.five_hour_usage"),style:"five-hour"},{key:"weeklyPercent",label:t("trends.weekly_monthly_usage"),style:"long-window"}]
    : [{key:"inputTokens",label:copy("uncached"),style:"input"},{key:"cachedInputTokens",label:copy("cached"),style:"cached"},{key:"outputTokens",label:copy("output"),style:"output"}];
  const noRetention = (day:Day & {endDate?: string}) => Boolean(retainedFrom && (day.endDate ?? day.date) < retainedFrom);
  const valueFor = (day:Day,key:Series):number | null => noRetention(day) ? null : key === "inputTokens" ? Math.max(0,day.inputTokens-day.cachedInputTokens) : day[key] ?? null;
  const valueOf = (day:Day):number | null => noRetention(day) ? null : mode === "cost" ? day.costUSD : mode === "tokens" ? day.totalTokens
    : day.fiveHourPercent == null && day.weeklyPercent == null ? null : Math.max(day.fiveHourPercent ?? 0,day.weeklyPercent ?? 0);
  const max = niceScale(items.reduce((top,day) => Math.max(top,valueOf(day) ?? 0),0));
  const format = (value:number | null | undefined) => value == null ? "—" : mode === "cost" ? formatCurrencyShort(value) : mode === "quota" ? `${formatNumber(value)}%` : formatCompactNumber(value);
  const toggle = (key:Series) => setHidden(current => { const next=new Set(current); if(next.has(key))next.delete(key);else next.add(key); return next; });
  const visibleSeries: Array<{key: Series | "cost" | "aggregate"; style: string}> = mode === "cost" ? [{key:"cost",style:"cost"}] : series.filter(item => !hidden.has(item.key));
  const grouped = items.some(item => item.count > 1);
  const maximumGroup = Math.max(1, ...items.map(item => item.count));
  const hasAggregateOnly = mode === "tokens" && items.some(item => item.totalTokens > item.inputTokens + item.outputTokens);
  if(hasAggregateOnly)visibleSeries.push({key:"aggregate",style:"aggregate"});
  useEffect(() => {
    if(!fullscreen) { if (wasFullscreen.current) fullscreenButton.current?.focus(); wasFullscreen.current=false; return; }
    wasFullscreen.current=true;
    fullscreenButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event:globalThis.KeyboardEvent) => { if(event.key === "Escape")setFullscreen(false); };
    window.addEventListener("keydown",key); return () => { window.removeEventListener("keydown",key); document.body.style.overflow = previousOverflow; };
  },[fullscreen]);
  function select(item:TrendBucket) { setSelectedDate(item.date); setHoveredDate(null); }
  function navigate(event:KeyboardEvent<HTMLButtonElement>,index:number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length-1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? Math.max(0,index-1)
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? Math.min(items.length-1,index+1) : null;
    if(next===null)return;
    event.preventDefault();select(items[next]);buttonsRef.current.get(items[next].date)?.focus();
  }
  function backToToday() {
    setHoveredDate(null); setSelectedDate(today);
    const item=items.find(item=>today>=item.startDate && today<=item.endDate);
    if(item)buttonsRef.current.get(item.date)?.focus();
  }
  const linePaths = !detail && !isMeter ? visibleSeries.flatMap(seriesItem => {
    const paths: string[] = []; let points: string[] = [];
    const flush = () => { if(points.length)paths.push(points.join(" "));points=[]; };
    items.forEach((item,index) => {
      const value = noRetention(item) ? null : seriesItem.key === "cost" ? item.costUSD : seriesItem.key === "aggregate" ? Math.max(0,item.totalTokens-item.inputTokens-item.outputTokens) : valueFor(item,seriesItem.key);
      if(value == null) {flush();return;}
      points.push(`${(index+.5)/Math.max(1,items.length)*1000},${200-Math.min(1,Math.max(0,value/max))*200}`);
    }); flush();
    return paths.map((points,index)=>points.includes(" ") ? <polyline key={`${seriesItem.key}-${index}`} className={`pulse-line-${seriesItem.style}`} points={points} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/> : <circle key={`${seriesItem.key}-${index}`} className={`pulse-line-${seriesItem.style}`} cx={points.split(",")[0]} cy={points.split(",")[1]} r="4" fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>);
  }) : null;
  const plot = <section data-testid="usage-trends-card" className={`pulse-trends pulse-fit-trends ${isMeter ? "pulse-trends-meter" : "pulse-trends-clear"} ${compact ? "is-compact" : ""} ${detail ? "is-day-detail" : "is-overview"} ${className}`}>
    <div className="pulse-trend-main">
      <div className="pulse-section-heading"><h2 className={compact ? "sr-only" : undefined}>{title ?? copy("trend")}</h2><div className="pulse-segments" role="group" aria-label={t("trends.view_label")}>{(["tokens","cost","quota"] as const).map(value => <button type="button" key={value} aria-pressed={mode===value} onClick={() => setMode(value)}>{copy(value === "cost" ? "estimate" : value)}</button>)}</div>
      {!compact ? <><button type="button" className="pulse-icon-button" aria-label={copy("showTable")} aria-pressed={table} onClick={() => setTable(!table)}><Table2 size={16}/></button><button ref={fullscreenButton} type="button" className="pulse-icon-button" aria-label={copy(fullscreen?"exitFullscreen":"fullscreen")} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></> : null}</div>
      {!compact ? <div className="pulse-trend-resolution" role="group" aria-label={home("fullPeriod")}><button type="button" aria-pressed={!detail && !table} onClick={()=>{setDetail(false);setTable(false);setHoveredDate(null);}}>{home("overview")}</button><button type="button" aria-pressed={detail && !table} onClick={()=>{setDetail(true);setTable(false);setHoveredDate(null);}}>{home("detail")}</button><span>{daily.length} {copy("days")}</span></div> : null}
      <div className="pulse-chart-legend" role="group" aria-label={t("trends.legend_label")}>{mode!=="cost" ? series.map(item => <button key={item.key} type="button" aria-pressed={!hidden.has(item.key)} onClick={() => toggle(item.key)}><i className={`pulse-series-${item.style}`} aria-hidden="true"/>{item.label}</button>) : <span>{copy("estimate")} · USD</span>}</div>
      {mode === "quota" && !daily.some(day => day.fiveHourPercent != null || day.weeklyPercent != null) ? <p role="status" className="pulse-source-note">{t("trends.quota_no_data")}</p> : null}
      {daily.length === 0 ? <p className="pulse-empty">{copy("noData")}</p> : table ? <div className="pulse-chart-table" data-mode={mode}><table><thead><tr><th>{copy("dates")}</th>{mode === "quota" ? <><th>{t("trends.five_hour_usage")}</th><th>{t("trends.weekly_monthly_usage")}</th></> : mode === "cost" ? <th>{copy("estimate")}</th> : <><th>{copy("total")}</th><th>{copy("input")}</th><th>{copy("cached")}</th><th>{copy("output")}</th><th>{copy("estimate")}</th></>}</tr></thead><tbody>{daily.map(day => <tr key={day.date}><td><button type="button" onClick={() => {setSelectedDate(day.date);setHoveredDate(null);}}>{day.date}</button></td>{noRetention(day) ? <td data-no-retention colSpan={mode === "quota" ? 2 : mode === "cost" ? 1 : 5}>{t("ux.no_retained_record")}</td> : mode === "quota" ? <><td>{day.fiveHourPercent == null ? t("ux.no_quota_samples") : `${formatNumber(day.fiveHourPercent)}%`}</td><td>{day.weeklyPercent == null ? t("ux.no_quota_samples") : `${formatNumber(day.weeklyPercent)}%`}</td></> : mode === "cost" ? <td>{day.costUSD == null ? "—" : formatCurrencyShort(day.costUSD)}</td> : <><td>{formatNumber(day.totalTokens)}</td><td>{formatNumber(day.inputTokens)}</td><td>{formatNumber(day.cachedInputTokens)}</td><td>{formatNumber(day.outputTokens)}</td><td>{day.costUSD == null ? "—" : formatCurrencyShort(day.costUSD)}</td></>}</tr>)}</tbody></table></div>
      : <div ref={scrollRef} onMouseLeave={()=>setHoveredDate(null)} onScroll={event => { scrollPositions.current[viewKey] = {top:event.currentTarget.scrollTop,left:event.currentTarget.scrollLeft}; }} className="pulse-chart-scroll" style={detail && typeof chartHeight==="number" ? {maxHeight:chartHeight} : undefined}>
        <div className="pulse-chart-scale"><span>0</span><span>{format(max/2)}</span><span>{format(max)}</span></div>
        <div className="pulse-fit-plot" style={!detail ? {height:compact ? chartHeight ?? 96 : undefined} : undefined}>
          {!detail && !isMeter ? <svg className="pulse-fit-lines" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">{linePaths}</svg> : null}
          <div className="pulse-trend-days" style={detail ? isMeter ? {minWidth:Math.max(320,items.length*46)} : undefined : {gridTemplateColumns:`repeat(${Math.max(1,items.length)},minmax(0,1fr))`}}>
            {items.map((day,index) => {
              const value=valueOf(day);
              const slices = mode === "cost" ? [{key:"cost",amount:noRetention(day) ? null : day.costUSD,style:"cost"}]
                : series.filter(item=>!hidden.has(item.key)).map(item=>({key:item.key,amount:valueFor(day,item.key),style:item.style}));
              if(mode === "tokens" && day.totalTokens > day.inputTokens+day.outputTokens)slices.push({key:"aggregate",amount:day.totalTokens-day.inputTokens-day.outputTokens,style:"aggregate"});
              const label = day.count === 1 ? day.date : `${day.startDate} — ${day.endDate}`;
              const axisLabel = index===0 || index===items.length-1 || index % Math.max(1,Math.ceil(items.length/5))===0;
              return <button type="button" ref={node=>{if(node)buttonsRef.current.set(day.date,node);else buttonsRef.current.delete(day.date);}} className="pulse-trend-day" key={day.date} aria-pressed={selected?.date===day.date} aria-label={`${label} · ${copy(mode === "cost" ? "estimate" : mode)} ${noRetention(day) ? t("ux.no_retained_record") : format(value)}`} tabIndex={selected?.date===day.date ? 0 : -1} data-axis-label={axisLabel ? "true" : "false"} data-preview={preview?.date===day.date ? "true" : undefined} onClick={()=>select(day)} onMouseEnter={()=>setHoveredDate(day.date)} onFocus={()=>select(day)} onKeyDown={event=>navigate(event,index)}>
                <span className="pulse-trend-date">{day.date.slice(5).replace("-","/")}</span><span className={`pulse-trend-bar ${mode==="quota"?"pulse-quota-bars":""}`} aria-hidden="true">
                  {slices.map(slice => <i key={slice.key} className={`pulse-series-${slice.style} ${slice.amount == null ? "is-unknown" : ""}`} style={{"--amount":`${Math.max(0,(slice.amount??0)/max)*100}%`} as CSSProperties}/>)}
                </span>{value == null ? <span className="pulse-unknown-marker" aria-hidden="true"/> : null}<strong>{format(value)}</strong>
              </button>;
            })}
          </div>
        </div>
      </div>}
      {retainedFrom ? <p className="pulse-source-note">{t("ux.retained_since", {date: retainedFrom})}</p> : null}
      <div className="pulse-chart-caption"><span>{home("fullPeriod")} · {daily[0]?.date} — {daily.at(-1)?.date}</span><span>{mode === "tokens" ? copy("input") : mode === "cost" ? copy("notBill") : t("trends.quota_note")}</span></div>
      {grouped && !table ? <p className="pulse-aggregation-note">{home("grouped",{count:maximumGroup})}{mode === "quota" ? ` · ${home("groupQuota")}` : ""}</p> : null}
      {hasAggregateOnly ? <p className="pulse-aggregation-note">{home("partUnknown")}</p> : null}
    </div>
    {!compact && inspected ? <aside className="pulse-day-inspector" data-testid="trend-inspector" data-preview={Boolean(preview)}>
      <header><div><b>{inspected.startDate===inspected.endDate ? inspected.date : `${inspected.startDate} — ${inspected.endDate}`}</b><span>{preview ? home("preview") : inspected.date===today && inspected.count===1 ? home("today") : home("selected")}{inspected.count>1 ? ` · ${home("groupDays",{count:inspected.count})}` : ""}</span></div>
        {hasToday ? <button type="button" className="pulse-text-button" disabled={selectedDate===today && !preview} onClick={backToToday}>{home("backToday")}</button> : <small>{home("noTodayInRange")}</small>}
      </header>
      {noRetention(inspected) ? <p className="pulse-source-note">{t("ux.no_retained_record")}</p> : mode === "quota" ? <dl><div><dt>{t("trends.five_hour_usage")}</dt><dd>{inspected.fiveHourPercent == null ? t("ux.no_quota_samples") : `${formatNumber(inspected.fiveHourPercent)}%`}</dd></div><div><dt>{t("trends.weekly_monthly_usage")}</dt><dd>{inspected.weeklyPercent == null ? t("ux.no_quota_samples") : `${formatNumber(inspected.weeklyPercent)}%`}</dd></div></dl> : <dl><div><dt>{copy("total")}</dt><dd>{formatCompactNumber(inspected.totalTokens)}</dd></div><div><dt>{copy("estimate")}</dt><dd>{inspected.costUSD == null ? "—" : formatCurrencyShort(inspected.costUSD)}</dd></div></dl>}
      {!noRetention(inspected) ? <details className="pulse-inspector-breakdown"><summary>{home("dayBreakdown")}</summary><dl><div><dt>{copy("input")}</dt><dd>{formatCompactNumber(inspected.inputTokens)}</dd></div><div><dt>{copy("cached")}</dt><dd>{formatCompactNumber(inspected.cachedInputTokens)}</dd></div><div><dt>{copy("output")}</dt><dd>{formatCompactNumber(inspected.outputTokens)}</dd></div><div><dt>{copy("cache")}</dt><dd>{inspected.inputTokens > 0 ? formatPercent(inspected.cachedInputTokens/inspected.inputTokens) : "—"}</dd></div>
      {mode==="quota" ? <><div><dt>{t("trends.five_hour_usage")}</dt><dd>{inspected.fiveHourPercent == null ? "—" : `${formatNumber(inspected.fiveHourPercent)}%`}</dd></div><div><dt>{t("trends.weekly_monthly_usage")}</dt><dd>{inspected.weeklyPercent == null ? "—" : `${formatNumber(inspected.weeklyPercent)}%`}</dd></div></> : null}</dl></details> : null}
      {onOpenDay ? inspected.count===1 ? <button type="button" className="pulse-text-button" onClick={()=>onOpenDay(inspected.date)}>{copy("todaySessions")}<ArrowRight size={14}/></button> : <button type="button" className="pulse-text-button" onClick={()=>{setDetail(true);setTable(false);setSelectedDate(inspected.date);setHoveredDate(null);}}>{home("inspectDays")}<ArrowRight size={14}/></button> : null}
    </aside> : null}
    {metrics.length>0 ? <div className="pulse-fact-row">{metrics.map(metric=><span key={metric.kind} title={metric.detail}>{metric.label}<strong>{metric.value}</strong></span>)}<span>{copy("cache")} {formatPercent(cacheHitRate)}</span></div> : null}
  </section>;
  return fullscreen ? createPortal(<div className="pulse-chart-fullscreen" onKeyDown={event => {
    if (event.key !== "Tab") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled),summary")];
    const first = buttons[0]; const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
  }} role="dialog" aria-modal="true" aria-label={title ?? copy("trend")}>{plot}</div>,document.body) : plot;
}
