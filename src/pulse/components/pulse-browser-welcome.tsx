import { ArrowRight, Download, Monitor, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PulseStyleSwitcher } from "./pulse-appearance-controls";
import { usePulseCopy } from "@/lib/pulse-copy";

const messages = {
  zh: ["看清用量，继续专注。", "Codex Pulse 将本机 Token、账号额度和会话记录放在同一工作台。", "浏览器只展示合成数据，不读取本机日志或账号。安装桌面版后，可查看你自己的记录。", "进入合成演示", "查看发布版本", "完整会话回放", "清爽 / 刻度双风格", "独立桌面悬浮窗"],
  "zh-Hant": ["看清用量，繼續專注。", "Codex Pulse 將本機 Token、帳號額度和對話記錄放在同一工作台。", "瀏覽器只展示合成資料，不讀取本機日誌或帳號。安裝桌面版後，可查看自己的記錄。", "開啟合成示範", "查看發布版本", "完整對話回放", "清爽 / 刻度雙風格", "獨立桌面浮動視窗"],
  en: ["Understand your usage. Stay focused.", "Codex Pulse brings local tokens, account capacity and session history into one workspace.", "This browser preview uses synthetic data. It does not read your local logs or account. Install the desktop app to explore your own records.", "Open synthetic demo", "View releases", "Full session replay", "Clear / Meter styles", "Independent desktop widget"],
  ja: ["使用量を把握し、作業に集中。", "Codex Pulse はローカルトークン、アカウント上限、セッション履歴を一つの画面にまとめます。", "ブラウザーでは合成データのみを表示し、ローカルログやアカウントを読み取りません。自分の記録はデスクトップ版で確認できます。", "合成デモを開く", "リリースを見る", "セッションの再生", "クリア / メータースタイル", "独立したウィジェット"],
  ko: ["사용량을 파악하고, 작업에 집중하세요.", "Codex Pulse는 로컬 토큰, 계정 한도 및 세션 기록을 한 곳에 모읍니다.", "브라우저 미리보기는 합성 데이터를 사용하며 로컬 로그나 계정을 읽지 않습니다. 데스크톱 앱에서 자신의 기록을 확인하세요.", "합성 데모 열기", "출시 버전 보기", "전체 세션 재생", "클리어 / 미터 스타일", "독립 데스크톱 위젯"],
  de: ["Nutzung verstehen. Konzentriert bleiben.", "Codex Pulse vereint lokale Tokens, Kontingente und Sitzungsverläufe in einem Arbeitsbereich.", "Diese Browser-Vorschau zeigt synthetische Daten und liest weder lokale Protokolle noch Ihr Konto. Die Desktop-App zeigt Ihre eigenen Aufzeichnungen.", "Synthetische Demo öffnen", "Versionen ansehen", "Vollständige Sitzungswiedergabe", "Klar / Skala", "Eigenständiges Desktop-Widget"],
};

export function PulseBrowserWelcome() {
  const {i18n}=useTranslation();
  const copy=usePulseCopy();
  const language=i18n.resolvedLanguage ?? i18n.language;
  const content=messages[language as keyof typeof messages] ?? messages.en;
  const demo=new URL(location.href); demo.searchParams.set("demo","1"); demo.hash="";
  return <div className="pulse-browser-welcome">
    <header><div className="pulse-brand"><span className="pulse-brand-mark" aria-hidden="true"><i/><i/><i/></span><strong>Pulse</strong></div><PulseStyleSwitcher/></header>
    <main><h1>{content[0]}</h1><p>{content[1]}</p><div className="pulse-welcome-actions"><a className="pulse-demo-action" href={demo.href}>{content[3]}<ArrowRight size={17}/></a><a href="https://github.com/zhulongqihan/codex-pulse/releases" target="_blank" rel="noreferrer"><Download size={16}/>{content[4]}</a></div>
      <div className="pulse-welcome-features"><span>{content[5]}</span><span>{content[6]}</span><span>{content[7]}</span></div>
      <p className="pulse-welcome-privacy"><ShieldCheck size={20} aria-hidden="true"/>{content[2]}</p>
    </main><footer><Monitor size={15}/> Windows · {copy("sample")}</footer>
  </div>;
}
