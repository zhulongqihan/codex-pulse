export function n(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
export function compact(value, digits = 1) {
  const number = n(value);
  if (number >= 1e9) return (number / 1e9).toFixed(digits).replace(/\.0$/, '') + 'B';
  if (number >= 1e6) return (number / 1e6).toFixed(digits).replace(/\.0$/, '') + 'M';
  if (number >= 1e3) return (number / 1e3).toFixed(digits).replace(/\.0$/, '') + 'K';
  return Math.round(number).toLocaleString('en-US');
}
export function exact(value) { return Math.round(n(value)).toLocaleString('en-US'); }
export function percent(value, total, digits = 1) { return total > 0 ? ((n(value) / n(total)) * 100).toFixed(digits) + '%' : '—'; }
export function cached(row) { return n(row?.cachedTokens ?? row?.cachedInputTokens ?? row?.cached_input_tokens); }
export function cacheRate(row) { return row?.hasTokenBreakdown === false ? '—' : percent(cached(row), row?.inputTokens); }
export function bytes(value) {
  const amount = n(value);
  if (amount >= 1024 ** 3) return (amount / 1024 ** 3).toFixed(2) + ' GB';
  if (amount >= 1024 ** 2) return (amount / 1024 ** 2).toFixed(1) + ' MB';
  return Math.round(amount / 1024) + ' KB';
}
export function localDay(value = new Date(), timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(item => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function offsetDay(day, offset) {
  const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
export function dateLabel(day, language = 'zh', long = false) {
  if (!day) return '—';
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', long ? { month: 'long', day: 'numeric', weekday: 'long' } : { month: '2-digit', day: '2-digit' }).format(new Date(day + 'T12:00:00Z'));
}
export function timeLabel(value, language = 'zh') {
  if (!value) return '—';
  const d = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
export function normalizeArray(value) {
  return Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([name, row]) => ({ name, ...row })) : [];
}
export function tokenRow(value = {}) {
  const hasTokenBreakdown = value.hasTokenBreakdown ?? ((value.inputTokens ?? value.input_tokens) != null && (value.cachedTokens ?? value.cachedInputTokens ?? value.cached_input_tokens) != null);
  return { ...value, hasTokenBreakdown, totalTokens: n(value.totalTokens ?? value.total_tokens), inputTokens: n(value.inputTokens ?? value.input_tokens), outputTokens: n(value.outputTokens ?? value.output_tokens), cachedTokens: cached(value), sessions: n(value.sessions ?? value.sessionCount) };
}
