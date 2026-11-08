import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, RefreshCw, X } from "lucide-react";
import { PulseBrandMark } from "./pulse-brand-mark";
import { compactPaceRange, hasPaceEstimate, paceRange, primaryPaceWindow, titlebarAction, usePulsePace, type PaceSnapshot, type PaceState, type PaceWindow } from "@/lib/pulse-pace";
import { paceCopy, type PaceCopyKey } from "@/lib/pulse-pace-copy";
import "./pulse-pace.css";

type Copy = (key: PaceCopyKey, values?: Record<string, string | number>) => string;
const isSyntheticDemo = () => new URLSearchParams(location.search).get("demo") === "1";
const stateDetail = (state: PaceState): PaceCopyKey => state === "forecast" ? "scope" : `${state}Detail`;
const n = (value: number, language: string, digits = 1) => new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
function windowLabel(window: PaceWindow | null | undefined, copy: Copy, language: string) {
  const minutes = window?.windowMinutes;
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return copy("windowUnknown");
  return minutes % 1440 === 0 ? copy("windowDays", { n: n(minutes / 1440, language) })
    : minutes % 60 === 0 ? copy("windowHours", { n: n(minutes / 60, language) }) : copy("windowMinutes", { n: n(minutes, language) });
}
function readingTime(value: string | null | undefined, language: string, copy: Copy) {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hour12: false }) : copy("never");
}
function freshLocalTokens(data: PaceSnapshot | null, now: number): number | null {
  const usage = data?.localUsage;
  if (!usage || usage.stale || !Number.isSafeInteger(usage.totalTokens) || usage.totalTokens < 0) return null;
  const updated = usage.updatedAt ? Date.parse(usage.updatedAt) : NaN;
  if (!Number.isFinite(updated) || now - updated < -120_000 || now - updated > 360_000) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: usage.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    if (usage.date !== `${part("year")}-${part("month")}-${part("day")}`) return null;
  } catch { return null; }
  return usage.totalTokens;
}
function compactTokens(value: number, language: string): string {
  if (/^(zh|ja|ko)/.test(language)) return new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  for (const [scale, unit] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) if (value >= scale) return `${n(value / scale, language)}${unit}`;
  return n(value, language, 0);
}
function resetCountdown(at: number, now: number, copy: Copy): string {
  const minutes = Math.ceil((at - now) / 60_000);
  if (minutes <= 0) return copy("resetPending");
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return days ? copy("resetDays", { days, hours }) : hours ? copy("resetHours", { hours, minutes: minutes % 60 }) : copy("resetMinutes", { minutes });
}
function snapshotState(data: PaceSnapshot | null, failed: boolean): PaceState {
  if (failed) return data?.updatedAt ? "stale" : "unavailable";
  if (!data) return "sampling";
  const primary = primaryPaceWindow(data);
  if (data.status === "forecast" && !hasPaceEstimate(primary)) return "sampling";
  return data.status;
}

export function PulsePaceBadgeView({ data, failed = false, onToggle }: { data: PaceSnapshot | null; failed?: boolean; onToggle: () => void }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy: Copy = (key, values) => paceCopy(language, key, values);
  const state = snapshotState(data, failed);
  const primary = primaryPaceWindow(data);
  const range = state === "forecast" ? compactPaceRange(primary) : null;
  const risk = state === "forecast" ? primary?.risk : "unknown";
  const localTokens = !failed && ["sampling", "idle", "slow"].includes(state) ? freshLocalTokens(data, Date.now()) : null;
  const label = range ?? (localTokens == null ? copy(state === "forecast" ? "sampling" : state) : `${compactTokens(localTokens, language)} Token`);
  const meaning = localTokens == null ? label : copy("todayLocalTokens", { tokens: n(localTokens, language, 0) });
  const demoPrefix = isSyntheticDemo() ? `${copy("demo")} · ` : "";
  return <button type="button" className={`pulse-pace-badge state-${state} risk-${risk}`} aria-label={`${demoPrefix}${copy("open")} · ${windowLabel(primary, copy, language)} · ${meaning}`} title={`${demoPrefix}${meaning} · ${windowLabel(primary, copy, language)} · ${copy(state === "forecast" ? "estimate" : stateDetail(state))}`} onClick={onToggle} data-testid="pace-badge">
    <PulseBrandMark size={20}/><span>{label}</span>
  </button>;
}

export function PulsePaceBadge() {
  const { data, error } = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  return <PulsePaceBadgeView data={data} failed={error || actionFailed} onToggle={() => { setActionFailed(false); void titlebarAction("toggle").catch(() => setActionFailed(true)); }}/>;
}

