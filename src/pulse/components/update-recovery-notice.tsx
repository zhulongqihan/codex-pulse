import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateRecoveryResult } from "@/lib/api";
import { updateRecoveryCopy } from "@/lib/update-recovery-copy";

export function UpdateRecoveryNotice({ result, error, onDismiss, onOpenRecords }: {
  result: UpdateRecoveryResult | null; error: string | null;
  onDismiss: () => Promise<void>; onOpenRecords: () => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof updateRecoveryCopy>[1]) => updateRecoveryCopy(language, key);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  if (!result && !error) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setActionError(false);
    try { await action(); } catch { setActionError(true); } finally { setBusy(false); }
  };
  const recorded = result?.recordedAt ? new Date(result.recordedAt) : null;
  return <aside className="pulse-update-recovery" role={result?.status === "restored" ? "status" : "alert"} aria-labelledby="pulse-update-recovery-title" data-testid="update-recovery-notice">
    <div><h2 id="pulse-update-recovery-title">{copy(result ? "title" : "readError")}</h2>
      {result ? <p>{copy(result.status)}</p> : null}
      {result?.attemptedVersion ? <p>{copy("version")}: {result.attemptedVersion}</p> : null}
      {recorded && Number.isFinite(recorded.getTime()) ? <p>{copy("recorded")}: <time dateTime={result!.recordedAt!}>{recorded.toLocaleString(language)}</time></p> : null}
      <details><summary>{copy("reason")}</summary><p className="pulse-update-recovery-reason">{result?.reason || error || copy("unknown")}</p></details>
      {result && error ? <p role="alert" className="pulse-error">{error}</p> : null}
      {actionError ? <p role="alert" className="pulse-error">{copy("actionError")}</p> : null}
    </div>
    <div className="pulse-update-recovery-actions"><button type="button" className="pulse-shell-action" disabled={busy} onClick={() => void run(onOpenRecords)}>{copy("open")}</button><button type="button" className="pulse-shell-action" disabled={busy} onClick={() => void run(onDismiss)}>{copy("dismiss")}</button></div>
  </aside>;
}
