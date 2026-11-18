import { useCallback, useId, useRef, useState } from "react";
import { Bell, ChevronDown, ChevronUp, ExternalLink, GripHorizontal, Pin, PinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pulseWidgetAction, updatePulsePreferences, usePulsePreferences, usePulsePreferencesError } from "@/lib/pulse-appearance";
import { usePulseCopy } from "@/lib/pulse-copy";
import { closeBehaviorCopy } from "@/lib/close-behavior-copy";
import { titlebarAction, usePulsePace } from "@/lib/pulse-pace";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { formatCoachCountdown, formatCoachNumber, formatCoachWindow, quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { quotaCoachFromSnapshot } from "@/lib/quota-pace-coach";
import { PulseBrandMark } from "./pulse-brand-mark";
import { PulsePaceCard } from "./pulse-pace";
import { useWidgetContentSize } from "@/hooks/use-widget-content-size";
import { PaperWidgetSummary, usePaperWidgetSnapshot } from "./paper-widget-summary";
import "./pulse-widget.css";

export function PulseWidget() {
  const copy = usePulseCopy();
  const { t, i18n } = useTranslation();
  const preferences = usePulsePreferences();
  const preferenceError = usePulsePreferencesError();
  const pace = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const pinLock = useRef(false);
  const hideHintId = useId();
  const panel = useRef<HTMLElement>(null);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const pinLabel = copy(preferences.widgetAlwaysOnTop ? "unpinAction" : "pinAction");
  const coach = quotaCoachFromSnapshot(pace.data, Date.now(), pace.error);
  const compactNotice = !preferences.widgetExpanded && coach.resetNotice?.isUnread;
  const empty = coach.remainingPercent == null;
  const effectiveSkin = preferences.widgetSkin && preferences.widgetSkin !== 'follow' ? preferences.widgetSkin : preferences.skinId;
  const paper = effectiveSkin === 'paper';
  const local = usePaperWidgetSnapshot(paper && preferences.widgetExpanded);
  const resizeFailure = useCallback(() => setActionFailed(true), []);
  useWidgetContentSize(panel, preferences.widgetExpanded, empty, `${language}:${preferences.skinId}:${preferences.widgetSkin}:${preferences.theme}:${preferences.widgetAlwaysOnTop}:${preferences.widgetVisible}`, resizeFailure, effectiveSkin);
  const action = (value: Parameters<typeof pulseWidgetAction>[0]) => {
    setActionFailed(false);
    void pulseWidgetAction(value).catch(() => setActionFailed(true));
  };
  const togglePin = async () => {
    if (pinLock.current) return;
    pinLock.current = true;
    setPinPending(true); setActionFailed(false);
    try { await pulseWidgetAction(preferences.widgetAlwaysOnTop ? "unpin" : "pin"); }
    catch { setActionFailed(true); }
    finally { pinLock.current = false; setPinPending(false); }
  };
  const details = () => { setActionFailed(false); void titlebarAction("details").catch(() => setActionFailed(true)); };
  const compactReading = coach.remainingPercent == null ? quotaCoachCopy(language, coach.status === 'ready' ? 'unavailable' : coach.status) : `${formatCoachWindow(coach.window,language)} ${coach.status==='ready'?'':`${quotaCoachFeedback(language,'last')} `}${formatCoachNumber(coach.remainingPercent,language,1)}% · ${coach.status==='ready'?formatCoachCountdown(coach.remainingMinutes,language):quotaCoachCopy(language,coach.status)}`;
  return <main ref={panel} data-widget-skin={effectiveSkin} className={`pulse-widget pulse-widget-coach ${paper ? 'paper-widget ' : ''}${preferences.widgetExpanded ? "is-expanded" : ""}${empty ? " is-empty" : ""}`}>
    <header className="pulse-widget-header" data-tauri-drag-region>
      <PulseBrandMark size={20}/>{compactNotice ? <button type="button" className="pulse-widget-notice" onClick={() => action("expand")} title={quotaCoachFeedback(language, "noticeCompact")}><Bell size={13}/><span>{quotaCoachFeedback(language, "noticeCompact")}</span></button> : <strong data-tauri-drag-region title={paper && !preferences.widgetExpanded ? compactReading : undefined}>{paper ? preferences.widgetExpanded ? 'Codex Pulse' : compactReading : quotaCoachCopy(language, "title")}</strong>}
      <GripHorizontal size={15} className="pulse-widget-grip" data-tauri-drag-region aria-hidden="true"/>
      <button type="button" onClick={() => action("showMain")} aria-label={copy("open")} title={copy("open")}><ExternalLink size={14}/></button>
      <button type="button" className="pulse-widget-pin" data-testid="widget-pin" onClick={() => void togglePin()} disabled={pinPending} aria-busy={pinPending} aria-pressed={preferences.widgetAlwaysOnTop} aria-label={pinLabel} title={pinLabel}>{preferences.widgetAlwaysOnTop ? <Pin size={14} aria-hidden="true"/> : <PinOff size={14} aria-hidden="true"/>}</button>
      <button type="button" onClick={() => action(preferences.widgetExpanded ? "collapse" : "expand")} aria-label={copy(preferences.widgetExpanded ? "collapse" : "expand")} title={copy(preferences.widgetExpanded ? "collapse" : "expand")}>{preferences.widgetExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
      <button type="button" data-testid="widget-hide" onClick={() => action("hide")} aria-label={copy("hide")} aria-describedby={hideHintId} title={closeBehaviorCopy(language, "hideOnly")}><X size={14} aria-hidden="true"/></button>
    </header>
    <span id={hideHintId} className="sr-only">{closeBehaviorCopy(language, "hideOnly")}</span>
    {preferences.widgetExpanded ? <p className="pulse-widget-close-hint" data-testid="widget-close-hint">{closeBehaviorCopy(language, "widgetHint", { quit: t("settings.menu_bar_quit") })}</p> : null}
    {paper && !preferences.widgetExpanded ? <div className="paper-widget-compact"><div className={`paper-widget-track ${coach.status!=='ready'?'is-last':''}`} role="meter" aria-label={coach.status==='ready'?quotaCoachCopy(language,'remaining'):quotaCoachFeedback(language,'last')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={coach.remainingPercent??undefined} aria-valuetext={coach.remainingPercent==null?copy('unknown'):undefined}><i style={{width:`${coach.remainingPercent??0}%`}}/></div>{compactNotice?<small>{compactReading}</small>:null}{coach.status!=='ready'?<small>{coach.remainingPercent!=null?`${quotaCoachFeedback(language,'last')} · `:''}{quotaCoachCopy(language,coach.status)}</small>:null}</div> : <div className="pulse-widget-coach-content">
      {paper ? <div className="paper-widget-expanded-scroll"><PaperWidgetSummary data={pace.data} snapshot={local.snapshot} failed={pace.error} localFailed={local.failed} language={language} onDetails={details}/><details className="paper-widget-pace-details" open={coach.resetNotice?.isUnread}><summary>{quotaCoachFeedback(language,'basis')}{coach.resetNotice?.isUnread?` · ${quotaCoachFeedback(language,'noticeCompact')}`:''}</summary>
      <PulsePaceCard variant="widget" showCompactNotice={false} data={pace.data} failed={pace.error} refreshing={pace.refreshing} onRefresh={()=>void pace.refresh()} onDetails={details} onRecover={()=>{setActionFailed(false);void titlebarAction('account').catch(()=>setActionFailed(true));}} onMarkNoticeRead={pace.markNoticeRead} noticePending={pace.noticePending} noticeFailed={pace.noticeError}/></details></div> :
      <PulsePaceCard variant={preferences.widgetExpanded ? "widget" : "compact"}
        showCompactNotice={false}
        data={pace.data} failed={pace.error} refreshing={pace.refreshing}
        onRefresh={() => void pace.refresh()} onDetails={() => { setActionFailed(false); void titlebarAction("details").catch(() => setActionFailed(true)); }}
        onRecover={() => { setActionFailed(false); void titlebarAction("account").catch(() => setActionFailed(true)); }}
        onMarkNoticeRead={pace.markNoticeRead} noticePending={pace.noticePending} noticeFailed={pace.noticeError}/>}
    </div>}
    {preferences.widgetExpanded ? <footer className="paper-widget-style"><label><span>{copy('widgetStyle')}</span><select aria-label={copy('widgetStyle')} value={preferences.widgetSkin??'follow'} onChange={event=>void updatePulsePreferences({widgetSkin:event.target.value as typeof preferences.widgetSkin})}>{(['follow','clear','meter','paper'] as const).map(value=><option key={value} value={value}>{copy(value==='follow'?'followStyle':value)}</option>)}</select></label>{paper?<button type="button" onClick={()=>action('showMain')}>{copy('open')}<ExternalLink size={13}/></button>:null}</footer>:null}
    {actionFailed ? <p className="pulse-error" role="alert">{paceCopy(language, "actionFailed")}</p> : null}
    {preferenceError ? <p className="pulse-error" role="alert">{copy('saveError')}: {preferenceError}</p> : null}
  </main>;
}
