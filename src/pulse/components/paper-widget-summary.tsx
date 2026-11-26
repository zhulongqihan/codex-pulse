import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BarChart3, Database, Leaf, Tag } from "lucide-react";
import { pulseCopy } from "@/lib/pulse-copy";
import { formatCoachCountdown, formatCoachNumber, formatCoachWindow, quotaCoachClarity, quotaCoachCopy, quotaCoachFeedback } from "@/lib/quota-pace-coach-copy";
import { quotaCoachFromSnapshot, quotaWindowReadState } from "@/lib/quota-pace-coach";
import type { PaceSnapshot } from "@/lib/pulse-pace";
import type { TrayPopoverData } from "@/lib/tray-popover";
import { currentDateInTimezone } from "@/lib/trend-buckets";
import { formatCurrencyShort } from "@/lib/formatters";
import { ReadingInfo } from "@/components/reading-info";
import "./paper-widget-summary.css";

const companion = {
  en: { today: "Today · local", cycleToday: "Observed today in this cycle", observed: "Observed window", note: "Partial observations from today's portion of this quota cycle. Official quota history can include other cycles on the same day." },
  zh: { today: "今日 · 本机", cycleToday: "本轮今日观测", observed: "观测窗口", note: "仅显示本轮额度周期内的今日部分观测。官方额度记录可能包含今天的其他周期。" },
  "zh-Hant": { today: "今日 · 本機", cycleToday: "本輪今日觀測", observed: "觀測視窗", note: "僅顯示本輪額度週期內的今日部分觀測。官方額度記錄可能包含今天的其他週期。" },
  ja: { today: "今日 · ローカル", cycleToday: "現在の周期の今日の観測", observed: "観測ウィンドウ", note: "現在の上限周期で今日観測できた分を表示します。公式クォータ履歴には同日の別の周期も含まれる場合があります。" },
  ko: { today: "오늘 · 로컬", cycleToday: "이번 주기의 오늘 관측", observed: "관측 기간", note: "현재 한도 주기에서 오늘 관측한 일부 기록을 표시합니다. 공식 한도 기록에는 같은 날의 다른 주기가 포함될 수 있습니다." },
  de: { today: "Heute · lokal", cycleToday: "Heute im laufenden Zyklus", observed: "Beobachtetes Fenster", note: "Teilbeobachtungen für heute im laufenden Kontingentzyklus. Der offizielle Kontingentverlauf kann weitere Zyklen desselben Tages enthalten." },
};
function localCopy(language: string) {
  const value=language.toLowerCase();
  return companion[value.startsWith('zh-hant') || value==='zh-tw' ? 'zh-Hant' : value.split('-')[0] as keyof typeof companion] ?? companion.en;
}
const validAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function sameDay(date:string|undefined,timezone:string|undefined,now:number) {
  if(!date||!timezone)return false;
  try{return date===currentDateInTimezone(timezone,new Date(now));}catch{return false;}
}
function readingIsStale(source:{updatedAt:string|null;stale?:boolean}|null|undefined,now:number) {
  const updated=Date.parse(source?.updatedAt??'');
  return !source||source.stale===true||!Number.isFinite(updated)||now-updated>360_000||now-updated< -120_000;
}

/** Read only the already-published local snapshot; this does not scan files or refresh the account. */
export function usePaperWidgetSnapshot(enabled:boolean) {
  const[snapshot,setSnapshot]=useState<TrayPopoverData|null>(null);
  const[failed,setFailed]=useState(false);
  useEffect(()=>{
    const explicitDemo=new URLSearchParams(location.search).get('demo')==='1'&&document.documentElement.dataset.demo==='true';
    if(!enabled||(!isTauri()&&!explicitDemo))return;
    let active=true,eventRevision=0,remove:(()=>void)|undefined;
    const initialReadRevision=eventRevision;
    const accept=(value:TrayPopoverData|null)=>{if(active){setSnapshot(value);setFailed(false);}};
    void(async()=>{
      try{
        const cleanup=await listen<TrayPopoverData>('widget-snapshot-updated',({payload})=>{eventRevision++;accept(payload);});
        if(!active){cleanup();return;}remove=cleanup;
      }catch{/* A direct local snapshot remains useful if event registration fails. */}
      if(!active)return;
      try{
        const value=await invoke<TrayPopoverData|null>('get_widget_snapshot');
        // The bootstrap read cannot supersede a push delivered while it was pending.
        if(eventRevision===initialReadRevision)accept(value);
      }catch{if(active&&eventRevision===initialReadRevision)setFailed(true);}
    })();
    return()=>{active=false;remove?.();};
  },[enabled]);
  return{snapshot,failed};
}