function PaceTimeline({ window, copy }: { window: PaceWindow; copy: Copy }) {
  if (!hasPaceEstimate(window)) return null;
  const resetMinutes = window.resetsAt ? Math.max(0, (Date.parse(window.resetsAt) - Date.now()) / 60_000) : NaN;
  const knownReset = Number.isFinite(resetMinutes);
  const horizon = Math.max(window.etaUpperMinutes, knownReset ? resetMinutes : 0, 1) * 1.08;
  // The first fifth is observed history; only the future section maps ETA and reset.
  const lower = 20 + Math.min(72, window.etaLowerMinutes / horizon * 76);
  const upper = Math.max(lower + 2, 20 + Math.min(76, window.etaUpperMinutes / horizon * 76));
  const reset = knownReset ? 20 + Math.min(76, resetMinutes / horizon * 76) : 96;
  const resetFirst = knownReset && resetMinutes < window.etaLowerMinutes;
  const style = { "--pace-lower": `${lower}%`, "--pace-upper": `${upper}%`, "--pace-reset": `${reset}%` } as CSSProperties;
  return <figure className="pulse-pace-timeline" style={style} aria-label={`${copy("measured")} · ${copy("projected")} · ${copy("now")} · ${copy(resetFirst ? "reset" : "limit")} · ${copy(resetFirst ? "limit" : "reset")}`} role="img">
    <div className="pace-timeline-legend" aria-hidden="true"><span>{copy("measured")}</span><span>{copy("projected")}</span></div>
    <div className="pace-axis"><i className="pace-observed"/><i className="pace-projection"/><i className="pace-range"/>{knownReset ? <i className="pace-reset-tick"/> : null}<i className="pace-start-tick"/></div>
    <figcaption><span>{copy("now")}</span><span>{copy(resetFirst ? "reset" : "limit")}</span><span>{knownReset ? copy(resetFirst ? "limit" : "reset") : ""}</span></figcaption>
  </figure>;
}

