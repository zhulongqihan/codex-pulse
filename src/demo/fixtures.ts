/** Synthetic data only. No file-system, account, or network API is used here. */
import seed from "./seed.json";
import type {
  CodexLimitsResponse, CodexQuotaForecastResponse, CodexResetAnnouncement, ModelPricingCatalogResponse,
  MonthlyUsageResponse, OverviewResponse, ProjectAnalyticsResponse, ProjectSessionDaysResponse,
  SessionDetailRow, SessionReplayDetail,
} from "../pulse/lib/api";

const DAY = 86_400_000;
const dateMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const now = new Date();
const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
export const today = `${dateParts.find(p => p.type === "year")!.value}-${dateParts.find(p => p.type === "month")!.value}-${dateParts.find(p => p.type === "day")!.value}`;
const shift = dateMs(today) - dateMs(seed.referenceDate);
const shiftDate = (date: string) => key(dateMs(date) + shift);

export const sessions: SessionDetailRow[] = (seed.sessions as SessionDetailRow[]).map((session, index) => ({
  ...session,
  modifiedAtMs: dateMs(shiftDate(session.dailyUsage.at(-1)!.date)) + 12 * 3_600_000,
  threadName: ["完善日期统计与边界测试", "检查同名项目的完整路径", "优化会话回放阅读", "整理模型价格来源", "修复导出与空值处理", "验证悬浮窗与主题同步"][index % 6],
  dailyUsage: session.dailyUsage.map(row => ({ ...row, date: shiftDate(row.date) })),
}));
export const retainedFrom = sessions.flatMap(row => row.dailyUsage.map(day => day.date)).sort()[0];

type Amounts = Pick<OverviewResponse["totals"], "inputTokens" | "cachedInputTokens" | "outputTokens" | "totalTokens" | "costUSD">;
const zero = (): Amounts => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 });
function add(target: Amounts, value: Amounts) {
  target.inputTokens += value.inputTokens; target.cachedInputTokens += value.cachedInputTokens;
  target.outputTokens += value.outputTokens; target.totalTokens += value.totalTokens;
  target.costUSD = target.costUSD === null || value.costUSD === null ? null : target.costUSD + value.costUSD;
}
function bounds(range: string) {
  if (range.startsWith("custom:")) {
    const [start, end] = range.slice(7).split("_");
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && end >= start) return [start, end];
  }
  const days = range === "all" ? Math.round((dateMs(today) - dateMs(retainedFrom)) / DAY) + 1 : Math.min(365, Math.max(1, parseInt(range, 10) || 30));
  return [key(dateMs(today) - (days - 1) * DAY), today];
}

