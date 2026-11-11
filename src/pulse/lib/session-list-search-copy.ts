import { getLanguage, type Language } from "./languages";

const en = {
  label: "Search sessions", placeholder: "Title, session ID, model or project…", clear: "Clear search",
  scope: "Search loaded sessions within existing filters. Results keep related agents together; daily totals include only the shown results.",
  groups: "{count} matching session groups", result: "{groups} matching groups · {sessions} loaded sessions, including related agents",
  empty: "No matching session groups", emptyHint: "Try another title, ID, model or project, or clear the search. Existing project filters still apply.",
  dayTokens: "Result tokens on this date", dayCost: "Result API estimate",
};
type Key = keyof typeof en;
const messages: Record<Language, Record<Key, string>> = {
  en,
  zh: {
    label: "搜索会话", placeholder: "标题、会话 ID、模型或项目…", clear: "清空搜索",
    scope: "在已有筛选内搜索已加载会话。结果保留相关代理组；日期汇总仅包含显示的结果。",
    groups: "{count} 个匹配会话组", result: "{groups} 个匹配组 · 显示 {sessions} 个已加载会话（含相关代理）",
    empty: "没有匹配的会话组", emptyHint: "试试其他标题、ID、模型或项目，或清空搜索。已有项目筛选仍然生效。",
    dayTokens: "当日结果 Token", dayCost: "结果 API 估价",
  },
  "zh-Hant": {
    label: "搜尋會話", placeholder: "標題、會話 ID、模型或專案…", clear: "清除搜尋",
    scope: "在現有篩選內搜尋已載入會話。結果保留相關代理群組；日期彙總僅包含顯示的結果。",
    groups: "{count} 個相符會話群組", result: "{groups} 個相符群組 · 顯示 {sessions} 個已載入會話（含相關代理）",
    empty: "沒有相符的會話群組", emptyHint: "嘗試其他標題、ID、模型或專案，或清除搜尋。現有專案篩選仍然生效。",
    dayTokens: "當日結果 Token", dayCost: "結果 API 估價",
  },
  ja: {
    label: "セッションを検索", placeholder: "タイトル、セッション ID、モデル、プロジェクト…", clear: "検索をクリア",
    scope: "現在の絞り込み内で読み込み済みセッションを検索します。関連エージェントをまとめて表示し、日別合計には表示結果のみを含めます。",
    groups: "一致するセッショングループ {count} 件", result: "一致するグループ {groups} 件 · 関連エージェントを含む読み込み済みセッション {sessions} 件",
    empty: "一致するセッショングループはありません", emptyHint: "別のタイトル、ID、モデル、プロジェクトを試すか、検索をクリアしてください。既存のプロジェクト絞り込みも適用されます。",
    dayTokens: "この日の検索結果のトークン", dayCost: "検索結果の API 参考費用",
  },
  ko: {
    label: "세션 검색", placeholder: "제목, 세션 ID, 모델 또는 프로젝트…", clear: "검색 지우기",
    scope: "기존 필터 내에서 불러온 세션을 검색합니다. 관련 에이전트를 함께 표시하며 날짜별 합계에는 표시된 결과만 포함됩니다.",
    groups: "일치하는 세션 그룹 {count}개", result: "일치하는 그룹 {groups}개 · 관련 에이전트를 포함한 불러온 세션 {sessions}개",
    empty: "일치하는 세션 그룹이 없습니다", emptyHint: "다른 제목, ID, 모델 또는 프로젝트를 검색하거나 검색을 지우세요. 기존 프로젝트 필터도 계속 적용됩니다.",
    dayTokens: "해당 날짜 검색 결과 토큰", dayCost: "검색 결과 API 예상 비용",
  },
  de: {
    label: "Sitzungen suchen", placeholder: "Titel, Sitzungs-ID, Modell oder Projekt…", clear: "Suche leeren",
    scope: "Durchsucht geladene Sitzungen innerhalb bestehender Filter. Zugehörige Agenten bleiben zusammen; Tagessummen enthalten nur die angezeigten Ergebnisse.",
    groups: "{count} passende Sitzungsgruppen", result: "{groups} passende Gruppen · {sessions} geladene Sitzungen einschließlich zugehöriger Agenten",
    empty: "Keine passenden Sitzungsgruppen", emptyHint: "Anderen Titel, andere ID, anderes Modell oder Projekt suchen oder die Suche leeren. Bestehende Projektfilter gelten weiterhin.",
    dayTokens: "Ergebnis-Token an diesem Tag", dayCost: "API-Schätzung der Ergebnisse",
  },
};
export function sessionSearchCopy(language: string, key: Key, values: Record<string, string | number> = {}): string {
  let text = messages[getLanguage(language)][key];
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
