import { useTranslation } from "react-i18next";
import { getLanguage, type Language } from "./languages";

const en = {
  account: "Account capacity", closeAccount: "Close account capacity", remaining: "remaining",
  widget: "Open widget", widgetVisible: "Widget is on", widgetBusy: "Opening…", widgetError: "Could not open the widget",
  help: "Getting started", helpTitle: "Ready to use Pulse", helpDescription: "See today's local usage at the top of Home and account capacity in its own panel. Open the desktop widget to keep capacity visible, or create shortcuts for next time.",
  local: "Local records", localReady: "Records available", localPending: "Waiting for records", accountReady: "Account connected", accountPending: "Account not confirmed",
  source: "Check data source", showAccount: "View account", showToday: "View today's sessions", setupWidget: "Show capacity on desktop",
  shortcuts: "Create shortcuts", shortcutsBusy: "Creating…", shortcutsDone: "Desktop and Start menu shortcuts are ready.", shortcutsError: "Could not create shortcuts",
  dismiss: "Got it", previewNote: "This action is available in the desktop app. The browser demo does not create windows or files.",
  tray: "Tray & widget", trayTitle: "System tray", trayDescription: "Choose the values shown in the Windows tray tooltip and tray panel.",
  trayValues: "Tray tooltip values", formatTitle: "Reset countdown", formatDescription: "Choose the units used in the tray tooltip and tray panel.", longWindow: "Long-term window",
  loginHint: "Account capacity uses your existing Codex sign-in. Sign in with the official Codex app if needed; Pulse does not ask for your password.",
} satisfies Record<string, string>;
export type ShellCopyKey = keyof typeof en;
const messages: Record<Language, Record<ShellCopyKey, string>> = {
  en,
  zh: {
    account: "账号额度", closeAccount: "关闭账号额度", remaining: "剩余", widget: "打开悬浮窗", widgetVisible: "悬浮窗已开启", widgetBusy: "正在打开…", widgetError: "无法打开悬浮窗",
    help: "使用帮助", helpTitle: "开始使用 Pulse", helpDescription: "首页上方查看今日本机用量，账号额度在独立面板中查看。打开桌面悬浮窗随时掌握额度，创建快捷方式方便下次启动。", local: "本机记录", localReady: "记录可用", localPending: "等待记录", accountReady: "账号已连接", accountPending: "账号待确认",
    source: "查看数据来源", showAccount: "查看账号额度", showToday: "查看今日会话", setupWidget: "在桌面显示额度", shortcuts: "创建快捷方式", shortcutsBusy: "正在创建…", shortcutsDone: "桌面和开始菜单快捷方式已创建。", shortcutsError: "无法创建快捷方式", dismiss: "已了解", previewNote: "此操作需要桌面版。浏览器演示不会创建窗口或文件。",
    tray: "托盘与悬浮窗", trayTitle: "系统托盘", trayDescription: "选择 Windows 托盘悬停提示和托盘信息板中显示的数据。", trayValues: "托盘悬停提示", formatTitle: "重置倒计时", formatDescription: "设置托盘悬停提示和信息板中倒计时使用的单位。", longWindow: "长期窗口", loginHint: "账号额度使用已有的 Codex 登录；如需登录，请在官方 Codex 中完成。Pulse 不会索取密码。",
  },
  "zh-Hant": {
    account: "帳號額度", closeAccount: "關閉帳號額度", remaining: "剩餘", widget: "開啟浮動視窗", widgetVisible: "浮動視窗已開啟", widgetBusy: "正在開啟…", widgetError: "無法開啟浮動視窗", help: "使用說明", helpTitle: "開始使用 Pulse", helpDescription: "首頁上方查看今日本機用量，帳號額度在獨立面板中查看。開啟桌面浮動視窗隨時掌握額度，建立捷徑方便下次啟動。", local: "本機記錄", localReady: "記錄可用", localPending: "等待記錄", accountReady: "帳號已連線", accountPending: "帳號待確認", source: "查看資料來源", showAccount: "查看帳號額度", showToday: "查看今日對話", setupWidget: "在桌面顯示額度", shortcuts: "建立捷徑", shortcutsBusy: "正在建立…", shortcutsDone: "桌面與開始功能表捷徑已建立。", shortcutsError: "無法建立捷徑", dismiss: "已了解", previewNote: "此操作需要桌面版。瀏覽器示範不會建立視窗或檔案。", tray: "系統匣與浮動視窗", trayTitle: "系統匣", trayDescription: "選擇 Windows 系統匣提示及資訊面板中顯示的資料。", trayValues: "系統匣提示", formatTitle: "重設倒數", formatDescription: "設定系統匣提示及資訊面板中倒數使用的單位。", longWindow: "長期視窗", loginHint: "帳號額度使用現有的 Codex 登入；請在官方 Codex 完成登入。Pulse 不會索取密碼。",
  },
  ja: {
    account: "アカウント上限", closeAccount: "上限パネルを閉じる", remaining: "残り", widget: "ウィジェットを開く", widgetVisible: "ウィジェット表示中", widgetBusy: "開いています…", widgetError: "ウィジェットを開けません", help: "使い方", helpTitle: "Pulse を使い始める", helpDescription: "ホーム上部で今日のローカル使用量、専用パネルでアカウント上限を確認できます。ウィジェットを開くとデスクトップで上限を確認でき、ショートカットから次回起動できます。", local: "ローカル記録", localReady: "記録を利用できます", localPending: "記録を待っています", accountReady: "アカウント接続済み", accountPending: "アカウント未確認", source: "データ元を確認", showAccount: "上限を表示", showToday: "今日のセッション", setupWidget: "上限をデスクトップに表示", shortcuts: "ショートカットを作成", shortcutsBusy: "作成中…", shortcutsDone: "デスクトップとスタートメニューに作成しました。", shortcutsError: "ショートカットを作成できません", dismiss: "わかりました", previewNote: "デスクトップ版で利用できます。ブラウザーデモはウィンドウやファイルを作成しません。", tray: "トレイとウィジェット", trayTitle: "システムトレイ", trayDescription: "Windows のトレイヒントとパネルに表示する値を選びます。", trayValues: "トレイヒントの値", formatTitle: "リセットまでの時間", formatDescription: "トレイヒントとパネルのカウントダウン単位を設定します。", longWindow: "長期ウィンドウ", loginHint: "既存の Codex ログインを使用します。必要なら公式 Codex でログインしてください。Pulse はパスワードを要求しません。",
  },
  ko: {
    account: "계정 한도", closeAccount: "계정 한도 닫기", remaining: "남음", widget: "위젯 열기", widgetVisible: "위젯 표시 중", widgetBusy: "여는 중…", widgetError: "위젯을 열 수 없습니다", help: "사용 안내", helpTitle: "Pulse 시작하기", helpDescription: "홈 상단에서 오늘의 로컬 사용량을, 별도 패널에서 계정 한도를 확인하세요. 위젯으로 한도를 바탕 화면에 표시하고 바로 가기로 다음에 쉽게 실행하세요.", local: "로컬 기록", localReady: "기록 사용 가능", localPending: "기록 대기 중", accountReady: "계정 연결됨", accountPending: "계정 확인 필요", source: "데이터 소스 확인", showAccount: "계정 한도 보기", showToday: "오늘 세션 보기", setupWidget: "바탕 화면에 한도 표시", shortcuts: "바로 가기 만들기", shortcutsBusy: "만드는 중…", shortcutsDone: "바탕 화면 및 시작 메뉴 바로 가기를 만들었습니다.", shortcutsError: "바로 가기를 만들 수 없습니다", dismiss: "확인했습니다", previewNote: "데스크톱 앱에서 사용할 수 있습니다. 브라우저 데모는 창이나 파일을 만들지 않습니다.", tray: "트레이 및 위젯", trayTitle: "시스템 트레이", trayDescription: "Windows 트레이 도구 설명 및 패널에 표시할 값을 선택하세요.", trayValues: "트레이 도구 설명 값", formatTitle: "재설정 카운트다운", formatDescription: "트레이 도구 설명 및 패널의 카운트다운 단위를 설정하세요.", longWindow: "장기 창", loginHint: "기존 Codex 로그인을 사용합니다. 필요한 경우 공식 Codex에서 로그인하세요. Pulse는 비밀번호를 요청하지 않습니다.",
  },
  de: {
    account: "Kontingent", closeAccount: "Kontingent schließen", remaining: "verbleibend", widget: "Widget öffnen", widgetVisible: "Widget aktiv", widgetBusy: "Wird geöffnet…", widgetError: "Widget konnte nicht geöffnet werden", help: "Starthilfe", helpTitle: "Mit Pulse beginnen", helpDescription: "Oben auf der Startseite steht die heutige lokale Nutzung, im eigenen Panel das Kontingent. Das Desktop-Widget hält es sichtbar; Verknüpfungen erleichtern den nächsten Start.", local: "Lokale Aufzeichnungen", localReady: "Aufzeichnungen verfügbar", localPending: "Aufzeichnungen ausstehend", accountReady: "Konto verbunden", accountPending: "Konto noch nicht bestätigt", source: "Datenquelle prüfen", showAccount: "Kontingent anzeigen", showToday: "Heutige Sitzungen", setupWidget: "Kontingent auf dem Desktop", shortcuts: "Verknüpfungen erstellen", shortcutsBusy: "Wird erstellt…", shortcutsDone: "Desktop- und Startmenü-Verknüpfungen wurden erstellt.", shortcutsError: "Verknüpfungen konnten nicht erstellt werden", dismiss: "Verstanden", previewNote: "Diese Aktion erfordert die Desktop-App. Die Browser-Demo erstellt keine Fenster oder Dateien.", tray: "Infobereich & Widget", trayTitle: "Windows-Infobereich", trayDescription: "Werte für den Windows-Tooltip und das Infobereich-Panel auswählen.", trayValues: "Werte im Tooltip", formatTitle: "Countdown bis zum Reset", formatDescription: "Einheiten des Countdowns in Tooltip und Panel festlegen.", longWindow: "Langfristiges Fenster", loginHint: "Pulse verwendet die vorhandene Codex-Anmeldung. Bei Bedarf in der offiziellen Codex-App anmelden. Pulse fragt nicht nach dem Passwort.",
  },
};

export function useShellCopy() {
  const { i18n } = useTranslation();
  const language = getLanguage(i18n.resolvedLanguage ?? i18n.language);
  return (key: ShellCopyKey) => messages[language][key];
}
