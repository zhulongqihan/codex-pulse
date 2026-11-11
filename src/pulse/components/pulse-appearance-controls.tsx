import { useState } from "react";
import { Check, Monitor, Moon, Sun, SlidersHorizontal } from "lucide-react";
import { usePulseCopy } from "@/lib/pulse-copy";
import { useTranslation } from "react-i18next";
import { integrationSettingsCopy } from "@/lib/integration-settings-copy";
import { updatePulsePreferences, usePulsePreferences, usePulsePreferencesError, type PulsePreferences } from "@/lib/pulse-appearance";

export function PulseStyleSwitcher() {
  const copy = usePulseCopy();
  const preferences = usePulsePreferences();
  return <div className="pulse-style-switch" role="group" aria-label={copy("skin")}>
    <SlidersHorizontal size={15} aria-hidden="true" />
    {(["clear", "meter"] as const).map((skinId) => <button key={skinId} type="button" aria-pressed={preferences.skinId === skinId} onClick={() => void updatePulsePreferences({ skinId })}>{copy(skinId)}</button>)}
  </div>;
}

export function PulseAppearanceSettings() {
  const copy = usePulseCopy();
  const { i18n } = useTranslation();
  const preferences = usePulsePreferences();
  const error = usePulsePreferencesError();
  const [saving, setSaving] = useState(false);
  const change = async (patch: Partial<PulsePreferences>) => {
    setSaving(true);
    await updatePulsePreferences(patch);
    setSaving(false);
  };
  return <section className="pulse-settings-section" aria-labelledby="pulse-appearance-title">
    <header><h2 id="pulse-appearance-title">{copy("appearance")}</h2><p>{copy("saved")}</p><p>{integrationSettingsCopy(i18n.resolvedLanguage ?? i18n.language, "appearanceNote")}</p></header>
    <div className="pulse-skin-options" role="group" aria-label={copy("skin")}>
      {(["clear", "meter"] as const).map((skinId) => <button key={skinId} type="button" className="pulse-skin-option" aria-pressed={preferences.skinId === skinId} onClick={() => void change({ skinId })}>
        <span className={`pulse-skin-preview pulse-preview-${skinId}`} aria-hidden="true"><span className="pulse-preview-nav"/><span className="pulse-preview-stat"/><span className="pulse-preview-chart"><i/><i/><i/><i/></span><span className="pulse-preview-list"><i/><i/><i/></span></span>
        <span>{copy(skinId)}</span><span className="pulse-option-state" aria-hidden="true">{preferences.skinId === skinId ? <Check size={15}/> : null}</span>
      </button>)}
    </div>
    <div className="pulse-setting-row"><span>{copy("theme")}</span><div className="pulse-segments" role="group" aria-label={copy("theme")}>
      {([{value: "light", Icon: Sun}, {value: "dark", Icon: Moon}, {value: "system", Icon: Monitor}] as const).map(({value, Icon}) => <button type="button" key={value} aria-pressed={preferences.theme === value} onClick={() => void change({ theme: value })}><Icon size={15} aria-hidden="true"/>{copy(value)}</button>)}
    </div></div>
    <div className="pulse-setting-row"><span>{copy("motion")}</span><div className="pulse-segments" role="group" aria-label={copy("motion")}>
      {(["off", "gentle", "full"] as const).map((value) => <button type="button" key={value} aria-pressed={preferences.motionLevel === value} onClick={() => void change({ motionLevel: value })}>{copy(value)}</button>)}
    </div></div>
    <label className="pulse-setting-row"><span>{copy("reduced")}</span><input type="checkbox" checked={preferences.respectReducedMotion} onChange={(event) => void change({ respectReducedMotion: event.target.checked })}/></label>
    <label className="pulse-setting-row"><span>{copy("compact")}</span><input type="checkbox" checked={preferences.compactMode} onChange={(event) => void change({ compactMode: event.target.checked })}/></label>
    <div aria-live="polite">{error ? <p className="pulse-error" role="alert">{copy("saveError")}: {error}</p> : null}{saving ? <span className="sr-only">…</span> : null}</div>
  </section>;
}

export function PulseWidgetSettings() {
  const copy = usePulseCopy();
  const preferences = usePulsePreferences();
  return <section className="pulse-settings-section" aria-labelledby="pulse-widget-title">
    <header><h2 id="pulse-widget-title">{copy("widget")}</h2></header>
    <label className="pulse-setting-row"><span>{copy("visible")}</span><input type="checkbox" checked={preferences.widgetVisible} onChange={(event) => void updatePulsePreferences({ widgetVisible: event.target.checked })}/></label>
    <label className="pulse-setting-row"><span>{copy("pin")}</span><input type="checkbox" checked={preferences.widgetAlwaysOnTop} onChange={(event) => void updatePulsePreferences({ widgetAlwaysOnTop: event.target.checked })}/></label>
    <label className="pulse-setting-row"><span>{copy("expand")}</span><input type="checkbox" checked={preferences.widgetExpanded} onChange={(event) => void updatePulsePreferences({ widgetExpanded: event.target.checked })}/></label>
  </section>;
}
