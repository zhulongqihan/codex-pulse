import path from 'node:path';

export const PARSER_VERSION = 1;
const TOKEN_FIELDS = ['inputTokens', 'cachedTokens', 'outputTokens', 'reasoningTokens', 'totalTokens'];
const formatters = new Map();
const hourFormatters = new Map();

export function dayInZone(value, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  const parts = formatters.get(timeZone).formatToParts(date);
  const part = kind => parts.find(p => p.type === kind)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Local clock hour, 0..23. Repeated DST clock hours intentionally share a bucket. */
export function hourInZone(value, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (!hourFormatters.has(timeZone)) hourFormatters.set(timeZone, new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }));
  const hour = Number(hourFormatters.get(timeZone).formatToParts(date).find(part => part.type === 'hour')?.value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export function emptyTokens() {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function normalizeTokens(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!['input_tokens', 'inputTokens', 'output_tokens', 'outputTokens', 'total_tokens', 'totalTokens'].some(k => raw[k] != null)) return null;
  const inputTokens = number(raw.input_tokens ?? raw.inputTokens);
  const outputTokens = number(raw.output_tokens ?? raw.outputTokens);
  return {
    inputTokens,
    cachedTokens: Math.min(inputTokens, number(raw.cached_input_tokens ?? raw.cachedInputTokens ?? raw.cachedTokens)),
    outputTokens,
    reasoningTokens: number(raw.reasoning_output_tokens ?? raw.reasoningOutputTokens ?? raw.reasoningTokens),
    totalTokens: number(raw.total_tokens ?? raw.totalTokens ?? inputTokens + outputTokens),
  };
}

function addTokens(target, value) {
  for (const field of TOKEN_FIELDS) target[field] = (target[field] || 0) + (value[field] || 0);
  return target;
}

function difference(current, previous) {
  const result = emptyTokens();
  for (const field of TOKEN_FIELDS) result[field] = Math.max(0, current[field] - (previous?.[field] || 0));
  result.cachedTokens = Math.min(result.cachedTokens, result.inputTokens);
  return result;
}

export function projectName(cwd) {
  if (typeof cwd !== 'string' || !cwd) return 'Workspace';
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts.at(-1) || 'Workspace';
}

function timestamp(envelope, payload) {
  const value = envelope.timestamp || payload.timestamp;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function responseId(payload) {
  return payload.response_id || payload.responseId || payload.response?.id || payload.info?.response_id || null;
}

function isChild(meta) {
  return Boolean(meta.forked_from_id || meta.parent_thread_id || (typeof meta.source === 'object' && meta.source?.subagent));
}

function isInherited(payload) {
  return payload.inherited === true || payload.is_inherited === true || payload.replayed === true || payload.origin === 'inherited';
}

/** Keeps only token metadata. Message text and tool output are never retained. */
export function createLogParser({ fileKey = 'unknown', timeZone = 'UTC' } = {}) {
  let meta = null;
  let model = 'unknown';
  let project = 'Workspace';
  let sequence = 0;
  const candidates = [];
  const turnStarts = [];
  const compactions = new Map();
  const warnings = new Set();
  let malformedLines = 0;

  function accept(envelope) {
    if (!envelope || typeof envelope !== 'object') return;
    const payload = envelope.payload || {};
    const kind = envelope.type === 'event_msg' ? payload.type : envelope.type;
    const at = timestamp(envelope, payload);
    if (kind === 'session_meta' && !meta) {
      meta = {
        id: typeof payload.id === 'string' ? payload.id : fileKey,
        createdAt: at,
        child: isChild(payload),
      };
      project = projectName(payload.cwd);
      return;
    }
    if (kind === 'turn_context') {
      if (typeof payload.model === 'string') model = payload.model;
      if (typeof payload.cwd === 'string') project = projectName(payload.cwd);
      return;
    }
    if (kind === 'task_started' || kind === 'turn_started') {
      if (!isInherited(payload) && at && (!meta?.createdAt || at >= meta.createdAt)) turnStarts.push(candidates.length);
      return;
    }
    if (kind === 'compacted') {
      const id = responseId(payload);
      if (id) compactions.set(id, { index: candidates.length, at });
      return;
    }
    if (kind !== 'token_count' && kind !== 'token_usage_record') return;
    const info = payload.info || payload;
    const cumulative = normalizeTokens(info.total_token_usage || info.totalTokenUsage);
    const last = normalizeTokens(info.last_token_usage || info.lastTokenUsage);
    const standalone = kind === 'token_usage_record' ? normalizeTokens(payload.usage || info.usage || info.token_usage || payload.token_usage || payload) : null;
    if (!cumulative && !last && !standalone) return;
    if (!at) { warnings.add('A usage record without a valid timestamp was skipped.'); return; }
    candidates.push({ kind, cumulative, last, standalone, at, model, project, responseId: responseId(payload), inherited: isInherited(payload), index: sequence++ });
  }

  function pushLine(line) {
    // Large prompt/tool records do not get JSON-parsed unless they contain a recognized metadata marker.
    if (!/"(?:session_meta|turn_context|token_count|token_usage_record|compacted|task_started|turn_started)"/.test(line)) return;
    try { accept(JSON.parse(line)); } catch { malformedLines++; }
  }

  function finish() {
    const thread = meta?.id || fileKey;
    const createdAt = meta?.createdAt;
    const childBoundary = meta?.child && turnStarts.length ? turnStarts[0] : null;
    if (meta?.child && childBoundary == null) warnings.add('Subagent replay baseline was determined from timestamps; no explicit child-turn boundary was available.');
    const records = [];
    let previous = null;
    const usedResponseIds = new Set();
    const advancingIndices = [];
    const candidateDeltas = new Map();

    for (let index = 0; index < candidates.length; index++) {
      const item = candidates[index];
      if (item.kind !== 'token_count') continue;
      const inherited = item.inherited || (meta?.child && ((childBoundary != null && index < childBoundary) || (createdAt && item.at < createdAt)));
      let delta;
      if (item.cumulative) {
        const reset = previous && item.cumulative.totalTokens < previous.totalTokens;
        if (reset) {
          warnings.add('A cumulative counter reset used last-request usage when available; otherwise the new baseline was not billed again.');
          delta = item.last || emptyTokens();
        } else delta = difference(item.cumulative, previous);
        previous = item.cumulative;
      } else delta = item.last;
      if (inherited || !delta || delta.totalTokens <= 0) continue;
      if (item.model === 'unknown') warnings.add('Some usage has no recorded model and is shown as unknown.');
      advancingIndices.push(index);
      candidateDeltas.set(index, delta);
      if (item.responseId) usedResponseIds.add(item.responseId);
      records.push({ id: item.responseId ? `response:${item.responseId}` : `${thread}:${item.index}`, threadId: thread, at: item.at, date: dayInZone(item.at, timeZone), model: item.model, project: item.project, ...delta });
    }

    // Only separately recorded, matching compactions with no later cumulative advancement
    // are added. Ambiguous coverage is omitted with an explicit precision warning.
    for (let index = 0; index < candidates.length; index++) {
      const item = candidates[index];
      if (item.kind !== 'token_usage_record' || !item.standalone) continue;
      const marker = item.responseId && compactions.get(item.responseId);
      if (!marker) { warnings.add('A separate usage record without a matching compaction marker was omitted.'); continue; }
      if (usedResponseIds.has(item.responseId)) continue;
      const inherited = item.inherited || (meta?.child && ((childBoundary != null && index < childBoundary) || (createdAt && item.at < createdAt)));
      if (inherited) continue;
      const nearbyAdvance = advancingIndices.some(i => i >= Math.min(index, marker.index));
      if (nearbyAdvance) { warnings.add('An ambiguous remote-compaction record was not added separately to avoid double counting.'); continue; }
      if (item.standalone.totalTokens > 0) records.push({ id: `response:${item.responseId}`, threadId: thread, at: item.at, date: dayInZone(item.at, timeZone), model: item.model, project: item.project, ...item.standalone });
    }

    // A response can emit several advancing snapshots within the same file. Merge
    // these before cross-file response-ID de-duplication.
    const merged = new Map();
    for (const record of records) {
      const prior = merged.get(record.id);
      if (prior) { addTokens(prior, record); if (record.at > prior.at) { prior.at = record.at; prior.date = record.date; prior.model = record.model; prior.project = record.project; } }
      else merged.set(record.id, { ...record });
    }
    if (malformedLines) warnings.add(`${malformedLines} malformed metadata record(s) were skipped.`);
    return { threadId: thread, startedAt: createdAt || records[0]?.at || null, records: [...merged.values()], warnings: [...warnings] };
  }
  return { accept, pushLine, finish };
}

export function canonicalFiles(entries) {
  const picked = new Map();
  for (const entry of entries) {
    const relative = entry.relative.replaceAll('\\', '/').replace(/\.zst$/i, '');
    const rank = (entry.archived ? 2 : 0) + (/\.zst$/i.test(entry.path) ? 1 : 0);
    const previous = picked.get(relative);
    if (!previous || rank < previous.rank) picked.set(relative, { ...entry, logicalKey: relative, rank });
  }
  return [...picked.values()].sort((a, b) => a.rank - b.rank || b.mtimeMs - a.mtimeMs || a.logicalKey.localeCompare(b.logicalKey));
}

function bucket(target, key, initial = {}) {
  if (!target.has(key)) target.set(key, { ...emptyTokens(), ...initial, _sessions: new Set() });
  return target.get(key);
}

export function aggregateRecords(fileSummaries, timeZone = 'UTC') {
  const canonicalThreads = new Set();
  const records = new Map();
  const warnings = new Set();
  let sourceFiles = 0;
  for (const summary of fileSummaries) {
    if (!summary || canonicalThreads.has(summary.threadId)) continue;
    canonicalThreads.add(summary.threadId);
    sourceFiles++;
    for (const warning of summary.warnings || []) warnings.add(warning);
    for (const original of summary.records || []) {
      const record = { ...original, date: dayInZone(original.at, timeZone) };
      if (!record.date) continue;
      const existing = records.get(record.id);
      if (!existing || record.totalTokens > existing.totalTokens) records.set(record.id, record);
    }
  }
  const days = new Map();
  const sessions = new Map();
  for (const record of records.values()) {
    const day = bucket(days, record.date, { date: record.date, _models: new Map(), _projects: new Map(), _hours: new Map() });
    addTokens(day, record); day._sessions.add(record.threadId);
    const hour = hourInZone(record.at, timeZone);
    if (hour != null) {
      const hourly = bucket(day._hours, hour, { hour });
      addTokens(hourly, record); hourly._sessions.add(record.threadId);
    }
    const model = bucket(day._models, record.model, { name: record.model }); addTokens(model, record); model._sessions.add(record.threadId);
    const project = bucket(day._projects, record.project, { name: record.project }); addTokens(project, record); project._sessions.add(record.threadId);
    const sessionKey = `${record.threadId}:${record.date}:${record.model}:${record.project}`;
    const session = bucket(sessions, sessionKey, { id: record.threadId, date: record.date, project: record.project, model: record.model, startedAt: record.at });
    addTokens(session, record); session._sessions.add(record.threadId); if (record.at < session.startedAt) session.startedAt = record.at;
  }
  const clean = row => { const { _sessions, _models, _projects, _hours, ...rest } = row; return { ...rest, sessions: _sessions.size }; };
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ ...clean(row), models: [...row._models.values()].map(clean), projects: [...row._projects.values()].map(clean), hourly: [...row._hours.values()].sort((a, b) => a.hour - b.hour).map(clean) }));
  return { daily, sessions: [...sessions.values()].map(clean).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), sourceFiles, warnings: [...warnings] };
}

export function logicalFileName(filePath) {
  return path.basename(filePath).replace(/\.zst$/i, '');
}
