// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { QuotaHistorySummary, QuotaHistoryView, QuotaRecordingSettings } from "./quota-history";
import type { QuotaHistoryDaily, QuotaHistoryDayResponse, QuotaHistoryResponse, QuotaHistorySegment } from "../lib/quota-history";
import { quotaHistoryCopy } from "../lib/quota-history-copy";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(), save: vi.fn(), listeners: new Map<string, (event: { payload: any }) => void>() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke, isTauri: native.isTauri }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: any) => { native.listeners.set(name, callback); return () => native.listeners.delete(name); }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: native.save }));

const daily = (kind: "session" | "weekly" = "session", minutes = 300, points: number | null = 8, date = "2026-11-15"): QuotaHistoryDaily => ({ date, kind, windowMinutes: minutes, consumedPercentPoints: points, coveredMinutes: 9, sampleCount: points === null ? 1 : 2, cycleCount: 1, gapCount: 0, unallocatedCount: 0, status: points === null ? "insufficient_samples" : points === 0 ? "unchanged" : "partial", source: "official" });
function history(overrides: Partial<QuotaHistoryResponse> = {}): QuotaHistoryResponse {
  return { schemaVersion: 1, identityRevision: 1, scopeAvailable: true, timezone: "Asia/Shanghai", enabled: true, storageStatus: "ready", readStatus: "ready", updatedAt: null, startDate: "2026-11-14", endDate: "2026-11-15", daily: [daily(), daily("weekly", 10080, null)], summaries: [], unallocatedCount: 0, ...overrides };
}
const segment: QuotaHistorySegment = { id: 9, kind: "session", windowMinutes: 300, resetsAt: "2026-11-16T00:00:00Z", date: "2026-11-15", startAt: "2026-11-15T01:00:00Z", endAt: "2026-11-15T01:09:00Z", startUsedPercent: 20, endUsedPercent: 28, consumedPercentPoints: 8, coveredMinutes: 9, reason: "continuous", source: "official" };
const detail = (overrides: Partial<QuotaHistoryDayResponse> = {}): QuotaHistoryDayResponse => ({ schemaVersion: 1, identityRevision: 1, scopeAvailable: true, storageStatus: "ready", readStatus: "ready", timezone: "Asia/Shanghai", date: "2026-11-15", kind: "session", windowMinutes: 300, segments: [segment], nextBefore: null, ...overrides });
beforeEach(async () => {
  native.listeners.clear(); native.invoke.mockReset(); await i18n.changeLanguage("en");
  native.isTauri.mockReturnValue(true); native.save.mockReset().mockResolvedValue(null);
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "get_quota_recording_preferences") return { schemaVersion: 1, enabled: true, timezone: "Asia/Shanghai" };
    if (command === "fetch_quota_history") return history();
    if (command === "fetch_quota_history_day") return detail({ segments: [] });
    throw new Error(`Unexpected command ${command}`);
  });
});

