import { getLanguage, type Language } from "./languages";

const en = {
  title: "Help & feedback", intro: "Understand the readings, find setup instructions, or tell us about your experience.",
  guide: "Setup and reading help", readGuide: "Open the user guide", trust: "Download and data access", share: "Share an experience", bug: "Report a problem",
  destination: "These buttons open GitHub; posting needs a GitHub account. The bug form prefills only app version and Windows. The optional context and conversations are not attached.",
  summaryTitle: "Optional feedback context", summaryDescription: "Review before copying. Only the fields shown below are included; account details, readings, paths, conversations and logs are excluded. Add a specific experience yourself if you decide to post.",
  stage: "How far did you get?", area: "Which area?", preview: "Feedback context preview", copy: "Copy this context", copied: "Context copied. Review your message before posting it yourself.", copyFailed: "Copy failed. Select the preview text and copy it manually, or try again.", openFailed: "Could not open GitHub. Try again, or copy this address into your browser.", opening: "Opening GitHub…",
  stageOptions: ["Prefer not to say", "Only viewed the demo", "Downloaded", "Launched", "Used during work"],
  areaOptions: ["Not specified", "Download or setup", "Account quota", "Pacing", "Usage analysis", "Desktop widget", "Codex integration", "Other"],
};
type Copy = Omit<typeof en, "stageOptions" | "areaOptions"> & { stageOptions: readonly string[]; areaOptions: readonly string[] };
const messages: Record<Language, Copy> = {
  en,
  zh: {
    title: "帮助与反馈", intro: "了解读数、查找上手说明，或告诉我们你的实际使用体验。",
    guide: "上手与读数帮助", readGuide: "打开使用说明", trust: "下载与数据访问说明", share: "分享使用体验", bug: "报告问题",
    destination: "这些按钮会打开 GitHub，发言需要 GitHub 账号。问题表单仅预填软件版本和 Windows，不附带可选摘要或会话数据。",
    summaryTitle: "可选反馈摘要", summaryDescription: "复制前先检查。仅包含下方列出的字段，不包含账号、额度读数、路径、会话和日志。决定发帖时，再自行补充一个具体体验。",
    stage: "你使用到了哪一步？", area: "涉及哪个方面？", preview: "反馈摘要预览", copy: "复制这份摘要", copied: "摘要已复制。请检查自己的消息后再发布。", copyFailed: "复制失败。可选中预览文字手动复制，或重试。", openFailed: "无法打开 GitHub。请重试，或将下方地址复制到浏览器打开。", opening: "正在打开 GitHub…",
    stageOptions: ["暂不说明", "只看过演示", "已下载", "已启动", "已实际用于工作"],
    areaOptions: ["未指定", "下载或启动", "账号额度", "额度配速", "用量分析", "桌面浮窗", "Codex 入口", "其他"],
  },
  "zh-Hant": {
    title: "說明與回饋", intro: "瞭解讀數、尋找入門說明，或告訴我們你的實際使用體驗。",
    guide: "入門與讀數說明", readGuide: "開啟使用說明", trust: "下載與資料存取說明", share: "分享使用體驗", bug: "回報問題",
    destination: "這些按鈕會開啟 GitHub，發言需要 GitHub 帳號。問題表單僅預填軟體版本和 Windows，不附帶選填摘要或對話資料。",
    summaryTitle: "選填回饋摘要", summaryDescription: "複製前請先檢查。僅包含下方列出的欄位，不包含帳號、額度讀數、路徑、對話和日誌。決定發文時，再自行補充一個具體體驗。",
    stage: "你使用到了哪一步？", area: "涉及哪個方面？", preview: "回饋摘要預覽", copy: "複製這份摘要", copied: "摘要已複製。請檢查自己的訊息後再發佈。", copyFailed: "複製失敗。可選取預覽文字手動複製，或重試。", openFailed: "無法開啟 GitHub。請重試，或將下方網址複製到瀏覽器開啟。", opening: "正在開啟 GitHub…",
    stageOptions: ["暫不說明", "只看過示範", "已下載", "已啟動", "已實際用於工作"],
    areaOptions: ["未指定", "下載或啟動", "帳號額度", "額度配速", "用量分析", "桌面浮窗", "Codex 入口", "其他"],
  },
  ja: {
    title: "ヘルプとフィードバック", intro: "数値の意味や開始手順を確認し、実際の使用体験を共有できます。",
    guide: "開始手順と数値の説明", readGuide: "ユーザーガイドを開く", trust: "ダウンロードとデータアクセス", share: "使用体験を共有", bug: "問題を報告",
    destination: "ボタンは GitHub を開き、投稿にはアカウントが必要です。不具合フォームに入るのはアプリのバージョンと Windows のみで、任意の概要や会話は添付されません。",
    summaryTitle: "任意のフィードバック情報", summaryDescription: "コピー前に確認してください。下に表示された項目のみを含み、アカウント、上限の読数、パス、会話、ログは含みません。投稿する場合は、具体的な体験を自分で追加してください。",
    stage: "どこまで使用しましたか？", area: "該当する項目", preview: "フィードバック情報のプレビュー", copy: "この情報をコピー", copied: "コピーしました。内容を確認してから自分で投稿してください。", copyFailed: "コピーできませんでした。プレビューを選択して手動でコピーするか、再試行してください。", openFailed: "GitHub を開けませんでした。再試行するか、下のアドレスをブラウザーにコピーしてください。", opening: "GitHub を開いています…",
    stageOptions: ["回答しない", "デモのみ", "ダウンロード済み", "起動済み", "仕事で使用した"],
    areaOptions: ["指定なし", "ダウンロード・開始", "アカウント上限", "ペース", "使用量分析", "デスクトップウィジェット", "Codex 連携", "その他"],
  },
  ko: {
    title: "도움말 및 피드백", intro: "수치의 의미와 시작 방법을 확인하거나 실제 사용 경험을 알려 주세요.",
    guide: "시작 및 수치 안내", readGuide: "사용 안내 열기", trust: "다운로드 및 데이터 접근", share: "사용 경험 공유", bug: "문제 보고",
    destination: "이 버튼은 GitHub를 열며 게시에는 계정이 필요합니다. 문제 양식에는 앱 버전과 Windows만 미리 입력됩니다. 선택적 요약이나 대화는 첨부되지 않습니다.",
    summaryTitle: "선택적 피드백 정보", summaryDescription: "복사 전에 확인하세요. 아래 표시된 항목만 포함하며 계정, 할당량 수치, 경로, 대화 및 로그는 제외됩니다. 게시하기로 했다면 구체적인 경험은 직접 추가하세요.",
    stage: "어디까지 사용했나요?", area: "관련 항목", preview: "피드백 정보 미리 보기", copy: "이 정보 복사", copied: "복사했습니다. 내용을 확인한 후 직접 게시하세요.", copyFailed: "복사하지 못했습니다. 미리 보기 텍스트를 선택해 수동으로 복사하거나 다시 시도하세요.", openFailed: "GitHub를 열지 못했습니다. 다시 시도하거나 아래 주소를 브라우저에 복사하세요.", opening: "GitHub 여는 중…",
    stageOptions: ["선택하지 않음", "데모만 봄", "다운로드함", "실행함", "실제 작업에 사용함"],
    areaOptions: ["지정 안 함", "다운로드 또는 시작", "계정 할당량", "사용 속도", "사용량 분석", "데스크톱 위젯", "Codex 연동", "기타"],
  },
  de: {
    title: "Hilfe und Feedback", intro: "Messwerte verstehen, die Einrichtung nachlesen oder eigene Erfahrungen teilen.",
    guide: "Einrichtung und Messwerte", readGuide: "Anleitung öffnen", trust: "Download und Datenzugriff", share: "Erfahrung teilen", bug: "Problem melden",
    destination: "Diese Schaltflächen öffnen GitHub; zum Schreiben ist ein Konto nötig. Das Fehlerformular enthält nur App-Version und Windows. Optionaler Kontext und Gespräche werden nicht angehängt.",
    summaryTitle: "Optionaler Feedback-Kontext", summaryDescription: "Vor dem Kopieren prüfen. Enthalten sind nur die unten angezeigten Felder, keine Kontodaten, Quotenwerte, Pfade, Gespräche oder Protokolle. Ergänzen Sie beim Veröffentlichen selbst eine konkrete Erfahrung.",
    stage: "Wie weit sind Sie gekommen?", area: "Welcher Bereich?", preview: "Vorschau des Feedback-Kontexts", copy: "Diesen Kontext kopieren", copied: "Kontext kopiert. Prüfen Sie Ihre Nachricht, bevor Sie sie selbst veröffentlichen.", copyFailed: "Kopieren fehlgeschlagen. Wählen Sie den Vorschautext zum manuellen Kopieren aus oder versuchen Sie es erneut.", openFailed: "GitHub konnte nicht geöffnet werden. Erneut versuchen oder diese Adresse in den Browser kopieren.", opening: "GitHub wird geöffnet…",
    stageOptions: ["Keine Angabe", "Nur Demo angesehen", "Heruntergeladen", "Gestartet", "Bei der Arbeit verwendet"],
    areaOptions: ["Nicht angegeben", "Download oder Einrichtung", "Kontingent", "Verbrauchstempo", "Nutzungsanalyse", "Desktop-Widget", "Codex-Integration", "Sonstiges"],
  },
};

export function feedbackCopy(language: string): Copy { return messages[getLanguage(language)]; }
