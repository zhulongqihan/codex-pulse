import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, GripHorizontal, Pin, PinOff, X } from "lucide-react";
import type { TrayPopoverData } from "@/lib/tray-popover";
import { pulseWidgetAction, usePulsePreferences } from "@/lib/pulse-appearance";
import { usePulseCopy } from "@/lib/pulse-copy";
import { PulseBrandMark } from "./pulse-brand-mark";

export function PulseWidget() {
  const copy = usePulseCopy();
  const preferences = usePulsePreferences();
  const [data, setData] = useState<TrayPopoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    if (isTauri()) void (async () => {
      const cleanup = await listen<TrayPopoverData>("widget-snapshot-updated", ({payload}) => { if (active) setData(payload); });
      if (!active) { cleanup(); return; }
      unlisten = cleanup;
      const snapshot = await invoke<TrayPopoverData | null>("get_widget_snapshot");
      if (active) setData(snapshot);
    })().catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; unlisten?.(); };
  }, []);
  const action = (value: Parameters<typeof pulseWidgetAction>[0]) => { void pulseWidgetAction(value).catch((cause) => setError(String(cause))); };
  return <main className={`pulse-widget ${preferences.widgetExpanded ? "is-expanded" : ""}`}>
    <header className="pulse-widget-header" data-tauri-drag-region>
      <PulseBrandMark size={20}/><strong data-tauri-drag-region>Pulse</strong><GripHorizontal size={15} className="pulse-widget-grip" data-tauri-drag-region aria-hidden="true"/>
      {data?.stale ? <span role="status" aria-label={copy("stale")} title={copy("stale")} className="text-warning"><AlertTriangle size={14}/></span> : null}
      <button type="button" onClick={() => action(preferences.widgetAlwaysOnTop ? "unpin" : "pin")} aria-pressed={preferences.widgetAlwaysOnTop} aria-label={copy("pin")} title={copy("pin")}>{preferences.widgetAlwaysOnTop ? <Pin size={14}/> : <PinOff size={14}/>}</button>
      <button type="button" onClick={() => action(preferences.widgetExpanded ? "collapse" : "expand")} aria-label={copy(preferences.widgetExpanded ? "collapse" : "expand")} title={copy(preferences.widgetExpanded ? "collapse" : "expand")}>{preferences.widgetExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
      <button type="button" onClick={() => action("hide")} aria-label={copy("hide")} title={copy("hide")}><X size={14}/></button>
    </header>
    <button type="button" className="pulse-widget-summary" onClick={() => action("showMain")} title={copy("open")}>
      <span><small>{data?.labels.today ?? copy("local")}</small><strong>{data?.tokens?.value ?? "—"}<small> tokens</small></strong></span>
      <span><small>{data?.quotas[0]?.label ?? copy("account")}</small><strong>{data?.quotas[0]?.remainingPercent == null ? "—" : `${Math.round(data.quotas[0].remainingPercent)}%`}</strong></span>
      <ExternalLink size={14} aria-hidden="true"/>
    </button>
    {preferences.widgetExpanded ? <div className="pulse-widget-details">
      {data?.stale ? <p className="text-warning" role="status">{copy("stale")}</p> : null}
      {data?.quotas.map((quota, index) => <section key={`${quota.kind}-${index}`}>
        <div><span>{quota.label}</span><strong>{quota.remainingPercent == null ? "—" : `${Math.round(quota.remainingPercent)}%`} <small>{data.labels.remaining}</small></strong></div>
        <div className="pulse-widget-meter" role="progressbar" aria-label={quota.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota.remainingPercent ?? undefined}><span style={{width: `${Math.max(0, Math.min(100, quota.remainingPercent ?? 0))}%`}}/></div>
        <small>{quota.resetText || copy("unknown")}</small>
      </section>)}
      <div className="pulse-widget-cost"><span>{copy("estimate")}</span><strong>{data?.cost ?? "—"}</strong></div>
      <p>{data ? copy("accountNote") : copy("waiting")}</p>
    </div> : null}
    {error ? <p className="pulse-error" role="alert">{error}</p> : null}
  </main>;
}
