import type { CodexLimitsResponse } from "./api";
import { getLanguage, type Language } from "./languages";

/** A returned account object alone does not prove a quota window is available. */
export function hasReturnedQuota(limits: CodexLimitsResponse | null | undefined): boolean {
  return [limits?.session, limits?.weekly].some(window => !!window
    && Number.isFinite(window.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100
    && Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100);
}

const en = {
  checkAccount: "Check account and connection",
  inspectQuota: "Check returned quota",
  pending: "First, check your existing sign-in in the account panel. Local log analysis remains available separately; API-key mode does not provide subscription quota.",
  missing: "The account responded without a usable quota window. Check its details; a missing window is unknown, not zero. Local analysis remains separate.",
  ready: "A returned quota reading is enough to start. Check its update time; pacing forecasts need further observations and may remain unavailable. A weekly window alone is valid.",
  optional: "Shortcuts and other setup are optional. You can close this help and reopen it from the toolbar.",
};
type Key = keyof typeof en;
const messages: Record<Language, Record<Key, string>> = {
  en,
  zh: {
    checkAccount: "检查账号与连接", inspectQuota: "查看已返回额度",
    pending: "先到账号面板检查已有登录。本机日志分析可单独使用；API Key 模式不提供订阅额度。",
    missing: "账号已响应，但未返回可用额度窗口。可查看账号详情；未返回是未知，不是零，本机分析仍可单独使用。",
    ready: "取得额度读数即可开始使用，请留意更新时间。配速预测还需继续观测，也可能暂不提供；只有周窗口同样有效。",
    optional: "快捷方式等设置可稍后再做。可关闭此帮助，并从工具栏重新打开。",
  },
  "zh-Hant": {
    checkAccount: "檢查帳號與連線", inspectQuota: "查看已傳回額度",
    pending: "先到帳號面板檢查既有登入。本機記錄分析可單獨使用；API Key 模式不提供訂閱額度。",
    missing: "帳號已回應，但未傳回可用額度視窗。可查看帳號詳情；未傳回是未知，不是零，本機分析仍可單獨使用。",
    ready: "取得額度讀數即可開始使用，請留意更新時間。配速預測仍需繼續觀測，也可能暫不提供；只有週視窗同樣有效。",
    optional: "捷徑等設定可稍後再做。可關閉此說明，並從工具列重新開啟。",
  },
  ja: {
    checkAccount: "アカウントと接続を確認", inspectQuota: "取得した上限を確認",
    pending: "まずアカウントパネルで既存のログインを確認してください。ローカルログの分析は別に利用できます。APIキーモードにはサブスクリプション上限がありません。",
    missing: "アカウントは応答しましたが、有効な上限期間を返しませんでした。詳細を確認してください。不明はゼロではなく、ローカル分析は別に利用できます。",
    ready: "上限の読数が取得できれば利用を開始できます。更新時刻を確認してください。予測には追加の観測が必要で、表示できない場合もあります。週の期間だけでも有効です。",
    optional: "ショートカットなどは後で設定できます。この説明は閉じてもツールバーから再表示できます。",
  },
  ko: {
    checkAccount: "계정 및 연결 확인", inspectQuota: "반환된 한도 확인",
    pending: "먼저 계정 패널에서 기존 로그인을 확인하세요. 로컬 로그 분석은 별도로 사용할 수 있습니다. API 키 모드에는 구독 한도가 없습니다.",
    missing: "계정이 응답했지만 사용할 수 있는 한도 기간을 반환하지 않았습니다. 세부 정보를 확인하세요. 알 수 없음은 0이 아니며 로컬 분석은 별도로 사용할 수 있습니다.",
    ready: "한도 값이 반환되면 사용을 시작할 수 있습니다. 업데이트 시간을 확인하세요. 예측에는 추가 관측이 필요하며 제공되지 않을 수도 있습니다. 주간 기간만 있어도 유효합니다.",
    optional: "바로 가기 등은 나중에 설정해도 됩니다. 이 도움말을 닫은 후 도구 모음에서 다시 열 수 있습니다.",
  },
  de: {
    checkAccount: "Konto und Verbindung prüfen", inspectQuota: "Erhaltenes Kontingent prüfen",
    pending: "Zuerst die vorhandene Anmeldung im Kontobereich prüfen. Lokale Loganalysen bleiben separat nutzbar. Der API-Schlüsselmodus liefert kein Abonnementkontingent.",
    missing: "Das Konto hat geantwortet, aber kein nutzbares Kontingentfenster geliefert. Details prüfen: Unbekannt ist nicht null. Lokale Analysen bleiben separat nutzbar.",
    ready: "Ein erhaltener Kontingentwert reicht für den Start. Die Aktualisierungszeit beachten. Prognosen benötigen weitere Beobachtungen und können fehlen. Ein Wochenfenster allein ist ebenfalls gültig.",
    optional: "Verknüpfungen und weitere Einstellungen sind optional. Diese Hilfe lässt sich schließen und über die Werkzeugleiste erneut öffnen.",
  },
};
export function firstUseCopy(language: string | undefined, key: Key): string {
  return messages[getLanguage(language ?? "en")][key];
}