export function overview(range = "30d", project?: string): OverviewResponse {
  const [startDate, endDate] = bounds(range);
  const days = Math.min(3660, Math.round((dateMs(endDate) - dateMs(startDate)) / DAY) + 1);
  const daily = new Map<string, OverviewResponse["daily"][number]>();
  for (let offset = 0; offset < days; offset++) {
    const date = key(dateMs(startDate) + offset * DAY);
    daily.set(date, { date, ...zero(), fiveHourPercent: null, weeklyPercent: null });
  }
  const modelTotals = new Map<string, Amounts>();
  const projectTotals = new Map<string, Amounts & { lastActiveDate: string }>();
  const projectDaily: Record<string, OverviewResponse["daily"]> = {};
  for (const session of sessions) for (const row of session.dailyUsage) {
    if (!daily.has(row.date) || (project && !row.projects.includes(project))) continue;
    add(daily.get(row.date)!, row);
    // Each synthetic day has one explicit model and one project; no proportional allocation.
    const model = row.models[0] ?? "Unknown";
    if (!modelTotals.has(model)) modelTotals.set(model, zero());
    add(modelTotals.get(model)!, row);
    const id = row.projects[0] ?? "Unknown";
    if (!projectTotals.has(id)) projectTotals.set(id, { ...zero(), lastActiveDate: row.date });
    const item = projectTotals.get(id)!; add(item, row); item.lastActiveDate = [item.lastActiveDate, row.date].sort().at(-1)!;
    const series = projectDaily[id] ??= [];
    let day = series.find(day => day.date === row.date);
    if (!day) { day = { ...zero(), date: row.date, fiveHourPercent: null, weeklyPercent: null }; series.push(day); }
    add(day, row);
  }
  const total = zero(); for (const row of daily.values()) add(total, row);
  return {
    range, days, startDate, endDate, timezone: "Asia/Shanghai", updatedAt: now.toISOString(), daily: [...daily.values()],
    totals: { ...total, avgTokensPerDay: total.totalTokens / days, avgCostPerDay: total.costUSD === null ? null : total.costUSD / days,
      cacheHitRate: total.inputTokens ? total.cachedInputTokens / total.inputTokens : 0,
      costPerMillionTokens: total.costUSD === null || !total.totalTokens ? null : total.costUSD / total.totalTokens * 1e6 },
    models: [...modelTotals].map(([model, amount]) => {
      const price = seed.modelPrices.find(row => row.model === model);
      return { model, ...amount, pricingStatus: price ? "priced" : "unavailable",
        inputCostPerMillionTokens: price?.inputCostPerMillionTokens ?? null,
        cachedInputCostPerMillionTokens: price?.cachedInputCostPerMillionTokens ?? null,
        outputCostPerMillionTokens: price?.outputCostPerMillionTokens ?? null,
        effectiveCostPerMillionTokens: amount.costUSD === null || !amount.totalTokens ? null : amount.costUSD / amount.totalTokens * 1e6,
        fiveHourQuota: null, weeklyQuota: null };
    }),
    projects: [...projectTotals].map(([project, amount]) => ({ project, displayName: project.split("/").at(-1)!, ...amount })), projectDaily,
  };
}

export function monthly(): MonthlyUsageResponse {
  const all = overview("all");
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const rows: MonthlyUsageResponse["monthly"] = [];
  for (let back = 11; back >= 0; back--) {
    const month = key(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - back, 1)).slice(0, 7);
    const total = zero(); for (const day of all.daily.filter(day => day.date.startsWith(month))) add(total, day);
    rows.push({ month, ...total, fiveHourPercent: null, weeklyPercent: null });
  }
  return { monthly: rows, startMonth: rows[0].month, endMonth: rows.at(-1)!.month, timezone: "Asia/Shanghai", updatedAt: now.toISOString(), retainedFrom, throughDate: today };
}

export function projectAnalytics(project: string, range: string): ProjectAnalyticsResponse {
  const data = overview(range, project);
  return { project, displayName: project.split("/").at(-1)!, range, startDate: data.startDate, endDate: data.endDate,
    timezone: data.timezone, summary: data.projects[0] ?? { project, displayName: project.split("/").at(-1)!, ...zero() }, models: data.models, daily: data.daily };
}
function matchingSessions(project: string, query: string) {
  const lowered = query.trim().toLocaleLowerCase();
  return sessions.filter(row => row.projects.includes(project) && (!lowered || `${row.threadName} ${row.threadId} ${row.path}`.toLocaleLowerCase().includes(lowered)));
}
export function projectSessionDays(project: string, range: string, query: string, before?: string): ProjectSessionDaysResponse {
  const [startDate, endDate] = bounds(range);
  const matching = matchingSessions(project, query);
  const grouped = new Map<string, ProjectSessionDaysResponse["days"][number]>();
  for (const session of matching) for (const day of session.dailyUsage) {
    if (day.date < startDate || day.date > endDate || (before && day.date >= before)) continue;
    const item = grouped.get(day.date) ?? { date: day.date, sessionCount: 0, totalTokens: 0, costUSD: 0 };
    item.sessionCount++; item.totalTokens += day.totalTokens;
    item.costUSD = item.costUSD === null || day.costUSD === null ? null : item.costUSD + day.costUSD;
    grouped.set(day.date, item);
  }
  return { startDate, endDate, timezone: "Asia/Shanghai", totalSessions: sessions.filter(row => row.projects.includes(project)).length,
    matchingSessions: matching.length, days: [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date)), nextBefore: null };
}
export function projectDaySessions(project: string, date: string, query: string) {
  return matchingSessions(project, query).filter(row => row.dailyUsage.some(day => day.date === date));
}

