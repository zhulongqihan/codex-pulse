import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpRight } from "lucide-react";
import { getLanguage } from "@/lib/languages";
import { integrationSettingsCopy } from "@/lib/integration-settings-copy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

const messages = {
  zh: { title: "Codex 客户端快捷入口", description: "在 Codex 侧栏查看额度和今日用量，随时打开 Pulse。", action: "添加到 Codex", busy: "正在准备…", detail: "打开插件页后选择安装，再将 Pulse 固定到侧栏。入口位置由客户端决定。", opened: "已请求打开 Codex 插件页。请完成安装并固定侧栏入口。", error: "无法打开插件页。请确认已安装支持本地插件的 Codex 桌面客户端。", browser: "请在 Pulse 桌面版中添加快捷入口。", privacy: "只读取本机用量快照；保持 Pulse 运行可持续更新。" },
  "zh-Hant": { title: "Codex 用戶端快捷入口", description: "在 Codex 側欄查看額度與今日用量，隨時開啟 Pulse。", action: "新增至 Codex", busy: "正在準備…", detail: "在外掛頁選擇安裝，再將 Pulse 固定至側欄。入口位置由用戶端決定。", opened: "已要求開啟 Codex 外掛頁。請完成安裝並固定側欄入口。", error: "無法開啟外掛頁。請確認已安裝支援本機外掛的 Codex 桌面版。", browser: "請在 Pulse 桌面版新增快捷入口。", privacy: "僅讀取本機用量快照；保持 Pulse 執行以持續更新。" },
  en: { title: "Codex desktop shortcut", description: "View quota and today’s usage in the Codex sidebar, and open Pulse at any time.", action: "Add to Codex", busy: "Preparing…", detail: "Install on the plugin page, then pin Pulse to the sidebar. The client controls the entry’s position.", opened: "Requested the Codex plugin page. Complete installation and pin the sidebar entry.", error: "Could not open the plugin page. Check that a Codex desktop client with local plugin support is installed.", browser: "Add the shortcut from the Pulse desktop app.", privacy: "Reads only a local usage snapshot. Keep Pulse running for updates." },
  ja: { title: "Codex デスクトップへのショートカット", description: "Codex のサイドバーで上限と今日の使用量を確認し、Pulse を開けます。", action: "Codex に追加", busy: "準備中…", detail: "プラグイン画面でインストールし、Pulse をサイドバーに固定してください。表示位置はクライアントが決めます。", opened: "Codex のプラグイン画面を要求しました。インストール後にサイドバーへ固定してください。", error: "プラグイン画面を開けません。ローカルプラグイン対応の Codex デスクトップを確認してください。", browser: "Pulse デスクトップ版から追加してください。", privacy: "ローカルの使用量スナップショットのみ読み取ります。更新には Pulse を起動しておいてください。" },
  ko: { title: "Codex 데스크톱 바로 가기", description: "Codex 사이드바에서 한도와 오늘 사용량을 보고 Pulse를 여세요.", action: "Codex에 추가", busy: "준비 중…", detail: "플러그인 페이지에서 설치한 뒤 Pulse를 사이드바에 고정하세요. 위치는 클라이언트가 결정합니다.", opened: "Codex 플러그인 페이지를 요청했습니다. 설치 후 사이드바에 고정하세요.", error: "플러그인 페이지를 열 수 없습니다. 로컬 플러그인을 지원하는 Codex 데스크톱을 확인하세요.", browser: "Pulse 데스크톱 앱에서 추가하세요.", privacy: "로컬 사용량 스냅샷만 읽습니다. 업데이트하려면 Pulse를 실행해 두세요." },
  de: { title: "Verknüpfung in Codex", description: "Kontingent und heutige Nutzung in der Codex-Seitenleiste anzeigen und Pulse öffnen.", action: "Zu Codex hinzufügen", busy: "Wird vorbereitet…", detail: "Auf der Plugin-Seite installieren und Pulse an die Seitenleiste anheften. Die Position bestimmt der Client.", opened: "Codex-Plugin-Seite angefordert. Installation abschließen und den Eintrag anheften.", error: "Plugin-Seite konnte nicht geöffnet werden. Ein Codex-Desktop-Client mit lokalen Plugins ist erforderlich.", browser: "Die Verknüpfung in der Pulse-Desktop-App hinzufügen.", privacy: "Liest nur einen lokalen Nutzungsschnappschuss. Pulse für Aktualisierungen geöffnet lassen." },
};

export function PulseCodexIntegration() {
  const { i18n } = useTranslation();
  const text = messages[getLanguage(i18n.resolvedLanguage ?? i18n.language)];
  const copy = (key: Parameters<typeof integrationSettingsCopy>[1]) => integrationSettingsCopy(i18n.resolvedLanguage ?? i18n.language, key);
  const [state, setState] = useState<"idle" | "busy" | "opened" | "error" | "browser">("idle");
  const pending = useRef(false);
  async function add() {
    if (pending.current) return;
    if (!("__TAURI_INTERNALS__" in window) || new URLSearchParams(location.search).get("demo") === "1") { setState("browser"); return; }
    pending.current = true;
    setState("busy");
    try { await invoke("prepare_codex_integration"); setState("opened"); }
    catch { setState("error"); }
    finally { pending.current = false; }
  }
  return <Card>
    <CardHeader><CardTitle>{text.title}</CardTitle><CardDescription>{copy("description")}</CardDescription></CardHeader>
    <CardContent>
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 text-sm text-muted-foreground"><p>{text.detail}</p><p className="text-xs">{text.privacy}</p></div>
        <Button size="sm" variant="secondary" className="h-auto min-h-8 max-w-full whitespace-normal sm:shrink-0" disabled={state === "busy"} onClick={() => void add()} data-testid="add-to-codex"><ArrowUpRight size={15}/>{state === "busy" ? text.busy : text.action}</Button>
      </div>
      <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground" data-testid="codex-panel-follow-rules"><p>{copy("following")}</p><p>{copy("refresh")}</p><p>{copy("host")}</p></div>
      {state !== "idle" && state !== "busy" ? <p role="status" className={`mt-3 text-sm ${state === "error" ? "text-error" : "text-muted-foreground"}`}>{text[state]}</p> : null}
    </CardContent>
  </Card>;
}
