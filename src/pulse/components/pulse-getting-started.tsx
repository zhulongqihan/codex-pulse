import { useShellCopy } from "@/lib/shell-copy";
import { FolderOpen, MonitorUp, Link, UserRound, X } from "lucide-react";
import type { Ref } from "react";
import { PulseUsageGuide } from "./pulse-usage-guide";
import { useTranslation } from "react-i18next";
import { firstUseCopy } from "@/lib/first-use";

type Props = {
  panelRef?: Ref<HTMLElement>;
  accountReady: boolean;
  quotaAvailable?: boolean;
  busy: boolean;
  notice: string | null;
  error: string | null;
  onSource: () => void;
  onAccount: () => void;
  onWidget: () => void;
  onShortcuts: () => void;
  onDismiss: () => void;
};

export function PulseGettingStarted({ panelRef, accountReady, quotaAvailable = false, busy, notice, error, onSource, onAccount, onWidget, onShortcuts, onDismiss }: Props) {
  const copy = useShellCopy();
  const { i18n } = useTranslation();
  const guide = (key: Parameters<typeof firstUseCopy>[1]) => firstUseCopy(i18n.resolvedLanguage ?? i18n.language, key);
  return <section id="pulse-workspace-help" ref={panelRef} tabIndex={-1} className="pulse-getting-started" data-testid="getting-started"
    aria-labelledby="pulse-getting-started-title"
    onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onDismiss(); } }}>
    <header><h2 id="pulse-getting-started-title">{copy("help")}</h2>
      <button type="button" className="pulse-icon-button" onClick={onDismiss} aria-label={copy("dismiss")} title={copy("dismiss")}><X size={17} aria-hidden="true"/></button>
    </header>
    <p className="pulse-setup-hint" data-testid="first-use-guidance">{guide(quotaAvailable ? "ready" : accountReady ? "missing" : "pending")}</p>
    {!quotaAvailable ? <button type="button" className="pulse-text-button pulse-setup-account" data-testid="first-use-next" onClick={onAccount}>
      <UserRound size={15} aria-hidden="true"/>{guide(accountReady ? "inspectQuota" : "checkAccount")}
    </button> : null}
    <PulseUsageGuide/>
    <div className="pulse-setup-actions">
      <button type="button" onClick={onSource}><FolderOpen size={15} aria-hidden="true"/>{copy("source")}</button>
      <button type="button" onClick={onWidget} disabled={busy}><MonitorUp size={15} aria-hidden="true"/>{copy("setupWidget")}</button>
      <button type="button" onClick={onShortcuts} disabled={busy} data-testid="create-shortcuts"><Link size={15} aria-hidden="true"/>{copy("shortcuts")}</button>
    </div>
    {notice ? <p className="pulse-action-notice" role="status">{notice}</p> : null}{error ? <p className="pulse-error" role="alert">{error}</p> : null}
  </section>;
}
