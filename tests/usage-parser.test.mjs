import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogParser, aggregateRecords, canonicalFiles, dayInZone, hourInZone, normalizeTokens } from '../src/main/scanner-core.mjs';
import { normalizeQuota } from '../src/main/quota-service.mjs';

const meta = (id = 'thread', timestamp = '2026-11-06T08:00:00Z', extra = {}) => ({ type: 'session_meta', timestamp, payload: { id, cwd: 'F:\\projects\\example', ...extra } });
const context = (model = 'model-a') => ({ type: 'turn_context', timestamp: '2026-11-06T08:00:01Z', payload: { model } });
const usage = (input, output, cached = 0) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: Math.min(output, 3), total_tokens: input + output });
const count = (totals, timestamp = '2026-11-06T08:01:00Z', extra = {}) => ({ type: 'event_msg', timestamp, payload: { type: 'token_count', info: { total_token_usage: totals }, ...extra } });
function parse(rows, options = {}) { const parser = createLogParser({ timeZone: 'UTC', ...options }); rows.forEach(row => parser.accept(row)); return parser.finish(); }
function total(summary) { return aggregateRecords([summary], 'UTC').daily.reduce((n, row) => n + row.totalTokens, 0); }

test('cumulative snapshots count deltas, never total plus last request twice', () => {
  const rows = [meta(), context(), count(usage(100, 10, 60)), count(usage(100, 10, 60)), count(usage(140, 15, 90), '2026-11-06T08:02:00Z', { info: { total_token_usage: usage(140, 15, 90), last_token_usage: usage(40, 5, 30) } })];
  const result = aggregateRecords([parse(rows)], 'UTC');
  assert.equal(result.daily[0].totalTokens, 155);
  assert.equal(result.daily[0].inputTokens, 140);
  assert.equal(result.daily[0].cachedTokens, 90);
  assert.equal(result.daily[0].outputTokens, 15);
});

test('cached input and reasoning are subsets, not additions to total tokens', () => {
  const tokens = normalizeTokens(usage(100, 10, 80));
  assert.equal(tokens.totalTokens, 110);
  assert.equal(tokens.cachedTokens, 80);
  assert.equal(tokens.reasoningTokens, 3);
});

test('explicit subagent turn boundary establishes inherited-history baseline', () => {
  const result = parse([
    meta('child', '2026-11-06T10:00:00Z', { source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } } }),
    context('parent-model'), count(usage(100, 10), '2026-11-06T09:00:00Z'),
    { type: 'event_msg', timestamp: '2026-11-06T10:00:01Z', payload: { type: 'task_started' } },
    context('child-model'), count(usage(130, 15), '2026-11-06T10:01:00Z'),
  ]);
  assert.equal(total(result), 35);
  assert.equal(result.records[0].model, 'child-model');
});

test('legacy child replay without a boundary uses timestamp baseline and discloses fallback', () => {
  const result = parse([meta('child', '2026-11-06T10:00:00Z', { parent_thread_id: 'parent' }), context(), count(usage(100, 10), '2026-11-06T09:00:00Z'), count(usage(120, 20), '2026-11-06T10:02:00Z')]);
  assert.equal(total(result), 30);
  assert.match(result.warnings.join(' '), /timestamps/);
});

test('counter reset counts only explicit last-request usage and rebaselines', () => {
  const result = parse([meta(), context(), count(usage(100, 10)), count(usage(20, 2), '2026-11-06T08:02:00Z', { info: { total_token_usage: usage(20, 2), last_token_usage: usage(5, 1) } }), count(usage(30, 3), '2026-11-06T08:03:00Z')]);
  assert.equal(total(result), 127);
  assert.match(result.warnings.join(' '), /reset/);
});

test('within-response advances merge, cross-file copied response IDs count only once', () => {
  const a = parse([meta('a'), context(), count(usage(10, 1), undefined, { response_id: 'response-1' }), count(usage(15, 3), '2026-11-06T08:02:00Z', { response_id: 'response-1' })]);
  const b = parse([meta('b'), context(), count(usage(15, 3), undefined, { response_id: 'response-1' })]);
  assert.equal(a.records.length, 1);
  assert.equal(aggregateRecords([a, b], 'UTC').daily[0].totalTokens, 18);
});

