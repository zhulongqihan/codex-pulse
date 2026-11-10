import { getLanguage, type Language } from "./languages";

const en = {
  title: "The previous update did not finish", restored: "The previous application has been restored and verified. You can continue using it.",
  incomplete: "Recovery could not be confirmed. Open the update records to check what happened.", failed: "The update did not finish. Check the reason before trying again.",
  readError: "Could not read the update result", reason: "View failure reason", unknown: "No specific reason was recorded.",
  version: "Attempted version", recorded: "Record saved", open: "Open update records", dismiss: "Got it", actionError: "The action could not be completed. Please try again.",
};
const messages: Record<Language, typeof en> = {
  en,
  zh: { title: "上次更新未完成", restored: "已核验恢复原程序，可以继续使用。", incomplete: "暂时无法确认程序是否已恢复，请打开更新记录核对。", failed: "更新未完成，请查看原因后重试。", readError: "无法读取更新结果", reason: "查看失败原因", unknown: "未记录具体原因。", version: "尝试版本", recorded: "记录时间", open: "打开更新记录", dismiss: "已了解", actionError: "操作未完成，请重试。" },
  "zh-Hant": { title: "上次更新未完成", restored: "已核實恢復原程式，可以繼續使用。", incomplete: "暫時無法確認程式是否已恢復，請開啟更新記錄核對。", failed: "更新未完成，請查看原因後重試。", readError: "無法讀取更新結果", reason: "查看失敗原因", unknown: "未記錄具體原因。", version: "嘗試版本", recorded: "記錄時間", open: "開啟更新記錄", dismiss: "已了解", actionError: "操作未完成，請重試。" },
  ja: { title: "前回の更新が完了しませんでした", restored: "以前のアプリへの復元を確認しました。引き続き使用できます。", incomplete: "復元を確認できませんでした。更新記録を開いて確認してください。", failed: "更新が完了しませんでした。原因を確認してから再試行してください。", readError: "更新結果を読み取れません", reason: "失敗の理由を確認", unknown: "具体的な理由は記録されていません。", version: "更新先バージョン", recorded: "記録日時", open: "更新記録を開く", dismiss: "確認しました", actionError: "操作が完了しませんでした。再試行してください。" },
  ko: { title: "이전 업데이트가 완료되지 않았습니다", restored: "이전 프로그램의 복원을 확인했습니다. 계속 사용할 수 있습니다.", incomplete: "복원 상태를 확인할 수 없습니다. 업데이트 기록을 열어 확인하세요.", failed: "업데이트가 완료되지 않았습니다. 원인을 확인한 뒤 다시 시도하세요.", readError: "업데이트 결과를 읽을 수 없습니다", reason: "실패 원인 보기", unknown: "구체적인 원인이 기록되지 않았습니다.", version: "시도한 버전", recorded: "기록 시간", open: "업데이트 기록 열기", dismiss: "확인했습니다", actionError: "작업을 완료하지 못했습니다. 다시 시도하세요." },
  de: { title: "Das letzte Update wurde nicht abgeschlossen", restored: "Die vorherige Anwendung wurde nachweislich wiederhergestellt. Sie können sie weiter verwenden.", incomplete: "Die Wiederherstellung konnte nicht bestätigt werden. Prüfen Sie die Updateaufzeichnungen.", failed: "Das Update wurde nicht abgeschlossen. Prüfen Sie vor einem neuen Versuch den Grund.", readError: "Updateergebnis konnte nicht gelesen werden", reason: "Fehlergrund anzeigen", unknown: "Es wurde kein genauer Grund aufgezeichnet.", version: "Versuchte Version", recorded: "Aufgezeichnet", open: "Updateaufzeichnungen öffnen", dismiss: "Verstanden", actionError: "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen." },
};
export function updateRecoveryCopy(language: string, key: keyof typeof en) { return messages[getLanguage(language)][key]; }
