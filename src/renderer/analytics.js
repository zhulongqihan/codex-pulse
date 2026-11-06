const TOKEN_FIELDS = [
  'inputTokens',
  'cachedTokens',
  'outputTokens',
  'totalTokens',
];
const PRESETS = new Set(['1', '2', '7', '14', '30', '60', '90', '180', '365']);
const COST_NOTE =
  'Standard API token-price estimate, not a Pro subscription bill, wallet balance, Credits deduction or additional charge. Unknown prices are not zero.';

function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + 'T12:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function checkedRange(from, to) {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new TypeError('Expected a valid inclusive YYYY-MM-DD date range.');
  return { from, to };
}

export function rangeFrom(preset, anchor, firstDate, customFrom, customTo) {
  if (!validDate(anchor)) throw new TypeError('Expected a valid anchor date.');
  const key = String(preset);
  if (key === 'custom') {
    const range = checkedRange(customFrom, customTo);
    if (range.to > anchor)
      throw new TypeError('The date range cannot end after the anchor date.');
    return range;
  }
  if (key === 'all')
    return checkedRange(
      firstDate == null || firstDate === '' ? anchor : firstDate,
      anchor,
    );
  if (!PRESETS.has(key)) throw new TypeError('Unsupported date-range preset.');
  const date = new Date(anchor + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - Number(key) + 1);
  return checkedRange(date.toISOString().slice(0, 10), anchor);
}

function tokens(row) {
  const result = {};
  for (const field of TOKEN_FIELDS) {
    const value = row[field] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0)
      throw new TypeError('Token values must be non-negative safe integers.');
    result[field] = value;
  }
  if (result.cachedTokens > result.inputTokens)
    throw new TypeError('Cached input must be included in input tokens.');
  return result;
}

function knownCost(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function emptyTotals() {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function addTokens(target, row) {
  for (const field of TOKEN_FIELDS) {
    target[field] += row[field];
    if (!Number.isSafeInteger(target[field]))
      throw new TypeError(
        'The token total exceeds the supported integer range.',
      );
  }
}

export function monthlyTotals(
  dailyRows = [],
  sessionRows = [],
  { sessionDetailsComplete } = {},
) {
  const months = new Map();
  for (const row of dailyRows) {
    if (!validDate(row?.date))
      throw new TypeError('Expected a valid daily date.');
    const month = row.date.slice(0, 7);
    if (!months.has(month))
      months.set(month, {
        month,
        date: month,
        ...emptyTotals(),
        days: new Map(),
        activeDates: new Set(),
        ids: new Set(),
        cost: 0,
        hasCost: true,
      });
    const total = months.get(month),
      values = tokens(row);
    addTokens(total, values);
    if (!total.days.has(row.date))
      total.days.set(row.date, {
        active: false,
        expectedSessions: 0,
        ids: new Set(),
      });
    const day = total.days.get(row.date);
    day.active ||= values.totalTokens > 0;
    if (Number.isFinite(row.sessions) && row.sessions > 0)
      day.expectedSessions = Math.max(day.expectedSessions, row.sessions);
    if (values.totalTokens > 0) total.activeDates.add(row.date);
    if (knownCost(row.estimatedCost)) total.cost += row.estimatedCost;
    else total.hasCost = false;
  }
  for (const row of sessionRows) {
    const date =
      row?.date ??
      (typeof row?.startedAt === 'string' ? row.startedAt.slice(0, 10) : null);
    if (!validDate(date) || typeof row.id !== 'string' || !row.id) continue;
    const total = months.get(date.slice(0, 7));
    const day = total?.days.get(date);
    if (day) {
      day.ids.add(row.id);
      total.ids.add(row.id);
    }
  }
  return [...months.values()]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map(
      ({ month, date, days, activeDates, ids, cost, hasCost, ...totals }) => {
        // Legacy imports can omit or truncate session detail. Daily counts establish
        // coverage only; summing them would count a cross-day session more than once.
        const complete =
          sessionDetailsComplete !== false &&
          [...days.values()].every(
            (day) =>
              (!day.active || day.ids.size > 0) &&
              (sessionDetailsComplete === true ||
                day.ids.size >= day.expectedSessions),
          );
        return {
          month,
          date,
          activeDays: activeDates.size,
          ...totals,
          sessions: complete ? ids.size : undefined,
          estimatedCost: hasCost && Number.isFinite(cost) ? cost : undefined,
        };
      },
    );
}

function exportData(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.daily))
    throw new TypeError('Expected a usage snapshot.');
  const range = checkedRange(
    snapshot.range?.from ?? snapshot.from,
    snapshot.range?.to ?? snapshot.to,
  );
  const rows = snapshot.daily
    .map((row) => {
      if (!validDate(row?.date))
        throw new TypeError('Expected a valid daily date.');
      return {
        date: row.date,
        ...tokens(row),
        estimatedCost: knownCost(row.estimatedCost)
          ? row.estimatedCost
          : undefined,
      };
    })
    .filter((row) => row.date >= range.from && row.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const totals = emptyTotals();
  for (const row of rows) addTokens(totals, row);
  const cost = rows.reduce((sum, row) => sum + (row.estimatedCost ?? 0), 0);
  totals.estimatedCost =
    rows.length &&
    rows.every((row) => knownCost(row.estimatedCost)) &&
    Number.isFinite(cost)
      ? cost
      : undefined;
  // Never pass through free-form source or pricing text: it may contain local paths.
  const source =
    snapshot.mode === 'demo' || snapshot.source?.logsOrigin === 'demo'
      ? 'Demonstration data'
      : snapshot.source?.origin === 'imported-desktop-cache'
        ? 'Imported local aggregate cache'
        : 'Local Codex session-log aggregates';
  const zone = snapshot.range?.timeZone ?? snapshot.timezone;
  let timeZone = 'Not provided';
  if (typeof zone === 'string' && /^[A-Za-z0-9_+\-/]{1,80}$/.test(zone)) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      timeZone = zone;
    } catch {
      /* Invalid metadata is omitted. */
    }
  }
  const rawTime = snapshot.source?.logsAsOf ?? snapshot.source?.lastScan;
  let logsAsOf = 'Not provided';
  if (
    typeof rawTime === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      rawTime,
    ) &&
    validDate(rawTime.slice(0, 10))
  ) {
    const time = new Date(rawTime);
    if (Number.isFinite(time.getTime())) logsAsOf = time.toISOString();
  }
  return { range, rows, totals, source, timeZone, logsAsOf };
}

