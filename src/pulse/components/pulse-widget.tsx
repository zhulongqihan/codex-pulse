import { useState } from "react";
import { Bell, ChevronDown, ChevronUp, ExternalLink, GripHorizontal, Pin, PinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pulseWidgetAction, usePulsePreferences } from "@/lib/pulse-appearance";
import { usePulseCopy } from "@/lib/pulse-copy";
import { titlebarAction, usePulsePace } from "@/lib/pulse-pace";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { quotaCoachFromSnapshot } from "@/lib/quota-pace-coach";
import { PulseBrandMark } from "./pulse-brand-mark";
import { PulsePaceCard } from "./pulse-pace";
import "./pulse-widget.css";

export function PulseWidget() {
  const copy = usePulseCopy();
  const { i18n } = useTranslation();
  const preferences = usePulsePreferences();
  const pace = usePulsePace();
  const [actionFailed, setActionFailed] = useState(false);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const compactNotice = !preferences.widgetExpanded && quotaCoachFromSnapshot(pace.data, Date.now(), pace.error).resetNotice?.isUnread;
  const action = (value: Parameters<typeof pulseWidgetAction>[0]) => {
    setActionFailed(false);
    void pulseWidgetAction(value).catch(() => setActionFailed(true));
  };
  return <main className={`pulse-widget pulse-widget-coach ${preferences.widgetExpanded ? "is-expanded" : ""}`}>
    <header className="pulse-widget-header" data-tauri-drag-region>
      <PulseBrandMark size={20}/>{compactNotice ? <button type="button" className="pulse-widget-notice" onClick={() => action("expand")} title={quotaCoachFeedback(language, "noticeCompact")}><Bell size={13}/><span>{quotaCoachFeedback(language, "noticeCompact")}</span></button> : <strong data-tauri-drag-region>{quotaCoachCopy(language, "title")}</strong>}
      <GripHorizontal size={15} className="pulse-widget-grip" data-tauri-drag-region aria-hidden="true"/>
      <button type="button" onClick={() => action("showMain")} aria-label={copy("open")} title={copy("open")}><ExternalLink size={14}/></button>
      <button type="button" onClick={() => action(preferences.widgetAlwaysOnTop ? "unpin" : "pin")} aria-pressed={preferences.widgetAlwaysOnTop} aria-label={copy("pin")} title={copy("pin")}>{preferences.widgetAlwaysOnTop ? <Pin size={14}/> : <PinOff size={14}/>}</button>
      <button type="button" onClick={() => action(preferences.widgetExpanded ? "collapse" : "expand")} aria-label={copy(preferences.widgetExpanded ? "collapse" : "expand")} title={copy(preferences.widgetExpanded ? "collapse" : "expand")}>{preferences.widgetExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
      <button type="button" onClick={() => action("hide")} aria-label={copy("hide")} title={copy("hide")}><X size={14}/></button>
    </header>
    <div className="pulse-widget-coach-content">
      <PulsePaceCard variant={preferences.widgetExpanded ? "widget" : "compact"}
        showCompactNotice={false}
        data={pace.data} failed={pace.error} refreshing={pace.refreshing}
        onRefresh={() => void pace.refresh()} onDetails={() => { setActionFailed(false); void titlebarAction("details").catch(() => setActionFailed(true)); }}
        onRecover={() => { setActionFailed(false); void titlebarAction("account").catch(() => setActionFailed(true)); }}
        onMarkNoticeRead={pace.markNoticeRead} noticePending={pace.noticePending} noticeFailed={pace.noticeError}/>
    </div>
    {actionFailed ? <p className="pulse-error" role="alert">{paceCopy(language, "actionFailed")}</p> : null}
  </main>;
}
