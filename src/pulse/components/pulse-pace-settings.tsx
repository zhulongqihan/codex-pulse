import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePulsePreferences, updatePulsePreferences, usePulsePreferencesError } from "@/lib/pulse-appearance";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { getLanguage, type Language } from "@/lib/languages";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PulseBrandMark } from "./pulse-brand-mark";

type DisplayReason = "loading" | "browser" | "unavailable" | "unsupported" | "disabled" | "no_codex_window" | "host_inactive" | "window_too_small" | "window_unavailable" | "ready";
type TitlebarStatus = { enabled: boolean; supported: boolean; hostFound: boolean; badgeVisible: boolean; reason: string };
const statusMessages: Record<Language, Record<DisplayReason, string>> = {
  zh: { loading: "正在检查显示状态…", browser: "合成演示不会连接本机 Codex 客户端。", unavailable: "暂时无法读取显示状态，请重新打开设置。", unsupported: "当前系统暂不支持标题栏提示。", disabled: "右上角提示已关闭。", no_codex_window: "请打开 Windows 商店版 Codex 客户端。", host_inactive: "切换到 Codex 窗口后显示。", window_too_small: "请扩大 Codex 窗口，为提示留出空间。", window_unavailable: "提示窗口暂不可用，请重启 Pulse。", ready: "提示已显示在 Codex 右上角。" },
  "zh-Hant": { loading: "正在檢查顯示狀態…", browser: "合成示範不會連接本機 Codex 用戶端。", unavailable: "暫時無法讀取顯示狀態，請重新開啟設定。", unsupported: "目前系統暫不支援標題列提示。", disabled: "右上角提示已關閉。", no_codex_window: "請開啟 Windows 商店版 Codex 用戶端。", host_inactive: "切換至 Codex 視窗後顯示。", window_too_small: "請放大 Codex 視窗，為提示保留空間。", window_unavailable: "提示視窗暫不可用，請重新啟動 Pulse。", ready: "提示已顯示於 Codex 右上角。" },
  en: { loading: "Checking display status…", browser: "The synthetic demo does not connect to a local Codex client.", unavailable: "Display status is unavailable. Reopen settings to retry.", unsupported: "This system does not support the title-bar companion yet.", disabled: "The title-bar companion is off.", no_codex_window: "Open the Microsoft Store edition of Codex for Windows.", host_inactive: "Switch to the Codex window to see the companion.", window_too_small: "Enlarge the Codex window to make room for the companion.", window_unavailable: "The companion window is unavailable. Restart Pulse.", ready: "The companion is visible at the top right of Codex." },
  ja: { loading: "表示状態を確認中…", browser: "合成デモはローカルの Codex に接続しません。", unavailable: "表示状態を取得できません。設定を開き直してください。", unsupported: "このシステムはタイトルバー表示にまだ対応していません。", disabled: "右上のヒントはオフです。", no_codex_window: "Windows の Microsoft Store 版 Codex を開いてください。", host_inactive: "Codex ウィンドウに切り替えると表示されます。", window_too_small: "Codex ウィンドウを広げて表示場所を確保してください。", window_unavailable: "表示ウィンドウを利用できません。Pulse を再起動してください。", ready: "Codex の右上に表示されています。" },
  ko: { loading: "표시 상태 확인 중…", browser: "합성 데모는 로컬 Codex 클라이언트에 연결하지 않습니다.", unavailable: "표시 상태를 읽지 못했습니다. 설정을 다시 여세요.", unsupported: "현재 시스템은 제목 표시줄 도우미를 지원하지 않습니다.", disabled: "오른쪽 위 표시가 꺼져 있습니다.", no_codex_window: "Windows용 Microsoft Store 버전 Codex를 여세요.", host_inactive: "Codex 창으로 전환하면 표시됩니다.", window_too_small: "Codex 창을 넓혀 표시 공간을 확보하세요.", window_unavailable: "도우미 창을 사용할 수 없습니다. Pulse를 다시 시작하세요.", ready: "Codex 오른쪽 위에 도우미가 표시됩니다." },
  de: { loading: "Anzeigestatus wird geprüft…", browser: "Die synthetische Demo verbindet sich nicht mit dem lokalen Codex-Client.", unavailable: "Anzeigestatus nicht verfügbar. Einstellungen erneut öffnen.", unsupported: "Dieses System unterstützt den Titelleistenbegleiter noch nicht.", disabled: "Der Titelleistenbegleiter ist ausgeschaltet.", no_codex_window: "Die Microsoft-Store-Version von Codex für Windows öffnen.", host_inactive: "Zum Codex-Fenster wechseln, um den Begleiter zu sehen.", window_too_small: "Das Codex-Fenster für den Begleiter vergrößern.", window_unavailable: "Begleiterfenster nicht verfügbar. Pulse neu starten.", ready: "Der Begleiter wird oben rechts in Codex angezeigt." },
};

