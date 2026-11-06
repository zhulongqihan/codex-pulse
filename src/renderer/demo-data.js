// Synthetic, deliberately labeled data for screenshots and browser previews.
// No local account information or session content belongs in this file.
export const DEMO_TODAY = '2026-11-06';
const names = ['Codex', 'Codex mini', '其他模型'];
const projects = ['创作工作台', '代码实验', '阅读整理'];
const modelWeights = [13.2 / 24.8, 6.9 / 24.8, 4.7 / 24.8];
const projectWeights = [.5, 7.6 / 24.8, 4.8 / 24.8];
const recent = [16.2, 17.9, 19.7, 21.1, 23.6, 18.6, 24.8];

function dateOffset(day, offset) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function split(total, weights) {
  const values = weights.map(w => Math.round(total * w));
  values[values.length - 1] += total - values.reduce((a, b) => a + b, 0);
  return values;
}
function stats(totalTokens, inputTokens, cachedTokens, sessions = 9) {
  return { totalTokens, inputTokens, cachedTokens, cachedInputTokens: cachedTokens, outputTokens: totalTokens - inputTokens, sessions };
}
const daily = Array.from({ length: 84 }, (_, i) => {
  const date = dateOffset(DEMO_TODAY, i - 83);
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  const m = i >= 77 ? recent[i - 77] : Math.max(1.3, (8.4 + Math.sin(i * .72) * 5.8 + i * .105) * (day === 0 || day === 6 ? .48 : 1));
  const total = Math.round(m * 1e6);
  const input = Math.round(total * (22 / 24.8));
  const cached = Math.round(input * (18 / 22));
  const mTotals = split(total, modelWeights), mInputs = split(input, modelWeights), mCaches = split(cached, modelWeights);
  const pTotals = split(total, projectWeights), pInputs = split(input, projectWeights), pCaches = split(cached, projectWeights);
  return {
    date, ...stats(total, input, cached),
    models: names.map((name, j) => ({ name, ...stats(mTotals[j], mInputs[j], mCaches[j], 3) })),
    projects: projects.map((name, j) => ({ name, ...stats(pTotals[j], pInputs[j], pCaches[j], 3) }))
  };
});
// Preserve clear, useful exact examples for the selected day.
Object.assign(daily.at(-1), stats(24_800_000, 22_000_000, 18_000_000));
daily.at(-1).models = [
  { name: names[0], ...stats(13_200_000, 11_600_000, 9_800_000, 3) },
  { name: names[1], ...stats(6_900_000, 6_100_000, 5_100_000, 3) },
  { name: names[2], ...stats(4_700_000, 4_300_000, 3_100_000, 3) }
];
const hourProfile = [1,1,1,1,2,2,3,5,8,11,14,18,20,23,21,18,16,12,8,6,4,3,2,1];
const hourSum = hourProfile.reduce((sum, value) => sum + value, 0), hourWeights = hourProfile.map(value => value / hourSum);
daily.forEach(day => {
  const inputs = split(day.inputTokens, hourWeights), caches = split(day.cachedTokens, hourWeights), outputs = split(day.outputTokens, hourWeights);
  day.hourly = inputs.map((input, hour) => ({hour,...stats(input + outputs[hour], input, caches[hour], hour >= 8 && hour <= 16 ? 1 : 0)}));
});

function aggregate(rows, key) {
  const map = new Map();
  rows.forEach(day => day[key].forEach(row => {
    const found = map.get(row.name) || { name: row.name, ...stats(0, 0, 0, 0) };
    for (const field of ['totalTokens', 'inputTokens', 'cachedTokens', 'outputTokens', 'sessions']) found[field] += row[field] || 0;
    found.cachedInputTokens = found.cachedTokens; map.set(row.name, found);
  }));
  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}
const demoCost = row => row.totalTokens / 1e6 * (123.45 / 141.9);
daily.forEach(row => { row.estimatedCost=demoCost(row); row.models.forEach(m=>{m.estimatedCost=demoCost(m);}); row.projects.forEach(p=>{p.estimatedCost=demoCost(p);}); });
export function getDemoSnapshot(range = {}) {
  const rows = daily.filter(d => (!range.from || d.date >= range.from) && (!range.to || d.date <= range.to));
  const totals = rows.reduce((acc, d) => {
    for (const field of Object.keys(acc)) acc[field] += d[field] || 0;
    return acc;
  }, stats(0, 0, 0, 0));
  const sessions = rows.flatMap((d, i) => d.models.flatMap((m, j) => projects.map((project, k) => ({
    id: `demo-${d.date.replaceAll('-', '')}-${j}${k}`,
    project, model: m.name,
    totalTokens: split(m.totalTokens, projectWeights)[k],
    inputTokens: split(m.inputTokens, projectWeights)[k],
    outputTokens: split(m.totalTokens, projectWeights)[k] - split(m.inputTokens, projectWeights)[k],
    cachedTokens: split(m.cachedTokens, projectWeights)[k],
    startedAt: `${d.date}T${String(8 + j * 3 + k).padStart(2, '0')}:${String((i * 7 + k * 13) % 60).padStart(2, '0')}:00+08:00`
  }))));
  return {
    version: 1, mode: 'demo', timezone: 'Asia/Shanghai',
    range: { from: range.from || daily[0].date, to: range.to || DEMO_TODAY, timeZone:'Asia/Shanghai' }, pricingSource:'Illustrative synthetic demo reference', pricingBasis:'Demonstration values, not official model pricing.',
    status: { scanning: false, quotaRefreshing: false, progress: { done: 756, total: 756 }, scanAt: '2026-11-06T02:12:00Z', quotaAt: '2026-11-06T02:12:00Z', error: null, warnings: [] },
    quota: { available: true, remainingPercent: 68, usedPercent: 32, resetsAt: '2026-11-13T00:00:00+08:00', plan: 'Pro', source: 'codex-app-server', windows: [{ name: '周额度', remainingPercent: 68, resetsAt: '2026-11-13T00:00:00+08:00', windowMinutes: 10080 }] },
    today: { ...daily.at(-1) }, totals: {...totals,estimatedCost:rows.reduce((sum,row)=>sum+row.estimatedCost,0)}, daily: rows,
    models: aggregate(rows, 'models').map(r=>({...r,estimatedCost:demoCost(r)})), projects: aggregate(rows, 'projects').map(r=>({...r,estimatedCost:demoCost(r)})),
    sessions: sessions.map(r=>({...r,estimatedCost:demoCost(r)})).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    source: { sessionDetailsComplete:true, sessionFiles: 756, lastScan: '2026-11-06T02:12:00Z', localOnly: true, logsOrigin: 'demo', logsAsOf: '2026-11-06T02:12:00Z', quotaAsOf: '2026-11-06T02:12:00Z' }
  };
}
export const demoAllDays = daily;
export const defaultSettings = {
  skinId:'meter', compactMode:false, theme: 'light', language: 'zh', widgetVisible: true, launchAtLogin: false,
  refreshSeconds: 60, motionLevel: 'gentle', reducedMotion: false,
  respectReducedMotion: true
};