export function account(): CodexLimitsResponse {
  return { account: "demo@example.invalid", membershipLevel: "pro", workspaceName: "合成工作区 · Demo", source: "synthetic-demo", updatedAt: now.toISOString(),
    session: { usedPercent: 28, remainingPercent: 72, windowMinutes: 300, resetsAt: new Date(now.getTime() + 2.5 * 3_600_000).toISOString() },
    weekly: { usedPercent: 41, remainingPercent: 59, windowMinutes: 10_080, resetsAt: new Date(now.getTime() + 4.2 * DAY).toISOString() },
    credits: { hasCredits: true, unlimited: false, balance: "125.500001" }, creditsIsMock: true,
    resetCreditsAvailableCount: 2, resetCredits: [1, 4].map(day => ({ id: `demo-reset-${day}`, expiresAt: new Date(now.getTime() + day * DAY).toISOString() })),
    subscriptionExpiresAt: new Date(now.getTime() + 18 * DAY).toISOString(), subscriptionWillRenew: true };
}
export function catalog(): ModelPricingCatalogResponse {
  return { isLimited: true, models: [...seed.modelPrices.map(price => ({ model: price.model, provider: "openai", pricingStatus: "priced" as const,
    inputCostPerMillionTokens: price.inputCostPerMillionTokens, cachedInputCostPerMillionTokens: price.cachedInputCostPerMillionTokens, outputCostPerMillionTokens: price.outputCostPerMillionTokens })),
    { model: "demo-unpriced-model", provider: "demo", pricingStatus: "unavailable", inputCostPerMillionTokens: null, cachedInputCostPerMillionTokens: null, outputCostPerMillionTokens: null }] };
}
export const resets: CodexResetAnnouncement[] = [2, 9, 16, 24].map((days, index) => ({ id: `synthetic-reset-${index}`, resetType: index === 1 ? "banked" : "regular",
  announcedAt: new Date(now.getTime() - days * DAY).toISOString(), text: "合成重置记录，用于展示日历和历史；不代表真实服务公告。",
  source: { author: "Synthetic demonstration", url: "https://github.com/zhulongqihan/codex-pulse" } }));
export function forecast(): CodexQuotaForecastResponse {
  const post = { id: "demo-post", text: "这是一条合成 Feed，用于展示来源与更新时间。没有获取实时公告。", url: "https://github.com/zhulongqihan/codex-pulse", at: now.toISOString(), isReply: false, replyToId: null };
  return { updatedAt: now.toISOString(), lastResetAt: resets[0].announcedAt, hasOfficialSignal: false, latestAlert: null, recentPosts: [post], evidencePosts: [], evidenceStale: false, evidenceUpdatedAt: now.toISOString() };
}

