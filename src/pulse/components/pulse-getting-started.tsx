import { useShellCopy } from "@/lib/shell-copy";
import { Check, FolderOpen, MonitorUp, Link, X } from "lucide-react";

type Props = { expanded: boolean; onExpand: () => void; localReady: boolean; accountReady: boolean; source?: string; busy: boolean; notice: string | null; error: string | null; onSource: () => void; onAccount: () => void; onWidget: () => void; onShortcuts: () => void; onDismiss: () => void };
export function PulseGettingStarted({ expanded, onExpand, localReady, accountReady, source, busy, notice, error, onSource, onAccount, onWidget, onShortcuts, onDismiss }: Props) {
  const copy = useShellCopy();
  return <section className="pulse-getting-started" data-testid="getting-started" aria-labelledby="pulse-getting-started-title">
    <div className="pulse-setup-line"><h2 id="pulse-getting-started-title">{copy("helpTitle")}</h2>
      <div className="pulse-setup-status"><button type="button" onClick={onSource} title={source || copy("source")}>{localReady ? <Check size={14}/> : <FolderOpen size={14}/>}<strong>{copy("local")}</strong>{copy(localReady ? "localReady" : "localPending")}</button><button type="button" onClick={onAccount}>{accountReady ? <Check size={14}/> : null}{copy(accountReady ? "accountReady" : "accountPending")}</button></div>
      <div className="pulse-setup-actions"><button type="button" onClick={onWidget} disabled={busy}><MonitorUp size={15}/>{copy("setupWidget")}</button><button type="button" onClick={onShortcuts} disabled={busy} data-testid="create-shortcuts"><Link size={15}/>{copy("shortcuts")}</button><button type="button" aria-expanded={expanded} aria-controls="pulse-setup-details" onClick={onExpand}>{copy("help")}</button></div>
      <button type="button" className="pulse-icon-button" onClick={onDismiss} aria-label={copy("dismiss")} title={copy("dismiss")}><X size={17}/></button>
    </div>
    {expanded ? <div id="pulse-setup-details"><p className="pulse-setup-hint">{copy("helpDescription")}</p>{!accountReady ? <p className="pulse-setup-hint">{copy("loginHint")}</p> : null}<button type="button" className="pulse-text-button" onClick={onSource}>{copy("source")}</button></div> : null}
    {notice ? <p className="pulse-action-notice" role="status">{notice}</p> : null}{error ? <p className="pulse-error" role="alert">{error}</p> : null}
  </section>;
}
