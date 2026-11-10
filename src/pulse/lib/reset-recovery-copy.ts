import { getLanguage } from "./languages";

const en = {
  retry: "Retry reset service", retrying: "Retrying reset service…", loading: "Loading reset history…",
  refreshHistory: "Refresh reset history", retryHistory: "Retry reset history",
  unavailable: "Could not load all reset information.", partialFailure: "Some reset information could not be refreshed; available records are kept.",
  staleHistory: "Refresh failed. Showing the last successfully loaded reset history.",
  scope: "Only reloads reset announcements and history; local logs are not rescanned.",
  cooldown: "The service may still be cooling down. Retrying respects cached results and rate limits; try again later.",
};
type Key = keyof typeof en;
const copy: Record<string, Record<Key, string>> = {
  en,
  zh: {
    retry: "重试重置服务", retrying: "正在重试重置服务…", loading: "正在加载重置历史…",
    refreshHistory: "刷新重置历史", retryHistory: "重试重置历史",
    unavailable: "未能获取完整的重置信息。", partialFailure: "部分重置信息未能更新，保留已有记录。",
    staleHistory: "刷新失败，仍显示上次成功加载的重置历史。",
    scope: "仅重新查询重置公告和历史，不重新扫描本机日志。",
    cooldown: "服务可能仍在冷却，重试仍遵循缓存和限流，请稍后再试。",
  },
  "zh-Hant": {
    retry: "重試重設服務", retrying: "正在重試重設服務…", loading: "正在載入重設歷史…",
    refreshHistory: "重新整理重設歷史", retryHistory: "重試重設歷史",
    unavailable: "未能取得完整的重設資訊。", partialFailure: "部分重設資訊未能更新，保留已有記錄。",
    staleHistory: "重新整理失敗，仍顯示上次成功載入的重設歷史。",
    scope: "僅重新查詢重設公告和歷史，不重新掃描本機日誌。",
    cooldown: "服務可能仍在冷卻，重試仍遵守快取與流量限制，請稍後再試。",
  },
  ja: {
    retry: "リセット情報を再試行", retrying: "リセット情報を再試行中…", loading: "リセット履歴を読込中…",
    refreshHistory: "リセット履歴を更新", retryHistory: "リセット履歴を再試行",
    unavailable: "リセット情報をすべて取得できませんでした。", partialFailure: "一部のリセット情報を更新できませんでした。取得済みの記録を保持しています。",
    staleHistory: "更新に失敗しました。前回取得できたリセット履歴を表示しています。",
    scope: "リセットの告知と履歴だけを再取得します。ローカルログは再スキャンしません。",
    cooldown: "サービスの待機時間中の可能性があります。再試行もキャッシュと頻度制限に従います。しばらくしてから再試行してください。",
  },
  ko: {
    retry: "초기화 정보 다시 시도", retrying: "초기화 정보 재시도 중…", loading: "초기화 기록을 불러오는 중…",
    refreshHistory: "초기화 기록 새로 고침", retryHistory: "초기화 기록 다시 시도",
    unavailable: "초기화 정보를 모두 불러오지 못했습니다.", partialFailure: "일부 초기화 정보를 갱신하지 못했습니다. 기존 기록은 유지합니다.",
    staleHistory: "새로 고침에 실패했습니다. 마지막으로 불러온 초기화 기록을 표시합니다.",
    scope: "초기화 공지와 기록만 다시 조회하며 로컬 로그는 다시 스캔하지 않습니다.",
    cooldown: "서비스가 대기 시간 중일 수 있습니다. 재시도도 캐시와 요청 제한을 따르므로 잠시 후 다시 시도하세요.",
  },
  de: {
    retry: "Reset-Dienst erneut versuchen", retrying: "Reset-Dienst wird erneut abgefragt…", loading: "Reset-Verlauf wird geladen…",
    refreshHistory: "Reset-Verlauf aktualisieren", retryHistory: "Reset-Verlauf erneut laden",
    unavailable: "Die Reset-Daten konnten nicht vollständig geladen werden.", partialFailure: "Einige Reset-Daten konnten nicht aktualisiert werden. Vorhandene Einträge bleiben erhalten.",
    staleHistory: "Aktualisierung fehlgeschlagen. Der zuletzt geladene Reset-Verlauf bleibt sichtbar.",
    scope: "Lädt nur Reset-Ankündigungen und Verlauf neu. Lokale Protokolle werden nicht erneut gescannt.",
    cooldown: "Der Dienst kann noch in einer Wartezeit sein. Auch erneute Versuche beachten Cache und Anfragelimits; bitte später versuchen.",
  },
};

export function resetRecoveryCopy(language: string, key: Key): string {
  return copy[getLanguage(language)][key];
}
