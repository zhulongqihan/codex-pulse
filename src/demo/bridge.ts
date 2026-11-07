import { isTauri } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { TrayPopoverData } from "../pulse/lib/tray-popover";
import type { PulsePreferences } from "../pulse/lib/pulse-appearance";
import { account, catalog, forecast, monthly, now, overview, projectAnalytics, projectDaySessions, projectSessionDays, replay, resets, retainedFrom, sessions, today } from "./fixtures";

const unavailable = () => { throw new Error("此操作需要 Codex Pulse 桌面版。合成演示不会访问本机文件、账号或执行模型请求。 / Available in the desktop app only."); };
const stamp = () => new Date().toISOString();
const scan = () => ({ importedDays: overview("all").daily.length, scannedAt: stamp(), timezone: "Asia/Shanghai", metrics: { totalMs: 0, pricingMs: 0, parseMs: 0, dbMs: 0, filesScanned: sessions.length, filesParsed: 0, filesReused: sessions.length, bytesRead: 0 } });
const paths = { data: "F:/Demo/CodexPulse/data", logs: "F:/Demo/CodexPulse/data/logs", profile: "F:/Demo/CodexPulse/data/webview", temporary: "F:/Demo/CodexPulse/data/tmp", exports: "F:/Demo/CodexPulse/data/exports" };
const preferences: PulsePreferences = { skinId: "clear", theme: "system", motionLevel: "gentle", compactMode: false, respectReducedMotion: true, widgetVisible: false, widgetExpanded: false, widgetAlwaysOnTop: true };
let tray: TrayPopoverData | null = null;
let widget: TrayPopoverData | null = null;
const creditScopes = new Map<string, { revision: number; active: boolean }>();

function initialSnapshot(): TrayPopoverData {
  const limits = account(); const day = overview("1d").totals;
  return { account: limits.account ?? null, membership: "Pro · Demo", workspace: "Synthetic workspace", updatedAt: limits.updatedAt, stale: false,
    quotas: [{ kind: "5h", label: "5h", remainingPercent: limits.session!.remainingPercent, usedText: "28%", resetText: "2h 30m" },
      { kind: "weekly", label: "Weekly", remainingPercent: limits.weekly!.remainingPercent, usedText: "41%", resetText: "4d 4h" }],
    tokens: { value: (day.totalTokens / 1000).toFixed(1) + "K", exact: day.totalTokens.toLocaleString() }, cost: day.costUSD === null ? "—" : "$" + day.costUSD.toFixed(3),
    labels: { remaining: "剩余 / Remaining", today: "今日 / Today", cost: "API 估价", unavailable: "未提供", showMain: "主窗口", quit: "退出" } };
}

function downloadMarkdown(range: string, path: string) {
  const data = overview(range);
  const lines = ["# Codex Pulse — 合成演示 / Synthetic demo", "", "This export contains synthetic examples only.", "",
    `Range: ${data.startDate} — ${data.endDate}`, "", "| Date | Input | Cached input | Output | Total | API estimate USD |", "|---|---:|---:|---:|---:|---:|"];
  for (const row of data.daily) lines.push(`| ${row.date} | ${row.inputTokens} | ${row.cachedInputTokens} | ${row.outputTokens} | ${row.totalTokens} | ${row.costUSD === null ? "unknown" : row.costUSD.toFixed(6)} |`);
  const link = document.createElement("a"); const objectUrl = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
  link.href = objectUrl; link.download = path.split(/[\\/]/).at(-1) || "CodexPulse-demo.md"; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return { path: link.download, format: "markdown", range, exportedAt: stamp() };
}

