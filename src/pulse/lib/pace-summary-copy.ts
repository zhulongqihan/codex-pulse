import { getLanguage, type Language } from "./languages";

const en = { title: "Current quota", details: "View pace details", used: "Quota used", elapsed: "Cycle elapsed", roomy: "Quota use is below time progress" };
const messages: Record<Language, Record<keyof typeof en, string>> = {
  en,
  zh: { title: "本轮额度", details: "查看配速依据", used: "额度已用", elapsed: "周期已过", roomy: "当前消耗低于时间进度" },
  "zh-Hant": { title: "本輪額度", details: "查看配速依據", used: "額度已用", elapsed: "週期已過", roomy: "目前消耗低於時間進度" },
  ja: { title: "現在のクォータ", details: "ペースの根拠を見る", used: "使用済み", elapsed: "期間の経過", roomy: "使用の進み方は時間経過より緩やかです" },
  ko: { title: "현재 한도", details: "사용 속도 근거 보기", used: "사용한 한도", elapsed: "기간 경과", roomy: "한도 사용이 시간 경과보다 느립니다" },
  de: { title: "Aktuelles Kontingent", details: "Verbrauchsgrundlage ansehen", used: "Verbraucht", elapsed: "Zeit vergangen", roomy: "Der Verbrauch liegt unter dem Zeitfortschritt" },
};
export function paceSummaryCopy(language: string, key: keyof typeof en): string { return messages[getLanguage(language)][key]; }
