import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { installationCopy } from "@/lib/installation-copy";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type EntryId = "desktop" | "startMenu" | "startup" | "codexPlugin";
type Status = "current" | "notConfigured" | "stale" | "otherInstallation" | "unavailable";
export type InstallationEntry = { id: EntryId; status: Status; location: string; targetPath: string | null; registeredTargetPath?: string | null; canRepair: boolean; detailCode: string };
export type InstallationInspection = { supported: boolean; snapshotId: string; executable: string; dataDirectory: string; codexHome: string; entries: InstallationEntry[]; checkedAt: string };
type Outcome = "repaired" | "prepared" | "changedSinceCheck" | "failed" | "skipped";
type RepairReport = { results: { id: EntryId; outcome: Outcome; detailCode: string }[]; inspection: InstallationInspection };

/** The maintenance tab stays mounted while hidden. Native checks are deliberately user initiated. */
export function PulseInstallationSettings({ onBindingsChanged }: { onBindingsChanged?: () => void }) {
  const { i18n } = useTranslation();
  const text = (key: Parameters<typeof installationCopy>[1]) => installationCopy(i18n.resolvedLanguage ?? i18n.language, key);
  const [inspection, setInspection] = useState<InstallationInspection | null>(null);
  const [busy, setBusy] = useState<"checking" | "repairing" | null>(null);
  const [notice, setNotice] = useState<"checkError" | "repairError" | "browser" | null>(null);
  const [results, setResults] = useState<RepairReport["results"]>([]);
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const native = () => "__TAURI_INTERNALS__" in window && new URLSearchParams(window.location.search).get("demo") !== "1";
  async function check() {
    if (running.current) return;
    if (!native()) { setNotice("browser"); return; }
    running.current = true; const request = ++generation.current;
    setBusy("checking"); setNotice(null); setResults([]);
    try { const next = await invoke<InstallationInspection>("inspect_pulse_installation"); if (request === generation.current) setInspection(next); }
    catch { if (request === generation.current) { setNotice("checkError"); setInspection(null); } }
    finally { if (request === generation.current) { running.current = false; setBusy(null); } }
  }
  async function repair(entry: InstallationEntry) {
    if (running.current || !inspection || !entry.canRepair || !native()) return;
    running.current = true; const request = ++generation.current;
    setBusy("repairing"); setNotice(null); setResults([]);
    try {
      const next = await invoke<RepairReport>("repair_pulse_installation", { snapshotId: inspection.snapshotId, entryIds: [entry.id] });
      if (request !== generation.current) return;
      setInspection(next.inspection); setResults(next.results);
      if (next.results.some(result => result.outcome === "repaired" && result.id === "startup")) onBindingsChanged?.();
    } catch { if (request === generation.current) { setNotice("repairError"); setInspection(null); } }
    finally { if (request === generation.current) { running.current = false; setBusy(null); } }
  }
  return <Card data-testid="installation-settings">
    <CardHeader><CardTitle>{text("title")}</CardTitle><CardDescription>{text("description")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{text("safety")}</p>
      <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void check()} data-testid="installation-check">{text(busy ?? "check")}</Button>
      {notice && <p role="status" className="text-sm text-muted-foreground">{text(notice)}</p>}
      {inspection && <>
        {!inspection.supported && <p className="text-sm text-muted-foreground">{text("browser")}</p>}
        <dl className="space-y-2 text-xs text-muted-foreground">
          {(["executable", "dataDirectory", "codexHome"] as const).map(key => <div key={key}><dt className="font-medium">{text(key)}</dt><dd className="[overflow-wrap:anywhere]">{inspection[key]}</dd></div>)}
        </dl>
        <ul className="divide-y divide-border border-t border-border">
          {inspection.entries.map(entry => <li key={entry.id} data-testid={`installation-${entry.id}`} className="space-y-2 py-4">
            <h4 className="text-sm font-medium">{text(entry.id)}</h4>
            <p className="text-sm" data-testid={`installation-status-${entry.id}`}>{text(entry.status)}</p>
            {entry.location && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{text("location")}: {entry.location}</p>}
            {entry.targetPath && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{text("target")}: {entry.targetPath}</p>}
            {entry.registeredTargetPath && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{text("registeredTarget")}: {entry.registeredTargetPath}</p>}
            <p className="text-xs leading-relaxed text-muted-foreground">{text(`${entry.id}Impact`)}</p>
            {entry.id === "codexPlugin" && <p className="text-xs leading-relaxed text-muted-foreground">{text("hostConfirmation")}</p>}
            {(entry.detailCode === "otherProfile" || entry.detailCode === "customized" || entry.detailCode === "movedDefaultProfile") && <p className="text-xs text-muted-foreground">{text(entry.detailCode)}</p>}
            {entry.canRepair && <Button size="sm" variant="secondary" className="max-w-full whitespace-normal text-left h-auto min-h-8" disabled={!!busy} onClick={() => void repair(entry)}>{text(entry.id === "codexPlugin" ? "pluginAction" : "repair")}</Button>}
            {results.filter(result => result.id === entry.id).map(result => <p key={result.id} role="status" className="text-sm leading-relaxed" data-testid={`installation-result-${entry.id}`}>{text(result.outcome)}</p>)}
          </li>)}
        </ul>
      </>}
    </CardContent>
  </Card>;
}
