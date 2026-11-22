import { useEffect, useId, useState, type ComponentProps, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronDown, RefreshCw } from "lucide-react";
import { CoachReference, PulsePaceCard } from "./pulse-pace";
import { quotaCoachFromSnapshot } from "@/lib/quota-pace-coach";
import { formatCoachCountdown, formatCoachNumber, formatCoachReset, formatCoachWindow, quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback, quotaCoachReason } from "@/lib/quota-pace-coach-copy";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { paceSummaryCopy } from "@/lib/pace-summary-copy";
import { localTimeZone, timeZoneLabel } from "@/lib/time-context";
import { ReadingInfo } from "./reading-info";
import "./pulse-pace-summary.css";

/** A summary of the existing quota model. Opening its details preserves all original explanations. */
export function PulsePaceSummary({
  expanded: controlledExpanded, onExpandedChange, detailsId, detailsPlacement = "inline", detailsTriggerRef, pacingOnly = false, ...props
}: ComponentProps<typeof PulsePaceCard> & {
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  detailsId?: string;
  detailsPlacement?: "inline" | "external";
  detailsTriggerRef?: Ref<HTMLButtonElement>;
  pacingOnly?: boolean;
}) {
  const { data, failed = false, refreshing = false, onRefresh, onRecover } = props;
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof quotaCoachCopy>[1]) => quotaCoachCopy(language, key);
  const summary = (key: Parameters<typeof paceSummaryCopy>[1]) => paceSummaryCopy(language, key);
  const [now, setNow] = useState(Date.now);
  const [inlineExpanded, setInlineExpanded] = useState(false);
  const generatedId = useId();
  const targetId = detailsId ?? generatedId;
  const expanded = controlledExpanded ?? inlineExpanded;
  const external = detailsPlacement === "external";
  const changeExpanded = (next: boolean) => {
    if (controlledExpanded == null) setInlineExpanded(next);
    onExpandedChange?.(next);
  };
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), data?.refreshAfterSeconds ? 1_000 : 30_000); return () => clearInterval(timer); }, [data?.refreshAfterSeconds]);
  const coach = quotaCoachFromSnapshot(data, now, failed);
  const ready = coach.status === "ready" && coach.tone != null;
  const projectedDepletion = ready && coach.remainingAtReset != null && coach.remainingAtReset.upperPercent < 1;
  const recentRisk = projectedDepletion && (coach.tone === "roomy" || coach.tone === "balanced");
  const generated = Date.parse(data?.generatedAt ?? "");
  const wait = data?.refreshAfterSeconds && Number.isFinite(generated) ? Math.max(0, Math.ceil(data.refreshAfterSeconds - (now - generated) / 1000)) : 0;
  const reason = !ready ? quotaCoachReason(language, data?.reason) : null;
  const readingLabel = ["stale", "failed", "expired", "unavailable"].includes(coach.status) && coach.remainingPercent != null ? quotaCoachFeedback(language, "last") : copy("remaining");
  const updatedDate = data?.updatedAt && Number.isFinite(Date.parse(data.updatedAt)) ? new Date(data.updatedAt) : null;
  const updated = updatedDate ? paceCopy(language, "updated", { time: updatedDate.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) }) : paceCopy(language, "never");
  const formatted = (value: number) => formatCoachNumber(value, language, 1);
  const errorStatus = coach.status === "ready" ? "unavailable" : coach.status;
  const resetTimezone = localTimeZone();
  const advice = ready ? recentRisk ? copy("recentRiskAdvice") : coach.tone === "roomy" ? summary("roomy") : copy(`${coach.tone!}Advice`) : null;
  return <section className={`pulse-summary coach-${coach.status}${pacingOnly ? " pulse-summary-pacing-only" : ""}`} aria-labelledby={`${generatedId}-title`} data-testid="pulse-pace-summary">
    <header className="pulse-summary-heading">
      <div><h2 id={`${generatedId}-title`}>{summary(pacingOnly ? "pacing" : "title")}</h2><span>{formatCoachWindow(coach.window, language)}</span>
        <ReadingInfo label={quotaCoachClarity(language, "explain")}>
          {!ready ? <p>{reason ?? copy(`${errorStatus}Detail`)}</p> : null}
          {ready ? <p>{quotaCoachCopy(language, "comparison", { used: formatted(coach.usedPercent!), elapsed: formatted(coach.elapsedPercent!) })}</p> : null}
          <p>{copy("scope")}</p>
          {coach.hasUnknownWindows ? <p>{quotaCoachFeedback(language, "unknownWindows")}</p> : null}
          {coach.resetAt != null ? <p>{quotaCoachCopy(language, "resetAt", { time: formatCoachReset(coach.resetAt, language) })}
            {resetTimezone ? ` · ${timeZoneLabel(resetTimezone, language, coach.resetAt)}` : null}</p> : null}
          <p><time dateTime={updatedDate?.toISOString()}>{updated}</time></p>
        </ReadingInfo>
      </div>
      <div className="pulse-summary-updated">{wait > 0 ? <span role="timer">{quotaCoachFeedback(language, "cooldownShort", { seconds: wait })}</span> : null}<button type="button" onClick={onRefresh} disabled={refreshing || wait > 0} aria-busy={refreshing} aria-label={paceCopy(language, "refresh")} title={paceCopy(language, "refresh")}><RefreshCw size={16}/></button></div>
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
        {external && projectedDepletion && !recentRisk ? <p className="pulse-summary-advice">{copy("projectedDepletion")}</p> : null}
      </div>
    </div>
    {external && !pacingOnly && ready && coach.reference ? <CoachReference reference={coach.reference} language={language}/> : null}
    <div className="pulse-summary-bottom"><button ref={detailsTriggerRef} type="button" className="pulse-text-button" aria-expanded={expanded} aria-controls={targetId} onClick={() => changeExpanded(!expanded)}>{summary("details")}<ChevronDown size={14}/></button></div>
    {coach.resetNotice?.isUnread ? <button type="button" className="pulse-summary-notice" aria-controls={targetId} aria-expanded={expanded} onClick={() => changeExpanded(true)}><Bell size={14}/>{quotaCoachFeedback(language, "noticeCompact")}</button> : null}
    {props.noticeFailed && (!external || !expanded) ? <p role="alert">{copy("markFailed")}</p> : null}
    {!external ? <div id={targetId} hidden={!expanded}>{expanded ? <PulsePaceCard {...props} variant="workspace"/> : null}</div> : null}
  </section>;
}