/** Explicit browser-only opt-in. A real Tauri window can never be replaced by demo IPC. */
export function installDemoBridge() {
  if (isTauri() || new URLSearchParams(location.search).get("demo") !== "1") return;
  document.documentElement.dataset.demo = "true";
  tray = initialSnapshot(); widget = initialSnapshot();
  const label = location.hash === "#tray" ? "tray" : location.hash === "#widget" ? "widget" : "main";
  mockWindows(label);
  mockIPC(async (command, input) => {
    const args = (input ?? {}) as Record<string, any>;
    switch (command) {
      case "scan_usage": case "rescan_project": return scan();
      case "refresh_usage_data": return { scan: scan(), limits: account(), limitsError: null, limitsSkipped: false, refreshedAt: stamp() };
      case "fetch_overview": return overview(args.range);
      case "fetch_monthly_usage": return monthly();
      case "fetch_project_analytics": return projectAnalytics(args.project, args.range);
      case "fetch_session_details": return structuredClone(sessions);
      case "fetch_session_detail": return replay(args.path);
      case "rescan_session": return { scan: scan(), session: sessions.find(row => row.path === args.path), detail: replay(args.path) };
      case "fetch_project_session_days": return projectSessionDays(args.project, args.range, args.query ?? "", args.before);
      case "fetch_project_day_sessions": return projectDaySessions(args.project, args.date, args.query ?? "");
      case "fetch_model_pricing_catalog": case "refresh_model_pricing": return catalog();
      case "fetch_codex_limits": return account();
      case "fetch_codex_quota_forecast": return forecast();
      case "fetch_latest_codex_reset": return resets[0];
      case "fetch_codex_reset_history": return resets.filter(row => Date.parse(row.announcedAt) >= now.getTime() - Number(args.days ?? 30) * 86_400_000);
      case "fetch_usage_diagnostics": return { codexHome: "F:/Demo/Codex", cachePath: `${paths.data}/codex-pulse.db`, runtime: "synthetic-demo", status: "ready", filesFound: sessions.length, cachedDays: Math.round((Date.parse(today) - Date.parse(retainedFrom)) / 86_400_000) + 1, error: null };
      case "get_pulse_paths": return paths;
      case "get_pulse_preferences": return preferences;
      case "get_legacy_preferences": return null;
      case "set_pulse_preferences": Object.assign(preferences, args.patch ?? {}); await emit("pulse-preferences-changed", preferences); return preferences;
      case "get_tray_popover": return tray;
      case "update_tray": tray = args.payload?.popover ?? tray; await emit("tray-popover-updated", tray); return null;
      case "get_widget_snapshot": return widget;
      case "update_widget_snapshot": widget = args.data; await emit("widget-snapshot-updated", widget); return null;
      case "session_credits_identity": return "synthetic-demo-only";
      case "set_session_credits_scope": creditScopes.set(args.scope, { revision: args.revision, active: args.active }); return null;
      case "fetch_session_credits": {
        const scope = creditScopes.get(args.scope);
        return { identity: "synthetic-demo-only", requestStatus: null, retryAt: null,
          rows: scope?.active && scope.revision === args.revision ? (args.threads ?? []).filter((row: { threadId: string }) => sessions.some(session => session.threadId === row.threadId)).map((row: { threadId: string }) => ({ threadId: row.threadId, dataStatus: "available", balanceUsageCredits: "1.250001", usageSource: "synthetic-demo", dataAsOf: stamp(), fetchedAt: stamp(), stale: false, isMock: true })) : [] };
      }
      case "check_for_updates": return { hasUpdate: false, currentVersion: "0.3.0", latestVersion: "0.3.0", latestTag: "v0.3.0", releaseName: "Codex Pulse", releaseNotes: "Browser demonstration: update checks are disabled.", releaseUrl: "https://github.com/zhulongqihan/codex-pulse/releases", etag: null, notModified: false };
      case "set_background_refresh_interval": case "reset_usage_state": return null;
      case "plugin:autostart|is_enabled": return false;
      case "plugin:dialog|save": return args.options?.defaultPath ?? "CodexPulse-demo.md";
      case "plugin:dialog|open": return null;
      case "export_usage": return args.format === "markdown" ? downloadMarkdown(args.range, args.path) : unavailable();
      case "plugin:window|inner_size": case "plugin:window|outer_size": return { width: innerWidth, height: innerHeight };
      case "plugin:window|scale_factor": return devicePixelRatio;
      case "plugin:window|is_visible": return true;
      case "plugin:window|set_size": case "plugin:window|start_dragging": case "plugin:log|attach_console": case "plugin:log|detach_console": case "plugin:log|log": return null;
      case "open_url": {
        const url = new URL(String(args.url));
        if (url.protocol !== "https:" || url.hostname !== "github.com") return unavailable();
        window.open(url.href, "_blank", "noopener,noreferrer"); return null;
      }
      case "widget_action": case "tray_popover_action": case "activate_codex_window": case "download_and_install_update": case "restart_app":
      case "open_pulse_data_dir": case "reveal_in_file_manager": case "configure_codex_home": case "schedule_cache_rebuild":
      case "plugin:autostart|enable": case "plugin:autostart|disable": return unavailable();
      default: throw new Error(`Desktop-only operation in synthetic demo: ${command}`);
    }
  }, { shouldMockEvents: true });
}
