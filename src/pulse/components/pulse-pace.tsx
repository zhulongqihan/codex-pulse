import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Bell, RefreshCw, X } from "lucide-react";
import { PulseBrandMark } from "./pulse-brand-mark";
import { titlebarAction, usePulsePace, type PaceSnapshot, type PaceResetNotice } from "@/lib/pulse-pace";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { quotaCoachFromSnapshot, quotaWindowReadState, type QuotaPaceCoach } from "@/lib/quota-pace-coach";
import { formatCoachCountdown, formatCoachNumber, formatCoachReset, formatCoachWindow, quotaCoachBadgeCopy, quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback, quotaCoachReason, type QuotaCoachCopyKey } from "@/lib/quota-pace-coach-copy";
import { localTimeZone, timeZoneLabel } from "@/lib/time-context";
import { readingGuidanceCopy } from "@/lib/reading-guidance-copy";
import { NoticeStatusDetails } from "./notice-status-details";
import "./pulse-pace.css";

type Copy = (key: QuotaCoachCopyKey, values?: Record<string, string | number>) => string;
const demo = () => new URLSearchParams(location.search).get("demo") === "1";
const readingTime = (value: string | null | undefined, language: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const number = (value: number | null, language: string, digits = 0) => value == null ? "—" : formatCoachNumber(value, language, digits);
const recentDepletionRisk = (coach: QuotaPaceCoach) => coach.status === "ready" && (coach.tone === "roomy" || coach.tone === "balanced") && coach.remainingAtReset != null && coach.remainingAtReset.upperPercent < 1;

export function PulsePaceBadgeView({ data, failed = false, onToggle, expanded, controls }: { data: PaceSnapshot | null; failed?: boolean; onToggle: () => void; expanded?: boolean; controls?: string }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const coach = quotaCoachFromSnapshot(data, Date.now(), failed);
  const copy: Copy = (key, values) => quotaCoachCopy(language, key, values);
  const notice = coach.resetNotice?.isUnread ? coach.resetNotice : null;
  const recentRisk = recentDepletionRisk(coach);
  const fullLabel = notice && coach.status === "ready" ? copy("notice") : copy(coach.status === "ready" ? recentRisk ? "recentRisk" : coach.tone! : coach.status);
  const label = coach.status === "ready" ? fullLabel : quotaCoachBadgeCopy(language, coach.status);
  const synthetic = demo() ? `${paceCopy(language, "demo")} · ` : "";
  const meaning = `${synthetic}${fullLabel}${notice && coach.status !== "ready" ? ` · ${copy("notice")}` : ""} · ${formatCoachWindow(coach.window, language)} · ${copy("scope")}`;
  return <button type="button" className={`pulse-pace-badge coach-${coach.status} tone-${coach.tone ?? "neutral"}${recentRisk ? " has-recent-depletion" : ""}${notice ? " has-reset-notice" : ""}`} aria-label={meaning} aria-expanded={expanded} aria-controls={controls} title={notice ? `${meaning} · ${copy("noticeClass")} · ${copy("source", { source: notice.sourceLabel })}` : meaning} onClick={onToggle} data-testid="pace-badge">
    {notice ? <Bell size={16} aria-hidden="true"/> : <PulseBrandMark size={20}/>}<span>{label}</span>
  </button>;
}

export function PulsePaceBadge() {
  const { data, error } = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  return <PulsePaceBadgeView data={data} failed={error || actionFailed} onToggle={() => { setActionFailed(false); void titlebarAction("toggle").catch(() => setActionFailed(true)); }}/>;
}

function NoticeBanner({ notice, language, copy, onRead, pending, failed }: { notice: PaceResetNotice; language: string; copy: Copy; onRead?: (id: string) => void | Promise<void>; pending?: boolean; failed?: boolean }) {
  const [sourceFailed, setSourceFailed] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => { setSourceFailed(false); setReadFailed(false); }, [notice.id]);
  const start = notice.startAt ? Date.parse(notice.startAt) : null;
  const end = notice.endAt ? Date.parse(notice.endAt) : null;
  const markRead = () => { setReadFailed(false); try { const result = onRead?.(notice.id); if (result) void result.catch(() => setReadFailed(true)); } catch { setReadFailed(true); } };
  return <aside className="coach-reset-notice" role="note" aria-label={copy("notice")}>
    <div className="coach-notice-title"><Bell size={14} aria-hidden="true"/><strong>{copy("notice")}</strong><span>{copy("noticeClass")}</span></div>
    <p className="coach-notice-summary" title={notice.summary}>{notice.summary}</p>
    <p>{start != null ? formatCoachReset(start, language) : copy("noticeTimeUnknown")}{end != null ? ` – ${formatCoachReset(end, language)}` : ""}</p>
    <div className="coach-notice-actions"><a href={notice.sourceUrl} title={notice.sourceUrl} target="_blank" rel="noreferrer" onClick={event => { if (isTauri() && !demo()) { event.preventDefault(); setSourceFailed(false); void invoke("open_url", { url: notice.sourceUrl }).catch(() => setSourceFailed(true)); } }}>{copy("source", { source: notice.sourceLabel })}<ArrowUpRight size={11} aria-hidden="true"/></a>{notice.isUnread && onRead ? <button type="button" onClick={markRead} disabled={pending} aria-busy={pending}>{copy("markRead")}</button> : !notice.isUnread ? <span>{copy("read")}</span> : null}</div>
    <p className="coach-notice-scope">{copy("noticeScope")}</p>
    {failed || readFailed || sourceFailed ? <p role="alert">{copy(sourceFailed ? "sourceFailed" : "markFailed")}</p> : null}
  </aside>;
}