export function replay(path: string): SessionReplayDetail {
  const session = sessions.find(row => row.path === path);
  if (!session) throw new Error("Unknown synthetic session");
  const raw: object[] = [{ type: "session_meta", payload: { id: session.threadId, cwd: session.projects[0], cli_version: "demo" } }];
  const turns: SessionReplayDetail["turns"] = [0, 1].map(index => {
    const startedAt = `${session.dailyUsage[Math.min(index, session.dailyUsage.length - 1)].date}T09:0${index}:00Z`;
    const completedAt = `${session.dailyUsage[Math.min(index, session.dailyUsage.length - 1)].date}T09:0${index}:20Z`;
    const userText = index === 0 ? `请检查 ${session.projects[0]} 的日期统计，并保留未知值。` : "补充测试并总结这次修改。";
    const assistantText = index === 0 ? "已检查自然日范围与同名项目路径。缓存输入包含在输入中，不能重复累加。" : "合成演示已完成：自然日分母、完整路径、缺失价格与会话生命周期分别处理。此内容仅用于演示回放。";
    const call = { callId: `demo-call-${index}`, name: index === 0 ? "exec_command" : "apply_patch", status: "completed",
      arguments: index === 0 ? JSON.stringify({ cmd: "git diff --stat", workdir: session.projects[0] }) : "*** Begin Patch\n*** Update File: src/date.ts\n@@\n-const days = activeDays;\n+const days = calendarDays;\n*** End Patch",
      output: index === 0 ? "src/date.ts | 2 +-\n1 file changed, 1 insertion(+), 1 deletion(-)" : "Success. Updated src/date.ts", stderr: null, startedAt, completedAt, durationMs: 1200, isError: false };
    raw.push({ type: "event_msg", timestamp: startedAt, payload: { type: "user_message", message: userText } });
    const userLine = raw.length;
    raw.push({ type: "response_item", timestamp: startedAt, payload: { type: "function_call", name: call.name, arguments: call.arguments, call_id: call.callId } });
    const toolLine = raw.length;
    raw.push({ type: "response_item", timestamp: completedAt, payload: { type: "function_call_output", call_id: call.callId, output: call.output } });
    const patch = index === 1 ? { callId: call.callId, success: true, output: "Success. Updated src/date.ts", timestamp: completedAt, isError: false } : null;
    if (patch) raw.push({ type: "event_msg", timestamp: completedAt, payload: { type: "patch_apply_end", call_id: call.callId, success: true, stdout: patch.output } });
    const patchLine = raw.length;
    raw.push({ type: "event_msg", timestamp: completedAt, payload: { type: "agent_message", message: assistantText } });
    const assistantLine = raw.length;
    return { turnId: `demo-turn-${index + 1}`, startedAt, completedAt, durationMs: 20_000,
      systemMessages: [],
      userMessages: [{ timestamp: startedAt, kind: "user", text: userText }], assistantMessages: [{ timestamp: completedAt, kind: "assistant", text: assistantText }], reasoningSummaries: [],
      toolCalls: [call], patchResults: patch ? [patch] : [], tokenEvents: [], errors: [], items: [
        { kind: "message", role: "user", source: "event_msg", timestamp: startedAt, text: userText, rawJsonlLineNumbers: [userLine] },
        { kind: "toolCall", ...call, rawJsonlLineNumbers: [toolLine, toolLine + 1] },
        ...(patch ? [{ kind: "patch" as const, ...patch, rawJsonlLineNumbers: [patchLine] }] : []),
        { kind: "message", role: "assistant", source: "event_msg", timestamp: completedAt, text: assistantText, rawJsonlLineNumbers: [assistantLine] },
      ] };
  });
  const rootId = session.parentSessionId ?? session.threadId;
  const family = sessions.filter(row => row.threadId === rootId || row.parentSessionId === rootId);
  return { path, sessionId: session.threadId!, threadName: session.threadName, modifiedAtMs: session.modifiedAtMs, sizeBytes: session.sizeBytes,
    rawJsonl: raw.map(row => JSON.stringify(row)).join("\n"),
    agents: family.map(row => ({ path: row.path, sessionId: row.threadId!, parentSessionId: row.parentSessionId ?? null,
      depth: row.agentDepth ?? 0, agentPath: row.agentPath ?? "/root", nickname: row.agentNickname ?? null, role: row.agentRole ?? null, threadName: row.threadName,
      inputTokens: row.inputTokens, cachedInputTokens: row.cachedInputTokens, outputTokens: row.outputTokens, costUSD: row.costUSD })),
    summary: { startTime: turns[0].startedAt, endTime: turns.at(-1)!.completedAt,
      durationMs: Date.parse(turns.at(-1)!.completedAt!) - Date.parse(turns[0].startedAt!), timeToFirstTokenMs: 1200,
      cwd: session.projects[0], projects: session.projects, models: session.models, cliVersion: "demo", git: { branch: "demo" },
      inputTokens: session.inputTokens, cachedInputTokens: session.cachedInputTokens, outputTokens: session.outputTokens, reasoningOutputTokens: session.reasoningOutputTokens,
      totalTokens: session.totalTokens, costUSD: session.costUSD, turnCount: turns.length, messageCount: 4, toolCallCount: 2, patchCount: 1, errorCount: 0 }, turns };
}
