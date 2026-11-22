import {useEffect,useState} from "react";
import {CalendarDays} from "lucide-react";
import {useTranslation} from "react-i18next";
import {getLanguage,languages} from "@/lib/languages";

/** Presentation only: no usage/identity requests or synthetic timestamps. */
export function PaperClock() {
  const {i18n}=useTranslation();
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const tick=()=>setNow(new Date());const timer=window.setInterval(tick,60_000);window.addEventListener("focus",tick);return()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};},[]);
  const locale=languages[getLanguage(i18n.resolvedLanguage??i18n.language)].intlLocale;
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <div className="pulse-paper-clock"><CalendarDays size={19} aria-hidden="true"/><time dateTime={now.toISOString()} title={timezone}>{new Intl.DateTimeFormat(locale,{year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit"}).format(now)}</time></div>;
}