test('matching isolated compaction is added; one with later cumulative coverage is not double counted', () => {
  const record = { type: 'token_usage_record', timestamp: '2026-11-06T08:02:00Z', payload: { response_id: 'compact-1', usage: usage(5, 1) } };
  const compact = { type: 'compacted', timestamp: '2026-11-06T08:02:01Z', payload: { response_id: 'compact-1' } };
  const first = parse([meta(), context(), count(usage(10, 1)), record, compact]);
  assert.equal(total(first), 17);
  const second = parse([meta(), context(), count(usage(10, 1)), record, compact, count(usage(15, 2), '2026-11-06T08:03:00Z')]);
  assert.equal(total(second), 17);
  assert.match(second.warnings.join(' '), /compaction/);
});

test('active plain file takes priority over matching compressed/archive copies', () => {
  const entries = canonicalFiles([
    { path: '/archive/rollout-a.jsonl', relative: 'rollout-a.jsonl', archived: true },
    { path: '/active/rollout-a.jsonl.zst', relative: 'rollout-a.jsonl.zst', archived: false },
    { path: '/active/rollout-a.jsonl', relative: 'rollout-a.jsonl', archived: false },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, '/active/rollout-a.jsonl');
});

test('local-day partition crosses UTC midnight correctly and handles DST', () => {
  assert.equal(dayInZone('2026-11-05T17:00:00Z', 'Asia/Shanghai'), '2026-11-06');
  assert.equal(dayInZone('2026-11-06T01:00:00Z', 'America/New_York'), '2026-11-05');
  assert.equal(dayInZone('2026-03-08T07:30:00Z', 'America/New_York'), '2026-03-08');
});

test('hourly statistics use actual event time in the selected timezone and preserve daily totals', () => {
  const summary = parse([meta('hours', '2026-11-05T00:00:00Z'), context(), count(usage(100, 10, 50), '2026-11-05T16:30:00Z'), count(usage(150, 15, 75), '2026-11-05T17:15:00Z')]);
  const shanghai = aggregateRecords([summary], 'Asia/Shanghai').daily;
  assert.equal(shanghai.length, 1);
  assert.equal(shanghai[0].date, '2026-11-06');
  assert.deepEqual(shanghai[0].hourly.map(row => [row.hour, row.totalTokens]), [[0, 110], [1, 55]]);
  assert.equal(shanghai[0].hourly.reduce((sum, row) => sum + row.totalTokens, 0), shanghai[0].totalTokens);
  assert.equal(shanghai[0].hourly[1].cachedTokens, 25);
  const utc = aggregateRecords([summary], 'UTC').daily;
  assert.equal(utc[0].date, '2026-11-05');
  assert.deepEqual(utc[0].hourly.map(row => row.hour), [16, 17]);
  assert.equal(hourInZone('2026-11-05T16:00:00Z', 'Asia/Shanghai'), 0);
  assert.equal(hourInZone('invalid', 'UTC'), null);
});

test('repeated daylight-saving clock hour merges real events without inventing another hour', () => {
  const summary = parse([meta('dst', '2026-11-01T00:00:00Z'), context(), count(usage(10, 1), '2026-11-01T05:30:00Z'), count(usage(20, 2), '2026-11-01T06:30:00Z')]);
  const day = aggregateRecords([summary], 'America/New_York').daily[0];
  assert.equal(day.date, '2026-11-01');
  assert.equal(day.hourly.length, 1);
  assert.equal(day.hourly[0].hour, 1);
  assert.equal(day.hourly[0].totalTokens, 22);
});

test('quota zero-used is valid, weekly primary is not mislabeled five-hour, missing daily stays empty', () => {
  const result = normalizeQuota({ rateLimits: { planType: 'pro', primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1800000000 }, secondary: null } }, { summary: { lifetimeTokens: 123 }, dailyUsageBuckets: null });
  assert.equal(result.available, true);
  assert.equal(result.remainingPercent, 100);
  assert.equal(result.windows[0].key, 'weekly');
  assert.equal(result.windows.length, 1);
  assert.deepEqual(result.officialDaily, []);
  assert.equal(result.lifetimeTokens, 123);
  assert.equal(normalizeQuota(null, null).remainingPercent, null);
});

test('messages and tool output never enter parser results', () => {
  const parser = createLogParser({ fileKey: 'file', timeZone: 'UTC' });
  [meta(), context(), { type: 'response_item', timestamp: '2026-11-06T08:00:00Z', payload: { type: 'message', content: 'PRIVATE PROMPT token_count' } }, count(usage(5, 1))].forEach(row => parser.pushLine(JSON.stringify(row)));
  assert.doesNotMatch(JSON.stringify(parser.finish()), /PRIVATE PROMPT/);
});
