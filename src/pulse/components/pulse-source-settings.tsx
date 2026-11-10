import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { FolderOpen, Search } from "lucide-react";
import { usePulseCopy } from "@/lib/pulse-copy";
import type { UsageDiagnostics } from "@/lib/api";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";

type Paths = { data: string; logs: string; profile: string; temporary: string; exports: string };
export function PulseSourceSettings({diagnostics,onChoose,onDetect,busy}:{diagnostics?:UsageDiagnostics|null;onChoose?:()=>void;onDetect?:()=>void;busy:boolean}) {
  const copy=usePulseCopy();
  const {t}=useTranslation();
  const [paths,setPaths]=useState<Paths|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    if(isTauri()) void invoke<Paths>("get_pulse_paths").then(value=>{if(active)setPaths(value);}).catch(cause=>{if(active)setError(String(cause));});
    return ()=>{active=false;};
  },[]);
  return <section className="pulse-settings-section" aria-labelledby="pulse-source-title">
    <header><h2 id="pulse-source-title">{copy("source")}</h2></header>
    <div className="pulse-setting-row"><div><strong>{copy("dataDir")}</strong><p className="pulse-source-path">{paths?.data ?? copy("unknown")}</p></div><Button variant="secondary" size="sm" onClick={()=>{if(isTauri())void invoke("open_pulse_data_dir").catch(cause=>setError(String(cause)));}}><FolderOpen size={15}/>{copy("dataDir")}</Button></div>
    <div className="pulse-setting-row"><div><strong>{copy("codexHome")}</strong><p className="pulse-source-path">{diagnostics?.codexHome ?? copy("unknown")}</p><p className="pulse-source-path">{diagnostics?.runtime}</p></div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onChoose} disabled={busy}><FolderOpen size={15}/>{copy("choose")}</Button><Button variant="secondary" size="sm" onClick={onDetect} disabled={busy}><Search size={15}/>{copy("detect")}</Button></div></div>
    {paths ? <details><summary className="pulse-text-button">{copy("logs")}</summary><dl className="pulse-path-details">{Object.entries(paths).map(([key,value])=><div key={key}><dt>{key}</dt><dd className="pulse-source-path">{value}</dd></div>)}</dl></details> : null}
    <p className="pulse-source-note">{t("ux.source_folder_hint")}</p>
    {error ? <p role="alert" className="pulse-error">{error}</p> : null}
  </section>;
}