function csvCell(value) {
  const text = String(value ?? '');
  return (
    '"' +
    (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
}

const HEADERS = [
  'Date',
  'Input tokens (including cache)',
  'Cached input tokens',
  'Output tokens',
  'Total tokens',
  'Estimated cost (USD)',
];
function values(row, unknown = '') {
  return [
    row.inputTokens,
    row.cachedTokens,
    row.outputTokens,
    row.totalTokens,
    row.estimatedCost ?? unknown,
  ];
}

export function rangeCsv(snapshot) {
  const data = exportData(snapshot);
  const rows = [
    ['Codex Pulse usage statistics'],
    ['Range (inclusive)', data.range.from, data.range.to],
    ['Source', data.source],
    ['Time zone', data.timeZone],
    ['Logs as of', data.logsAsOf],
    ['Cost basis', COST_NOTE],
    [
      'Token basis',
      'Cached input is already included in input tokens; do not add it again.',
    ],
    [],
    HEADERS,
    ...data.rows.map((row) => [row.date, ...values(row)]),
    ['Total', ...values(data.totals)],
  ];
  return (
    '\ufeff' +
    rows.map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}

export function rangeMarkdown(snapshot) {
  const data = exportData(snapshot);
  const tableRow = (cells) => '| ' + cells.join(' | ') + ' |';
  return [
    '# Codex Pulse usage statistics',
    '',
    `Range (inclusive): ${data.range.from} to ${data.range.to}`,
    '',
    `Source: ${data.source}`,
    `Time zone: ${data.timeZone}`,
    `Logs as of: ${data.logsAsOf}`,
    '',
    tableRow(HEADERS),
    tableRow(HEADERS.map(() => '---')),
    ...data.rows.map((row) => tableRow([row.date, ...values(row, '—')])),
    tableRow(['**Total**', ...values(data.totals, '—')]),
    '',
    COST_NOTE,
    '',
    'Cached input is already included in input tokens; do not add it again.',
    'Only retained local usage aggregates are exported. Missing local records do not prove there was no account activity.',
    '',
  ].join('\n');
}
