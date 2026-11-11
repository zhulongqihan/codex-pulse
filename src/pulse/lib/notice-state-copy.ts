import { getLanguage, type Language } from "./languages";

const en = {
  title: "Reset notice status", expired: "The previous notice has expired", stale: "Notice information is out of date", unavailable: "Notice information is temporarily unavailable", none: "No current notice", unknown: "Notice status",
  expiredDetail: "The previous notice’s validity period has ended. It is no longer an active reminder; this does not mean your account has reset.",
  staleDetail: "The notice source has not been confirmed recently. Earlier information is not shown as an active notice.",
  unavailableDetail: "The last notice check failed. It is currently unknown whether there is a valid notice; you can check again later.",
  noneDetail: "The last successful check returned no valid notice. This does not confirm that an earlier notice was withdrawn.",
  unknownDetail: "There is no confirmed notice status yet. A missing notice alone does not establish whether it expired or was withdrawn.",
  checked: "Last checked: {time}", validUntil: "Previous notice valid until: {time}", independent: "Public reset notices are separate from your account’s reset time.",
};
type Key = keyof typeof en;
const messages: Record<Language, Record<Key, string>> = {
  en,
  zh: { title: "重置预告状态", expired: "上次预告已到期", stale: "预告信息已过旧", unavailable: "暂时无法获取预告", none: "当前没有有效预告", unknown: "预告状态",
    expiredDetail: "上次预告的有效期已结束，不再作为活跃提醒；这不代表你的账号已经重置。", staleDetail: "预告来源已有一段时间未确认，旧信息不再作为活跃预告展示。", unavailableDetail: "最近一次预告检查失败，暂时无法确认是否有有效消息，可稍后再查看。", noneDetail: "最近一次成功检查未返回有效预告；这不能证明上次预告已被撤回。", unknownDetail: "尚无可确认的预告状态。仅凭预告未显示，无法判断它是到期还是被撤回。", checked: "最后检查：{time}", validUntil: "上次预告有效期至：{time}", independent: "公开重置预告与个人账号的重置时间相互独立。" },
  "zh-Hant": { title: "重設預告狀態", expired: "上次預告已到期", stale: "預告資訊已過舊", unavailable: "暫時無法取得預告", none: "目前沒有有效預告", unknown: "預告狀態",
    expiredDetail: "上次預告的有效期已結束，不再作為有效提醒；這不表示你的帳戶已經重設。", staleDetail: "預告來源已有一段時間未確認，舊資訊不再作為有效預告顯示。", unavailableDetail: "最近一次預告檢查失敗，暫時無法確認是否有有效訊息，可稍後再查看。", noneDetail: "最近一次成功檢查未傳回有效預告；這無法證明上次預告已撤回。", unknownDetail: "尚無可確認的預告狀態。僅憑預告未顯示，無法判斷它是到期還是被撤回。", checked: "最後檢查：{time}", validUntil: "上次預告有效期至：{time}", independent: "公開重設預告與個人帳戶的重設時間互相獨立。" },
  ja: { title: "リセット予告の状態", expired: "前回の予告は期限切れです", stale: "予告の情報が古くなっています", unavailable: "予告を一時的に取得できません", none: "現在有効な予告はありません", unknown: "予告の状態",
    expiredDetail: "前回の予告は有効期間を過ぎたため、通知として表示しません。アカウントがリセットされたという意味ではありません。", staleDetail: "予告の情報源を最近確認できていません。古い情報を有効な予告として表示しません。", unavailableDetail: "直近の予告確認に失敗しました。有効な情報の有無は現在不明です。後ほどご確認ください。", noneDetail: "直近の正常な確認では、有効な予告が返されませんでした。以前の予告が撤回されたとは断定できません。", unknownDetail: "確認できた予告の状態はまだありません。表示されないことだけでは、期限切れか撤回かは判断できません。", checked: "最終確認：{time}", validUntil: "前回の予告の有効期限：{time}", independent: "公開されるリセット予告と個人アカウントのリセット時刻は別の情報です。" },
  ko: { title: "초기화 예고 상태", expired: "이전 예고가 만료되었습니다", stale: "예고 정보가 오래되었습니다", unavailable: "예고를 일시적으로 가져올 수 없습니다", none: "현재 유효한 예고가 없습니다", unknown: "예고 상태",
    expiredDetail: "이전 예고의 유효 기간이 끝나 활성 알림으로 표시하지 않습니다. 계정이 초기화되었다는 뜻은 아닙니다.", staleDetail: "예고 출처를 최근에 확인하지 못했습니다. 오래된 정보를 유효한 예고로 표시하지 않습니다.", unavailableDetail: "최근 예고 확인에 실패했습니다. 유효한 정보가 있는지는 현재 알 수 없습니다. 나중에 다시 확인하세요.", noneDetail: "최근 성공한 확인에서 유효한 예고가 반환되지 않았습니다. 이전 예고가 철회되었다고 단정할 수는 없습니다.", unknownDetail: "아직 확인된 예고 상태가 없습니다. 예고가 표시되지 않는 것만으로 만료 또는 철회 여부를 판단할 수 없습니다.", checked: "마지막 확인: {time}", validUntil: "이전 예고 유효 기간: {time}", independent: "공개 초기화 예고와 개인 계정의 초기화 시각은 별개입니다." },
  de: { title: "Status der Reset-Ankündigung", expired: "Die vorige Ankündigung ist abgelaufen", stale: "Die Ankündigungsdaten sind veraltet", unavailable: "Ankündigungen sind vorübergehend nicht verfügbar", none: "Keine aktuelle Ankündigung", unknown: "Ankündigungsstatus",
    expiredDetail: "Der Gültigkeitszeitraum der vorigen Ankündigung ist beendet. Sie wird nicht mehr als aktive Erinnerung angezeigt. Das bedeutet nicht, dass Ihr Konto zurückgesetzt wurde.", staleDetail: "Die Quelle wurde zuletzt nicht bestätigt. Frühere Informationen werden nicht als aktive Ankündigung angezeigt.", unavailableDetail: "Die letzte Prüfung ist fehlgeschlagen. Ob eine gültige Ankündigung vorliegt, ist derzeit unbekannt. Bitte später erneut nachsehen.", noneDetail: "Die letzte erfolgreiche Prüfung lieferte keine gültige Ankündigung. Daraus lässt sich kein Widerruf einer früheren Ankündigung ableiten.", unknownDetail: "Es liegt noch kein bestätigter Ankündigungsstatus vor. Eine fehlende Anzeige allein belegt weder Ablauf noch Widerruf.", checked: "Zuletzt geprüft: {time}", validUntil: "Vorige Ankündigung gültig bis: {time}", independent: "Öffentliche Reset-Ankündigungen und die Reset-Zeit Ihres Kontos sind voneinander unabhängig." },
};
export function noticeStateCopy(language: string, key: Key, values: Record<string, string> = {}): string {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), messages[getLanguage(language)][key]);
}