describe("official quota history", () => {
  it("explains saved history outside the current scope and counts only days with a consumption value", async () => {
    native.invoke.mockResolvedValue({
      ...history({
        startDate: "2026-11-13",
        daily: [daily("session", 300, 0), daily("session", 300, null, "2026-11-14"), daily("weekly", 10080, null)],
      }),
      hasOtherScopeHistory: true,
    });
    render(<QuotaHistoryView/>);
    expect(await screen.findByText(/Quota history from another account or source is saved locally/)).toBeVisible();
    expect(screen.getByText("1 of 3 days had enough readings to calculate consumption.")).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("Insufficient samples")).toBeVisible();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Quota window" }), "weekly:10080");
    expect(screen.getByText("0 of 3 days had enough readings to calculate consumption.")).toBeVisible();
  });

  it.each([
    [true, undefined],
    [true, false],
    [false, true],
  ])("withholds the separate-history note for scopeAvailable=%s and hasOtherScopeHistory=%s", async (scopeAvailable, hasOtherScopeHistory) => {
    native.invoke.mockResolvedValue({
      ...history({ scopeAvailable, daily: scopeAvailable ? [daily()] : [] }),
      hasOtherScopeHistory,
    });
    render(<QuotaHistoryView/>);
    if (scopeAvailable) {
      expect(await screen.findByText("1 of 2 days had enough readings to calculate consumption.")).toBeVisible();
    } else {
      expect(await screen.findByText("Current account identity is unavailable. Check the selected Codex account and environment.")).toBeVisible();
      expect(screen.queryByText(/days had enough readings/)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Quota history from another account or source is saved locally/)).not.toBeInTheDocument();
  });

  it.each([
    ["zh", "Excel 导出需使用桌面版；网页演示可下载 Markdown。"],
    ["zh-Hant", "Excel 匯出需使用桌面版；網頁示範可下載 Markdown。"],
    ["en", "Excel export requires the desktop app. You can download Markdown from this web demo."],
    ["ja", "Excel出力はデスクトップ版で利用できます。このWebデモではMarkdownをダウンロードできます。"],
    ["ko", "Excel 내보내기는 데스크톱 앱에서 사용할 수 있습니다. 이 웹 데모에서는 Markdown을 다운로드할 수 있습니다."],
    ["de", "Excel-Export erfordert die Desktop-App. In dieser Webdemo können Sie Markdown herunterladen."],
  ])("explains the web Excel limitation and the available Markdown export in %s", async (language, message) => {
    await i18n.changeLanguage(language); native.isTauri.mockReturnValue(false);
    native.save.mockResolvedValue("Quota-demo.xlsx");
    native.invoke.mockImplementation(async (command: string) => {
      if (command === "fetch_quota_history") return history();
      if (command === "get_pulse_paths") return { data: "F:/Demo/data", logs: "F:/Demo/logs", profile: "F:/Demo/webview", temporary: "F:/Demo/tmp", exports: "F:/Demo/exports" };
      throw new Error("此操作需要 Codex Pulse 桌面版。 / Available in the desktop app only.");
    });
    render(<QuotaHistoryView/>); await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: quotaHistoryCopy(language, "exportXlsx") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).not.toHaveTextContent(quotaHistoryCopy(language, "exportFailed"));
    expect(native.save).not.toHaveBeenCalled();
    expect(native.invoke.mock.calls.filter(([command]) => command === "export_quota_history")).toHaveLength(0);
  });

  it("keeps a retryable message for desktop export failures without exposing internal errors", async () => {
    native.save.mockResolvedValue("F:/Exports/Quota.xlsx");
    native.invoke.mockImplementation(async (command: string) => {
      if (command === "fetch_quota_history") return history();
      if (command === "get_pulse_paths") return { data: "F:/Pulse/data", logs: "F:/Pulse/logs", profile: "F:/Pulse/webview", temporary: "F:/Pulse/tmp", exports: "F:/Pulse/exports" };
      throw new Error("PRIVATE_INTERNAL_FAILURE_QuotaDb_AuthScope");
    });
    render(<QuotaHistoryView/>); await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Export Excel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not export quota history. Please retry.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE_INTERNAL_FAILURE");
    expect(screen.getByRole("alert")).not.toHaveTextContent("desktop app");
  });

  it("still offers Markdown export in the web demo", async () => {
    native.isTauri.mockReturnValue(false); native.save.mockResolvedValue("Quota-demo.md");
    native.invoke.mockImplementation(async (command: string, args: any) => {
      if (command === "fetch_quota_history") return history();
      if (command === "get_pulse_paths") return { data: "F:/Demo/data", logs: "F:/Demo/logs", profile: "F:/Demo/webview", temporary: "F:/Demo/tmp", exports: "F:/Demo/exports" };
      if (command === "export_quota_history" && args.format === "markdown") return { path: "Quota-demo.md", format: "markdown", range: "30d", exportedAt: "2026-11-15T04:00:00Z" };
      throw new Error("Unexpected demo export command");
    });
    render(<QuotaHistoryView/>); await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Export Markdown" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Exported to Quota-demo.md");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("reads today independently and keeps weekly unknown separate from session consumption", async () => {
    const open = vi.fn(); render(<QuotaHistorySummary onOpenHistory={open}/>);
    const summary = await screen.findByTestId("quota-history-summary");
    await waitFor(() => expect(summary).toHaveTextContent("8 pp"));
    expect(summary).toHaveTextContent("—");
    expect(within(summary).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Ledger timezone: Asia/Shanghai")).not.toBeInTheDocument();
    expect(screen.queryByText("Partial observations")).not.toBeInTheDocument();
    await userEvent.click(within(summary).getByRole("button", { name: "About today's quota readings" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Ledger timezone: Asia/Shanghai");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Partial observations");
    await userEvent.keyboard("{Escape}");
    expect(native.invoke).toHaveBeenCalledWith("fetch_quota_history", { range: "1d" });
    await userEvent.click(within(summary).getByRole("button", { name: "View quota history" })); expect(open).toHaveBeenCalledOnce();
  });

  it("shows a short official refresh failure beside the retained readings and keeps the explanation on demand", async () => {
    native.invoke.mockResolvedValue(history({ readStatus: "read_failed", daily: [daily("session", 300, 0)] }));
    const open = vi.fn();
    render(<QuotaHistorySummary onOpenHistory={open}/>);
    const summary = screen.getByTestId("quota-history-summary");
    expect(await within(summary).findByRole("alert")).toHaveTextContent(/^Quota refresh failed$/);
    expect(summary).toHaveTextContent("0 pp");
    expect(summary).toHaveTextContent("—");
    expect(screen.queryByText(/Saved history remains available/)).not.toBeInTheDocument();
    expect(screen.queryByText("Reading unchanged")).not.toBeInTheDocument();
    await userEvent.click(within(summary).getByRole("button", { name: "About today's quota readings" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Saved history remains available");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(summary).getByRole("button", { name: "View quota history" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("keeps local history read errors directly retryable from the dashboard summary", async () => {
    native.invoke.mockRejectedValueOnce(new Error("ledger read failed"));
    render(<QuotaHistorySummary onOpenHistory={() => {}}/>);
    const summary = screen.getByTestId("quota-history-summary");
    expect(await within(summary).findByRole("alert")).toHaveTextContent(/^History unavailable$/);
    await userEvent.click(within(summary).getByRole("button", { name: "Read history again" }));
    await waitFor(() => expect(summary).toHaveTextContent("8 pp"));
    expect(within(summary).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps saved day segments readable when the latest official reading failed", async () => {
    native.invoke.mockImplementation(async (command: string) => command === "fetch_quota_history" ? history({ readStatus: "read_failed" }) : detail({ readStatus: "read_failed" }));
    render(<QuotaHistoryView/>);
    await userEvent.click(await screen.findByRole("button", { name: "2026-11-15" }));
    const day = await screen.findByTestId("quota-day-detail");
    await waitFor(() => expect(day).toHaveTextContent("8 pp"));
    expect(within(day).getByRole("alert")).toHaveTextContent("Official quota could not be read");
    expect(day).toHaveTextContent("Saved history remains available");
    expect(within(day).queryByRole("button", { name: "Read history again" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not read quota history/)).not.toBeInTheDocument();
  });

  it("labels migrated known daily consumption as imported partial even without an old sample count", async () => {
    native.invoke.mockResolvedValue(history({ daily: [{ ...daily(), sampleCount: 0, status: "historical_partial", source: "coach_migration" }] }));
    render(<QuotaHistoryView/>);
    const table = await screen.findByRole("table");
    const imported = within(table).getByRole("row", { name: /2026-11-15/ });
    expect(imported).toHaveTextContent("8 pp"); expect(imported).toHaveTextContent("Imported partial observation");
    expect(imported).not.toHaveTextContent("Not observed");
  });

  it("distinguishes observed unchanged from unknown and never clips a day above 100 pp", async () => {
    native.invoke.mockResolvedValue(history({ daily: [daily("session", 300, 125), daily("session", 300, 0, "2026-11-14")] }));
    render(<QuotaHistoryView/>);
    const table = await screen.findByRole("table", { name: "Daily quota observations" });
    expect(table).toHaveTextContent("125 pp"); expect(table).toHaveTextContent("Reading unchanged");
    const chart = screen.getByRole("img", { name: "Daily observed consumption in percentage points" });
    expect(chart).toHaveAttribute("data-scale-max", "125");
  });

  it("renders Paper observations as bars and zero dots, with a gap for an unknown day", async () => {
    native.invoke.mockResolvedValue(history({
      startDate: "2026-11-13",
      daily: [daily("session", 300, 0, "2026-11-14"), daily("session", 300, 125)],
    }));
    render(<QuotaHistoryView paper/>);
    const chart = await screen.findByRole("img", { name: "Daily observed consumption in percentage points" });
    expect(chart).toHaveAttribute("data-scale-max", "200");
    expect(chart.querySelectorAll(".pulse-quota-chart-guide")).toHaveLength(3);
    expect(chart.querySelector('[data-observation="positive"] .pulse-quota-chart-bar')).toBeInTheDocument();
    expect(chart.querySelector('[data-observation="zero"] .pulse-quota-chart-zero-dot')).toBeInTheDocument();
    const missing = chart.querySelector('[data-observation="missing"]');
    expect(missing).toHaveAttribute("data-chart-date", "2026-11-13");
    expect(missing?.querySelector("title")).toHaveTextContent("Not observed");
    expect(missing?.querySelector(".pulse-quota-chart-bar, .pulse-quota-chart-zero-dot")).toBeNull();
    expect(chart.querySelector('[data-chart-date="2026-11-15"] text')).toHaveTextContent("11-15");
  });

  it("gives both Paper export formats the same button treatment", async () => {
    render(<QuotaHistoryView paper/>);
    await screen.findByRole("table");
    const excel = screen.getByRole("button", { name: "Export Excel" });
    const markdown = screen.getByRole("button", { name: "Export Markdown" });
    expect(excel).toHaveClass("border", "bg-surface", "h-8");
    expect(markdown.className).toBe(excel.className);
    expect(markdown).toBeEnabled();
    expect(excel).toBeEnabled();
  });

  it("loads paginated day details and retains the first page", async () => {
    native.invoke.mockImplementation(async (command: string, args: any) => command === "fetch_quota_history" ? history() : command === "fetch_quota_history_day" ? detail({ segments: [{ ...segment, id: args.before ? 8 : 9, reason: args.before ? "cross_day" : "continuous", date: args.before ? null : segment.date }], nextBefore: args.before ? null : 9 }) : null);
    render(<QuotaHistoryView/>);
    await userEvent.click(await screen.findByRole("button", { name: "2026-11-15" }));
    await userEvent.click(await screen.findByRole("button", { name: "Load earlier segments" }));
    await waitFor(() => expect(screen.getByTestId("quota-day-segments").children).toHaveLength(2));
    expect(screen.getByTestId("quota-day-detail")).toHaveTextContent("Cross-day, unallocated");
  });

  it("updates the settings switch from authoritative cross-window events", async () => {
    render(<QuotaRecordingSettings/>);
    const toggle = await screen.findByRole("switch", { name: "Record daily official quota" });
    await waitFor(() => expect(toggle).toBeEnabled());
    native.invoke.mockResolvedValueOnce({ schemaVersion: 1, enabled: false, timezone: "Asia/Shanghai" });
    await act(async () => { native.listeners.get("quota-history-updated")?.({ payload: null }); });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("clears prior account records immediately and ignores older revision responses", async () => {
    render(<QuotaHistoryView/>);
    await screen.findByRole("table");
    let finish!: (value: QuotaHistoryResponse) => void;
    native.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { native.listeners.get("codex-identity-updated")!({ payload: { revision: 2 } }); });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await act(async () => { finish(history({ identityRevision: 1 })); });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps read failures and storage failures distinct while retaining known daily records", async () => {
    native.invoke.mockResolvedValue(history({ readStatus: "read_failed", storageStatus: "write_failed" }));
    render(<QuotaHistoryView/>);
    await screen.findByRole("table");
    expect(screen.getByText(/Official quota could not be read/)).toBeVisible();
    expect(screen.getByText(/Quota history could not be saved/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Read history again" })).not.toBeInTheDocument();
  });

  it.each([new Error("PRIVATE_INTERNAL_SQLITE_PATH"), "legacy mock error", { code: "local_read_failed" }, { code: "identity_changed" }])("shows a local-only retry after an IPC failure without claiming recording stopped: %j", async failure => {
    native.invoke.mockRejectedValueOnce(failure);
    render(<QuotaHistoryView/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read quota history");
    expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE_INTERNAL");
    expect(screen.queryByText(/Recording is paused/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Read history again" }));
    expect(await screen.findByRole("table")).toHaveTextContent("8 pp");
    expect(native.invoke.mock.calls.every(([command]) => command === "fetch_quota_history")).toBe(true);
  });

  it("shows initialization unavailability without fabricating a normal empty history", async () => {
    native.invoke.mockRejectedValue({ code: "storage_unavailable" });
    render(<QuotaHistoryView/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Recording is paused; original files are retained");
    expect(screen.queryByText(/Could not read quota history/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
  });

  it("does not imply a provider failure when only saving the successful reading failed", async () => {
    native.invoke.mockResolvedValue(history({ storageStatus: "write_failed" }));
    render(<QuotaHistoryView/>);
    expect(await screen.findByRole("table")).toHaveTextContent("8 pp");
    expect(screen.getByRole("alert")).toHaveTextContent("The official reading was received");
    expect(screen.queryByText(/Official quota could not be read/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read history again" })).not.toBeInTheDocument();
  });

  it("keeps local day reread failure separate from provider and storage failures", async () => {
    native.invoke.mockImplementation(async (command: string) => {
      if (command === "fetch_quota_history") return history();
      throw { code: "local_read_failed" };
    });
    render(<QuotaHistoryView/>);
    await userEvent.click(await screen.findByRole("button", { name: "2026-11-15" }));
    const day = await screen.findByTestId("quota-day-detail");
    expect(await within(day).findByRole("alert")).toHaveTextContent("Could not read quota history");
    expect(within(day).getByRole("button", { name: "Read history again" })).toBeEnabled();
    expect(day).not.toHaveTextContent("Recording is paused");
  });

  it.each([
    ["zh", "官方额度读取失败", "官方读数已取得", "记录已暂停，原文件仍保留", "重新读取设置"],
    ["zh-Hant", "官方額度讀取失敗", "已取得官方讀數", "記錄已暫停，原檔案仍保留", "重新讀取設定"],
    ["en", "Official quota could not be read", "The official reading was received", "Recording is paused; original files are retained", "Read settings again"],
    ["ja", "公式の上限を読み取れません", "公式の値は取得しました", "記録は一時停止し、元のファイルは保持", "設定を再読込"],
    ["ko", "공식 한도를 읽지 못했습니다", "공식 관측값은 받았지만", "기록이 일시 중지되었으며 원본 파일은 보존", "설정 다시 읽기"],
    ["de", "Das offizielle Kontingent konnte nicht gelesen werden", "Der offizielle Messwert wurde empfangen", "Die Aufzeichnung pausiert; Originaldateien bleiben erhalten", "Einstellungen erneut lesen"],
  ])("presents provider, saving and unavailable states separately in %s", async (language, provider, saving, unavailable, retrySettings) => {
    await i18n.changeLanguage(language);
    native.invoke.mockImplementation(async (command: string) => {
      if (command === "fetch_quota_history") return history({ readStatus: "read_failed", storageStatus: "write_failed" });
      throw { code: "storage_unavailable" };
    });
    render(<><QuotaHistoryView/><QuotaRecordingSettings/></>);
    await screen.findByRole("table");
    expect(screen.getByText(new RegExp(provider))).toBeVisible();
    expect(screen.getByText(new RegExp(saving))).toBeVisible();
    expect(await screen.findByText(new RegExp(unavailable))).toBeVisible();
    expect(screen.getByRole("button", { name: retrySettings })).toBeEnabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.queryByRole("button", { name: quotaHistoryCopy(language, "retry") })).not.toBeInTheDocument();
  });

  it.each([
    [{ code: "storage_unavailable" }, "Recording is paused; original files are retained"],
    [new Error("PRIVATE_INTERNAL_IPC_FAILURE"), "Recording status is unknown"],
  ])("distinguishes unavailable recording storage from unknown preference reads: %j", async (failure, expected) => {
    render(<QuotaRecordingSettings/>);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    native.invoke.mockRejectedValue(failure);
    await act(async () => { native.listeners.get("quota-history-updated")!({ payload: null }); });
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(toggle).toBeDisabled();
    expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE_INTERNAL");
    if (failure instanceof Error) expect(screen.getByRole("alert")).not.toHaveTextContent("Recording is paused");
  });

  it("offers independent window durations and rejects custom ranges longer than 366 days", async () => {
    native.invoke.mockResolvedValue(history({ daily: [daily("session", 300, 8), daily("session", 240, 12), daily("weekly", 10080, null)] }));
    render(<QuotaHistoryView/>);
    const windowSelect = await screen.findByRole("combobox", { name: "Quota window" });
    await userEvent.selectOptions(windowSelect, "session:240");
    expect(screen.getByRole("table")).toHaveTextContent("12 pp"); expect(screen.getByRole("table")).not.toHaveTextContent("8 pp");
    const rangeSelect = screen.getByRole("combobox", { name: "Quota history date range" });
    expect(within(rangeSelect).queryByRole("option", { name: /All retained/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(rangeSelect, "custom");
    const inputs = screen.getAllByDisplayValue("").filter(input => input.tagName === "INPUT");
    fireEvent.change(inputs[0], { target: { value: "2024-01-01" } }); fireEvent.change(inputs[1], { target: { value: "2026-11-15" } });
    await userEvent.click(screen.getByRole("button", { name: "Apply Range" }));
    expect(screen.getByRole("alert")).toHaveTextContent("366 days");
    expect(native.invoke.mock.calls.filter(([command]) => command === "fetch_quota_history")).toHaveLength(1);
  });

  it("does not relabel old range records while the next range is loading", async () => {
    render(<QuotaHistoryView/>); await screen.findByRole("table");
    native.invoke.mockImplementationOnce(() => new Promise(() => {}));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Quota history date range" }), "7d");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
  });

  it.each(["7d", "365d"])("does not display or export previous 30d data after a failed %s query", async nextRange => {
    render(<QuotaHistoryView/>);
    expect(await screen.findByRole("table")).toHaveTextContent("8 pp");
    native.invoke.mockRejectedValueOnce(new Error("ledger read failed"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Quota history date range" }), nextRange);
    await screen.findByRole("alert");
    expect(screen.getByRole("combobox", { name: "Quota history date range" })).toHaveValue(nextRange);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Daily observed consumption in percentage points" })).not.toBeInTheDocument();
    const exportButton = screen.getByRole("button", { name: "Export Excel" });
    expect(exportButton).toBeDisabled(); await userEvent.click(exportButton);
    expect(native.invoke.mock.calls.filter(([command]) => command === "export_quota_history")).toHaveLength(0);
  });

  it("retains known records when a same-range background reread fails", async () => {
    render(<QuotaHistoryView/>); await screen.findByRole("table");
    native.invoke.mockRejectedValueOnce(new Error("ledger read failed"));
    await act(async () => { native.listeners.get("quota-history-updated")!({ payload: null }); });
    await screen.findByRole("alert");
    expect(screen.getByRole("table")).toHaveTextContent("8 pp");
    expect(screen.getByRole("combobox", { name: "Quota history date range" })).toHaveValue("30d");
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeEnabled();
  });

  it("retains the backend switch value when saving fails", async () => {
    render(<QuotaRecordingSettings/>);
    const toggle = await screen.findByRole("switch", { name: "Record daily official quota" });
    await waitFor(() => expect(toggle).toBeEnabled());
    native.invoke.mockRejectedValueOnce(new Error("disk full")); await userEvent.click(toggle);
    await screen.findByRole("alert"); expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("rejects an old identity read after a local scope invalidation without refreshing official quota", async () => {
    let finish!: (value: unknown) => void;
    native.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<QuotaHistorySummary onOpenHistory={() => {}}/>);
    await waitFor(() => expect(native.listeners.has("quota-history-updated")).toBe(true));
    await act(async () => { native.listeners.get("quota-history-updated")!({ payload: { identityRevision: 2 } }); });
    await waitFor(() => expect(screen.getByTestId("quota-history-summary")).toHaveTextContent("8 pp"));
    await act(async () => { finish(history({ identityRevision: 1, daily: [daily("session", 300, 99)] })); });
    expect(screen.getByTestId("quota-history-summary")).not.toHaveTextContent("99 pp");
    expect(native.invoke.mock.calls.every(([command]) => command === "fetch_quota_history")).toBe(true);
  });
});