function CoachReadings({ coach, language, copy }: { coach: QuotaPaceCoach; language: string; copy: Copy }) {
  return <div className="coach-key-readings">
    <div><span>{["stale", "failed", "expired", "unavailable"].includes(coach.status) && coach.remainingPercent != null ? quotaCoachFeedback(language, "last") : copy("remaining")}</span><strong data-testid="coach-remaining">{number(coach.remainingPercent, language, 1)}{coach.remainingPercent == null ? "" : <small>%</small>}</strong></div>
    <div><span>{copy("resetIn")}</span><strong className="coach-countdown" data-testid="coach-countdown">{formatCoachCountdown(coach.remainingMinutes, language)}</strong></div>
  </div>;
}

function CoachWindowDetails({ coach, data, language, now, failed }: { coach: QuotaPaceCoach; data: PaceSnapshot | null; language: string; now: number; failed: boolean }) {
  const updated = Date.parse(data?.updatedAt ?? "");
  const fresh = !failed && !data?.refreshFailed && Number.isFinite(updated) && now - updated >= -120_000 && now - updated <= 360_000 && !["stale", "unavailable"].includes(data?.status ?? "unavailable");
  const clarity = (key: Parameters<typeof quotaCoachClarity>[1], values?: Record<string, string | number>) => quotaCoachClarity(language, key, values);
  return <details className="coach-explanation" data-testid="coach-window-details">
    <summary>{clarity("explain")}</summary>
    <p>{clarity("timeMethod")}</p>
    <p data-testid="coach-time-basis">{coach.startAt != null && coach.resetAt != null ? clarity("timeRange", { start: formatCoachReset(coach.startAt, language), end: formatCoachReset(coach.resetAt, language) }) : clarity("timeMissing")}</p>
    <p>{clarity(coach.status === "ready" ? "selection" : "selectionPaused")}</p>
    {data?.windows.length ? <ul className="coach-window-list" data-testid="coach-window-list">{data.windows.map((window, index) => {
      const state = quotaWindowReadState(window, now, fresh);
      const remaining = window.remainingPercent;
      const reset = Date.parse(window.resetsAt ?? "");
      return <li key={`${window.kind}-${index}`} data-window-kind={window.kind} data-reading-state={state}>
        <strong>{clarity("windowRow", { kind: clarity(window.kind === "session" ? "sessionKind" : "weeklyKind"), window: formatCoachWindow(window, language), status: clarity(state) })}</strong>
        {coach.status === "ready" && coach.window === window ? <span className="coach-selected-window">{clarity("selected")}</span> : null}
        {typeof remaining === "number" && Number.isFinite(remaining) && remaining >= 0 && remaining <= 100 ? <p>{clarity("windowRemaining", { label: state === "ready" || state === "exhausted" ? quotaCoachCopy(language, "remaining") : quotaCoachFeedback(language, "last"), percent: number(remaining, language, 1) })}</p> : null}
        {Number.isFinite(reset) ? <p>{clarity("windowReset", { time: formatCoachReset(reset, language) })}</p> : null}
      </li>;
    })}</ul> : <p>{clarity("noWindows")}</p>}
  </details>;
}

