import { useEffect, useId, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronDown, Info, RefreshCw } from "lucide-react";
import { PulsePaceCard } from "./pulse-pace";
import { quotaCoachFromSnapshot } from "@/lib/quota-pace-coach";
import { formatCoachCountdown, formatCoachNumber, formatCoachReset, formatCoachWindow, quotaCoachCopy, quotaCoachFeedback, quotaCoachReason } from "@/lib/quota-pace-coach-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { localTimeZone, timeZoneLabel } from "@/lib/time-context";
import "./pulse-pace-summary.css";

/** A summary of the existing quota model. Opening its details preserves all original explanations. */
export function PulsePaceSummary(props: ComponentProps<typeof PulsePaceCard>) {
  const { data, failed = false, refreshing = false, onRefresh, onRecover, observationsExpanded } = props;
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof quotaCoachCopy>[1]) => quotaCoachCopy(language, key);
  const summary = (key: Parameters<typeof paceSummaryCopy>[1]) => paceSummaryCopy(language, key);
  const [now, setNow] = useState(Date.now);
  const [expanded, setExpanded] = useState(Boolean(observationsExpanded));
  const detailsId = useId();
  useEffect(() => { if (observationsExpanded) setExpanded(true); }, [observationsExpanded]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), data?.refreshAfterSeconds ? 1_000 : 30_000); return () => clearInterval(timer); }, [data?.refreshAfterSeconds]);
  const coach = quotaCoachFromSnapshot(data, now, failed);
  const ready = coach.status === "ready" && coach.tone != null;
  const recentRisk = ready && (coach.tone === "roomy" || coach.tone === "balanced") && coach.remainingAtReset != null && coach.remainingAtReset.upperPercent < 1;
  const generated = Date.parse(data?.generatedAt ?? "");
  const wait = data?.refreshAfterSeconds && Number.isFinite(generated) ? Math.max(0, Math.ceil(data.refreshAfterSeconds - (now - generated) / 1000)) : 0;
  const reason = !ready ? quotaCoachReason(language, data?.reason) : null;
  const readingLabel = ["stale", "failed", "expired", "unavailable"].includes(coach.status) && coach.remainingPercent != null ? quotaCoachFeedback(language, "last") : copy("remaining");
  const updatedDate = data?.updatedAt && Number.isFinite(Date.parse(data.updatedAt)) ? new Date(data.updatedAt) : null;
  const formatted = (value: number) => formatCoachNumber(value, language, 1);
  const errorStatus = coach.status === "ready" ? "unavailable" : coach.status;
  const status = ready ? copy(recentRisk ? "recentRiskLabel" : `${coach.tone!}Label`) : copy(errorStatus);
  const resetTimezone = localTimeZone();
  const advice = ready ? recentRisk ? copy("recentRiskAdvice") : coach.tone === "roomy" ? summary("roomy") : copy(`${coach.tone!}Advice`) : reason ?? copy(`${errorStatus}Detail`);
  return <section className={`pulse-summary coach-${coach.status}`} aria-labelledby={`${detailsId}-title`} data-testid="pulse-pace-summary">
    <header className="pulse-summary-heading"><div><h2 id={`${detailsId}-title`}>{summary("title")}</h2><span>{formatCoachWindow(coach.window, language)}</span></div><div className="pulse-summary-updated"><time dateTime={updatedDate?.toISOString()} title={updatedDate?.toLocaleString(language)}>{updatedDate ? paceCopy(language, "updated", { time: updatedDate.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) }) : paceCopy(language, "never")}</time><button type="button" onClick={onRefresh} disabled={refreshing || wait > 0} aria-busy={refreshing} aria-label={paceCopy(language, "refresh")} title={wait ? quotaCoachFeedback(language, "cooldown", { seconds: wait }) : paceCopy(language, "refresh")}><RefreshCw size={16}/></button></div></header>
    <div className="pulse-summary-readings"><div><p>{readingLabel}</p><strong data-testid="summary-remaining">{coach.remainingPercent == null ? "—" : <>{formatted(coach.remainingPercent)}<small>%</small></>}</strong></div><div><p>{copy("resetIn")}</p><strong className="pulse-summary-countdown">{formatCoachCountdown(coach.remainingMinutes, language)}</strong>{coach.resetAt != null ? <p className="pulse-summary-reset">{quotaCoachCopy(language, "resetAt", { time: formatCoachReset(coach.resetAt, language) })}{resetTimezone ? <span>{timeZoneLabel(resetTimezone, language, coach.resetAt)}</span> : null}</p> : null}</div><div className="pulse-summary-judgment" role={!ready ? "status" : undefined}><span className="pulse-summary-status">{status}</span><h3>{advice}</h3>{ready ? <div className="pulse-summary-comparison" aria-label={quotaCoachCopy(language, "comparison", { used: formatted(coach.usedPercent!), elapsed: formatted(coach.elapsedPercent!) })}>{([["used", coach.usedPercent], ["elapsed", coach.elapsedPercent]] as const).map(([key, value]) => <div key={key}><span>{summary(key)}</span><i aria-hidden="true"><b style={{ width: `${value ?? 0}%` }}/></i><span>{formatted(value!)}%</span></div>)}</div> : onRecover ? <button className="pulse-text-button" type="button" onClick={onRecover}>{quotaCoachFeedback(language, "recover")}</button> : null}</div></div>
    {wait > 0 ? <p className="pulse-summary-wait" role="status">{quotaCoachFeedback(language, "cooldown", { seconds: wait })}</p> : null}
    <div className="pulse-summary-bottom"><p><Info size={14}/>{coach.hasUnknownWindows ? quotaCoachFeedback(language, "unknownWindows") : copy("scope")}</p><button type="button" className="pulse-text-button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{summary("details")}<ChevronDown size={14}/></button></div>
    {coach.resetNotice?.isUnread ? <button type="button" className="pulse-summary-notice" onClick={() => setExpanded(true)}><Bell size={14}/>{quotaCoachFeedback(language, "noticeCompact")}</button> : null}
    {props.noticeFailed ? <p role="alert">{copy("markFailed")}</p> : null}
    <div id={detailsId} hidden={!expanded}>{expanded ? <PulsePaceCard {...props} variant="workspace"/> : null}</div>
  </section>;
}
