import { useEffect, useId, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronDown } from "lucide-react";
import { NoticeStatusText } from "./notice-status-details";
import { CoachReference, CoachResetNotice, PaceRefreshControl, PulsePaceCard } from "./pulse-pace";
import { noticeStateCopy } from "@/lib/notice-state-copy";
import { quotaCoachFromSnapshot } from "@/lib/quota-pace-coach";
import { formatCoachComparison, formatCoachCountdown, formatCoachNumber, formatCoachReset, formatCoachWindow, quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback, quotaCoachReason } from "@/lib/quota-pace-coach-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { localTimeZone, timeZoneLabel } from "@/lib/time-context";
import { ReadingInfo } from "./reading-info";
import "./pulse-pace-summary.css";

export function PulsePaceSummary({
  paper = false, pacingOnly = false, ...props
}: ComponentProps<typeof PulsePaceCard> & { paper?: boolean; pacingOnly?: boolean }) {
  const { data, failed = false, onRefresh, onRecover } = props;
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof quotaCoachCopy>[1]) => quotaCoachCopy(language, key);
  const summary = (key: Parameters<typeof paceSummaryCopy>[1]) => paceSummaryCopy(language, key);
  const [now, setNow] = useState(Date.now);
  const [expanded, setExpanded] = useState(false);
  const generatedId = useId();
  const targetId = `${generatedId}-details`;
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), data?.refreshAfterSeconds ? 1_000 : 30_000); return () => clearInterval(timer); }, [data?.refreshAfterSeconds]);
  const coach = quotaCoachFromSnapshot(data, now, failed);
  const ready = coach.status === "ready" && coach.tone != null;
  const projectedDepletion = ready && coach.remainingAtReset != null && coach.remainingAtReset.upperPercent < 1;
  const recentRisk = projectedDepletion && (coach.tone === "roomy" || coach.tone === "balanced");
  const reason = !ready ? quotaCoachReason(language, data?.reason) : null;
  const readingLabel = ["stale", "failed", "expired", "unavailable"].includes(coach.status) && coach.remainingPercent != null ? quotaCoachFeedback(language, "last") : copy("remaining");
  const updatedDate = data?.updatedAt && Number.isFinite(Date.parse(data.updatedAt)) ? new Date(data.updatedAt) : null;
  const updated = updatedDate ? paceCopy(language, "updated", { time: updatedDate.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) })
    : coach.remainingPercent == null ? paceCopy(language, "never") : null;
  const formatted = (value: number) => formatCoachNumber(value, language, 1);
  const comparison = formatCoachComparison(coach, language, 1);
  const errorStatus = coach.status === "ready" ? "unavailable" : coach.status;
  const resetTimezone = localTimeZone();
  const advice = ready ? recentRisk ? copy("recentRiskAdvice") : coach.tone === "roomy" ? summary("roomy") : copy(`${coach.tone!}Advice`) : null;
  const notice = coach.resetNotice;
  const showUpdated = paper ? updatedDate != null : updated != null;
  return <section className={`pulse-summary coach-${coach.status}${pacingOnly ? " pulse-summary-pacing-only" : ""}`} aria-labelledby={`${generatedId}-title`} data-testid="pulse-pace-summary">
    <header className="pulse-summary-heading">
      <div><h2 id={`${generatedId}-title`}>{summary(pacingOnly ? "pacing" : "title")}</h2><span>{formatCoachWindow(coach.window, language)}</span>
        {!paper || comparison || coach.resetAt != null || showUpdated ? <ReadingInfo label={quotaCoachClarity(language, "explain")}>
          {!paper && !ready ? <p>{reason ?? copy(`${errorStatus}Detail`)}</p> : null}
          {comparison ? <p>{comparison}</p> : null}
          {!paper ? <p>{copy("scope")}</p> : null}
          {!paper && coach.hasUnknownWindows ? <p>{quotaCoachFeedback(language, "unknownWindows")}</p> : null}
          {coach.resetAt != null ? <p>{quotaCoachCopy(language, "resetAt", { time: formatCoachReset(coach.resetAt, language) })}
            {resetTimezone ? ` · ${timeZoneLabel(resetTimezone, language, coach.resetAt)}` : null}</p> : null}
          {showUpdated ? <p><time dateTime={updatedDate?.toISOString()}>{updated}</time></p> : null}
        </ReadingInfo> : null}
      </div>
      <div className="pulse-summary-updated"><PaceRefreshControl data={data} language={language} now={now} onRefresh={onRefresh}/></div>
    </header>
    <div className="pulse-summary-readings">
      {!pacingOnly ? <><div>
        <p>{readingLabel}</p>
        <strong data-testid="summary-remaining">{coach.remainingPercent == null ? "—" : <>{formatted(coach.remainingPercent)}<small>%</small></>}</strong>
      </div>
      <div>
        <p>{copy("resetIn")}</p>
        <strong className="pulse-summary-countdown">{formatCoachCountdown(coach.remainingMinutes, language)}</strong>
      </div></> : null}
      <div className="pulse-summary-judgment" role={!ready ? "status" : undefined}>
        {ready ? <h3>{advice}</h3> : <>
          <span className="pulse-summary-status">{copy(errorStatus)}</span>
          {onRecover ? <button className="pulse-text-button" type="button" onClick={onRecover}>{quotaCoachFeedback(language, "recover")}</button> : null}
        </>}
        {paper && projectedDepletion && !recentRisk ? <p className="pulse-summary-advice">{copy("projectedDepletion")}</p> : null}
      </div>
    </div>
    {paper && !pacingOnly && ready && coach.reference ? <CoachReference reference={coach.reference} language={language}/> : null}
    {paper ? <details className="pulse-summary-forecast">
      <summary>{copy("notice")}</summary>
      {notice ? <CoachResetNotice notice={notice} language={language} onRead={props.onMarkNoticeRead} pending={props.noticePending} failed={props.noticeFailed} showHeading={false}/> :
        <div className="pulse-summary-forecast-state">
          <strong>{noticeStateCopy(language, coach.noticeState.status === "active" ? "unknown" : coach.noticeState.status)}</strong>
          <NoticeStatusText state={coach.noticeState} language={language}/>
        </div>}
    </details> : <>
      <div className="pulse-summary-bottom"><button type="button" className="pulse-text-button" aria-expanded={expanded} aria-controls={targetId} onClick={() => setExpanded(!expanded)}>{summary("details")}<ChevronDown size={14}/></button></div>
      {notice?.isUnread ? <button type="button" className="pulse-summary-notice" aria-controls={targetId} aria-expanded={expanded} onClick={() => setExpanded(true)}><Bell size={14}/>{quotaCoachFeedback(language, "noticeCompact")}</button> : null}
      {props.noticeFailed ? <p role="alert">{copy("markFailed")}</p> : null}
      <div id={targetId} hidden={!expanded}>{expanded ? <PulsePaceCard {...props} variant="workspace"/> : null}</div>
    </>}
  </section>;
}
