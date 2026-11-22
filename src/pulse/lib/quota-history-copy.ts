import { getLanguage, type Language } from "./languages";

const summary = {
  en: { info: "About today's quota readings", providerReadFailed: "Quota refresh failed", readFailed: "History unavailable", writeFailed: "Quota recording failed", unavailable: "Quota storage unavailable", identity: "Cannot verify account", paused: "Recording off", loading: "Loading history…" },
  zh: { info: "今日额度读数说明", providerReadFailed: "额度刷新失败", readFailed: "历史读取失败", writeFailed: "额度记录保存失败", unavailable: "额度存储不可用", identity: "暂时无法确认当前账号", paused: "记录已关闭", loading: "正在读取历史…" },
  "zh-Hant": { info: "今日額度讀數說明", providerReadFailed: "額度更新失敗", readFailed: "歷史讀取失敗", writeFailed: "額度記錄儲存失敗", unavailable: "額度儲存無法使用", identity: "暫時無法確認目前帳號", paused: "記錄已關閉", loading: "正在讀取歷史…" },
  ja: { info: "今日の上限の記録について", providerReadFailed: "上限の更新に失敗", readFailed: "履歴を読み込めません", writeFailed: "上限の記録に失敗", unavailable: "上限の記録領域を利用できません", identity: "アカウントを確認できません", paused: "記録オフ", loading: "履歴を読み込み中…" },
  ko: { info: "오늘의 한도 관측 안내", providerReadFailed: "한도 새로 고침 실패", readFailed: "기록을 읽을 수 없음", writeFailed: "한도 기록 저장 실패", unavailable: "한도 저장소를 사용할 수 없음", identity: "계정을 확인할 수 없음", paused: "기록 꺼짐", loading: "기록을 읽는 중…" },
  de: { info: "Zu den heutigen Kontingentwerten", providerReadFailed: "Kontingent nicht aktualisiert", readFailed: "Historie nicht lesbar", writeFailed: "Kontingent nicht gespeichert", unavailable: "Kontingentspeicher nicht verfügbar", identity: "Konto nicht bestätigt", paused: "Aufzeichnung aus", loading: "Historie wird geladen…" },
} satisfies Record<Language, Record<string, string>>;
type SummaryCopyKey = keyof typeof summary.en;

export function quotaHistorySummaryCopy(language: string, key: SummaryCopyKey): string {
  return summary[getLanguage(language)][key];
}

