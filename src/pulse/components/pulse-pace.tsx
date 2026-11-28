import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Bell, RefreshCw, X } from "lucide-react";
import { PulseBrandMark } from "./pulse-brand-mark";
import { noticeStateCopy } from "@/lib/notice-state-copy";
import { titlebarAction, usePulsePace, type PaceSnapshot, type PaceResetNotice } from "@/lib/pulse-pace";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { quotaCoachFromSnapshot, quotaWindowReadState, type QuotaPaceCoach } from "@/lib/quota-pace-coach";
import { formatCoachComparison, formatCoachCountdown, formatCoachNumber, formatCoachReset, formatCoachWindow, quotaCoachBadgeCopy, quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback, quotaCoachReason, type QuotaCoachCopyKey } from "@/lib/quota-pace-coach-copy";
import { localTimeZone, timeZoneLabel } from "@/lib/time-context";
import { readingGuidanceCopy } from "@/lib/reading-guidance-copy";
import { NoticeStatusDetails, NoticeStatusText } from "./notice-status-details";
import { ReadingInfo } from "./reading-info";
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

export function PaceRefreshControl({ data, language, now, onRefresh, animate = false, children }: {
  data: PaceSnapshot | null; language: string; now: number;
  onRefresh: () => void; animate?: boolean; children?: ReactNode;
}) {
  const generated = Date.parse(data?.generatedAt ?? "");
  const retryAfter = data?.refreshAfterSeconds ?? 0;
  const wait = retryAfter > 0 && Number.isFinite(generated)
    ? Math.max(0, Math.ceil(retryAfter - Math.max(0, now - generated) / 1_000)) : 0;
  const queued = data?.refreshQueued === true;
  const active = data?.refreshInFlight === true;
  const seconds = formatCoachNumber(wait, language);
  const counting = wait > 0 && !active;
  const status = active ? paceCopy(language, "refreshing")
    : queued ? paceCopy(language, counting ? "refreshQueued" : "refreshWaiting", { seconds })
    : counting ? quotaCoachFeedback(language, "rateLimitWait", { seconds }) : null;
  const label = paceCopy(language, "refresh");
  const title = queued || active ? status ?? label : counting ? quotaCoachFeedback(language, "rateLimitSchedule") : label;
  return <>
    <button type="button" className="pace-refresh-button" onClick={onRefresh} aria-busy={active} aria-label={label} title={title}>
      <RefreshCw size={16} aria-hidden="true" className={active && animate ? "is-refreshing" : undefined}/>
    </button>
    {status ? <span className="coach-refresh-clock" data-testid={counting ? "coach-refresh-wait" : "coach-refresh-status"} role={counting ? "timer" : "status"}>{status}</span> : children}
    {queued && counting ? <span className="sr-only" role="status">{paceCopy(language, "refreshWaiting")}</span> : null}
  </>;
}

export function PulsePaceBadge() {
  const { data, error } = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  return <PulsePaceBadgeView data={data} failed={error || actionFailed} onToggle={() => { setActionFailed(false); void titlebarAction("toggle").catch(() => setActionFailed(true)); }}/>;
}

export function CoachResetNotice({ notice, language, onRead, pending, failed, showHeading = true }: { notice: PaceResetNotice; language: string; onRead?: (id: string) => void | Promise<void>; pending?: boolean; failed?: boolean; showHeading?: boolean }) {
  const copy: Copy = (key, values) => quotaCoachCopy(language, key, values);
  const [sourceFailed, setSourceFailed] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => { setSourceFailed(false); setReadFailed(false); }, [notice.id]);
  const start = notice.startAt ? Date.parse(notice.startAt) : null;
  const end = notice.endAt ? Date.parse(notice.endAt) : null;
  const markRead = () => { setReadFailed(false); try { const result = onRead?.(notice.id); if (result) void result.catch(() => setReadFailed(true)); } catch { setReadFailed(true); } };
  return <aside className="coach-reset-notice" role="note" aria-label={copy("notice")}>
    <div className="coach-notice-title">{showHeading ? <><Bell size={14} aria-hidden="true"/><strong>{copy("notice")}</strong></> : null}<span>{copy("noticeClass")}</span><ReadingInfo label={copy("noticeClass")}>{copy("noticeScope")}</ReadingInfo></div>
    <p className="coach-notice-summary" title={notice.summary}>{notice.summary}</p>
    <p>{start != null ? formatCoachReset(start, language) : copy("noticeTimeUnknown")}{end != null ? ` – ${formatCoachReset(end, language)}` : ""}</p>
    <div className="coach-notice-actions"><a href={notice.sourceUrl} title={notice.sourceUrl} target="_blank" rel="noreferrer" onClick={event => { if (isTauri() && !demo()) { event.preventDefault(); setSourceFailed(false); void invoke("open_url", { url: notice.sourceUrl }).catch(() => setSourceFailed(true)); } }}>{copy("source", { source: notice.sourceLabel })}<ArrowUpRight size={11} aria-hidden="true"/></a>{notice.isUnread && onRead ? <button type="button" onClick={markRead} disabled={pending} aria-busy={pending}>{copy("markRead")}</button> : !notice.isUnread ? <span>{copy("read")}</span> : null}</div>
    {failed || readFailed || sourceFailed ? <p role="alert">{copy(sourceFailed ? "sourceFailed" : "markFailed")}</p> : null}
  </aside>;
}

