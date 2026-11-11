import { useTranslation } from "react-i18next";
import { closeBehaviorCopy } from "@/lib/close-behavior-copy";
import { readingGuidanceCopy } from "@/lib/reading-guidance-copy";
import "./pulse-usage-guide.css";

/** Optional, contextual instructions. Mounting never requests data or changes preferences. */
export function PulseUsageGuide() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof readingGuidanceCopy>[1]) => readingGuidanceCopy(language, key);
  const close = (key: Parameters<typeof closeBehaviorCopy>[1]) => closeBehaviorCopy(language, key, { quit: t("settings.menu_bar_quit") });
  return <div className="pulse-usage-guide" data-testid="usage-guide">
    <details data-testid="help-readings"><summary>{copy("numbers")}</summary>
      <dl>{(["local", "account", "cost"] as const).map(key => <div key={key}><dt>{copy(key)}</dt><dd>{copy(`${key}Meaning`)}</dd></div>)}</dl>
      <p>{copy("views")}</p>
    </details>
    <details data-testid="help-recovery"><summary>{copy("recovery")}</summary>
      <p>{copy("localRecovery")}</p><p>{copy("accountRecovery")}</p><p>{copy("failedRecovery")}</p><p>{copy("modelMissing")}</p>
    </details>
    <details data-testid="help-windows"><summary>{copy("windows")}</summary>
      <p>{copy("widgetUsage")}</p>
      <dl>{(["main", "widget", "corner", "quit"] as const).map(key => <div key={key}><dt>{close(`${key}Title`)}</dt><dd>{close(key)}</dd></div>)}</dl>
      <p>{close("tray")}</p>
    </details>
  </div>;
}