export function PulsePaceCard({ data, failed = false, refreshing = false, onRefresh, onClose, onDetails }: { data: PaceSnapshot | null; failed?: boolean; refreshing?: boolean; onRefresh: () => void; onClose: () => void; onDetails: () => void }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy: Copy = (key, values) => paceCopy(language, key, values);
  const state = snapshotState(data, failed);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const primary = primaryPaceWindow(data);
  const range = state === "forecast" ? paceRange(primary) : null;
  const risk = state === "forecast" ? primary?.risk : "unknown";
  const [sourceTab, setSourceTab] = useState<"projects" | "models">("projects");
  const sources = data?.localUsage?.[sourceTab]?.slice(0, 2) ?? [];
  const riskKey: PaceCopyKey = risk === "before_reset" ? "before" : risk === "near_reset" ? "near" : risk === "after_reset" ? "after" : "unknownRisk";
  const resetWindow = primary?.resetsAt && Number.isFinite(Date.parse(primary.resetsAt)) ? primary : data?.windows.find(window => window.resetsAt && Number.isFinite(Date.parse(window.resetsAt)));
  const resetAt = resetWindow?.resetsAt ? Date.parse(resetWindow.resetsAt) : NaN;
  const resetIsPrimary = !range && ["sampling", "idle", "slow"].includes(state) && resetAt > now;
  const totalTokens = data?.localUsage?.totalTokens;
  const hasTotal = typeof totalTokens === "number" && Number.isSafeInteger(totalTokens) && totalTokens >= 0;
  const demo = isSyntheticDemo();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return <section className={`pulse-pace-card state-${state} risk-${risk}`} aria-labelledby="pace-heading" data-testid="pace-popover">
    <header className={`pulse-pace-header${demo ? " has-demo-label" : ""}`}><div><PulseBrandMark size={25}/><h1 id="pace-heading">{copy("title")}</h1>{demo ? <span className="pulse-pace-demo-label">{copy("demo")}</span> : null}</div><button ref={closeButton} type="button" onClick={onClose} aria-label={copy("close")} title={copy("close")}><X size={17}/></button></header>
    <div className="pulse-pace-scroll">
      <div className="pace-estimate">
        <p className="pace-scope-label">{windowLabel(resetIsPrimary ? resetWindow : primary ?? data?.windows[0], copy, language)} · {copy(resetIsPrimary ? "nextReset" : state === "forecast" ? "estimate" : "noEstimate")}</p>
        <p className={`pace-main-reading${resetIsPrimary ? " is-reset-countdown" : ""}`} data-testid="pace-estimate" role="status">{range ? <>{copy("about")} <strong>{range.lower === range.upper ? n(range.lower, language) : `${n(range.lower, language)}–${n(range.upper, language)}`}</strong> {copy(range.unit === "h" ? "hours" : "minutes")}</> : resetIsPrimary ? <strong>{resetCountdown(resetAt, now, copy)}</strong> : copy(state === "idle" ? "idleHeadline" : state === "slow" ? "slowHeadline" : state === "forecast" ? "sampling" : state)}</p>
        {Number.isFinite(resetAt) ? <p className="pace-reset-date">{resetIsPrimary ? null : <span>{copy("nextReset")} · </span>}<time dateTime={resetWindow!.resetsAt!}>{new Intl.DateTimeFormat(language, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(resetAt)}</time>{resetIsPrimary ? null : <span> · {resetCountdown(resetAt, now, copy)}</span>}</p> : <p className="pace-reset-date">{copy("resetUnknown")}</p>}
        {range && primary ? <><p className="pace-risk"><i aria-hidden="true"/>{copy(riskKey)}</p><PaceTimeline window={primary} copy={copy}/></> : <p className="pace-state-detail">{copy(stateDetail(state))}</p>}
        {range && primary?.observedMinutes != null && primary.consumedPercentPoints != null ? <p className="pace-consumed">{copy("observed", { minutes: n(primary.observedMinutes, language, 0), points: n(primary.consumedPercentPoints, language, 2) })}</p> : state === "sampling" && primary && primary.sampleCount > 0 ? <p className="pace-consumed">{copy("samples", { count: primary.sampleCount, minutes: n(primary.sampleSpanMinutes, language, 0) })}</p> : null}
        {range ? <p className="pace-window-scope">{copy("scope")}</p> : null}
      </div>
      <section className="pace-official" aria-label={copy("official")}><h2>{copy("official")}</h2><div>{(["session", "weekly"] as const).map(kind => {
        const window = data?.windows.find(window => window.kind === kind);
        return window?.remainingPercent != null && Number.isFinite(window.remainingPercent) ? <p key={kind}><span>{windowLabel(window, copy, language)}</span><strong>{n(window.remainingPercent, language, 2)}%</strong></p> : <p key={kind} className="pace-missing-window">{copy(kind === "session" ? "sessionMissing" : "weeklyMissing")}</p>;
      })}</div></section>
      <section className="pace-sources" aria-labelledby="pace-sources-title">
        <div className="pace-sources-heading"><div className="pace-source-title"><h2 id="pace-sources-title">{copy("local")}</h2>{data?.localUsage?.stale ? <span role="status" className="pace-source-stale-label">{copy("sourceStale")}</span> : null}</div><div className="pace-source-tabs" role="group" aria-label={copy("local")}>{(["projects", "models"] as const).map(tab => <button type="button" key={tab} aria-pressed={tab === sourceTab} onClick={() => setSourceTab(tab)}>{copy(tab)}</button>)}</div></div>
        <p className="pace-local-total">{hasTotal ? <strong data-testid="pace-token-total">{n(totalTokens, language, 0)} <span>Token</span></strong> : copy("tokensUnknown")}</p>
        {sources.length ? <ul>{sources.map((source, index) => {
          const percent = source.sharePercent;
          const known = typeof percent === "number" && Number.isFinite(percent) && percent >= 0;
          return <li key={`${source.label}-${index}`}><span title={source.label}>{source.label}</span><span className="pace-source-track" aria-hidden="true"><i style={{ width: `${known ? Math.min(100, percent) : 0}%` }}/></span><strong>{known ? `${n(percent, language)}%` : "—"}</strong></li>;
        })}</ul> : <p className="pace-empty-sources">{copy("noSources")}</p>}
        <p className="pace-source-note">{copy("sourceNote")}</p>
        {data?.localUsage ? <div className="pace-source-freshness"><time dateTime={data.localUsage.updatedAt ?? undefined}>{data.localUsage.updatedAt ? copy("updated", { time: readingTime(data.localUsage.updatedAt, language, copy) }) : copy("never")}</time></div> : null}
      </section>
      {failed ? <p className="pace-error" role="alert">{copy(data?.updatedAt ? "failed" : "unavailableDetail")}</p> : null}
    </div>
    <footer className="pulse-pace-footer"><div><button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing} aria-label={copy("refresh")} title={copy("refresh")}><RefreshCw size={16} className={refreshing ? "is-refreshing" : ""}/></button><time dateTime={data?.updatedAt ?? undefined}>{data?.updatedAt ? copy("updated", { time: readingTime(data.updatedAt, language, copy) }) : copy("never")}</time></div><button type="button" className="pace-details" onClick={onDetails}>{copy("details")}<ArrowUpRight size={14}/></button></footer>
  </section>;
}

export function PulsePacePanel() {
  const { data, error, refreshing, refresh } = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  const { i18n } = useTranslation();
  const action = (value: "close" | "details") => { setActionFailed(false); void titlebarAction(value).catch(() => setActionFailed(true)); };
  return <><PulsePaceCard data={data} failed={error} refreshing={refreshing} onRefresh={() => void refresh()} onClose={() => action("close")} onDetails={() => action("details")}/>{actionFailed ? <p role="alert" className="pace-action-error">{paceCopy(i18n.resolvedLanguage ?? i18n.language, "actionFailed")}</p> : null}</>;
}