function CoachReadings({ coach, language, copy, information }: { coach: QuotaPaceCoach; language: string; copy: Copy; information?: ReactNode }) {
  return <div className="coach-key-readings">
    <div><span>{["stale", "failed", "expired", "unavailable"].includes(coach.status) && coach.remainingPercent != null ? quotaCoachFeedback(language, "last") : copy("remaining")}</span><strong data-testid="coach-remaining">{number(coach.remainingPercent, language, 1)}{coach.remainingPercent == null ? "" : <small>%</small>}</strong></div>
    <div><span className="coach-reading-label">{copy("resetIn")}{information}</span><strong className="coach-countdown" data-testid="coach-countdown">{formatCoachCountdown(coach.remainingMinutes, language)}</strong></div>
  </div>;
}

export function CoachReference({ reference, language }: { reference: NonNullable<QuotaPaceCoach["reference"]>; language: string }) {
  const copy: Copy = (key, values) => quotaCoachCopy(language, key, values);
  const untilReset = reference.unit === "reset";
  const perDay = reference.unit === "day";
  const title = untilReset ? quotaCoachClarity(language, "untilReference") : copy(perDay ? "dayReference" : "hourReference");
  const points = number(reference.percentPoints, language, untilReset || reference.percentPoints < 1 ? 1 : 0);
  return <section className="coach-reference" aria-label={title}>
    <h3 className="coach-reading-label">{title}<ReadingInfo label={title}>{untilReset ? quotaCoachClarity(language, "untilNote") : copy("referenceNote")}</ReadingInfo></h3>
    <strong data-testid="coach-reference">{untilReset ? quotaCoachClarity(language, "untilAmount", { points }) : copy(perDay ? "perDay" : "perHour", { points })}</strong>
  </section>;
}