export function PulsePaceSettings({ onManageStartup, manageStartupDisabled = false }: { onManageStartup?: () => void; manageStartupDisabled?: boolean } = {}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = (key: Parameters<typeof paceCopy>[1]) => paceCopy(language, key);
  const preferences = usePulsePreferences();
  const error = usePulsePreferencesError();
  const [displayReason, setDisplayReason] = useState<DisplayReason>("loading");
  useEffect(() => {
    if (!isTauri() || new URLSearchParams(location.search).get("demo") === "1") { setDisplayReason("browser"); return; }
    let active = true;
    let eventRevision = 0;
    let unlisten: (() => void) | undefined;
    const accept = (status: TitlebarStatus) => {
      if (!active) return;
      const reason = !status.supported ? "unsupported" : !status.enabled ? "disabled" : status.reason;
      setDisplayReason(Object.hasOwn(statusMessages.en, reason) ? reason as DisplayReason : "unavailable");
    };
    void (async () => {
      try {
        const cleanup = await listen<TitlebarStatus>("titlebar-status", ({ payload }) => { eventRevision += 1; accept(payload); });
        if (!active) { cleanup(); return; }
        unlisten = cleanup;
      } catch { /* A one-time status read still works if the event channel is unavailable. */ }
      const revision = eventRevision;
      try { const status = await invoke<TitlebarStatus>("get_titlebar_status"); if (revision === eventRevision) accept(status); }
      catch { if (active && revision === eventRevision) setDisplayReason("unavailable"); }
    })();
    return () => { active = false; unlisten?.(); };
  }, []);
  const statusReason = preferences.titlebarEnabled ? displayReason : "disabled";
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><PulseBrandMark size={22}/>{copy("settingTitle")}</CardTitle><CardDescription>{copy("settingDescription")}</CardDescription></CardHeader><CardContent>
    <div className="flex items-center justify-between gap-5 border-t border-border pt-5"><div className="space-y-1"><p className="text-sm font-medium" id="pace-setting-label">{copy("settingLabel")}</p><p className="text-xs leading-relaxed text-muted-foreground" id="pace-setting-note">{copy("settingNote")}</p></div><button type="button" role="switch" aria-checked={preferences.titlebarEnabled} aria-labelledby="pace-setting-label" aria-describedby="pace-setting-note" onClick={() => void updatePulsePreferences({ titlebarEnabled: !preferences.titlebarEnabled })} className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-ring ${preferences.titlebarEnabled ? "border-primary bg-primary" : "border-border bg-muted"}`} data-testid="titlebar-enabled"><span className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${preferences.titlebarEnabled ? "translate-x-5" : "translate-x-0"}`} aria-hidden="true"/></button></div>
    <p role="status" className="mt-3 text-xs leading-relaxed text-muted-foreground" data-testid="titlebar-display-status">{statusMessages[getLanguage(language)][statusReason]}</p>
    {onManageStartup ? <button type="button" disabled={manageStartupDisabled} onClick={onManageStartup} className="mt-3 text-xs font-medium text-primary underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50">{copy("manageStartup")}</button> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-error">{copy("saveFailed")}</p> : null}
  </CardContent></Card>;
}
