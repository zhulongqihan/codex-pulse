import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { PulseUsageGuide } from "./pulse-usage-guide";
import { openUrl } from "@/lib/api";
import { usePulsePreferences } from "@/lib/pulse-appearance";
import { getLanguage } from "@/lib/languages";
import { feedbackCopy } from "@/lib/feedback-copy";
import { buildFeedbackSummary, feedbackAreas, feedbackStages, feedbackUrl } from "@/lib/feedback";
import { version } from "../../../package.json";
import "./pulse-feedback.css";

export function PulseFeedback() {
  const { i18n } = useTranslation();
  const language = getLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = feedbackCopy(language);
  const { skinId, theme } = usePulsePreferences();
  const [stage, setStage] = useState<string>("notSpecified");
  const [area, setArea] = useState<string>("notSpecified");
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const [copiedSummary, setCopiedSummary] = useState<string | null>(null);
  const [openState, setOpenState] = useState<"idle" | "opening" | "failed">("idle");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const summary = buildFeedbackSummary({ version, language, skin: skinId, theme, stage, area });
  const open = async (kind: "discussion" | "bug" | "guide" | "trust") => {
    const url = feedbackUrl(kind, language, version);
    setOpenState("opening");
    setFailedUrl(null);
    try { await openUrl(url); setOpenState("idle"); }
    catch { setFailedUrl(url); setOpenState("failed"); }
  };
  const copySummary = async () => {
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(summary);
      setCopiedSummary(summary);
      setCopyState("copied");
    } catch { setCopyState("failed"); }
  };
  return <div className="pulse-feedback" data-testid="pulse-feedback">
    <header><h2>{copy.title}</h2><p>{copy.intro}</p></header>
    <div className="pulse-feedback-links">
      <Button type="button" onClick={() => void open("discussion")} disabled={openState === "opening"}>{copy.share}<ExternalLink size={15} aria-hidden="true"/></Button>
      <Button type="button" variant="secondary" onClick={() => void open("bug")} disabled={openState === "opening"}>{copy.bug}<ExternalLink size={15} aria-hidden="true"/></Button>
      <Button type="button" variant="ghost" onClick={() => void open("guide")} disabled={openState === "opening"}>{copy.readGuide}<ExternalLink size={15} aria-hidden="true"/></Button>
      <Button type="button" variant="ghost" onClick={() => void open("trust")} disabled={openState === "opening"}>{copy.trust}<ExternalLink size={15} aria-hidden="true"/></Button>
    </div>
    <p className="pulse-feedback-note">{copy.destination}</p>
    {openState === "opening" ? <p role="status">{copy.opening}</p> : null}
    {openState === "failed" ? <div role="alert" className="pulse-feedback-open-error"><p>{copy.openFailed}</p><code>{failedUrl}</code></div> : null}
    <details className="pulse-feedback-guide"><summary>{copy.guide}</summary><PulseUsageGuide/></details>
    <section className="pulse-feedback-context" aria-labelledby="feedback-context-title">
      <h3 id="feedback-context-title">{copy.summaryTitle}</h3><p id="feedback-context-description">{copy.summaryDescription}</p>
      <div className="pulse-feedback-fields">
        <label><span>{copy.stage}</span><select value={stage} onChange={event => { setStage(event.target.value); setCopyState("idle"); }}>{feedbackStages.map((value, index) => <option key={value} value={value}>{copy.stageOptions[index]}</option>)}</select></label>
        <label><span>{copy.area}</span><select value={area} onChange={event => { setArea(event.target.value); setCopyState("idle"); }}>{feedbackAreas.map((value, index) => <option key={value} value={value}>{copy.areaOptions[index]}</option>)}</select></label>
      </div>
      <label className="pulse-feedback-preview"><span>{copy.preview}</span><textarea readOnly value={summary} rows={8} aria-describedby="feedback-context-description" spellCheck={false}/></label>
      <Button type="button" variant="secondary" onClick={() => void copySummary()} disabled={copyState === "copying"}><Copy size={15} aria-hidden="true"/>{copy.copy}</Button>
      {copyState === "copied" && copiedSummary === summary ? <p role="status">{copy.copied}</p> : null}
      {copyState === "failed" ? <p role="alert" className="pulse-error">{copy.copyFailed}</p> : null}
    </section>
  </div>;
}
