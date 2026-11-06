import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTotals, rangeCsv, rangeFrom, rangeMarkdown } from '../src/renderer/analytics.js';

const day = (date, totalTokens, estimatedCost) => ({ date, inputTokens: totalTokens * .8, cachedTokens: totalTokens * .4, outputTokens: totalTokens * .2, totalTokens, estimatedCost });
const snapshot = (daily, range = { from: '2024-02-01', to: '2024-02-29', timeZone: 'Asia/Shanghai' }) => ({
  range, daily, mode: 'live',
  source: { origin: 'pulse-scan', logsAsOf: '2024-03-01T01:02:03+08:00' },
});

test('date presets are inclusive and cross leap days, months and years without local-time arithmetic', () => {
  assert.deepEqual(rangeFrom('1', '2024-03-01'), { from: '2024-03-01', to: '2024-03-01' });
  assert.deepEqual(rangeFrom('2', '2024-03-01'), { from: '2024-02-29', to: '2024-03-01' });
  assert.deepEqual(rangeFrom(7, '2024-01-03'), { from: '2023-12-28', to: '2024-01-03' });
  for (const preset of [1, 2, 7, 14, 30, 60, 90, 180, 365]) {
    const range = rangeFrom(preset, '2024-03-01');
    assert.equal((Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1, preset);
    assert.equal(range.to, '2024-03-01');
  }
  assert.deepEqual(rangeFrom('all', '2024-03-01', '2023-12-31'), { from: '2023-12-31', to: '2024-03-01' });
  assert.deepEqual(rangeFrom('all', '2024-03-01'), { from: '2024-03-01', to: '2024-03-01' });
  assert.deepEqual(rangeFrom('custom', '2024-03-01', '2024-02-20', '2024-02-01', '2024-02-29'), { from: '2024-02-01', to: '2024-02-29' });
});

test('invalid, reversed, future and unsupported ranges fail explicitly', () => {
  const invalidDates = ['2023-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-01-00', '2024-1-01', '0000-01-01', '=NOW()', '', null];
  for (const date of invalidDates) {
    assert.throws(() => rangeFrom('7', date), TypeError);
    assert.throws(() => rangeFrom('custom', '2024-03-01', null, date, '2024-03-01'), TypeError);
  }
  assert.throws(() => rangeFrom('custom', '2024-03-01', null, '2024-03-01', '2024-02-29'), TypeError);
  assert.throws(() => rangeFrom('custom', '2024-03-01', null, '2024-03-01', '2024-03-02'), TypeError);
  assert.throws(() => rangeFrom('all', '2024-03-01', '2024-03-02'), TypeError);
  assert.throws(() => rangeFrom('8', '2024-03-01'), TypeError);
  assert.throws(() => rangeFrom('365', '0001-01-01'), TypeError);
});

test('natural months sum existing token fields without counting cached input twice and deduplicate session slices', () => {
  const rows = [day('2024-01-31', 100, .1), day('2024-02-01', 200, .2), day('2024-02-29', 300, .3), day('2024-03-01', 0, 0)];
  const sessions = [
    { id: 'same-thread', date: '2024-01-31', model: 'a' },
    { id: 'same-thread', date: '2024-02-01', model: 'a' },
    { id: 'same-thread', date: '2024-02-01', model: 'b' },
    { id: 'same-thread', date: '2024-02-29', model: 'b' },
    { id: 'another-thread', startedAt: '2024-02-29T23:00:00+08:00' },
    { id: 'outside-daily-range', date: '2024-02-28' },
    { id: 'bad-date', date: '2024-02-30' },
    { date: '2024-02-29' },
  ];
  const before = JSON.stringify({ rows, sessions });
  const result = monthlyTotals(rows, sessions);
  assert.deepEqual(result.map(row => row.month), ['2024-03', '2024-02', '2024-01']);
  assert.deepEqual(result[1], { month: '2024-02', date: '2024-02', activeDays: 2, inputTokens: 400, cachedTokens: 200, outputTokens: 100, totalTokens: 500, sessions: 2, estimatedCost: .5 });
  assert.equal(result[2].sessions, 1, 'one thread may count once in each active month');
  assert.equal(result[0].activeDays, 0);
  assert.equal(result[0].estimatedCost, 0, 'a known free month remains zero');
  assert.equal(JSON.stringify({ rows, sessions }), before, 'pure functions do not mutate caller data');
});

test('unknown monthly prices remain unknown instead of becoming a partial or zero total', () => {
  for (const unknown of [undefined, null, NaN, Infinity, -1, '0.20']) {
    const result = monthlyTotals([day('2024-02-01', 100, .1), day('2024-02-29', 200, unknown)]);
    assert.equal(result[0].estimatedCost, undefined);
    assert.equal(result[0].totalTokens, 300);
  }
  assert.deepEqual(monthlyTotals(), []);
  assert.throws(() => monthlyTotals([day('2023-02-29', 100, 0)]), TypeError);
});

test('months with activity and no session detail report unknown while inactive empty months may report zero', () => {
  for (const sessions of [undefined, null, 0, 2, NaN, Infinity]) {
    const rows = [{ ...day('2024-02-01', 100, .1), sessions }];
    assert.equal(monthlyTotals(rows, [])[0].sessions, undefined);
    assert.equal(monthlyTotals(rows, [], { sessionDetailsComplete: true })[0].sessions, undefined, 'an active day without any details contradicts a complete source');
    assert.equal(monthlyTotals(rows, [])[0].estimatedCost, .1, 'session precision does not affect known cost');
  }
  assert.equal(monthlyTotals([day('2024-02-01', 0, 0)], [])[0].sessions, 0);
  assert.equal(monthlyTotals([{ ...day('2024-02-01', 0, 0), sessions: 2 }], [])[0].sessions, undefined);
});

test('legacy session details must cover each daily count, with model slices deduplicated before checking coverage', () => {
  const rows = [
    { ...day('2024-01-31', 100, .1), sessions: 1 },
    { ...day('2024-02-01', 200, .2), sessions: 2 },
    { ...day('2024-02-29', 300, .3), sessions: 1 },
  ];
  const details = [
    { id: 'january', date: '2024-01-31' },
    { id: 'first', date: '2024-02-01', model: 'a' },
    { id: 'first', date: '2024-02-01', model: 'b' },
    { id: 'last', date: '2024-02-29' },
  ];
  const partial = monthlyTotals(rows, details);
  assert.equal(partial[0].sessions, undefined, 'two model slices of one ID cannot cover two daily sessions');
  assert.equal(partial[1].sessions, 1, 'complete months remain usable independently');
  assert.equal(partial[0].estimatedCost, .5);
  assert.equal(monthlyTotals(rows, [...details, { id: 'second', date: '2024-02-01' }])[0].sessions, 3);
  assert.equal(monthlyTotals(rows, details.filter(row => row.date !== '2024-02-29'))[0].sessions, undefined, 'missing an entire active date is also incomplete');
});

test('complete per-day detail counts one session once across dates instead of summing daily counts', () => {
  const rows = [
    { ...day('2024-02-01', 100, .1), sessions: 2 },
    { ...day('2024-02-29', 200, .2), sessions: 2 },
  ];
  const details = [
    { id: 'shared', date: '2024-02-01', model: 'a' },
    { id: 'shared', date: '2024-02-01', model: 'b' },
    { id: 'first-day', date: '2024-02-01' },
    { id: 'shared', date: '2024-02-29' },
    { id: 'last-day', date: '2024-02-29' },
  ];
  assert.equal(monthlyTotals(rows, details)[0].sessions, 3);
  assert.equal(monthlyTotals(rows, details, { sessionDetailsComplete: true })[0].sessions, 3);
});

test('an explicitly incomplete source never reports a definitive monthly session count', () => {
  const rows = [{ ...day('2024-02-01', 100, .1), sessions: 1 }, day('2024-03-01', 0, 0)];
  const result = monthlyTotals(rows, [{ id: 'present', date: '2024-02-01' }], { sessionDetailsComplete: false });
  assert(result.every(row => row.sessions === undefined), 'false also keeps an apparently empty month unknown');
  assert.equal(result[0].estimatedCost, 0);
  assert.equal(result[1].estimatedCost, .1);
  assert.equal(result[1].totalTokens, 100);
});

test('exports enforce the selected closed range and recompute totals from the exported days', () => {
  const value = snapshot([day('2024-03-01', 900, 9), day('2024-02-29', 200, .2), day('2024-01-31', 800, 8), day('2024-02-01', 100, .1)]);
  value.totals = { totalTokens: 2000, estimatedCost: 99 };
  const csv = rangeCsv(value), markdown = rangeMarkdown(value);
  assert(csv.startsWith('\ufeff'));
  assert.match(csv, /"Range \(inclusive\)","2024-02-01","2024-02-29"/);
  assert.match(csv, /"2024-02-01","80","40","20","100","0.1"/);
  assert.match(csv, /"2024-02-29","160","80","40","200","0.2"/);
  assert.match(csv, /"Total","240","120","60","300",/);
  assert.match(markdown, /\| \*\*Total\*\* \| 240 \| 120 \| 60 \| 300 \|/);
  assert(csv.indexOf('"2024-02-01","80"') < csv.indexOf('"2024-02-29","160"'));
  for (const output of [csv, markdown]) {
    assert.doesNotMatch(output, /2024-01-31|2024-03-01.*900|2000|99/);
    assert.match(output, /Local Codex session-log aggregates/);
    assert.match(output, /Asia\/Shanghai/);
    assert.match(output, /2024-02-29T17:02:03.000Z/);
    assert.match(output, /not a Pro subscription bill/);
    assert.match(output, /Cached input is already included/);
  }
});

test('single-day and empty exports do not reach outside the requested range', () => {
  const rows = [day('2024-02-01', 100, .1), day('2024-02-29', 200, .2)];
  const single = snapshot(rows, { from: '2024-02-29', to: '2024-02-29' });
  assert.match(rangeMarkdown(single), /\| \*\*Total\*\* \| 160 \| 80 \| 40 \| 200 \| 0.2 \|/);
  assert.doesNotMatch(rangeCsv(single), /2024-02-01/);
  const empty = snapshot(rows, { from: '2024-02-02', to: '2024-02-03' });
  assert.match(rangeCsv(empty), /"Total","0","0","0","0",""/);
  assert.match(rangeMarkdown(empty), /\| \*\*Total\*\* \| 0 \| 0 \| 0 \| 0 \| — \|/);
});

test('unknown export costs are empty in CSV and disclosed in Markdown, including the total', () => {
  const value = snapshot([day('2024-02-01', 100, 0), day('2024-02-29', 200)]);
  assert.match(rangeCsv(value), /"2024-02-01","80","40","20","100","0"/);
  assert.match(rangeCsv(value), /"2024-02-29","160","80","40","200",""/);
  assert.match(rangeCsv(value), /"Total","240","120","60","300",""/);
  assert.match(rangeMarkdown(value), /\| 2024-02-29 \| 160 \| 80 \| 40 \| 200 \| — \|/);
  assert.match(rangeMarkdown(value), /Unknown prices are not zero/);
});

test('exports whitelist aggregates and safe metadata instead of serializing private strings', () => {
  const secret = 'PRIVATE-ID alice@example.com F:\\private\\sessions =HYPERLINK("bad") | text\n';
  const value = snapshot([{ ...day('2024-02-01', 100, .1), prompt: secret, id: secret, path: secret }]);
  value.source = { origin: secret, logsAsOf: secret, lastScan: secret, path: secret, account: secret };
  value.range.timeZone = secret;
  value.pricingSource = secret;
  value.sessions = [{ id: secret, text: secret }];
  value.account = secret;
  for (const output of [rangeCsv(value), rangeMarkdown(value)]) {
    assert.doesNotMatch(output, /PRIVATE|alice|private|HYPERLINK|bad|text/);
    assert.match(output, /Not provided/);
  }
  assert.match(rangeMarkdown({ ...value, mode: 'demo' }), /Source: Demonstration data/);
  assert.match(rangeCsv({ ...value, source: { origin: 'imported-desktop-cache' } }), /Imported local aggregate cache/);
});

test('untrusted dates and numeric cells cannot become spreadsheet formulas', () => {
  for (const date of ['=HYPERLINK("bad")', '+cmd', '@SUM(A1)', '-1', '2024-02-30']) {
    assert.throws(() => rangeCsv(snapshot([day(date, 100, .1)])), TypeError);
  }
  for (const field of ['inputTokens', 'cachedTokens', 'outputTokens', 'totalTokens']) {
    for (const value of ['=1+1', '+1', -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => rangeCsv(snapshot([{ ...day('2024-02-01', 100, .1), [field]: value }])), TypeError);
    }
  }
  const value = snapshot([day('2024-02-01', 100, '=1+1')]);
  assert.doesNotMatch(rangeCsv(value), /=1\+1/);
  assert.throws(() => rangeMarkdown(snapshot([], { from: '2024-02-29', to: '2024-02-01' })), TypeError);
});
