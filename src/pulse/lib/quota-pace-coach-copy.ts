import { getLanguage, type Language } from "./languages";
import type { PaceWindow } from "./pulse-pace";

const en = {
  title: "Cycle pace", remaining: "Quota remaining", resetIn: "Until reset", roomy: "Roomy pace", balanced: "On pace", fast: "Pace is high",
  roomyLabel: "More room in this window", balancedLabel: "Consumption follows the time progress", fastLabel: "Consumption is ahead of the time progress",
  roomyAdvice: "Consider longer tasks already in your plan.", balancedAdvice: "Follow your plan and keep an eye on the remaining quota.", fastAdvice: "Watch upcoming usage and keep some quota for later.",
  recentRisk: "Recent surge", recentRiskLabel: "Recent consumption has increased", recentRiskAdvice: "If this recent pace continues, quota may run out before your reset.", projectedDepletion: "Recent observations point to possible depletion before reset.",
  comparison: "{used}% of quota used; {elapsed}% of the window time elapsed", dayReference: "Daily reference allocation", hourReference: "Hourly reference allocation",
  perDay: "About {points} percentage points / day", perHour: "About {points} percentage points / hour", referenceNote: "Spread the current remainder until reset; this is not a daily refill.",
  scope: "Applies only to this quota window.", resetAt: "Resets {time}", timeBasis: "Time progress uses the official window duration and personal reset time.",
  unavailable: "Quota data unavailable", stale: "Reading needs a refresh", failed: "Could not refresh", exhausted: "Window quota exhausted", expired: "Reset time reached",
  unavailableDetail: "A reliable quota value and reset time are needed before comparing the pace.", staleDetail: "The last reading is shown without a pace recommendation.", failedDetail: "Retry the read-only refresh. The retained reading is not a current recommendation.", exhaustedDetail: "This known window has no remaining quota. Other windows cannot override it.", expiredDetail: "Wait for the next official reading; no refill is assumed.",
  nearReset: "Reset is near with quota remaining. Consider tasks already in your plan.", projected: "If recent pace continues, about {lower}–{upper}% may remain at reset.", projectionNote: "A conditional range, not a guarantee of working time or a promised outcome.",
  observations: "Daily observations this cycle", partial: "Partial observations", unobserved: "Not observed", coverage: "{minutes} min covered", dailyNote: "Only recorded changes are shown. Missing coverage is not zero consumption.",
  notice: "Reset notice", noticeClass: "Third-party global notice · unconfirmed", source: "Source: {source}", noticeTimeUnknown: "Expected time not confirmed", noticeScope: "This is not confirmation that your personal quota has reset.", markRead: "Mark read", read: "Read", markFailed: "Could not mark it read. Please retry.", sourceFailed: "Could not open the source link. Please retry.",
  dayWindow: "{n}-day window", hourWindow: "{n}-hour window", minuteWindow: "{n}-minute window", unknownWindow: "Quota window", days: "{days}d {hours}h", hours: "{hours}h {minutes}m", minutes: "{minutes}m", unknown: "Unknown", resetPending: "Awaiting new reading",
};
export type QuotaCoachCopyKey = keyof typeof en;
const messages: Record<Language, Record<QuotaCoachCopyKey, string>> = {
  en,
  zh: {
    title: "本轮配速", remaining: "额度还剩", resetIn: "距重置", roomy: "从容用", balanced: "配速均衡", fast: "用量偏快",
    roomyLabel: "余量较宽裕", balancedLabel: "消耗与时间进度接近", fastLabel: "消耗快于时间进度",
    roomyAdvice: "可优先安排计划中的长任务", balancedAdvice: "按计划推进，继续留意余量变化", fastAdvice: "注意后续用量，给后半程留些余量",
    recentRisk: "近期偏快", recentRiskLabel: "近期消耗加快", recentRiskAdvice: "若持续近期节奏，可能在个人重置前用尽。", projectedDepletion: "近期观测提示，重置前可能用尽额度。",
    comparison: "额度已用{used}%，周期时间已过{elapsed}%", dayReference: "日均参考分配", hourReference: "每小时参考分配",
    perDay: "约{points}个百分点／天", perHour: "约{points}个百分点／小时", referenceNote: "把当前余量均摊到重置前，并非每日新增额度。",
    scope: "仅对应当前额度窗口。", resetAt: "{time} 重置", timeBasis: "时间进度按官方窗口时长与个人重置时刻计算。",
    unavailable: "额度信息不足", stale: "读数待刷新", failed: "刷新失败", exhausted: "当前窗口额度已用尽", expired: "已到给定重置时间",
    unavailableDetail: "需要可靠的额度读数与重置时间，才能比较配速。", staleDetail: "保留最近读数，暂不给出配速建议。", failedDetail: "可重试只读刷新，保留的读数不作为当前建议。", exhaustedDetail: "该窗口已无余量，其他窗口不能抵消这一限制。", expiredDetail: "等待新的官方读数，不自动补为满额。",
    nearReset: "临近重置仍有余量，可考虑安排计划内任务。", projected: "若近期节奏持续，到重置时预计剩余约{lower}–{upper}%。", projectionNote: "这是条件区间，不保证可工作时长或实际结果。",
    observations: "本轮每日观测", partial: "部分观测", unobserved: "未观测", coverage: "覆盖{minutes}分钟", dailyNote: "仅显示已记录的变化，未覆盖不代表零消耗。",
    notice: "重置预告", noticeClass: "第三方全局预告 · 待确认", source: "来源：{source}", noticeTimeUnknown: "预计时间待确认", noticeScope: "不代表你的个人额度已经重置。", markRead: "标记已读", read: "已读", markFailed: "标记已读失败，请重试。", sourceFailed: "无法打开来源链接，请重试。",
    dayWindow: "{n}天周期", hourWindow: "{n}小时周期", minuteWindow: "{n}分钟周期", unknownWindow: "额度窗口", days: "{days}天{hours}小时", hours: "{hours}小时{minutes}分钟", minutes: "{minutes}分钟", unknown: "未知", resetPending: "等待新读数",
  },
  "zh-Hant": {
    title: "本輪配速", remaining: "額度還剩", resetIn: "距重置", roomy: "從容用", balanced: "配速均衡", fast: "用量偏快",
    roomyLabel: "餘量較寬裕", balancedLabel: "消耗與時間進度接近", fastLabel: "消耗快於時間進度",
    roomyAdvice: "可優先安排計畫中的長任務", balancedAdvice: "按計畫推進，繼續留意餘量變化", fastAdvice: "注意後續用量，為後半程留些餘量",
    recentRisk: "近期偏快", recentRiskLabel: "近期消耗加快", recentRiskAdvice: "若持續近期節奏，可能在個人重置前用盡。", projectedDepletion: "近期觀測顯示，重置前可能用盡額度。",
    comparison: "額度已用{used}%，週期時間已過{elapsed}%", dayReference: "日均參考分配", hourReference: "每小時參考分配",
    perDay: "約{points}個百分點／天", perHour: "約{points}個百分點／小時", referenceNote: "將目前餘量均攤至重置前，並非每日新增額度。",
    scope: "僅對應目前額度視窗。", resetAt: "{time} 重置", timeBasis: "時間進度依官方視窗長度與個人重置時刻計算。",
    unavailable: "額度資訊不足", stale: "讀數待更新", failed: "更新失敗", exhausted: "目前視窗額度已用盡", expired: "已到指定重置時間",
    unavailableDetail: "需要可靠額度讀數與重置時間，才能比較配速。", staleDetail: "保留最近讀數，暫不提供配速建議。", failedDetail: "可重試唯讀更新，保留讀數不作為目前建議。", exhaustedDetail: "該視窗已無餘量，其他視窗不能抵銷此限制。", expiredDetail: "等待新官方讀數，不自動補為滿額。",
    nearReset: "臨近重置仍有餘量，可考慮安排計畫內任務。", projected: "若近期節奏持續，重置時預計剩餘約{lower}–{upper}%。", projectionNote: "此為條件區間，不保證工作時長或實際結果。",
    observations: "本輪每日觀測", partial: "部分觀測", unobserved: "未觀測", coverage: "涵蓋{minutes}分鐘", dailyNote: "僅顯示已記錄變化，未涵蓋不代表零消耗。",
    notice: "重置預告", noticeClass: "第三方全域預告 · 待確認", source: "來源：{source}", noticeTimeUnknown: "預計時間待確認", noticeScope: "不代表你的個人額度已重置。", markRead: "標記已讀", read: "已讀", markFailed: "標記已讀失敗，請重試。", sourceFailed: "無法開啟來源連結，請重試。",
    dayWindow: "{n}天週期", hourWindow: "{n}小時週期", minuteWindow: "{n}分鐘週期", unknownWindow: "額度視窗", days: "{days}天{hours}小時", hours: "{hours}小時{minutes}分鐘", minutes: "{minutes}分鐘", unknown: "未知", resetPending: "等待新讀數",
  },
  ja: {
    title: "期間のペース", remaining: "上限の残り", resetIn: "リセットまで", roomy: "余裕あり", balanced: "均衡ペース", fast: "消費が速め",
    roomyLabel: "この期間には余裕があります", balancedLabel: "消費と時間の進み方が近い", fastLabel: "消費が時間の進行より速い",
    roomyAdvice: "予定していた長めの作業を検討できます。", balancedAdvice: "予定を進めつつ残量を確認しましょう。", fastAdvice: "後半にも残量を残せるよう、今後の消費に注意。",
    recentRisk: "直近は速め", recentRiskLabel: "直近の消費が増加", recentRiskAdvice: "直近のペースが続くと、個人のリセット前に残量を使い切る可能性があります。", projectedDepletion: "直近の観測では、リセット前に残量が尽きる可能性があります。",
    comparison: "上限を{used}%使用、期間の時間は{elapsed}%経過", dayReference: "1日あたりの参考配分", hourReference: "1時間あたりの参考配分",
    perDay: "約{points}ポイント／日", perHour: "約{points}ポイント／時間", referenceNote: "現在の残量をリセットまで均等に割る目安で、毎日の補充量ではありません。",
    scope: "この上限期間のみが対象です。", resetAt: "{time} リセット", timeBasis: "公式の期間長と個人のリセット時刻から時間進行を計算します。",
    unavailable: "上限情報が不足", stale: "観測を更新してください", failed: "更新できません", exhausted: "この期間の残量なし", expired: "指定のリセット時刻に到達",
    unavailableDetail: "ペース比較には確かな残量とリセット時刻が必要です。", staleDetail: "前回の値を表示し、ペースの提案は控えます。", failedDetail: "読み取り更新を再試行してください。前回の値は現在の提案ではありません。", exhaustedDetail: "他の期間に残量があっても、この制限は解消しません。", expiredDetail: "新しい公式観測を待ち、満額とは仮定しません。",
    nearReset: "リセットが近く残量もあります。予定内の作業を検討できます。", projected: "最近のペースが続けば、リセット時の残量は約{lower}–{upper}%と推定。", projectionNote: "条件付きの範囲で、作業時間や結果は保証しません。",
    observations: "この期間の日別観測", partial: "部分観測", unobserved: "未観測", coverage: "{minutes}分を観測", dailyNote: "記録した変化のみを表示。未観測は消費ゼロではありません。",
    notice: "リセット予告", noticeClass: "第三者の全体予告・未確認", source: "情報元：{source}", noticeTimeUnknown: "予定時刻は未確認", noticeScope: "個人の上限がリセット済みとは意味しません。", markRead: "既読にする", read: "既読", markFailed: "既読にできません。再試行してください。", sourceFailed: "情報元を開けません。再試行してください。",
    dayWindow: "{n}日間", hourWindow: "{n}時間", minuteWindow: "{n}分間", unknownWindow: "上限期間", days: "{days}日{hours}時間", hours: "{hours}時間{minutes}分", minutes: "{minutes}分", unknown: "不明", resetPending: "新しい観測を待機",
  },
  ko: {
    title: "이번 기간 페이스", remaining: "남은 한도", resetIn: "초기화까지", roomy: "여유 있음", balanced: "균형 페이스", fast: "소비 빠름",
    roomyLabel: "이 기간에 여유가 있습니다", balancedLabel: "소비와 시간 진행이 비슷함", fastLabel: "시간 진행보다 소비가 빠름",
    roomyAdvice: "계획한 긴 작업을 우선 고려할 수 있습니다.", balancedAdvice: "계획대로 진행하며 남은 한도를 확인하세요.", fastAdvice: "후반에도 여유를 남기도록 이후 사용량에 주의하세요.",
    recentRisk: "최근 빠름", recentRiskLabel: "최근 소비가 증가함", recentRiskAdvice: "최근 페이스가 계속되면 개인 초기화 전에 한도가 소진될 수 있습니다.", projectedDepletion: "최근 관측상 초기화 전에 한도가 소진될 가능성이 있습니다.",
    comparison: "한도 {used}% 사용, 기간 시간 {elapsed}% 경과", dayReference: "하루 참고 배분", hourReference: "시간당 참고 배분",
    perDay: "약 {points}퍼센트포인트 / 일", perHour: "약 {points}퍼센트포인트 / 시간", referenceNote: "현재 잔여량을 초기화 전까지 나눈 참고값이며 매일 추가되는 한도가 아닙니다.",
    scope: "현재 한도 기간에만 해당합니다.", resetAt: "{time} 초기화", timeBasis: "공식 기간 길이와 개인 초기화 시각으로 시간 진행을 계산합니다.",
    unavailable: "한도 정보 부족", stale: "관측 갱신 필요", failed: "갱신 실패", exhausted: "현재 기간 한도 소진", expired: "지정 초기화 시각 도달",
    unavailableDetail: "페이스를 비교하려면 한도와 초기화 시각이 필요합니다.", staleDetail: "이전 수치를 표시하며 현재 페이스를 권하지 않습니다.", failedDetail: "읽기 전용 갱신을 재시도하세요. 이전 수치는 현재 권고가 아닙니다.", exhaustedDetail: "다른 기간의 잔여량으로 이 제한을 해소할 수 없습니다.", expiredDetail: "새 공식 관측을 기다리며 최대 한도로 가정하지 않습니다.",
    nearReset: "초기화가 가깝고 한도가 남았습니다. 계획한 작업을 고려하세요.", projected: "최근 페이스가 이어지면 초기화 때 약 {lower}–{upper}%가 남을 수 있습니다.", projectionNote: "조건부 범위이며 작업 시간이나 결과를 보장하지 않습니다.",
    observations: "이번 기간 일별 관측", partial: "부분 관측", unobserved: "관측 안 됨", coverage: "{minutes}분 관측", dailyNote: "기록한 변화만 표시합니다. 미관측은 소비 0이 아닙니다.",
    notice: "초기화 예고", noticeClass: "제3자 전체 예고 · 미확인", source: "출처: {source}", noticeTimeUnknown: "예상 시각 미확인", noticeScope: "개인 한도가 초기화됐다는 의미가 아닙니다.", markRead: "읽음 표시", read: "읽음", markFailed: "읽음 표시 실패. 다시 시도하세요.", sourceFailed: "출처 링크를 열 수 없습니다. 다시 시도하세요.",
    dayWindow: "{n}일 기간", hourWindow: "{n}시간 기간", minuteWindow: "{n}분 기간", unknownWindow: "한도 기간", days: "{days}일 {hours}시간", hours: "{hours}시간 {minutes}분", minutes: "{minutes}분", unknown: "알 수 없음", resetPending: "새 관측 대기",
  },
  de: {
    title: "Tempo im Zyklus", remaining: "Kontingent übrig", resetIn: "Bis zum Reset", roomy: "Spielraum", balanced: "Im Takt", fast: "Tempo hoch",
    roomyLabel: "Spielraum in diesem Fenster", balancedLabel: "Verbrauch folgt dem Zeitfortschritt", fastLabel: "Verbrauch liegt vor dem Zeitfortschritt",
    roomyAdvice: "Geplante längere Aufgaben können Vorrang haben.", balancedAdvice: "Dem Plan folgen und das Restkontingent im Blick behalten.", fastAdvice: "Weiteren Verbrauch beachten und etwas für später übrig lassen.",
    recentRisk: "Zuletzt hoch", recentRiskLabel: "Verbrauch zuletzt gestiegen", recentRiskAdvice: "Bei diesem jüngsten Tempo könnte das Kontingent vor Ihrem Reset aufgebraucht sein.", projectedDepletion: "Aktuelle Beobachtungen deuten auf möglichen Verbrauch vor dem Reset hin.",
    comparison: "{used}% des Kontingents verbraucht; {elapsed}% der Fensterzeit vergangen", dayReference: "Täglicher Richtwert", hourReference: "Stündlicher Richtwert",
    perDay: "Etwa {points} Prozentpunkte / Tag", perHour: "Etwa {points} Prozentpunkte / Stunde", referenceNote: "Verteilt den aktuellen Rest bis zum Reset; keine tägliche Auffüllung.",
    scope: "Gilt nur für dieses Kontingentfenster.", resetAt: "Reset {time}", timeBasis: "Zeitfortschritt aus offizieller Fensterdauer und persönlicher Reset-Zeit berechnet.",
    unavailable: "Kontingentdaten fehlen", stale: "Messung aktualisieren", failed: "Aktualisierung fehlgeschlagen", exhausted: "Fensterkontingent aufgebraucht", expired: "Reset-Zeit erreicht",
    unavailableDetail: "Der Vergleich benötigt verlässliche Werte und eine Reset-Zeit.", staleDetail: "Letzter Wert ohne aktuelle Tempoempfehlung.", failedDetail: "Lesende Aktualisierung wiederholen. Der alte Wert ist keine aktuelle Empfehlung.", exhaustedDetail: "Andere Fenster können diese bekannte Einschränkung nicht aufheben.", expiredDetail: "Neue offizielle Messung abwarten; keine Auffüllung annehmen.",
    nearReset: "Reset ist nah und Kontingent bleibt. Geplante Aufgaben können passen.", projected: "Bei gleichem Tempo könnten zum Reset etwa {lower}–{upper}% übrig sein.", projectionNote: "Bedingte Spanne, keine Garantie für Arbeitszeit oder Ergebnis.",
    observations: "Tägliche Messungen im Zyklus", partial: "Teilbeobachtung", unobserved: "Nicht beobachtet", coverage: "{minutes} Min. erfasst", dailyNote: "Nur erfasste Änderungen. Fehlende Abdeckung bedeutet nicht Nullverbrauch.",
    notice: "Reset-Hinweis", noticeClass: "Globaler Dritthinweis · unbestätigt", source: "Quelle: {source}", noticeTimeUnknown: "Erwartete Zeit unbestätigt", noticeScope: "Bestätigt keinen Reset Ihres persönlichen Kontingents.", markRead: "Als gelesen markieren", read: "Gelesen", markFailed: "Markierung fehlgeschlagen. Erneut versuchen.", sourceFailed: "Quellenlink konnte nicht geöffnet werden. Erneut versuchen.",
    dayWindow: "{n}-Tage-Fenster", hourWindow: "{n}-Stunden-Fenster", minuteWindow: "{n}-Minuten-Fenster", unknownWindow: "Kontingentfenster", days: "{days} T. {hours} Std.", hours: "{hours} Std. {minutes} Min.", minutes: "{minutes} Min.", unknown: "Unbekannt", resetPending: "Neue Messung abwarten",
  },
};
export function quotaCoachCopy(language: string, key: QuotaCoachCopyKey, values?: Record<string, string | number>): string {
  let result = messages[getLanguage(language)][key];
  if (values) for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, String(value));
  return result;
}
export type QuotaCoachBadgeState = "unavailable" | "stale" | "failed" | "exhausted" | "expired";
const badgeMessages: Record<Language, Record<QuotaCoachBadgeState, string>> = {
  en: { unavailable: "No data", stale: "Refresh", failed: "Read failed", exhausted: "At limit", expired: "Reset due" },
  zh: { unavailable: "额度未知", stale: "待刷新", failed: "刷新失败", exhausted: "额度用尽", expired: "重置待确认" },
  "zh-Hant": { unavailable: "額度未知", stale: "待更新", failed: "更新失敗", exhausted: "額度用盡", expired: "重置待確認" },
  ja: { unavailable: "情報不足", stale: "要更新", failed: "更新失敗", exhausted: "上限到達", expired: "再観測待ち" },
  ko: { unavailable: "정보 부족", stale: "갱신 필요", failed: "갱신 실패", exhausted: "한도 소진", expired: "새 관측 대기" },
  de: { unavailable: "Keine Daten", stale: "Veraltet", failed: "Lesefehler", exhausted: "Am Limit", expired: "Reset fällig" },
};
export function quotaCoachBadgeCopy(language: string, state: QuotaCoachBadgeState): string {
  return badgeMessages[getLanguage(language)][state];
}
export function formatCoachNumber(value: number, language: string, digits = 0): string {
  const formatter = new Intl.NumberFormat(language, { maximumFractionDigits: digits });
  // A recorded positive amount must never be presented as an observed zero.
  return value > 0 && value < .5 * 10 ** -digits ? `<${formatter.format(10 ** -digits)}` : formatter.format(value);
}
export function formatCoachCountdown(minutes: number | null, language: string): string {
  if (minutes == null || !Number.isFinite(minutes)) return quotaCoachCopy(language, "unknown");
  if (minutes <= 0) return quotaCoachCopy(language, "resetPending");
  const total = Math.ceil(minutes), days = Math.floor(total / 1440), hours = Math.floor(total % 1440 / 60);
  return quotaCoachCopy(language, days ? "days" : hours ? "hours" : "minutes", { days, hours, minutes: hours ? total % 60 : total });
}
export function formatCoachWindow(window: PaceWindow | null, language: string): string {
  const minutes = window?.windowMinutes;
  if (minutes == null || minutes <= 0 || !Number.isFinite(minutes)) return quotaCoachCopy(language, "unknownWindow");
  const days = minutes % 1440 === 0, hours = minutes % 60 === 0;
  return quotaCoachCopy(language, days ? "dayWindow" : hours ? "hourWindow" : "minuteWindow", { n: formatCoachNumber(minutes / (days ? 1440 : hours ? 60 : 1), language, 1) });
}
export function formatCoachReset(resetAt: number | null, language: string): string {
  return resetAt == null || !Number.isFinite(resetAt) ? quotaCoachCopy(language, "unknown") : new Intl.DateTimeFormat(language, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(resetAt);
}

const feedback = {
  en: { basis: "Observation basis this cycle", noDaily: "No daily observations match this window yet; missing history is not reconstructed.", last: "Last reading", unknownWindows: "Some quota windows were not returned; other limits may still apply.", points: "{points} pp", dailySource: "Changes in account quota readings; separate from local Tokens.", noticeCompact: "Third-party notice · unconfirmed", cooldownShort: "Retry in {seconds}s", ageNow: "Read just now", age: "Read {minutes} min ago", cooldown: "Recent reading retained · retry in {seconds}s", recover: "Check account and connection", login: "Sign in with the official Codex app, then refresh the reading.", apiKey: "The selected API-key environment does not provide subscription quota windows.", offline: "Offline mode: an online quota reading is unavailable.", identity: "Account identity is unavailable. Check the selected account and environment.", noObservations: "No account reading yet. Try the read-only refresh.", invalidTime: "The reading time is invalid. Refresh for a new reading." },
  zh: { basis: "本轮观测依据", noDaily: "暂无匹配当前窗口的每日观测；覆盖不足时不推算历史。", last: "上次读数", unknownWindows: "部分额度窗口未返回，其他限制仍可能生效。", points: "{points}个百分点", dailySource: "账号额度读数的变化，与本机 Token 分开统计。", noticeCompact: "第三方预告 · 待确认", cooldownShort: "{seconds}秒后可重试", ageNow: "刚刚读取", age: "{minutes}分钟前读数", cooldown: "保留最近读数，{seconds}秒后可重试", recover: "检查账号与连接", login: "请在官方 Codex 登录后，刷新额度读数。", apiKey: "当前选择的 API Key 环境不提供订阅额度窗口。", offline: "当前为离线模式，无法获取在线额度读数。", identity: "暂时无法确认账号身份，请检查所选账号与环境。", noObservations: "尚无账号额度读数，可尝试只读刷新。", invalidTime: "读数时间无效，请刷新获取新读数。" },
  "zh-Hant": { basis: "本輪觀測依據", noDaily: "暫無符合目前視窗的每日觀測；覆蓋不足時不推算歷史。", last: "上次讀數", unknownWindows: "部分額度視窗未回傳，其他限制仍可能生效。", points: "{points}個百分點", dailySource: "帳號額度讀數的變化，與本機 Token 分開統計。", noticeCompact: "第三方預告 · 待確認", cooldownShort: "{seconds}秒後可重試", ageNow: "剛剛讀取", age: "{minutes}分鐘前讀數", cooldown: "保留最近讀數，{seconds}秒後可重試", recover: "檢查帳號與連線", login: "請在官方 Codex 登入後，更新額度讀數。", apiKey: "目前選取的 API Key 環境不提供訂閱額度視窗。", offline: "目前為離線模式，無法取得線上額度讀數。", identity: "暫時無法確認帳號身分，請檢查所選帳號與環境。", noObservations: "尚無帳號額度讀數，可嘗試唯讀更新。", invalidTime: "讀數時間無效，請更新取得新讀數。" },
  ja: { basis: "この期間の観測根拠", noDaily: "この期間の日別観測はまだありません。欠けた履歴は推測しません。", last: "前回の値", unknownWindows: "一部の上限期間は未取得です。他の制限が適用される場合があります。", points: "{points}ポイント", dailySource: "アカウント上限の変化です。ローカルTokenとは別集計です。", noticeCompact: "第三者の予告 · 未確認", cooldownShort: "{seconds}秒後に再試行", ageNow: "たった今の観測", age: "{minutes}分前の観測", cooldown: "前回の値を保持 · {seconds}秒後に再試行", recover: "アカウントと接続を確認", login: "公式Codexでログインしてから更新してください。", apiKey: "選択中のAPIキー環境には契約上限の期間情報がありません。", offline: "オフラインのためオンラインの値を取得できません。", identity: "アカウントを確認できません。選択したアカウントと環境を確認してください。", noObservations: "まだ観測がありません。読み取り専用の更新をお試しください。", invalidTime: "観測時刻が無効です。更新してください。" },
  ko: { basis: "이번 기간 관측 근거", noDaily: "현재 기간과 일치하는 일별 관측이 없습니다. 누락된 기록을 추정하지 않습니다.", last: "이전 관측", unknownWindows: "일부 한도 기간이 반환되지 않았습니다. 다른 제한도 적용될 수 있습니다.", points: "{points}퍼센트포인트", dailySource: "계정 한도 관측의 변화이며 로컬 Token과 별도로 집계합니다.", noticeCompact: "제3자 예고 · 미확인", cooldownShort: "{seconds}초 후 재시도", ageNow: "방금 관측", age: "{minutes}분 전 관측", cooldown: "최근 관측 유지 · {seconds}초 후 재시도", recover: "계정 및 연결 확인", login: "공식 Codex에서 로그인한 뒤 관측을 갱신하세요.", apiKey: "선택한 API 키 환경은 구독 한도 기간을 제공하지 않습니다.", offline: "오프라인 모드에서는 온라인 관측을 가져올 수 없습니다.", identity: "계정 신원을 확인할 수 없습니다. 계정과 환경을 확인하세요.", noObservations: "계정 관측이 없습니다. 읽기 전용 갱신을 시도하세요.", invalidTime: "관측 시각이 잘못되었습니다. 갱신하세요." },
  de: { basis: "Messgrundlage dieses Zyklus", noDaily: "Noch keine passenden Tagesmessungen. Fehlende Historie wird nicht rekonstruiert.", last: "Letzte Messung", unknownWindows: "Einige Kontingentfenster fehlen; weitere Limits können gelten.", points: "{points} Prozentpunkte", dailySource: "Änderungen der Kontingentmessungen, getrennt von lokalen Tokens.", noticeCompact: "Dritthinweis · unbestätigt", cooldownShort: "In {seconds}s erneut", ageNow: "Gerade gelesen", age: "Messung vor {minutes} Min.", cooldown: "Letzter Wert bleibt · in {seconds}s erneut versuchen", recover: "Konto und Verbindung prüfen", login: "In der offiziellen Codex-App anmelden und danach aktualisieren.", apiKey: "Die gewählte API-Key-Umgebung liefert keine Abo-Kontingentfenster.", offline: "Im Offline-Modus sind keine Online-Messungen verfügbar.", identity: "Kontozuordnung fehlt. Gewähltes Konto und Umgebung prüfen.", noObservations: "Noch keine Kontomessung. Lesende Aktualisierung versuchen.", invalidTime: "Ungültige Messzeit. Neue Messung abrufen." },
} satisfies Record<Language, Record<string, string>>;
export type QuotaCoachFeedbackKey = keyof typeof feedback.en;
export function quotaCoachFeedback(language: string, key: QuotaCoachFeedbackKey, values?: Record<string, string | number>): string {
  let result = feedback[getLanguage(language)][key];
  if (values) for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
  return result;
}
export function quotaCoachReason(language: string, reason: string | null | undefined): string | null {
  const keys: Record<string, QuotaCoachFeedbackKey> = { login_required: "login", api_key: "apiKey", offline: "offline", identity_unavailable: "identity", no_observations: "noObservations", invalid_observation_time: "invalidTime" };
  return reason && keys[reason] ? quotaCoachFeedback(language, keys[reason]) : null;
}