export function PaperWidgetSummary({data,snapshot,failed,localFailed=false,language,onDetails}:{data:PaceSnapshot|null;snapshot:TrayPopoverData|null;failed:boolean;localFailed?:boolean;language:string;onDetails:()=>void}) {
  const[now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer);},[]);
  const copy=(key:Parameters<typeof pulseCopy>[1])=>pulseCopy(language,key), labels=localCopy(language);
  const coach=quotaCoachFromSnapshot(data,now,failed);
  const updated=Date.parse(data?.updatedAt??'');
  const fresh=!failed&&!data?.refreshFailed&&Number.isFinite(updated)&&now-updated>=-120_000&&now-updated<=360_000&&!['stale','unavailable'].includes(data?.status??'unavailable');
  const today=snapshot?.integration?.today;
  const currentToday=sameDay(today?.date,today?.timezone,now)?today:null;
  const local=data?.localUsage;
  const currentLocal=sameDay(local?.date,local?.timezone,now)?local:null;
  const tokenSource=Number.isSafeInteger(currentToday?.totalTokens)&&validAmount(currentToday?.totalTokens)?currentToday:Number.isSafeInteger(currentLocal?.totalTokens)&&validAmount(currentLocal?.totalTokens)?currentLocal:null;
  const tokens=tokenSource?.totalTokens??null;
  const cost=validAmount(currentToday?.costUSD)?currentToday.costUSD:null;
  const tokenStale=tokens!=null&&(readingIsStale(tokenSource,now)||(tokenSource===currentToday&&localFailed));
  const costStale=cost!=null&&(readingIsStale(currentToday,now)||localFailed);
  let observationDate:string|null=null;
  try{if(coach.observationTimezone)observationDate=currentDateInTimezone(coach.observationTimezone,new Date(now));}catch{/* Invalid zones never become today's observation. */}
  const observed=coach.dailyObservations.find(row=>row.date===observationDate);
  return <div className="paper-widget-summary">
    <section className="paper-widget-quotas" aria-label={copy('quota')} data-testid="paper-widget-quotas">
      {(['session','weekly'] as const).map(kind=>{
        const window=data?.windows.find(window=>window.kind===kind);
        const state=window?quotaWindowReadState(window,now,fresh):'unavailable';
        const remaining=window&&validAmount(window.remainingPercent)&&window.remainingPercent<=100?window.remainingPercent:null;
        const label=quotaCoachClarity(language,kind==='session'?'sessionKind':'weeklyKind');
        const reset=Date.parse(window?.resetsAt??'');
        const last=remaining!=null&&!['ready','exhausted'].includes(state);
        return <div key={kind} className={`paper-widget-quota is-${state}`} data-reading-state={state}>
          <div><span title={window?formatCoachWindow(window,language):label}>{label}</span><strong>{remaining==null?'—':`${formatCoachNumber(remaining,language,1)}%`}</strong><small>{Number.isFinite(reset)&&reset>now?formatCoachCountdown((reset-now)/60_000,language):quotaCoachCopy(language,state==='expired'?'expired':'unavailable')}</small></div>
          <div className="paper-widget-track" role="meter" aria-label={`${label} · ${last?quotaCoachFeedback(language,'last'):quotaCoachCopy(language,'remaining')}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining??undefined} aria-valuetext={remaining==null?copy('unknown'):undefined}><i style={{width:`${remaining??0}%`}}/></div>
          {last?<small className="paper-widget-last">{quotaCoachFeedback(language,'last')} · {quotaCoachCopy(language,state==='expired'?'expired':state==='stale'?'stale':'unavailable')}</small>:null}
        </div>;
      })}
    </section>
    <p className={`paper-widget-judgment is-${coach.tone??coach.status}`}><Leaf size={20}/>{quotaCoachCopy(language,coach.status==='ready'?coach.tone!:coach.status)}</p>
    <section className="paper-widget-today" aria-label={labels.today} data-testid="paper-widget-today">
      <p>{labels.today}</p>
      <div data-reading-state={tokens == null ? 'unknown' : tokenStale ? 'stale' : 'current'}>
        <Database size={18}/>
        <span className="paper-widget-metric-label"><span>{copy('tokens')}</span>{tokenStale ? <small>{copy('stale')}</small> : null}</span>
        <strong title={tokenSource?.updatedAt ?? undefined}>{tokens == null ? '—' : formatCoachNumber(tokens, language)}</strong>
      </div>
      <div data-reading-state={cost == null ? 'unknown' : costStale ? 'stale' : 'current'}>
        <Tag size={17}/>
        <span className="paper-widget-metric-label">
          <span className="paper-widget-metric-name">{copy('estimate')}<ReadingInfo label={copy('estimate')}>{copy('notBill')}</ReadingInfo></span>
          {costStale ? <small>{copy('stale')}</small> : null}
        </span>
        <strong title={currentToday?.updatedAt ?? undefined}>{formatCurrencyShort(cost)}</strong>
      </div>
    </section>
    <div className="paper-widget-observed-row">
      <button className="paper-widget-observed" type="button" onClick={onDetails}>
        <BarChart3 size={21}/>
        <span><strong>{labels.cycleToday}</strong><span>{coach.window ? formatCoachWindow(coach.window, language) : labels.observed} · {observed?.consumedPercentPoints == null ? copy('unknown') : quotaCoachFeedback(language, 'points', { points: formatCoachNumber(observed.consumedPercentPoints, language, 2) })}</span></span>
      </button>
      <ReadingInfo label={labels.observed}>{labels.note}</ReadingInfo>
    </div>
  </div>;
}
