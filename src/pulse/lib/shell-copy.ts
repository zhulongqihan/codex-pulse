import { useTranslation } from "react-i18next";
import { getLanguage, type Language } from "./languages";

const en = {
  analysis: "Usage analysis",
  paceDetails: "Current cycle pacing and observations",
  account: "Account capacity", closeAccount: "Close account capacity", remaining: "remaining",
  widget: "Open widget", widgetVisible: "Widget is on", widgetBusy: "Opening…", widgetError: "Could not open the widget",
  help: "Getting started", helpTitle: "Ready to use Pulse", helpDescription: "Home shows remaining capacity, resets, pacing and today's reference cost. Open Usage analysis for history, or Account capacity for account and reset details. The desktop widget keeps capacity within reach.",
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
    analysis: "用量分析",
    paceDetails: "本轮配速与观测依据",
    account: "账号额度", closeAccount: "关闭账号额度", remaining: "剩余", widget: "打开悬浮窗", widgetVisible: "悬浮窗已开启", widgetBusy: "正在打开…", widgetError: "无法打开悬浮窗",
    help: "使用帮助", helpTitle: "开始使用 Pulse", helpDescription: "首页查看额度余量、重置时间、配速和今日参考成本；历史统计在用量分析中，账号与重置详情在账号额度面板中。打开桌面悬浮窗可随时掌握额度。", local: "本机记录", localReady: "记录可用", localPending: "等待记录", accountReady: "账号已连接", accountPending: "账号待确认",
    source: "查看数据来源", showAccount: "查看账号额度", showToday: "查看今日会话", setupWidget: "在桌面显示额度", shortcuts: "创建快捷方式", shortcutsBusy: "正在创建…", shortcutsDone: "桌面和开始菜单快捷方式已创建。", shortcutsError: "无法创建快捷方式", dismiss: "已了解", previewNote: "此操作需要桌面版。浏览器演示不会创建窗口或文件。",
    tray: "托盘与悬浮窗", trayTitle: "系统托盘", trayDescription: "选择 Windows 托盘悬停提示和托盘信息板中显示的数据。", trayValues: "托盘悬停提示", formatTitle: "重置倒计时", formatDescription: "设置托盘悬停提示和信息板中倒计时使用的单位。", longWindow: "长期窗口", loginHint: "账号额度使用已有的 Codex 登录；如需登录，请在官方 Codex 中完成。Pulse 不会索取密码。",
  },
  "zh-Hant": {
    analysis: "用量分析",
    paceDetails: "本輪配速與觀測依據",
    account: "帳號額度", closeAccount: "關閉帳號額度", remaining: "剩餘", widget: "開啟浮動視窗", widgetVisible: "浮動視窗已開啟", widgetBusy: "正在開啟…", widgetError: "無法開啟浮動視窗", help: "使用說明", helpTitle: "開始使用 Pulse", helpDescription: "首頁查看額度餘量、重設時間、配速與今日參考成本；歷史統計在用量分析中，帳號與重設詳情在帳號額度面板中。開啟桌面浮動視窗可隨時掌握額度。", local: "本機記錄", localReady: "記錄可用", localPending: "等待記錄", accountReady: "帳號已連線", accountPending: "帳號待確認", source: "查看資料來源", showAccount: "查看帳號額度", showToday: "查看今日對話", setupWidget: "在桌面顯示額度", shortcuts: "建立捷徑", shortcutsBusy: "正在建立…", shortcutsDone: "桌面與開始功能表捷徑已建立。", shortcutsError: "無法建立捷徑", dismiss: "已了解", previewNote: "此操作需要桌面版。瀏覽器示範不會建立視窗或檔案。", tray: "系統匣與浮動視窗", trayTitle: "系統匣", trayDescription: "選擇 Windows 系統匣提示及資訊面板中顯示的資料。", trayValues: "系統匣提示", formatTitle: "重設倒數", formatDescription: "設定系統匣提示及資訊面板中倒數使用的單位。", longWindow: "長期視窗", loginHint: "帳號額度使用現有的 Codex 登入；請在官方 Codex 完成登入。Pulse 不會索取密碼。",
  },
  ja: {
    analysis: "使用量分析",
    paceDetails: "現在の期間のペースと観測根拠",
    account: "アカウント上限", closeAccount: "上限パネルを閉じる", remaining: "残り", widget: "ウィジェットを開く", widgetVisible: "ウィジェット表示中", widgetBusy: "開いています…", widgetError: "ウィジェットを開けません", help: "使い方", helpTitle: "Pulse を使い始める", helpDescription: "ホームで残り上限、リセット時刻、ペースと今日の参考費用を確認できます。履歴は使用量分析、アカウントとリセットの詳細は上限パネルにあります。ウィジェットでも上限を確認できます。", local: "ローカル記録", localReady: "記録を利用できます", localPending: "記録を待っています", accountReady: "アカウント接続済み", accountPending: "アカウント未確認", source: "データ元を確認", showAccount: "上限を表示", showToday: "今日のセッション", setupWidget: "上限をデスクトップに表示", shortcuts: "ショートカットを作成", shortcutsBusy: "作成中…", shortcutsDone: "デスクトップとスタートメニューに作成しました。", shortcutsError: "ショートカットを作成できません", dismiss: "わかりました", previewNote: "デスクトップ版で利用できます。ブラウザーデモはウィンドウやファイルを作成しません。", tray: "トレイとウィジェット", trayTitle: "システムトレイ", trayDescription: "Windows のトレイヒントとパネルに表示する値を選びます。", trayValues: "トレイヒントの値", formatTitle: "リセットまでの時間", formatDescription: "トレイヒントとパネルのカウントダウン単位を設定します。", longWindow: "長期ウィンドウ", loginHint: "既存の Codex ログインを使用します。必要なら公式 Codex でログインしてください。Pulse はパスワードを要求しません。",
  },
  ko: {
    analysis: "사용량 분석",
    paceDetails: "현재 기간의 사용 속도 및 관측 근거",
    account: "계정 한도", closeAccount: "계정 한도 닫기", remaining: "남음", widget: "위젯 열기", widgetVisible: "위젯 표시 중", widgetBusy: "여는 중…", widgetError: "위젯을 열 수 없습니다", help: "사용 안내", helpTitle: "Pulse 시작하기", helpDescription: "홈에서 남은 한도, 재설정 시간, 사용 속도와 오늘의 참고 비용을 확인하세요. 기록은 사용량 분석에, 계정 및 재설정 상세 정보는 계정 한도 패널에 있습니다. 위젯으로도 한도를 확인할 수 있습니다.", local: "로컬 기록", localReady: "기록 사용 가능", localPending: "기록 대기 중", accountReady: "계정 연결됨", accountPending: "계정 확인 필요", source: "데이터 소스 확인", showAccount: "계정 한도 보기", showToday: "오늘 세션 보기", setupWidget: "바탕 화면에 한도 표시", shortcuts: "바로 가기 만들기", shortcutsBusy: "만드는 중…", shortcutsDone: "바탕 화면 및 시작 메뉴 바로 가기를 만들었습니다.", shortcutsError: "바로 가기를 만들 수 없습니다", dismiss: "확인했습니다", previewNote: "데스크톱 앱에서 사용할 수 있습니다. 브라우저 데모는 창이나 파일을 만들지 않습니다.", tray: "트레이 및 위젯", trayTitle: "시스템 트레이", trayDescription: "Windows 트레이 도구 설명 및 패널에 표시할 값을 선택하세요.", trayValues: "트레이 도구 설명 값", formatTitle: "재설정 카운트다운", formatDescription: "트레이 도구 설명 및 패널의 카운트다운 단위를 설정하세요.", longWindow: "장기 창", loginHint: "기존 Codex 로그인을 사용합니다. 필요한 경우 공식 Codex에서 로그인하세요. Pulse는 비밀번호를 요청하지 않습니다.",
  },
  de: {
    analysis: "Nutzungsanalyse",
    paceDetails: "Tempo und Beobachtungsgrundlage des aktuellen Zeitfensters",
    account: "Kontingent", closeAccount: "Kontingent schließen", remaining: "verbleibend", widget: "Widget öffnen", widgetVisible: "Widget aktiv", widgetBusy: "Wird geöffnet…", widgetError: "Widget konnte nicht geöffnet werden", help: "Starthilfe", helpTitle: "Mit Pulse beginnen", helpDescription: "Die Startseite zeigt Restkontingent, Reset, Tempo und heutige Referenzkosten. Verlauf und Auswertungen stehen in der Nutzungsanalyse, Konto- und Resetdetails im Kontingent-Panel. Das Desktop-Widget hält das Kontingent sichtbar.", local: "Lokale Aufzeichnungen", localReady: "Aufzeichnungen verfügbar", localPending: "Aufzeichnungen ausstehend", accountReady: "Konto verbunden", accountPending: "Konto noch nicht bestätigt", source: "Datenquelle prüfen", showAccount: "Kontingent anzeigen", showToday: "Heutige Sitzungen", setupWidget: "Kontingent auf dem Desktop", shortcuts: "Verknüpfungen erstellen", shortcutsBusy: "Wird erstellt…", shortcutsDone: "Desktop- und Startmenü-Verknüpfungen wurden erstellt.", shortcutsError: "Verknüpfungen konnten nicht erstellt werden", dismiss: "Verstanden", previewNote: "Diese Aktion erfordert die Desktop-App. Die Browser-Demo erstellt keine Fenster oder Dateien.", tray: "Infobereich & Widget", trayTitle: "Windows-Infobereich", trayDescription: "Werte für den Windows-Tooltip und das Infobereich-Panel auswählen.", trayValues: "Werte im Tooltip", formatTitle: "Countdown bis zum Reset", formatDescription: "Einheiten des Countdowns in Tooltip und Panel festlegen.", longWindow: "Langfristiges Fenster", loginHint: "Pulse verwendet die vorhandene Codex-Anmeldung. Bei Bedarf in der offiziellen Codex-App anmelden. Pulse fragt nicht nach dem Passwort.",
  },
};

export function useShellCopy() {
  const { i18n } = useTranslation();
  const language = getLanguage(i18n.resolvedLanguage ?? i18n.language);
  return (key: ShellCopyKey) => messages[language][key];
}
