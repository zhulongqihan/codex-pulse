import { useTranslation } from "react-i18next";
import { closeBehaviorCopy } from "@/lib/close-behavior-copy";

/** Explains existing native close/tray actions; it never changes window state. */
export function CloseBehaviorNote() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof closeBehaviorCopy>[1]) => closeBehaviorCopy(language, key, { quit: t("settings.menu_bar_quit") });
  return <section role="note" aria-label={copy("heading")} data-testid="close-behavior-note" className="space-y-3 text-sm">
    <h4 className="font-medium text-foreground">{copy("heading")}</h4>
    <dl className="space-y-3 text-xs leading-relaxed">
      {(["main", "widget", "corner", "quit"] as const).map(key => <div key={key} className="space-y-1">
        <dt className="font-medium text-foreground">{copy(`${key}Title`)}</dt>
        <dd className="text-muted-foreground">{copy(key)}</dd>
      </div>)}
    </dl>
    <p className="text-xs leading-relaxed text-muted-foreground">{copy("tray")}</p>
  </section>;
}