export type PulsePaceVariant = "popover" | "workspace" | "widget" | "compact";
export function PulsePaceCard({ data, failed = false, refreshing = false, onRefresh, onClose, onDetails, onRecover, observationsExpanded, showCompactNotice = true, variant = "popover", onMarkNoticeRead, noticePending = false, noticeFailed = false }: {
  data: PaceSnapshot | null; failed?: boolean; refreshing?: boolean; onRefresh: () => void; onClose?: () => void; onDetails: () => void;
  variant?: PulsePaceVariant; onMarkNoticeRead?: (id: string) => void | Promise<void>; noticePending?: boolean; noticeFailed?: boolean;
  onRecover?: () => void; observationsExpanded?: boolean; showCompactNotice?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy: Copy = (key, values) => quotaCoachCopy(language, key, values);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), data?.refreshAfterSeconds ? 1_000 : 30_000); return () => clearInterval(timer); }, [data?.refreshAfterSeconds]);
  const coach = quotaCoachFromSnapshot(data, now, failed);
  const compact = variant === "compact";
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (variant === "popover") closeButton.current?.focus({ preventScroll: true }); }, [variant]);
  useEffect(() => {
    if (variant !== "popover" || !onClose) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [variant, onClose]);
  const status = coach.status;
  const errorStatus = status === "ready" ? "unavailable" : status;
  const tone = coach.tone;
  const synthetic = demo();
  const notice = coach.resetNotice;
  const reference = coach.reference;
  const remainingRange = coach.remainingAtReset;
  const resetTimezone = localTimeZone();
  const recentRisk = recentDepletionRisk(coach);
  const generated = Date.parse(data?.generatedAt ?? "");
  const wait = data?.refreshAfterSeconds && Number.isFinite(generated) ? Math.max(0, Math.ceil(data.refreshAfterSeconds - (now - generated) / 1000)) : 0;
  const updated = Date.parse(data?.updatedAt ?? "");
  const age = Number.isFinite(updated) ? Math.max(0, Math.floor((now - updated) / 60_000)) : null;
  const ageLabel = age == null ? paceCopy(language, "never") : quotaCoachFeedback(language, age ? "age" : "ageNow", { minutes: formatCoachNumber(age, language) });
  const reason = status !== "ready" ? quotaCoachReason(language, data?.reason) : null;
  const emptyWidget = variant === "widget" && coach.remainingPercent == null;
  return <section className={`pulse-pace-card quota-coach-card variant-${variant} coach-${status} tone-${tone ?? "neutral"}${coach.remainingPercent == null ? " without-reading" : ""}${recentRisk ? " has-recent-depletion" : ""}`} aria-label={copy("title")} data-testid="pace-popover">
    {variant === "popover" || variant === "workspace" ? <header className="pulse-pace-header"><div><PulseBrandMark size={25}/><h2>{copy("title")}</h2><span className="coach-window-tag" title={`${formatCoachWindow(coach.window, language)} · ${copy("scope")}`}>{formatCoachWindow(coach.window, language)}</span>{synthetic ? <span className="pulse-pace-demo-label">{paceCopy(language, "demo")}</span> : null}</div>{variant === "popover" && onClose ? <button ref={closeButton} type="button" onClick={onClose} aria-label={paceCopy(language, "close")} title={paceCopy(language, "close")}><X size={17}/></button> : null}</header> : null}
    <div className="pulse-pace-scroll coach-body">
      <div className="coach-core">
        {(!compact && !emptyWidget) || coach.remainingPercent != null ? <CoachReadings coach={coach} language={language} copy={copy}/> : null}
        {status === "ready" && tone ? <div className="coach-judgment"><span className="coach-tone-label">{copy(recentRisk ? compact ? "recentRisk" : "recentRiskLabel" : compact ? tone : `${tone}Label`)}</span>{compact ? <span className="coach-compact-window">{formatCoachWindow(coach.window, language)}</span> : null}<p className="coach-advice">{copy(recentRisk ? "recentRiskAdvice" : `${tone}Advice`)}</p>{!compact ? <p className="coach-comparison" data-testid="coach-comparison" title={copy("timeBasis")}>{copy("comparison", { used: number(coach.usedPercent, language), elapsed: number(coach.elapsedPercent, language) })}</p> : null}</div> : <div className="coach-state" role="status"><strong>{copy(errorStatus)}</strong><p>{reason ?? copy(`${errorStatus}Detail`)}</p></div>}
        {coach.hasUnknownWindows && coach.remainingPercent != null ? <p className="coach-unknown-windows">{quotaCoachFeedback(language, "unknownWindows")}</p> : null}
        {compact && showCompactNotice && notice?.isUnread ? <p className="coach-compact-notice"><Bell size={12} aria-hidden="true"/>{quotaCoachFeedback(language, "noticeCompact")}</p> : null}
        {status === "unavailable" || reason || emptyWidget ? <button type="button" className="coach-recover" onClick={onRecover ?? onDetails}>{quotaCoachFeedback(language, "recover")}<ArrowUpRight size={12}/></button> : null}
      </div>
      {emptyWidget ? <section className="coach-empty-guide" data-testid="widget-empty-guide">
        <h3>{readingGuidanceCopy(language, "emptyNext")}</h3><p>{readingGuidanceCopy(language, "emptyMeaning")}</p>
        <p>{readingGuidanceCopy(language, "emptyRecovery")}</p><p>{readingGuidanceCopy(language, "emptyObservation")}</p>
        {data?.windows.length ? <CoachWindowDetails coach={coach} data={data} language={language} now={now} failed={failed}/> : null}
        {coach.resetAt != null ? <p>{copy("resetAt", { time: formatCoachReset(coach.resetAt, language) })}{resetTimezone ? <span className="coach-reset-timezone">{quotaCoachClarity(language, "resetZone", { timezone: timeZoneLabel(resetTimezone, language, coach.resetAt) })}</span> : null}</p> : null}
        {notice ? <NoticeBanner notice={notice} language={language} copy={copy} onRead={onMarkNoticeRead} pending={noticePending} failed={noticeFailed}/> : null}
      </section> : !compact ? <>
        {reference && status === "ready" ? <section className="coach-reference" aria-label={reference.unit === "reset" ? quotaCoachClarity(language, "untilReference") : copy(reference.unit === "day" ? "dayReference" : "hourReference")}><h3>{reference.unit === "reset" ? quotaCoachClarity(language, "untilReference") : copy(reference.unit === "day" ? "dayReference" : "hourReference")}</h3><strong data-testid="coach-reference">{reference.unit === "reset" ? quotaCoachClarity(language, "untilAmount", { points: number(reference.percentPoints, language, 1) }) : copy(reference.unit === "day" ? "perDay" : "perHour", { points: number(reference.percentPoints, language, reference.percentPoints < 1 ? 1 : 0) })}</strong><p>{reference.unit === "reset" ? quotaCoachClarity(language, "untilNote") : copy("referenceNote")}</p></section> : null}
        <CoachWindowDetails coach={coach} data={data} language={language} now={now} failed={failed}/>
        {coach.nearResetWithSurplus && !recentRisk ? <p className="coach-surplus-note">{copy("nearReset")}</p> : null}
        {remainingRange ? <section className="coach-projection"><p>{remainingRange.upperPercent < 1 ? copy("projectedDepletion") : copy("projected", { lower: number(Math.floor(remainingRange.lowerPercent), language), upper: number(Math.ceil(remainingRange.upperPercent), language) })}</p><p>{copy("projectionNote")}</p></section> : null}
        {notice && !compact ? <NoticeBanner notice={notice} language={language} copy={copy} onRead={onMarkNoticeRead} pending={noticePending} failed={noticeFailed}/> : null}
        <details className="coach-daily" data-testid="coach-cycle-observations" open={observationsExpanded}><summary>{quotaCoachFeedback(language, "basis")}</summary><p>{quotaCoachClarity(language, "cycleNote")}</p>{coach.startAt != null && coach.resetAt != null ? <p>{quotaCoachClarity(language, "cycleRange", { start: formatCoachReset(coach.startAt, language), end: formatCoachReset(coach.resetAt, language) })}</p> : null}<p data-testid="coach-observation-timezone">{coach.observationTimezone ? quotaCoachClarity(language, "observationZone", { timezone: coach.observationTimezone }) : quotaCoachClarity(language, "observationZoneUnknown")}</p>{coach.window ? <p>{paceCopy(language, "samples", { count: number(coach.window.sampleCount, language), minutes: number(coach.window.sampleSpanMinutes, language, 1) })}</p> : null}{!coach.dailyObservations.length ? <p>{quotaCoachFeedback(language, "noDaily")}</p> : <h3>{copy("observations")}</h3>}<p>{copy("dailyNote")} {quotaCoachFeedback(language, "dailySource")}</p><ul>{coach.dailyObservations.map(row => <li key={row.date}><time dateTime={row.date}>{new Intl.DateTimeFormat(language, { month: "numeric", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${row.date}T00:00:00Z`))}</time><strong>{row.consumedPercentPoints == null ? copy("unobserved") : quotaCoachFeedback(language, "points", { points: number(row.consumedPercentPoints, language, 2) })}</strong><span>{row.partial ? `${copy("partial")} · ` : ""}{copy("coverage", { minutes: number(row.coveredMinutes, language, 1) })}</span></li>)}</ul></details>
        <p className="coach-scope">{copy("resetAt", { time: formatCoachReset(coach.resetAt, language) })} · {copy("scope")}{resetTimezone ? <span className="coach-reset-timezone">{quotaCoachClarity(language, "resetZone", { timezone: timeZoneLabel(resetTimezone, language, coach.resetAt ?? now) })}</span> : null}</p>
      </> : null}
      {!compact ? <NoticeStatusDetails state={coach.noticeState} language={language}/> : null}
    </div>
    <footer className="pulse-pace-footer"><div><button type="button" onClick={onRefresh} disabled={refreshing || wait > 0} aria-busy={refreshing} aria-label={paceCopy(language, "refresh")} title={wait > 0 ? quotaCoachFeedback(language, "cooldown", { seconds: wait }) : paceCopy(language, "refresh")}><RefreshCw size={16} className={refreshing ? "is-refreshing" : ""}/></button><time dateTime={data?.updatedAt ?? undefined} title={data?.updatedAt ? new Date(data.updatedAt).toLocaleString(language) : undefined}>{compact || status !== "ready" ? ageLabel : data?.updatedAt ? paceCopy(language, "updated", { time: readingTime(data.updatedAt, language) }) : paceCopy(language, "never")}{compact && wait > 0 ? <span data-testid="coach-refresh-wait" title={quotaCoachFeedback(language, "cooldown", { seconds: wait })}> · {quotaCoachFeedback(language, "cooldownShort", { seconds: wait })}</span> : null}</time></div>{!compact ? <button type="button" className="pace-details" onClick={onDetails}>{paceCopy(language, "details")}<ArrowUpRight size={14}/></button> : null}{wait > 0 && !compact ? <p className="coach-refresh-wait" data-testid="coach-refresh-wait">{quotaCoachFeedback(language, "cooldown", { seconds: wait })}</p> : null}</footer>
  </section>;
}

export function PulsePacePanel() {
  const { data, error, refreshing, refresh, markNoticeRead, noticePending, noticeError } = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  const { i18n } = useTranslation();
  const action = (value: "close" | "details" | "account") => { setActionFailed(false); void titlebarAction(value).catch(() => setActionFailed(true)); };
  return <><PulsePaceCard data={data} failed={error} refreshing={refreshing} onRefresh={() => void refresh()} onClose={() => action("close")} onDetails={() => action("details")} onRecover={() => action("account")} onMarkNoticeRead={markNoticeRead} noticePending={noticePending} noticeFailed={noticeError}/>{actionFailed ? <p role="alert" className="pace-action-error">{paceCopy(i18n.resolvedLanguage ?? i18n.language, "actionFailed")}</p> : null}</>;
}