const en = {
  localEstimate: "Local quota estimate",
  localEstimateCoverage: "Days observed ({observed}/{total})",
  localEstimatePeaks: "Groups show the highest observed day for each window. Groups without readings stay unknown.",
  localEstimateGroupDays: "{count}-day group",
  localEstimateNote: "Estimates use account readings saved in local session logs and total only dates with enough readings. These readings may include other devices. Each account uses its own quota window, so the total cannot measure this device’s quota use or the share of one plan used.",
  otherScopeHistory: "Quota history from another account or source is saved locally. To view it, switch back to that account in Codex or restore the previous source in Pulse settings. Each account and source has its own total.",
  observedDays: "{observed} of {total} days had enough readings to calculate consumption.",
  exportDesktopOnly: "Excel export requires the desktop app. You can download Markdown from this web demo.",
  rangeStart: "Start date", rangeEnd: "End date",
  chartScroll: "Scroll horizontally for earlier dates; the latest dates are shown first.",
  title: "Official quota history", local: "Local usage", today: "Today's observed consumption", open: "View quota history",
  partial: "Partial observations", note: "Changes in the current account's quota readings, including other devices. Separate from local Tokens; not an official daily bill.",
  weekly: "Long window", session: "Short window", duration: "{minutes} min window", hours: "{hours}-hour window", days: "{days}-day window", points: "{points} pp",
  unknown: "Not observed", insufficient: "Insufficient samples", unchanged: "Reading unchanged", coverage: "{minutes} min covered", cycles: "{count} cycles", samples: "{count} samples", gaps: "{count} gaps",
  providerReadFailed: "Official quota could not be read. Saved history remains available; new records may be missing. Automatic retries follow the existing backoff.", readFailed: "Could not read quota history. Retained records are shown where available.", writeFailed: "Quota history could not be saved. The official reading was received, but saving failed. Previous records remain; local saving will retry automatically.", unavailable: "Quota history storage is unavailable. Recording is paused; original files are retained. Check local data and diagnostics.",
  identity: "Current account identity is unavailable. Check the selected Codex account and environment.", retry: "Read history again", paused: "Recording is off; saved history is retained.", loading: "Reading local quota history…",
  timezone: "Ledger timezone: {zone}", scope: "Current account and source only", sum: "Sum of recorded portions", sumNote: "Missing dates are unknown and are not included as zero-consumption days.",
  chart: "Daily observed consumption in percentage points", table: "Daily quota observations", date: "Date", consumption: "Observed consumption", state: "Observation status", details: "Day details", close: "Close details", reset: "Resets {time}",
  unallocated: "{count} cross-day segments are unallocated", crossDay: "Cross-day, unallocated", start: "First reading", end: "Last reading", more: "Load earlier segments", pageNote: "Only loaded segments are shown. Load earlier segments to continue; exports include all matching segments.",
  baseline: "Baseline only", continuous: "Continuous observation", gap: "Same-day gap; net change retained, interval not covered", decreased: "Reading decreased; new baseline", changed: "Quota cycle changed", resumed: "Recording resumed; new baseline", conflict: "Conflicting reading", historical: "Imported partial observation", migrated: "Imported from previous observations", mixed: "Official and imported observations",
  record: "Record daily official quota", recordNote: "Records the current account about once a minute while Pulse runs, including hidden windows. Stops on exit or sleep. Saved locally; turning this off keeps history.",
  preferenceFailed: "Could not save the recording setting. The previous setting is retained.", retrySettings: "Read settings again", preferenceReadFailed: "Could not read recording settings. Recording status is unknown. Read the settings again before changing them.",
  exportXlsx: "Export Excel", exportMarkdown: "Export Markdown", exportFailed: "Could not export quota history. Please retry.", exported: "Exported to {path}", range: "Quota history date range", rangeLimit: "Choose at most 366 days per query. Earlier history remains saved.", window: "Quota window", noWindows: "No quota window has been recorded for this range yet.",
};
export type QuotaHistoryCopyKey = keyof typeof en;
const messages: Record<Language, Record<QuotaHistoryCopyKey, string>> = {
  en,
  zh: {
    localEstimate: "本机日志额度估算",
    localEstimateCoverage: "所选 {total} 天中有 {observed} 天可估算",
    localEstimatePeaks: "每组显示各窗口已观测的最高单日值。无读数的组保持未知。",
    localEstimateGroupDays: "{count} 天一组",
    localEstimateNote: "根据本机会话日志中的账号额度读数估算，只合计读数足够的日期。读数可能包含其他设备的用量，各账号窗口以各自额度为基准。合计无法核算本机扣减或单个套餐的已用比例。",
    otherScopeHistory: "本地还保留其他账号或来源的额度历史。请在 Codex 切回原账号，或在 Pulse 设置切回原数据来源后查看。各账号与来源分别统计。",
    observedDays: "所选 {total} 天中，有 {observed} 天的样本足以计算观测消耗。",
    exportDesktopOnly: "Excel 导出需使用桌面版；网页演示可下载 Markdown。",
    rangeStart: "开始日期", rangeEnd: "结束日期",
    chartScroll: "横向滚动可查看更早日期，默认显示最近日期。",
    title: "官方额度记录", local: "本机用量", today: "今日观测消耗", open: "查看额度历史", partial: "部分观测", note: "当前账号额度读数的变化，可能包含其他设备的使用。与本机 Token 分开统计，并非官方逐日账单。",
    weekly: "长时窗口", session: "短时窗口", duration: "{minutes}分钟窗口", hours: "{hours}小时窗口", days: "{days}天窗口", points: "{points}个百分点",
    unknown: "未观测", insufficient: "样本不足", unchanged: "读数未变化", coverage: "覆盖{minutes}分钟", cycles: "{count}个周期", samples: "{count}条样本", gaps: "{count}处断档",
    providerReadFailed: "官方额度读取失败，已保存历史仍可查看，新记录可能暂缺；将按现有退避自动重试。", readFailed: "读取额度历史失败；有保留记录时继续显示。", writeFailed: "额度历史保存失败：官方读数已取得，但未能保存。此前记录保留，将自动重试本地保存。", unavailable: "额度历史存储不可用，记录已暂停，原文件仍保留。请检查本地数据与诊断信息。", identity: "暂时无法确认当前账号，请检查所选 Codex 账号与环境。", retry: "重新读取历史", paused: "记录已关闭，已有历史仍保留。", loading: "正在读取本地额度历史…",
    timezone: "账本时区：{zone}", scope: "仅当前账号与来源", sum: "已记录部分之和", sumNote: "缺样日期保持未知，不作为零消耗日参与统计。", chart: "每日观测消耗（单位：百分点）", table: "每日额度观测明细", date: "日期", consumption: "观测消耗", state: "观测状态", details: "当日详情", close: "关闭详情", reset: "{time} 重置",
    unallocated: "{count}段跨日变化未分配", crossDay: "跨日未分配", start: "首条读数", end: "末条读数", more: "加载更早分段", pageNote: "仅展示已加载分段；可继续加载更早记录。导出包含范围内全部匹配分段。", baseline: "仅基线", continuous: "连续观测", gap: "同日断档：保留净变化，不计覆盖", decreased: "读数下降，建立新基线", changed: "额度周期变化", resumed: "恢复记录，建立新基线", conflict: "读数冲突", historical: "导入的部分观测", migrated: "来自旧观测的导入", mixed: "官方与导入观测",
    record: "记录每日官方额度", recordNote: "Pulse 运行时约每分钟记录当前账号，隐藏窗口仍记录；退出或休眠停止。本地长期保存，关闭开关不删除历史。", preferenceFailed: "记录设置保存失败，仍沿用此前设置。", retrySettings: "重新读取设置", preferenceReadFailed: "读取记录设置失败，当前记录状态未知。请重新读取设置后再修改。", exportXlsx: "导出 Excel", exportMarkdown: "导出 Markdown", exportFailed: "导出额度历史失败，请重试。", exported: "已导出至 {path}", range: "额度历史日期范围", rangeLimit: "单次最多查询366天，更早历史仍保留。", window: "额度窗口", noWindows: "此范围尚未记录额度窗口。",
  },
  "zh-Hant": {
    localEstimate: "本機日誌額度估算",
    localEstimateCoverage: "所選 {total} 天中有 {observed} 天可估算",
    localEstimatePeaks: "每組顯示各視窗已觀測的最高單日值。無讀數的組維持未知。",
    localEstimateGroupDays: "{count} 天一組",
    localEstimateNote: "根據本機工作階段日誌中的帳號額度讀數估算，只合計讀數足夠的日期。讀數可能包含其他裝置的用量，各帳號視窗以各自額度為基準。合計無法計算本機扣減或單一方案的已用比例。",
    otherScopeHistory: "本機還保留其他帳號或來源的額度歷史。請在 Codex 切回原帳號，或在 Pulse 設定切回原資料來源後查看。各帳號與來源分開統計。",
    observedDays: "所選 {total} 天中，有 {observed} 天的樣本足以計算觀測消耗。",
    exportDesktopOnly: "Excel 匯出需使用桌面版；網頁示範可下載 Markdown。",
    rangeStart: "開始日期", rangeEnd: "結束日期",
    chartScroll: "橫向捲動可查看更早日期，預設顯示最近日期。",
    title: "官方額度記錄", local: "本機用量", today: "今日觀測消耗", open: "查看額度歷史", partial: "部分觀測", note: "目前帳號額度讀數的變化，可能包含其他裝置的使用。與本機 Token 分開統計，並非官方逐日帳單。",
    weekly: "長時視窗", session: "短時視窗", duration: "{minutes}分鐘視窗", hours: "{hours}小時視窗", days: "{days}天視窗", points: "{points}個百分點", unknown: "未觀測", insufficient: "樣本不足", unchanged: "讀數未變化", coverage: "涵蓋{minutes}分鐘", cycles: "{count}個週期", samples: "{count}筆樣本", gaps: "{count}處缺口",
    providerReadFailed: "官方額度讀取失敗，已儲存歷史仍可查看，新記錄可能暫缺；將按現有退避自動重試。", readFailed: "讀取額度歷史失敗；若有保留記錄則繼續顯示。", writeFailed: "額度歷史儲存失敗：已取得官方讀數，但未能儲存。先前記錄保留，將自動重試本機儲存。", unavailable: "額度歷史儲存無法使用，記錄已暫停，原檔案仍保留。請檢查本機資料與診斷資訊。", identity: "暫時無法確認目前帳號，請檢查所選 Codex 帳號與環境。", retry: "重新讀取歷史", paused: "記錄已關閉，既有歷史仍保留。", loading: "正在讀取本機額度歷史…", timezone: "帳本時區：{zone}", scope: "僅目前帳號與來源", sum: "已記錄部分之和", sumNote: "缺樣日期保持未知，不作為零消耗日參與統計。",
    chart: "每日觀測消耗（單位：百分點）", table: "每日額度觀測明細", date: "日期", consumption: "觀測消耗", state: "觀測狀態", details: "當日詳情", close: "關閉詳情", reset: "{time} 重置", unallocated: "{count}段跨日變化未分配", crossDay: "跨日未分配", start: "首筆讀數", end: "末筆讀數", more: "載入更早分段", pageNote: "僅顯示已載入分段；可繼續載入更早記錄。匯出包含範圍內全部符合的分段。", baseline: "僅基線", continuous: "連續觀測", gap: "同日缺口：保留淨變化，不計涵蓋", decreased: "讀數下降，建立新基線", changed: "額度週期變化", resumed: "恢復記錄，建立新基線", conflict: "讀數衝突", historical: "匯入的部分觀測", migrated: "來自舊觀測的匯入", mixed: "官方與匯入觀測",
    record: "記錄每日官方額度", recordNote: "Pulse 執行時約每分鐘記錄目前帳號，隱藏視窗仍記錄；退出或休眠停止。本機長期儲存，關閉開關不刪除歷史。", preferenceFailed: "記錄設定儲存失敗，仍沿用先前設定。", retrySettings: "重新讀取設定", preferenceReadFailed: "讀取記錄設定失敗，目前記錄狀態未知。請重新讀取設定後再修改。", exportXlsx: "匯出 Excel", exportMarkdown: "匯出 Markdown", exportFailed: "匯出額度歷史失敗，請重試。", exported: "已匯出至 {path}", range: "額度歷史日期範圍", rangeLimit: "單次最多查詢366天，更早歷史仍保留。", window: "額度視窗", noWindows: "此範圍尚未記錄額度視窗。",
  },
  ja: {
    localEstimate: "ローカルログからの上限推計",
    localEstimateCoverage: "選択した{total}日中{observed}日を観測",
    localEstimatePeaks: "グループごとに各期間の観測日最高値を表示します。測定値がないグループは不明です。",
    localEstimateGroupDays: "{count}日間のグループ",
    localEstimateNote: "ローカルのセッションログの測定値から、十分な記録がある日だけを集計します。他の端末の利用を含む場合があり、上限の期間はアカウントごとに異なります。合計から、この端末の消費量や単一プランの使用割合は算出できません。",
    otherScopeHistory: "別のアカウントまたはデータソースの上限履歴もこの端末に保存されています。表示するには、Codex で元のアカウントに切り替えるか、Pulse の設定で元のデータソースに戻してください。アカウントとデータソースごとに集計します。",
    observedDays: "選択した {total} 日のうち、{observed} 日で消費量を計算できるだけの測定値がありました。",
    exportDesktopOnly: "Excel出力はデスクトップ版で利用できます。このWebデモではMarkdownをダウンロードできます。",
    rangeStart: "開始日", rangeEnd: "終了日",
    chartScroll: "左右にスクロールすると以前の日付を表示します。初期表示は最新の日付です。",
    title: "公式上限の記録", local: "ローカル使用量", today: "今日の観測消費", open: "上限の履歴を見る", partial: "部分的な観測", note: "現在のアカウント上限の変化。他の端末の利用を含む場合があります。ローカルTokenとは別集計で、公式の日別請求ではありません。", weekly: "長期の上限", session: "短期の上限", duration: "{minutes}分の期間", hours: "{hours}時間の期間", days: "{days}日の期間", points: "{points}ポイント", unknown: "未観測", insufficient: "サンプル不足", unchanged: "観測値は変化なし", coverage: "{minutes}分を観測", cycles: "{count}サイクル", samples: "{count}サンプル", gaps: "{count}件の空白",
    providerReadFailed: "公式の上限を読み取れません。保存済み履歴は表示できますが、新しい記録が欠ける場合があります。既存の待機間隔で自動再試行します。", readFailed: "上限履歴を読み取れません。保存済みの記録があれば表示します。", writeFailed: "上限履歴を保存できません。公式の値は取得しましたが、保存に失敗しました。以前の記録を保持し、ローカル保存を自動再試行します。", unavailable: "履歴ストレージを使用できません。記録は一時停止し、元のファイルは保持しています。ローカルデータと診断を確認してください。", identity: "現在のアカウントを確認できません。Codexのアカウントと環境を確認してください。", retry: "履歴を再読込", paused: "記録はオフです。保存済み履歴は保持されます。", loading: "ローカルの上限履歴を読込中…", timezone: "台帳のタイムゾーン：{zone}", scope: "現在のアカウントと環境のみ", sum: "記録済み部分の合計", sumNote: "欠けた日は不明のままとし、消費ゼロとして集計しません。", chart: "日別の観測消費（ポイント）", table: "日別の上限観測", date: "日付", consumption: "観測消費", state: "観測状態", details: "日の詳細", close: "詳細を閉じる", reset: "{time}にリセット", unallocated: "{count}件の日付をまたぐ区間が未配分", crossDay: "日付をまたぐ未配分", start: "最初の観測", end: "最後の観測", more: "前の区間を読み込む", pageNote: "読込済み区間のみ表示。前の区間も読み込めます。エクスポートは全該当区間を含みます。", baseline: "基準値のみ", continuous: "連続観測", gap: "同日の空白：変化は保持し、観測時間には加算しません", decreased: "観測値低下、新しい基準値", changed: "上限サイクルが変更", resumed: "記録再開、新しい基準値", conflict: "観測値の矛盾", historical: "インポートした部分観測", migrated: "以前の観測からインポート", mixed: "公式とインポートの観測", record: "公式上限を日別に記録", recordNote: "Pulse実行中は約1分ごとに現在のアカウントを記録。非表示でも続行し、終了・スリープ時は停止。ローカル保存で、オフにしても履歴は保持。", preferenceFailed: "記録設定を保存できません。以前の設定を保持します。", retrySettings: "設定を再読込", preferenceReadFailed: "記録設定を読み取れません。現在の記録状態は不明です。設定を再読込してから変更してください。", exportXlsx: "Excelに出力", exportMarkdown: "Markdownに出力", exportFailed: "履歴を出力できません。再試行してください。", exported: "出力先：{path}", range: "上限履歴の日付範囲", rangeLimit: "1回の照会は最大366日。以前の履歴も保存されています。", window: "上限の期間", noWindows: "この範囲の上限期間はまだ記録されていません。",
  },
  ko: {
    localEstimate: "로컬 로그 한도 추정",
    localEstimateCoverage: "선택한 {total}일 중 {observed}일 관측",
    localEstimatePeaks: "그룹별로 각 기간의 관측 일일 최댓값을 표시합니다. 측정값이 없는 그룹은 알 수 없음으로 표시합니다.",
    localEstimateGroupDays: "{count}일 그룹",
    localEstimateNote: "로컬 세션 로그의 계정 한도 측정값을 사용해 측정값이 충분한 날짜만 합산합니다. 다른 기기의 사용량이 포함될 수 있고 계정마다 한도 기간이 다릅니다. 합계로 이 기기의 사용량이나 한 요금제에서 사용한 비율을 알 수 없습니다.",
    otherScopeHistory: "다른 계정이나 데이터 소스의 한도 기록도 이 기기에 저장되어 있습니다. 해당 기록을 보려면 Codex에서 이전 계정으로 전환하거나 Pulse 설정에서 이전 데이터 소스를 선택하세요. 계정과 데이터 소스별로 따로 집계합니다.",
    observedDays: "선택한 {total}일 중 {observed}일은 사용량을 계산할 수 있는 충분한 측정값이 있습니다.",
    exportDesktopOnly: "Excel 내보내기는 데스크톱 앱에서 사용할 수 있습니다. 이 웹 데모에서는 Markdown을 다운로드할 수 있습니다.",
    rangeStart: "시작 날짜", rangeEnd: "종료 날짜",
    chartScroll: "가로로 스크롤하여 이전 날짜를 확인하세요. 기본으로 최근 날짜가 표시됩니다.",
    title: "공식 한도 기록", local: "로컬 사용량", today: "오늘 관측 소비", open: "한도 기록 보기", partial: "부분 관측", note: "현재 계정 한도 관측의 변화로, 다른 기기 사용도 포함될 수 있습니다. 로컬 Token과 별도이며 공식 일별 청구서가 아닙니다.", weekly: "장기 한도", session: "단기 한도", duration: "{minutes}분 기간", hours: "{hours}시간 기간", days: "{days}일 기간", points: "{points}퍼센트포인트", unknown: "미관측", insufficient: "표본 부족", unchanged: "관측값 변화 없음", coverage: "{minutes}분 관측", cycles: "{count}개 주기", samples: "{count}개 표본", gaps: "{count}개 공백", providerReadFailed: "공식 한도를 읽지 못했습니다. 저장된 기록은 볼 수 있지만 새 기록이 누락될 수 있습니다. 기존 대기 간격에 따라 자동 재시도합니다.", readFailed: "한도 기록을 읽지 못했습니다. 저장된 기록이 있으면 표시합니다.", writeFailed: "한도 기록을 저장하지 못했습니다. 공식 관측값은 받았지만 저장에 실패했습니다. 이전 기록은 보존되며 로컬 저장을 자동 재시도합니다.", unavailable: "한도 저장소를 사용할 수 없습니다. 기록이 일시 중지되었으며 원본 파일은 보존됩니다. 로컬 데이터와 진단을 확인하세요.", identity: "현재 계정을 확인할 수 없습니다. Codex 계정과 환경을 확인하세요.", retry: "기록 다시 읽기", paused: "기록이 꺼져 있으며 저장된 기록은 보존됩니다.", loading: "로컬 한도 기록 읽는 중…", timezone: "기록 시간대: {zone}", scope: "현재 계정 및 출처만", sum: "기록된 부분의 합계", sumNote: "누락된 날짜는 알 수 없음이며 소비 0인 날로 계산하지 않습니다.", chart: "일별 관측 소비 (퍼센트포인트)", table: "일별 한도 관측", date: "날짜", consumption: "관측 소비", state: "관측 상태", details: "일별 상세", close: "상세 닫기", reset: "{time} 초기화", unallocated: "날짜를 넘는 {count}개 구간 미배분", crossDay: "날짜 경계 미배분", start: "첫 관측", end: "마지막 관측", more: "이전 구간 불러오기", pageNote: "불러온 구간만 표시합니다. 이전 구간을 더 불러올 수 있으며 내보내기는 일치하는 모든 구간을 포함합니다.", baseline: "기준값만", continuous: "연속 관측", gap: "같은 날 공백: 순변화 보존, 관측 시간 제외", decreased: "관측값 감소, 새 기준값", changed: "한도 주기 변경", resumed: "기록 재개, 새 기준값", conflict: "관측값 충돌", historical: "가져온 부분 관측", migrated: "이전 관측에서 가져옴", mixed: "공식 및 가져온 관측", record: "일별 공식 한도 기록", recordNote: "Pulse 실행 중 약 1분마다 현재 계정을 기록합니다. 창을 숨겨도 계속되며 종료 또는 절전 시 멈춥니다. 로컬에 보존되며 꺼도 기록은 삭제되지 않습니다.", preferenceFailed: "기록 설정을 저장하지 못했습니다. 이전 설정을 유지합니다.", retrySettings: "설정 다시 읽기", preferenceReadFailed: "기록 설정을 읽지 못했습니다. 현재 기록 상태를 알 수 없습니다. 설정을 다시 읽은 후 변경하세요.", exportXlsx: "Excel 내보내기", exportMarkdown: "Markdown 내보내기", exportFailed: "한도 기록을 내보내지 못했습니다. 다시 시도하세요.", exported: "내보낸 위치: {path}", range: "한도 기록 날짜 범위", rangeLimit: "조회당 최대 366일이며 이전 기록도 보존됩니다.", window: "한도 기간", noWindows: "이 범위에 기록된 한도 기간이 없습니다.",
  },
  de: {
    localEstimate: "Lokale Kontingentschätzung",
    localEstimateCoverage: "Erfasste Tage ({observed}/{total})",
    localEstimatePeaks: "Gruppen zeigen den höchsten beobachteten Tageswert je Fenster. Gruppen ohne Messwerte bleiben unbekannt.",
    localEstimateGroupDays: "Gruppe mit {count} Tagen",
    localEstimateNote: "Die Schätzung summiert Tage mit genügend Kontomesswerten aus lokalen Sitzungsprotokollen. Nutzung anderer Geräte kann einfließen, und jedes Konto hat ein eigenes Kontingentfenster. Die Summe gibt weder den Verbrauch dieses Geräts noch den genutzten Anteil eines Tarifs an.",
    otherScopeHistory: "Der Kontingentverlauf eines anderen Kontos oder einer anderen Quelle ist lokal gespeichert. Wechseln Sie in Codex zurück zum betreffenden Konto oder wählen Sie in den Pulse-Einstellungen die frühere Quelle. Die Summe wird je Konto und Quelle berechnet.",
    observedDays: "An {observed} von {total} Tagen reichen die Messwerte zur Berechnung des Verbrauchs aus.",
    exportDesktopOnly: "Excel-Export erfordert die Desktop-App. In dieser Webdemo können Sie Markdown herunterladen.",
    rangeStart: "Startdatum", rangeEnd: "Enddatum",
    chartScroll: "Horizontal zu früheren Tagen scrollen; zuerst werden die neuesten Tage angezeigt.",
    title: "Offizielle Kontingenthistorie", local: "Lokale Nutzung", today: "Heute beobachteter Verbrauch", open: "Kontingenthistorie öffnen", partial: "Teilweise beobachtet", note: "Änderungen des aktuellen Kontokontingents, eventuell inklusive anderer Geräte. Getrennt von lokalen Tokens; keine offizielle Tagesabrechnung.", weekly: "Langes Fenster", session: "Kurzes Fenster", duration: "{minutes}-Minuten-Fenster", hours: "{hours}-Stunden-Fenster", days: "{days}-Tage-Fenster", points: "{points} Prozentpunkte", unknown: "Nicht beobachtet", insufficient: "Zu wenige Messwerte", unchanged: "Messwert unverändert", coverage: "{minutes} Min. erfasst", cycles: "{count} Zyklen", samples: "{count} Messwerte", gaps: "{count} Lücken", providerReadFailed: "Das offizielle Kontingent konnte nicht gelesen werden. Gespeicherte Historie bleibt verfügbar; neue Einträge können fehlen. Automatische Wiederholungen folgen den bisherigen Wartezeiten.", readFailed: "Kontingenthistorie konnte nicht gelesen werden. Gespeicherte Werte bleiben sichtbar, falls vorhanden.", writeFailed: "Die Kontingenthistorie konnte nicht gespeichert werden. Der offizielle Messwert wurde empfangen, aber nicht gespeichert. Alte Daten bleiben erhalten; das lokale Speichern wird automatisch erneut versucht.", unavailable: "Der Historienspeicher ist nicht verfügbar. Die Aufzeichnung pausiert; Originaldateien bleiben erhalten. Lokale Daten und Diagnose prüfen.", identity: "Aktuelles Konto nicht zuordenbar. Codex-Konto und Umgebung prüfen.", retry: "Historie erneut lesen", paused: "Aufzeichnung aus; gespeicherte Historie bleibt erhalten.", loading: "Lokale Kontingenthistorie wird gelesen…", timezone: "Zeitzone des Journals: {zone}", scope: "Nur aktuelles Konto und Quelle", sum: "Summe der erfassten Teile", sumNote: "Fehlende Tage bleiben unbekannt und zählen nicht als Tage ohne Verbrauch.", chart: "Täglich beobachteter Verbrauch in Prozentpunkten", table: "Tägliche Kontingentmessungen", date: "Datum", consumption: "Beobachteter Verbrauch", state: "Beobachtungsstatus", details: "Tagesdetails", close: "Details schließen", reset: "Zurücksetzung {time}", unallocated: "{count} tagesübergreifende Abschnitte ohne Zuordnung", crossDay: "Tagesübergreifend, nicht zugeordnet", start: "Erster Messwert", end: "Letzter Messwert", more: "Frühere Abschnitte laden", pageNote: "Nur geladene Abschnitte sichtbar. Frühere Abschnitte können nachgeladen werden. Exporte enthalten alle passenden Abschnitte.", baseline: "Nur Ausgangswert", continuous: "Laufende Beobachtung", gap: "Lücke am selben Tag: Nettoänderung erfasst, Zeit nicht abgedeckt", decreased: "Messwert gesunken; neuer Ausgangswert", changed: "Kontingentzyklus geändert", resumed: "Aufzeichnung fortgesetzt; neuer Ausgangswert", conflict: "Widersprüchlicher Messwert", historical: "Importierte Teilbeobachtung", migrated: "Aus früheren Beobachtungen importiert", mixed: "Offizielle und importierte Beobachtungen", record: "Offizielles Tageskontingent aufzeichnen", recordNote: "Solange Pulse läuft, wird das aktuelle Konto etwa minütlich erfasst, auch bei verborgenen Fenstern. Bei Beenden oder Ruhezustand pausiert dies. Lokal gespeichert; Ausschalten behält die Historie.", preferenceFailed: "Aufzeichnungseinstellung nicht gespeichert. Vorherige Einstellung bleibt bestehen.", retrySettings: "Einstellungen erneut lesen", preferenceReadFailed: "Die Aufzeichnungseinstellung konnte nicht gelesen werden. Der Aufzeichnungsstatus ist unbekannt. Vor einer Änderung die Einstellungen erneut lesen.", exportXlsx: "Excel exportieren", exportMarkdown: "Markdown exportieren", exportFailed: "Kontingenthistorie nicht exportiert. Erneut versuchen.", exported: "Exportiert nach {path}", range: "Datumsbereich der Kontingenthistorie", rangeLimit: "Je Abfrage höchstens 366 Tage. Frühere Historie bleibt gespeichert.", window: "Kontingentfenster", noWindows: "Für diesen Zeitraum ist noch kein Kontingentfenster erfasst.",
  },
};
export function quotaHistoryCopy(language: string, key: QuotaHistoryCopyKey, values?: Record<string, string | number>): string {
  let result = messages[getLanguage(language)][key];
  if (values) for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
  return result;
}