function CoachWindowDetails({ coach, data, language, now, failed }: { coach: QuotaPaceCoach; data: PaceSnapshot | null; language: string; now: number; failed: boolean }) {
  const updated = Date.parse(data?.updatedAt ?? "");
  const fresh = !failed && !data?.refreshFailed && Number.isFinite(updated) && now - updated >= -120_000 && now - updated <= 360_000 && !["stale", "unavailable"].includes(data?.status ?? "unavailable");
  const clarity = (key: Parameters<typeof quotaCoachClarity>[1], values?: Record<string, string | number>) => quotaCoachClarity(language, key, values);
  return <details className="coach-explanation" data-testid="coach-window-details">
    <summary>{clarity("windowList")}</summary>
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
export function PulsePaceCard({ data, failed = false, onRefresh, onClose, onDetails, onRecover, showCompactNotice = true, variant = "popover", onMarkNoticeRead, noticePending = false, noticeFailed = false }: {
  data: PaceSnapshot | null; failed?: boolean; onRefresh: () => void; onClose?: () => void; onDetails: () => void;
  variant?: PulsePaceVariant; onMarkNoticeRead?: (id: string) => void | Promise<void>; noticePending?: boolean; noticeFailed?: boolean;
  onRecover?: () => void; showCompactNotice?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy: Copy = (key, values) => quotaCoachCopy(language, key, values);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), data?.refreshAfterSeconds ? 1_000 : 30_000); return () => clearInterval(timer); }, [data?.refreshAfterSeconds]);
  const coach = quotaCoachFromSnapshot(data, now, failed);
  const popover = variant === "popover";
  const compact = variant === "compact";
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (variant === "popover") closeButton.current?.focus({ preventScroll: true }); }, [variant]);
  useEffect(() => {
    if (variant !== "popover" || !onClose) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); } };
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
  const updatedAt = data?.updatedAt;
  const updated = Date.parse(updatedAt ?? "");
  const age = Number.isFinite(updated) ? Math.max(0, Math.floor((now - updated) / 60_000)) : null;
  const ageLabel = age == null
    ? coach.remainingPercent == null ? paceCopy(language, "never") : null
    : quotaCoachFeedback(language, age ? "age" : "ageNow", { minutes: formatCoachNumber(age, language) });
  const footerReading = !compact && status === "ready" && updatedAt
    ? paceCopy(language, "updated", { time: readingTime(updatedAt, language) }) : ageLabel;
  const reason = status !== "ready" ? quotaCoachReason(language, data?.reason) : null;
  const quietNotice = coach.noticeState.status === "none" || coach.noticeState.status === "unknown";
  const emptyWidget = variant === "widget" && coach.remainingPercent == null;
  const windowDetails = !popover && <CoachWindowDetails coach={coach} data={data} language={language} now={now} failed={failed}/>;
  const surplusNote = coach.nearResetWithSurplus && !recentRisk ? <p className="coach-surplus-note">{copy("nearReset")}</p> : null;
  const projection = remainingRange && (!popover || remainingRange.upperPercent >= 1)
    ? <section className="coach-projection"><p>{remainingRange.upperPercent < 1 ? copy("projectedDepletion") : copy("projected", { lower: number(Math.floor(remainingRange.lowerPercent), language), upper: number(Math.ceil(remainingRange.upperPercent), language) })}</p><ReadingInfo label={copy("title")}>{copy("projectionNote")}</ReadingInfo></section>
    : null;
  const noticeBanner = notice ? <CoachResetNotice notice={notice} language={language} onRead={onMarkNoticeRead} pending={noticePending} failed={noticeFailed}/> : null;
  const clarity = (key: Parameters<typeof quotaCoachClarity>[1], values?: Record<string, string | number>) => quotaCoachClarity(language, key, values);
  const reset = coach.resetAt == null ? null : copy("resetAt", { time: formatCoachReset(coach.resetAt, language) });
  const comparisonText = formatCoachComparison(coach, language);
  const comparison = comparisonText ? <p data-testid="coach-comparison">{comparisonText}</p> : null;
  const checkedAt = coach.noticeState.checkedAt;
  const information = variant === "popover" ? (reset || comparison || checkedAt) && <ReadingInfo label={clarity("explain")}>
    {reset ? <p>{reset}</p> : null}
    {comparison}
    {checkedAt ? <p><time dateTime={checkedAt}>{noticeStateCopy(language, "checked", { time: formatCoachReset(Date.parse(checkedAt), language) })}</time></p> : null}
  </ReadingInfo> : <ReadingInfo label={clarity("explain")}>
    {status !== "ready" ? <p>{reason ?? copy(`${errorStatus}Detail`)}</p> : null}
    <p>{copy("scope")}</p>
    {!compact && updatedAt && Number.isFinite(updated) ? <p><time dateTime={updatedAt}>{paceCopy(language, "updated", { time: readingTime(updatedAt, language) })}</time></p> : null}
    {coach.hasUnknownWindows && coach.remainingPercent != null ? <p>{quotaCoachFeedback(language, "unknownWindows")}</p> : null}
    {coach.resetAt != null ? <p>{copy("resetAt", { time: formatCoachReset(coach.resetAt, language) })}{resetTimezone ? ` · ${clarity("resetZone", { timezone: timeZoneLabel(resetTimezone, language, coach.resetAt) })}` : null}</p> : null}
    {comparison}
    {!compact ? <>
      <p data-testid="coach-time-basis">{coach.startAt != null && coach.resetAt != null ? clarity("timeRange", { start: formatCoachReset(coach.startAt, language), end: formatCoachReset(coach.resetAt, language) }) : clarity("timeMissing")}</p>
      <p>{clarity("timeMethod")}</p>
      {quietNotice ? <NoticeStatusText state={coach.noticeState} language={language}/> : null}
    </> : null}
  </ReadingInfo>;
  const noticeStatus = !quietNotice && coach.noticeState.status !== "active"
    ? <NoticeStatusDetails state={coach.noticeState} language={language}/> : null;
  return <section className={`pulse-pace-card quota-coach-card variant-${variant} coach-${status} tone-${tone ?? "neutral"}${coach.remainingPercent == null ? " without-reading" : ""}${recentRisk ? " has-recent-depletion" : ""}`} aria-label={copy("title")} data-testid="pace-popover">
    {variant === "popover" || variant === "workspace" ? <header className="pulse-pace-header"><div><PulseBrandMark size={25}/><h2>{copy("title")}</h2><span className="coach-window-tag">{formatCoachWindow(coach.window, language)}</span>{information}{synthetic ? <span className="pulse-pace-demo-label">{paceCopy(language, "demo")}</span> : null}</div>{popover && onClose ? <button ref={closeButton} type="button" onClick={onClose} aria-label={paceCopy(language, "close")} title={paceCopy(language, "close")}><X size={17}/></button> : null}</header> : null}
    <div className="pulse-pace-scroll coach-body">
      <div className="coach-core">
        {(!compact && !emptyWidget) || coach.remainingPercent != null ? <CoachReadings coach={coach} language={language} copy={copy} information={variant === "widget" || compact ? information : undefined}/> : null}
        {status === "ready" && tone ? <div className="coach-judgment"><span className="coach-tone-label">{copy(recentRisk ? compact ? "recentRisk" : "recentRiskLabel" : compact ? tone : `${tone}Label`)}</span>{compact ? <span className="coach-compact-window">{formatCoachWindow(coach.window, language)}</span> : null}
          {(!popover || !recentRisk) ? <p className="coach-advice">{copy(recentRisk ? "recentRiskAdvice" : `${tone}Advice`)}</p> : null}
        </div> : <div className="coach-state" role="status"><strong>{copy(errorStatus)}</strong>{compact && coach.remainingPercent == null ? information : null}</div>}
        {compact && showCompactNotice && notice?.isUnread ? <p className="coach-compact-notice"><Bell size={12} aria-hidden="true"/>{quotaCoachFeedback(language, "noticeCompact")}</p> : null}
        {status === "unavailable" || reason || emptyWidget ? <button type="button" className="coach-recover" onClick={onRecover ?? onDetails}>{quotaCoachFeedback(language, "recover")}<ArrowUpRight size={12}/></button> : null}
      </div>
      {emptyWidget ? <section className="coach-empty-guide" data-testid="widget-empty-guide">
        <h3 className="coach-reading-label">{readingGuidanceCopy(language, "emptyNext")}
          <ReadingInfo label={clarity("explain")}>
            <p>{reason ?? copy(`${errorStatus}Detail`)}</p>
            <p>{readingGuidanceCopy(language, "emptyMeaning")}</p>
            <p>{readingGuidanceCopy(language, "emptyRecovery")}</p>
            <p>{readingGuidanceCopy(language, "emptyObservation")}</p>
            {quietNotice ? <NoticeStatusText state={coach.noticeState} language={language}/> : null}
          </ReadingInfo>
        </h3>
        {data?.windows.length ? <CoachWindowDetails coach={coach} data={data} language={language} now={now} failed={failed}/> : null}
        {coach.resetAt != null ? <p>{copy("resetAt", { time: formatCoachReset(coach.resetAt, language) })}{resetTimezone ? <span className="coach-reset-timezone">{quotaCoachClarity(language, "resetZone", { timezone: timeZoneLabel(resetTimezone, language, coach.resetAt) })}</span> : null}</p> : null}
        {noticeBanner}
      </section> : !compact ? <>
        {reference && status === "ready" ? <CoachReference reference={reference} language={language}/> : null}
        {windowDetails}{surplusNote}{projection}{noticeBanner}
      </> : null}
      {!compact ? noticeStatus : null}
    </div>
    <footer className="pulse-pace-footer"><div>
      <PaceRefreshControl data={data} language={language} now={now} onRefresh={onRefresh} animate={!popover}>
        {footerReading ? <time dateTime={age == null ? undefined : updatedAt ?? undefined} title={age == null ? undefined : new Date(updated).toLocaleString(language)}>{footerReading}</time> : null}
      </PaceRefreshControl>
    </div>{!compact ? <button type="button" className="pace-details" onClick={onDetails}>{paceCopy(language, "details")}<ArrowUpRight size={14}/></button> : null}</footer>
  </section>;
}

export function PulsePacePanel() {
  const { data, error, refresh, markNoticeRead, noticePending, noticeError } = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  const { i18n } = useTranslation();
  const action = (value: "close" | "details" | "account") => { setActionFailed(false); void titlebarAction(value).catch(() => setActionFailed(true)); };
  return <><PulsePaceCard data={data} failed={error} onRefresh={() => void refresh()} onClose={() => action("close")} onDetails={() => action("details")} onRecover={() => action("account")} onMarkNoticeRead={markNoticeRead} noticePending={noticePending} noticeFailed={noticeError}/>{actionFailed ? <p role="alert" className="pace-action-error">{paceCopy(i18n.resolvedLanguage ?? i18n.language, "actionFailed")}</p> : null}</>;
}
