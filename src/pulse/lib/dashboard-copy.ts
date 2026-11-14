import { useTranslation } from "react-i18next";
import { getLanguage, type Language } from "./languages";

const en = {
  analysis: "Usage analysis",
  history: "Historical usage and cost",
  historyDescription: "Explore trends and the project or model breakdown for a period.",
  openAnalysis: "Open usage analysis",
  todayCost: "Today's API cost estimate",
  todayTokens: "Local tokens",
  periodCost: "Period API cost estimate",
  estimateNote: "Estimated from model prices; not an actual bill.",
  separateQuota: "Counted separately from account quota",
  localLogs: "Local logs",
};

export type DashboardCopyKey = keyof typeof en;
const copy: Record<Language, Record<DashboardCopyKey, string>> = {
  en,
  zh: {
    analysis: "用量分析", history: "历史用量与成本", historyDescription: "按时段查看趋势，以及项目和模型的消耗分布。",
    openAnalysis: "打开用量分析", todayCost: "今日 API 参考成本", todayTokens: "本机 Token", periodCost: "时段 API 参考成本",
    estimateNote: "按模型单价估算，非实际账单。", separateQuota: "与账号额度分别统计", localLogs: "本机日志",
  },
  "zh-Hant": {
    analysis: "用量分析", history: "歷史用量與成本", historyDescription: "依時段查看趨勢，以及專案和模型的用量分布。",
    openAnalysis: "開啟用量分析", todayCost: "今日 API 參考成本", todayTokens: "本機 Token", periodCost: "時段 API 參考成本",
    estimateNote: "依模型單價估算，非實際帳單。", separateQuota: "與帳號額度分別統計", localLogs: "本機日誌",
  },
  ja: {
    analysis: "使用量分析", history: "過去の使用量と費用", historyDescription: "期間ごとの傾向と、プロジェクトやモデル別の内訳を確認できます。",
    openAnalysis: "使用量分析を開く", todayCost: "今日の API 参考費用", todayTokens: "ローカル Token", periodCost: "期間の API 参考費用",
    estimateNote: "モデル単価に基づく推定です。実際の請求額ではありません。", separateQuota: "アカウント上限とは別集計", localLogs: "ローカルログ",
  },
  ko: {
    analysis: "사용량 분석", history: "이전 사용량 및 비용", historyDescription: "기간별 추세와 프로젝트 또는 모델별 사용량을 확인하세요.",
    openAnalysis: "사용량 분석 열기", todayCost: "오늘의 API 참고 비용", todayTokens: "로컬 Token", periodCost: "기간 API 참고 비용",
    estimateNote: "모델 단가 기준 추정액이며 실제 청구액이 아닙니다.", separateQuota: "계정 한도와 별도 집계", localLogs: "로컬 로그",
  },
  de: {
    analysis: "Nutzungsanalyse", history: "Bisherige Nutzung und Kosten", historyDescription: "Trends und die Aufteilung nach Projekt oder Modell im gewählten Zeitraum ansehen.",
    openAnalysis: "Nutzungsanalyse öffnen", todayCost: "API-Kostenschätzung heute", todayTokens: "Lokale Token", periodCost: "API-Kostenschätzung im Zeitraum",
    estimateNote: "Aus Modellpreisen geschätzt; keine tatsächliche Rechnung.", separateQuota: "Getrennt vom Kontokontingent erfasst", localLogs: "Lokale Protokolle",
  },
};

export function dashboardCopy(language: string, key: DashboardCopyKey): string {
  return copy[getLanguage(language)][key];
}

export function useDashboardCopy() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return (key: DashboardCopyKey) => dashboardCopy(language, key);
}
