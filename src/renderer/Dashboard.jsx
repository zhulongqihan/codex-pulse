import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  UserRound,
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Folder,
  Layers,
  MessageSquare,
  PanelRightClose,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  X,
  Clock3,
  Copy,
  Columns2,
  PanelTop,
  AlertCircle,
} from 'lucide-react';
import { MeterPlot, StylePreview } from './variant-ui.jsx';
import { bridge, useMedia, usePulse } from './use-pulse.js';
import { monthlyTotals, rangeCsv, rangeMarkdown } from './analytics.js';
import {
  cached,
  compact,
  dateLabel,
  exact,
  localDay,
  n,
  offsetDay,
  timeLabel,
  tokenRow,
} from './utils.js';
import SettingsPanel from './SettingsPanel.jsx';
import AccountPanel from './AccountPanel.jsx';
import './dashboard.css';
import './variants.css';
import './production.css';

const NAV = [
  ['overview', '仪表盘', 'Overview', Activity],
  ['sessions', '会话', 'Sessions', MessageSquare],
  ['models', '模型', 'Models', Layers],
  ['daily', '按日', 'Daily', CalendarDays],
  ['monthly', '按月', 'Monthly', Columns2],
  ['projects', '项目', 'Projects', Folder],
];
const readRoute = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return [...NAV.map((n) => n[0]), 'settings'].includes(r) ? r : 'overview';
};
const money = (value) =>
  Number.isFinite(value)
    ? '$' +
      value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
const rate = (row) =>
  row?.hasTokenBreakdown === false || !n(row?.inputTokens)
    ? '—'
    : ((cached(row) / row.inputTokens) * 100).toFixed(1) + '%';
const sliceKey = (row) =>
  [row.id, row.date || row.startedAt, row.model, row.project].join('|');
const shortId = (id) =>
  !id ? '—' : id.length > 20 ? id.slice(0, 8) + '…' + id.slice(-8) : id;
function IconButton({ label, children, onClick, ...props }) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
function Empty({ title, children }) {
  return (
    <div className="empty-content">
      <Activity size={24} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
function TokenBar({ row, max }) {
  const r = tokenRow(row),
    scale = Math.max(1, max);
  return (
    <div
      className="stack"
      role="img"
      aria-label={
        r.hasTokenBreakdown
          ? `Input ${exact(r.inputTokens)}, cache ${exact(r.cachedTokens)}, output ${exact(r.outputTokens)}`
          : `Total ${exact(r.totalTokens)}`
      }
      title={exact(r.totalTokens) + ' tokens'}
    >
      {r.hasTokenBreakdown ? (
        <>
          <span
            className="uncached"
            style={{
              width:
                (Math.max(0, r.inputTokens - r.cachedTokens) / scale) * 100 +
                '%',
            }}
          />
          <span
            className="cached"
            style={{ width: (r.cachedTokens / scale) * 100 + '%' }}
          />
          <span
            className="output"
            style={{ width: (r.outputTokens / scale) * 100 + '%' }}
          />
        </>
      ) : (
        <span
          className="output"
          style={{ width: (r.totalTokens / scale) * 100 + '%' }}
        />
      )}
    </div>
  );
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Dashboard() {
  const pulse = usePulse(),
    {
      settings,
      saveSettings,
      all,
      snapshot,
      preset,
      setPreset,
      custom,
      setCustom,
      range,
      displayRange,
      rangeReady,
      anchor,
      refresh,
      refreshing,
      action,
      error,
    } = pulse;
  const [route, setRoute] = useState(readRoute),
    [selectedDay, setSelectedDay] = useState(''),
    [chartMode, setChartMode] = useState('tokens'),
    [sort, setSort] = useState('date');
  const [sessionId, setSessionId] = useState(''),
    [sessionQuery, setSessionQuery] = useState(''),
    [sessionPage, setSessionPage] = useState(0),
    [sessionProject, setSessionProject] = useState(''),
    [sessionModel, setSessionModel] = useState('');
  const [project, setProject] = useState(''),
    [model, setModel] = useState(''),
    [entityQuery, setEntityQuery] = useState(''),
    [replayTab, setReplayTab] = useState('usage');
  const [exportOpen, setExportOpen] = useState(false),
    [notice, setNotice] = useState(''),
    [accountVisible, setAccountVisible] = useState(true),
    [accountOpen, setAccountOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [globalQuery, setGlobalQuery] = useState('');
  const compactWindow = useMedia('(max-width:1080px)'),
    systemDark = useMedia('(prefers-color-scheme:dark)'),
    systemReduced = useMedia('(prefers-reduced-motion:reduce)');
  const accountRef = useRef(null),
    searchDialog = useRef(null),
    searchInput = useRef(null),
    noticeTimer = useRef(null);
  const language = settings.language === 'en' ? 'en' : 'zh',
    t = (zh, en) => (language === 'en' ? en : zh);
  const mode =
    settings.theme === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : settings.theme || 'light';
  const motion =
    settings.reducedMotion ||
    settings.motionLevel === 'off' ||
    (settings.respectReducedMotion !== false && systemReduced)
      ? 'off'
      : settings.motionLevel || 'gentle';
  const skin = ['clear', 'meter'].includes(settings.skinId)
    ? settings.skinId
    : 'clear';
  const ready =
    snapshot.mode === 'demo' || snapshot.source?.logsAvailable === true;
  const rows = useMemo(() => snapshot.daily || [], [snapshot.daily]);
  const sessionRows = useMemo(
    () => snapshot.sessions || [],
    [snapshot.sessions],
  );
  const months = useMemo(
    () =>
      monthlyTotals(rows, sessionRows, {
        sessionDetailsComplete: snapshot.source?.sessionDetailsComplete,
      }),
    [rows, sessionRows, snapshot.source?.sessionDetailsComplete],
  );
  const day = rows.find((r) => r.date === selectedDay) || rows.at(-1),
    dayIndex = rows.indexOf(day);
  const graphRows = rows.slice(-7),
    max = Math.max(1, ...graphRows.map((r) => n(r.totalTokens)));
  const chartRows = graphRows.map((r) => ({
    ...r,
    total: r.totalTokens / 1e6,
    input: n(r.inputTokens) / 1e6,
    output: n(r.outputTokens) / 1e6,
    cache: cached(r) / 1e6,
    cost: r.estimatedCost,
    day:
      r.date === anchor
        ? t('今天', 'Today')
        : new Intl.DateTimeFormat(language === 'en' ? 'en' : 'zh-CN', {
            weekday: 'short',
          }).format(new Date(r.date + 'T12:00:00Z')),
    hasTokenBreakdown: tokenRow(r).hasTokenBreakdown,
  }));
  const chartSelected = chartRows.findIndex((r) => r.date === day?.date);
  const chartSessions = sessionRows
    .filter(
      (r) =>
        (r.date || localDay(r.startedAt, snapshot.range?.timeZone)) ===
        day?.date,
    )
    .slice(0, 4);
  const deferredQuery = useDeferredValue(
    sessionQuery.trim().toLocaleLowerCase(),
  );
  const filteredSessions = useMemo(
    () =>
      sessionRows
        .filter(
          (r) =>
            (!sessionProject || r.project === sessionProject) &&
            (!sessionModel || r.model === sessionModel) &&
            (!deferredQuery ||
              [r.id, r.project, r.model].some((v) =>
                String(v || '')
                  .toLocaleLowerCase()
                  .includes(deferredQuery),
              )),
        )
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))),
    [sessionRows, sessionProject, sessionModel, deferredQuery],
  );
  const activeSession =
    filteredSessions.find((r) => sliceKey(r) === sessionId) ||
    filteredSessions[0];
  const pageCount = Math.max(1, Math.ceil(filteredSessions.length / 30)),
    pageRows = filteredSessions.slice(
      Math.min(sessionPage, pageCount - 1) * 30,
      (Math.min(sessionPage, pageCount - 1) + 1) * 30,
    );
  const total = snapshot.totals || {},
    pageLabel =
      NAV.find((r) => r[0] === route)?.[language === 'en' ? 2 : 1] ||
      t('设置', 'Settings');
  function announce(text) {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(''), 3000);
  }
  function go(next) {
    setRoute(next);
    location.hash = '/' + next;
    setExportOpen(false);
  }
  function showSessions(projectName = '', modelName = '') {
    setSessionProject(projectName);
    setSessionModel(modelName);
    setSessionQuery('');
    setSessionPage(0);
    go('sessions');
  }
  function toggleAccount() {
    if (compactWindow) accountRef.current?.togglePopover();
    else setAccountVisible((v) => !v);
  }
  function copy(value) {
    navigator.clipboard
      .writeText(value)
      .then(() => announce(t('已复制', 'Copied')))
      .catch(() =>
        announce(
          t('复制失败，请手动选择', 'Copy failed; select the value manually'),
        ),
      );
  }
  async function exportRange(format) {
    setExportOpen(false);
    if (!range || !rangeReady) return;
    try {
      if (bridge) {
        if (await bridge.exportData(format, range))
          announce(t('已导出当前范围', 'Selected range exported'));
      } else {
        download(
          `codex-pulse-demo-${range.from}-${range.to}.${format === 'csv' ? 'csv' : 'md'}`,
          format === 'csv' ? rangeCsv(snapshot) : rangeMarkdown(snapshot),
          format === 'csv'
            ? 'text/csv;charset=utf-8'
            : 'text/markdown;charset=utf-8',
        );
        announce(t('演示数据已导出', 'Demo data exported'));
      }
    } catch {
      announce(t('导出未完成，请重试', 'Export did not finish; try again'));
    }
  }
  useEffect(() => {
    document.documentElement.dataset.variant = skin;
    document.documentElement.dataset.skin = mode;
    document.documentElement.dataset.motion = motion === 'off' ? 'off' : 'on';
    document.documentElement.dataset.dense = String(!!settings.compactMode);
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  }, [skin, mode, motion, settings.compactMode, language]);
  useEffect(() => {
    const changed = () => setRoute(readRoute());
    addEventListener('hashchange', changed);
    return () => removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    setSessionPage(0);
  }, [sessionQuery, sessionProject, sessionModel]);
  useEffect(() => {
    if (searchOpen) {
      searchDialog.current?.showModal();
      setTimeout(() => searchInput.current?.focus(), 0);
    } else searchDialog.current?.close();
  }, [searchOpen]);
  useEffect(() => {
    const keys = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setExportOpen(false);
      }
      if (e.altKey && Number(e.key) > 0 && Number(e.key) < 7) {
        e.preventDefault();
        const next = NAV[Number(e.key) - 1][0];
        setRoute(next);
        location.hash = '/' + next;
      }
    };
    addEventListener('keydown', keys);
    return () => removeEventListener('keydown', keys);
  }, []);
  const sortedDays = useMemo(
    () =>
      [...rows].sort((a, b) =>
        sort === 'tokens'
          ? b.totalTokens - a.totalTokens
          : sort === 'cost'
            ? (b.estimatedCost ?? -1) - (a.estimatedCost ?? -1)
            : b.date.localeCompare(a.date),
      ),
    [rows, sort],
  );
  const entityType = route === 'models' ? 'models' : 'projects',
    entityRows = (snapshot[entityType] || []).filter((r) =>
      r.name.toLocaleLowerCase().includes(entityQuery.toLocaleLowerCase()),
    ),
    entitySelection = route === 'models' ? model : project;
  const activeEntity =
    entityRows.find((r) => r.name === entitySelection) || entityRows[0];
  const entitySessions = activeEntity
    ? sessionRows.filter(
        (r) => (route === 'models' ? r.model : r.project) === activeEntity.name,
      )
    : [];
  const entityTimeline = activeEntity
    ? rows.map((d) => ({
        date: d.date,
        ...(d[entityType]?.find((r) => r.name === activeEntity.name) || {
          totalTokens: 0,
        }),
      }))
    : [];
  const distribution = useMemo(() => {
    const map = new Map();
    for (const r of entitySessions) {
      const name = route === 'models' ? r.project : r.model;
      map.set(name, (map.get(name) || 0) + n(r.totalTokens));
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [entitySessions, route]);
  return (
    <div
      className="app"
      data-motion={motion}
      data-preview={snapshot.mode === 'demo' ? 'true' : 'false'}
    >
      <header className="app-header">
        <button
          className="brand"
          onClick={() => go('overview')}
          aria-label="Codex Pulse"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Pulse</span>
        </button>
        <nav aria-label={t('主导航', 'Main navigation')}>
          {NAV.map(([id, zh, en, Icon]) => (
            <button
              data-route={id}
              key={id}
              onClick={() => go(id)}
              aria-current={route === id ? 'page' : undefined}
            >
              <Icon size={17} />
              <span>{t(zh, en)}</span>
            </button>
          ))}
        </nav>
        <div className="header-tools">
          <label className="variant-quick">
            <SlidersHorizontal size={14} />
            <select
              aria-label={t('界面风格', 'Interface style')}
              value={skin}
              onChange={(e) => saveSettings({ skinId: e.target.value })}
            >
              <option value="clear">{t('清爽', 'Clear')}</option>
              <option value="meter">{t('刻度', 'Meter')}</option>
            </select>
          </label>
          <IconButton
            label={t('账户额度', 'Account limits')}
            onClick={toggleAccount}
            aria-expanded={compactWindow ? accountOpen : accountVisible}
          >
            <UserRound size={18} />
          </IconButton>
          <IconButton
            label={t('搜索（Ctrl+K）', 'Search (Ctrl+K)')}
            onClick={() => setSearchOpen(true)}
          >
            <Search size={18} />
          </IconButton>
          <IconButton
            data-route="settings"
            label={t('设置', 'Settings')}
            onClick={() => go('settings')}
            aria-current={route === 'settings' ? 'page' : undefined}
          >
            <Settings size={18} />
          </IconButton>
        </div>
      </header>
      <div className="workbench">
        <main className="main-workspace">
          <div className="page-toolbar">
            <div className="page-title">
              <h1>
                {route === 'overview'
                  ? t('用量概览', 'Usage overview')
                  : pageLabel}
              </h1>
              <span className="source-badge">
                {snapshot.mode === 'demo'
                  ? t('演示数据', 'Demo data')
                  : t('本机日志', 'Local logs')}
              </span>
            </div>
            <div className="toolbar-status">
              <Check size={13} />
              <span>
                {snapshot.status?.scanning
                  ? t('正在扫描', 'Scanning')
                  : t('已同步 ', 'Synced ') +
                    String(all.daily?.length || 0) +
                    t(' 天记录', ' days')}
              </span>
              <span className="last-update">
                {timeLabel(snapshot.source?.logsAsOf, language)}
              </span>
              <IconButton
                label={t('刷新本机记录', 'Refresh local records')}
                disabled={refreshing || snapshot.status?.scanning}
                onClick={() => refresh({ logs: true, quota: false })}
              >
                <RefreshCw
                  size={15}
                  className={snapshot.status?.scanning ? 'spin' : ''}
                />
              </IconButton>
            </div>
          </div>
          {range && !rangeReady && ready && (
            <p className="range-loading" role="status">
              {error
                ? t(
                    '当前显示上次成功读取的日期范围。',
                    'Showing the last successfully loaded date range.',
                  )
                : t(
                    '正在读取新范围，暂时显示上次成功的统计。',
                    'Loading the new range. Previous statistics remain visible.',
                  )}
            </p>
          )}
          {error && (
            <div className="source-warning" role="status">
              <AlertCircle size={15} />
              {t(
                '操作暂未完成，保留上次成功的数据。',
                'The action did not finish. Previous successful data is retained.',
              )}
              <button onClick={() => refresh()}>{t('重试', 'Retry')}</button>
            </div>
          )}
          {snapshot.status?.scanning && (
            <div className="scan-notice" role="status">
              {t('扫描进度', 'Scan progress')}{' '}
              {snapshot.status.progress?.done || 0} /{' '}
              {snapshot.status.progress?.total || '—'}
              <progress
                max={snapshot.status.progress?.total || 1}
                value={snapshot.status.progress?.done || 0}
              />
            </div>
          )}
          {route !== 'settings' && (
            <>
              <div className="range-toolbar">
                <div className="range-left">
                  <IconButton
                    label={t('选择前一天', 'Previous day')}
                    disabled={dayIndex <= 0}
                    onClick={() => setSelectedDay(rows[dayIndex - 1].date)}
                  >
                    <ChevronLeft size={16} />
                  </IconButton>
                  <strong>
                    {displayRange
                      ? displayRange.from + ' — ' + displayRange.to
                      : '—'}
                  </strong>
                  <IconButton
                    label={t('选择后一天', 'Next day')}
                    disabled={dayIndex < 0 || dayIndex >= rows.length - 1}
                    onClick={() => setSelectedDay(rows[dayIndex + 1].date)}
                  >
                    <ChevronRight size={16} />
                  </IconButton>
                  <span className="toolbar-divider" />
                  <select
                    aria-label={t('日期范围', 'Date range')}
                    value={preset}
                    onChange={(e) => {
                      if (e.target.value === 'custom' && !custom.from)
                        setCustom({
                          from: range?.from || anchor,
                          to: range?.to || anchor,
                        });
                      setPreset(e.target.value);
                    }}
                  >
                    {[1, 2, 7, 14, 30, 60, 90, 180, 365].map((v) => (
                      <option key={v} value={v}>
                        {v === 1
                          ? t('今天', 'Today')
                          : t('最近 ' + v + ' 天', 'Last ' + v + ' days')}
                      </option>
                    ))}
                    <option value="all">{t('全部记录', 'All records')}</option>
                    <option value="custom">
                      {t('自定义范围', 'Custom range')}
                    </option>
                  </select>
                </div>
                <div className="range-actions">
                  <IconButton
                    label={t('显示或隐藏账户区', 'Toggle account panel')}
                    onClick={toggleAccount}
                  >
                    <PanelRightClose size={16} />
                  </IconButton>
                  <div className="export-wrap">
                    <button
                      className="button"
                      onClick={() => setExportOpen((v) => !v)}
                      disabled={!range || !rangeReady}
                      aria-expanded={exportOpen}
                    >
                      <ArrowDownToLine size={15} />
                      {t('导出', 'Export')}
                      <ChevronDown size={12} />
                    </button>
                    {exportOpen && (
                      <div className="export-menu">
                        <button onClick={() => exportRange('csv')}>
                          {t('导出 CSV', 'Export CSV')}
                        </button>
                        <button onClick={() => exportRange('markdown')}>
                          {t('导出 Markdown', 'Export Markdown')}
                        </button>
                        <p>{t('当前日期范围', 'Current date range')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {preset === 'custom' && (
                <div className="custom-range">
                  <label>
                    {t('从', 'From')}
                    <input
                      type="date"
                      aria-label={t('开始日期', 'Start date')}
                      max={anchor}
                      value={custom.from}
                      onChange={(e) =>
                        setCustom((v) => ({ ...v, from: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    {t('至', 'To')}
                    <input
                      type="date"
                      aria-label={t('结束日期', 'End date')}
                      max={anchor}
                      value={custom.to}
                      onChange={(e) =>
                        setCustom((v) => ({ ...v, to: e.target.value }))
                      }
                    />
                  </label>
                  {!range && (
                    <span role="status">
                      {t(
                        '请选择有效且不晚于今天的日期范围。',
                        'Choose a valid date range ending no later than today.',
                      )}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {route === 'overview' && (
            <>
              <div className="summary-strip">
                {[
                  [
                    t('总用量', 'Total tokens'),
                    ready ? compact(total.totalTokens) : '—',
                    'tokens',
                  ],
                  [
                    t('输入', 'Input'),
                    ready ? compact(total.inputTokens) : '—',
                    t('含缓存', 'includes cache'),
                  ],
                  [
                    t('输出', 'Output'),
                    ready ? compact(total.outputTokens) : '—',
                    'tokens',
                  ],
                  [
                    t('缓存命中', 'Cache hit'),
                    rate(total),
                    t('输入占比', 'share of input'),
                  ],
                  [
                    t('API 估价', 'API estimate'),
                    money(total.estimatedCost),
                    t('非 Pro 账单', 'not a Pro bill'),
                  ],
                ].map(([label, value, hint]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{hint}</small>
                  </div>
                ))}
              </div>
              {day ? (
                <div className="overview-split">
                  <div className="daily-comparison">
                    <div className="week-chart">
                      <div className="section-heading">
                        <h2>{t('每天的用量', 'Daily usage')}</h2>
                        <div className="text-tabs">
                          <button
                            aria-pressed={chartMode === 'tokens'}
                            onClick={() => setChartMode('tokens')}
                          >
                            Token
                          </button>
                          <button
                            aria-pressed={chartMode === 'cost'}
                            onClick={() => setChartMode('cost')}
                          >
                            {t('估价', 'Estimate')}
                          </button>
                        </div>
                      </div>
                      <div className="comparison-legend">
                        <span>
                          <i className="uncached" />
                          {t('未缓存输入', 'Uncached input')}
                        </span>
                        <span>
                          <i className="cached" />
                          {t('缓存输入', 'Cached input')}
                        </span>
                        <span>
                          <i className="output" />
                          {t('输出', 'Output')}
                        </span>
                      </div>
                      {skin === 'meter' ? (
                        <MeterPlot
                          rows={chartRows}
                          allDays={chartRows}
                          selected={chartSelected}
                          onSelect={(i) => setSelectedDay(chartRows[i].date)}
                          view={chartMode}
                        />
                      ) : (
                        <>
                          <div className="comparison-head">
                            <span>{t('日期', 'Date')}</span>
                            <span className="axis">
                              <span>0</span>
                              <span>{compact(max / 2)}</span>
                              <span>{compact(max)}</span>
                            </span>
                            <span>
                              {chartMode === 'cost'
                                ? t('估价', 'Estimate')
                                : t('合计', 'Total')}
                            </span>
                          </div>
                          <div className="day-list">
                            {[...graphRows].reverse().map((r) => (
                              <button
                                key={r.date}
                                className={
                                  'day-row ' +
                                  (day.date === r.date ? 'selected' : '')
                                }
                                aria-pressed={day.date === r.date}
                                onClick={() => setSelectedDay(r.date)}
                              >
                                <span className="date-cell">
                                  <strong>
                                    {r.date.slice(5).replace('-', '/')}
                                  </strong>
                                  <small>
                                    {r.date === anchor
                                      ? t('今天', 'Today')
                                      : ''}
                                  </small>
                                </span>
                                <span className="bar-cell">
                                  {chartMode === 'tokens' ? (
                                    <TokenBar row={r} max={max} />
                                  ) : (
                                    <span
                                      className="cost-line"
                                      style={{
                                        width: Number.isFinite(r.estimatedCost)
                                          ? (r.estimatedCost /
                                              Math.max(
                                                1,
                                                ...graphRows.map(
                                                  (d) => d.estimatedCost || 0,
                                                ),
                                              )) *
                                              100 +
                                            '%'
                                          : '0%',
                                      }}
                                    />
                                  )}
                                </span>
                                <strong className="day-total">
                                  {chartMode === 'cost'
                                    ? money(r.estimatedCost)
                                    : compact(r.totalTokens)}
                                </strong>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="comparison-foot">
                        <span>
                          {t('日均 ', 'Daily average ') +
                            compact(
                              n(total.totalTokens) / Math.max(1, rows.length),
                            )}{' '}
                          tokens
                        </span>
                        <span>
                          {rows.length > 7
                            ? t(
                                '图中为最近7个活动日',
                                'Latest 7 active days shown',
                              )
                            : t('缓存已包含于输入', 'Cache is part of input')}
                        </span>
                      </div>
                    </div>
                    <div className="project-section">
                      <div className="section-heading">
                        <h2>{t('用量去了哪里', 'Where usage went')}</h2>
                        <button
                          className="text-button"
                          onClick={() => go('projects')}
                        >
                          {t('查看项目', 'View projects')}
                          <ChevronRight size={13} />
                        </button>
                      </div>
                      {(snapshot.projects || []).slice(0, 5).map((r, i) => (
                        <button
                          className="project-line"
                          key={r.name}
                          onClick={() => {
                            setProject(r.name);
                            go('projects');
                          }}
                        >
                          <span className={'project-dot project-' + (i % 3)} />
                          <span>{r.name}</span>
                          <span className="project-share">
                            <i
                              style={{
                                width:
                                  (n(r.totalTokens) /
                                    Math.max(1, n(total.totalTokens))) *
                                    100 +
                                  '%',
                              }}
                            />
                          </span>
                          <strong>{compact(r.totalTokens)}</strong>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="day-inspector">
                    <div className="inspector-date">
                      <strong>{day.date.slice(8)}</strong>
                      <div>
                        <h2>{dateLabel(day.date, language)}</h2>
                        <span>
                          {day.date === anchor
                            ? t('今天', 'Today')
                            : new Intl.DateTimeFormat(language, {
                                weekday: 'long',
                              }).format(new Date(day.date + 'T12:00:00Z'))}
                        </span>
                      </div>
                      <CalendarDays size={18} />
                    </div>
                    <div className="day-facts">
                      <span>
                        {t('总用量', 'Total tokens')}
                        <strong>{compact(day.totalTokens)}</strong>
                      </span>
                      <span>
                        {t('API 估价', 'API estimate')}
                        <strong>{money(day.estimatedCost)}</strong>
                      </span>
                      <span>
                        {t('会话', 'Sessions')}
                        <strong>
                          {day.sessions ??
                            new Set(chartSessions.map((s) => s.id)).size}
                        </strong>
                      </span>
                      <span>
                        {t('缓存命中', 'Cache hit')}
                        <strong>{rate(day)}</strong>
                      </span>
                    </div>
                    <div className="section-heading">
                      <h2>{t('当天会话', 'Sessions that day')}</h2>
                    </div>
                    <div className="compact-sessions">
                      {chartSessions.map((r) => (
                        <button
                          key={sliceKey(r)}
                          onClick={() => {
                            setSessionId(sliceKey(r));
                            showSessions(r.project, r.model);
                          }}
                        >
                          <span className="session-time">
                            {timeLabel(r.startedAt, language).split(' ').at(-1)}
                          </span>
                          <span>
                            <strong>
                              {r.project || t('未知项目', 'Unknown project')}
                            </strong>
                            <small>
                              {r.model || t('未知模型', 'Unknown model')}
                              <span>{compact(r.totalTokens)}</span>
                            </small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </div>
                    {!chartSessions.length && (
                      <p className="quiet-note">
                        {t(
                          '此日未保留会话明细。',
                          'No session details were retained for this day.',
                        )}
                      </p>
                    )}
                    <button
                      className="inspector-link"
                      onClick={() => showSessions()}
                    >
                      {t('查看范围内全部会话', 'View all sessions in range')}
                      <ChevronRight size={14} />
                    </button>
                    <p className="quiet-note">
                      {t(
                        '选择日期，可查看当天用量。',
                        'Select a date to inspect its usage.',
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <Empty
                  title={
                    ready
                      ? t('此范围没有活动记录', 'No activity in this range')
                      : t('正在读取本机统计', 'Reading local statistics')
                  }
                >
                  {t(
                    '尝试调整日期范围，或刷新本机记录。',
                    'Change the date range or refresh local records.',
                  )}
                </Empty>
              )}
            </>
          )}
          {['daily', 'monthly'].includes(route) && (
            <div className="table-page">
              <div className="section-heading">
                <h2>
                  {route === 'daily'
                    ? rows.length + t(' 天记录', ' recorded days')
                    : t('自然月汇总', 'Calendar months')}
                </h2>
                {route === 'daily' && (
                  <select
                    aria-label={t('按日排序', 'Daily sort')}
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="date">
                      {t('日期从新到旧', 'Newest date first')}
                    </option>
                    <option value="tokens">
                      {t('用量从高到低', 'Most tokens first')}
                    </option>
                    <option value="cost">
                      {t('估价从高到低', 'Highest estimate first')}
                    </option>
                  </select>
                )}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('日期', 'Date')}</th>
                      {route === 'daily' && (
                        <th>{t('用量分布', 'Composition')}</th>
                      )}
                      {route === 'monthly' && (
                        <th>{t('活动天数', 'Active days')}</th>
                      )}
                      <th>{t('输入', 'Input')}</th>
                      <th>{t('缓存输入', 'Cached input')}</th>
                      <th>{t('输出', 'Output')}</th>
                      <th>{t('合计', 'Total')}</th>
                      <th>{t('会话', 'Sessions')}</th>
                      <th>{t('API 估价', 'API estimate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(route === 'daily' ? sortedDays : months).map((r) => (
                      <tr
                        key={r.date}
                        tabIndex={route === 'daily' ? 0 : undefined}
                        onClick={
                          route === 'daily'
                            ? () => {
                                setSelectedDay(r.date);
                                go('overview');
                              }
                            : undefined
                        }
                        onKeyDown={(e) => {
                          if (route === 'daily' && e.key === 'Enter') {
                            setSelectedDay(r.date);
                            go('overview');
                          }
                        }}
                      >
                        <td>
                          <strong>{r.month || r.date}</strong>
                        </td>
                        {route === 'daily' ? (
                          <td className="table-bar">
                            <TokenBar row={r} max={max} />
                          </td>
                        ) : (
                          <td>{r.activeDays}</td>
                        )}
                        <td>
                          {r.hasTokenBreakdown === false
                            ? '—'
                            : compact(r.inputTokens)}
                        </td>
                        <td>
                          {r.hasTokenBreakdown === false
                            ? '—'
                            : compact(cached(r))}
                        </td>
                        <td>
                          {r.hasTokenBreakdown === false
                            ? '—'
                            : compact(r.outputTokens)}
                        </td>
                        <td>
                          <strong>{compact(r.totalTokens)}</strong>
                        </td>
                        <td>{r.sessions ?? '—'}</td>
                        <td>{money(r.estimatedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="quiet-note">
                {t(
                  '缓存输入计入输入；会话按 ID 去重。API 估价不是 Pro 账单。',
                  'Cached input is part of input. Sessions are deduplicated by ID. API estimates are not Pro bills.',
                )}
              </p>
              {!rows.length && (
                <Empty
                  title={t('此范围暂无记录', 'No records in this range')}
                />
              )}
            </div>
          )}
          {route === 'sessions' && (
            <div className="session-workspace">
              <aside className="session-picker">
                <label className="search-field">
                  <Search size={15} />
                  <input
                    aria-label={t('搜索会话', 'Search sessions')}
                    placeholder={t(
                      '搜索 ID、项目或模型',
                      'Search ID, project or model',
                    )}
                    value={sessionQuery}
                    onChange={(e) => setSessionQuery(e.target.value)}
                  />
                </label>
                <div className="session-filters">
                  <select
                    aria-label={t('会话项目筛选', 'Session project filter')}
                    value={sessionProject}
                    onChange={(e) => setSessionProject(e.target.value)}
                  >
                    <option value="">{t('全部项目', 'All projects')}</option>
                    {(snapshot.projects || []).map((r) => (
                      <option key={r.name}>{r.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={t('会话模型筛选', 'Session model filter')}
                    value={sessionModel}
                    onChange={(e) => setSessionModel(e.target.value)}
                  >
                    <option value="">{t('全部模型', 'All models')}</option>
                    {(snapshot.models || []).map((r) => (
                      <option key={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="session-group">
                  {t('统计分段', 'Usage segments')}
                  <span>{filteredSessions.length}</span>
                </div>
                {pageRows.map((r) => (
                  <button
                    key={sliceKey(r)}
                    className={
                      'session-pick ' +
                      (sliceKey(activeSession || {}) === sliceKey(r)
                        ? 'selected'
                        : '')
                    }
                    onClick={() => setSessionId(sliceKey(r))}
                  >
                    <div>
                      <strong>
                        {r.project || t('未知项目', 'Unknown project')}
                      </strong>
                      <span>{timeLabel(r.startedAt, language)}</span>
                    </div>
                    <p>
                      {r.model || t('未知模型', 'Unknown model')}
                      <span>{compact(r.totalTokens)}</span>
                    </p>
                    <small title={r.id}>{shortId(r.id)}</small>
                  </button>
                ))}
                {!filteredSessions.length && (
                  <p className="quiet-note">
                    {t('没有匹配的记录。', 'No matching records.')}
                  </p>
                )}
                <div className="pagination">
                  <button
                    disabled={sessionPage === 0}
                    onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span>
                    {Math.min(sessionPage + 1, pageCount)} / {pageCount}
                  </span>
                  <button
                    disabled={sessionPage >= pageCount - 1}
                    onClick={() => setSessionPage((p) => p + 1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </aside>
              <section className="replay">
                {activeSession ? (
                  <>
                    <div className="replay-header">
                      <div>
                        <span className="breadcrumb">
                          {activeSession.project}
                          <ChevronRight size={12} />
                          {t('会话统计', 'Session statistics')}
                        </span>
                        <h2 title={activeSession.id}>
                          {shortId(activeSession.id)}
                        </h2>
                      </div>
                      <IconButton
                        label={t('复制会话 ID', 'Copy session ID')}
                        onClick={() => copy(activeSession.id)}
                      >
                        <Copy size={16} />
                      </IconButton>
                    </div>
                    <div className="replay-meta">
                      <span>
                        <Clock3 size={13} />
                        {timeLabel(activeSession.startedAt, language)}
                      </span>
                      <span>{activeSession.model}</span>
                      <span>{compact(activeSession.totalTokens)} tokens</span>
                    </div>
                    <div className="replay-tabs">
                      <button
                        aria-pressed={replayTab === 'usage'}
                        onClick={() => setReplayTab('usage')}
                      >
                        {t('用量', 'Usage')}
                      </button>
                      <button
                        aria-pressed={replayTab === 'metadata'}
                        onClick={() => setReplayTab('metadata')}
                      >
                        {t('元数据', 'Metadata')}
                      </button>
                      <span>{t('只读统计', 'Read-only statistics')}</span>
                    </div>
                    {replayTab === 'usage' ? (
                      <div className="metadata">
                        <h3>{t('本段用量', 'Segment usage')}</h3>
                        {[
                          [
                            t('输入（含缓存）', 'Input, including cache'),
                            activeSession.hasTokenBreakdown === false
                              ? '—'
                              : compact(activeSession.inputTokens),
                          ],
                          [
                            t('缓存输入', 'Cached input'),
                            activeSession.hasTokenBreakdown === false
                              ? '—'
                              : compact(cached(activeSession)),
                          ],
                          [
                            t('输出', 'Output'),
                            activeSession.hasTokenBreakdown === false
                              ? '—'
                              : compact(activeSession.outputTokens),
                          ],
                          [
                            t('总 Token', 'Total tokens'),
                            compact(activeSession.totalTokens),
                          ],
                          [t('缓存命中', 'Cache hit'), rate(activeSession)],
                          [
                            t('API 估价', 'API estimate'),
                            money(activeSession.estimatedCost),
                          ],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span>{k}</span>
                            <strong>{v}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="metadata">
                        {[
                          [t('会话 ID', 'Session ID'), activeSession.id],
                          [
                            t('日期', 'Date'),
                            activeSession.date ||
                              localDay(activeSession.startedAt),
                          ],
                          [t('项目', 'Project'), activeSession.project],
                          [t('模型', 'Model'), activeSession.model],
                          [
                            t('开始记录于', 'First recorded at'),
                            timeLabel(activeSession.startedAt, language),
                          ],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span>{k}</span>
                            <strong>{v || '—'}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="quiet-note">
                      {t(
                        '按日期、模型和项目分段统计；同一会话可能出现多条记录。此视图不读取对话正文。',
                        'Usage is segmented by date, model and project. One session may have several rows. This view does not read conversation text.',
                      )}
                    </p>
                  </>
                ) : (
                  <Empty
                    title={t('没有可显示的会话', 'No session to display')}
                  />
                )}
              </section>
            </div>
          )}
          {['models', 'projects'].includes(route) && (
            <div className="entity-workspace">
              <aside className="entity-picker">
                <label className="search-field">
                  <Search size={15} />
                  <input
                    value={entityQuery}
                    onChange={(e) => setEntityQuery(e.target.value)}
                    placeholder={t('搜索', 'Search')}
                    aria-label={t(
                      '搜索模型或项目',
                      'Search models or projects',
                    )}
                  />
                </label>
                <h2>
                  {entityRows.length} {pageLabel}
                </h2>
                {entityRows.map((r) => (
                  <button
                    className={
                      'entity-pick ' +
                      (activeEntity?.name === r.name ? 'selected' : '')
                    }
                    key={r.name}
                    onClick={() =>
                      route === 'models' ? setModel(r.name) : setProject(r.name)
                    }
                    aria-pressed={activeEntity?.name === r.name}
                  >
                    {route === 'models' ? (
                      <Layers size={17} />
                    ) : (
                      <Folder size={17} />
                    )}
                    <span>
                      <strong>{r.name}</strong>
                      <small>{compact(r.totalTokens)} tokens</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </aside>
              <section className="entity-detail">
                {activeEntity ? (
                  <>
                    <div className="section-heading">
                      <h2>{activeEntity.name}</h2>
                      <span>
                        {displayRange?.from + ' — ' + displayRange?.to}
                      </span>
                    </div>
                    <div className="entity-total">
                      {compact(activeEntity.totalTokens)} <span>tokens</span>
                    </div>
                    <div className="day-facts entity-facts">
                      <span>
                        {t('缓存命中', 'Cache hit')}
                        <strong>{rate(activeEntity)}</strong>
                      </span>
                      <span>
                        {t('会话', 'Sessions')}
                        <strong>
                          {activeEntity.sessions ??
                            new Set(entitySessions.map((r) => r.id)).size}
                        </strong>
                      </span>
                      <span>
                        {t('输入', 'Input')}
                        <strong>{compact(activeEntity.inputTokens)}</strong>
                      </span>
                      <span>
                        {t('输出', 'Output')}
                        <strong>{compact(activeEntity.outputTokens)}</strong>
                      </span>
                    </div>
                    <div
                      className="entity-trend"
                      role="group"
                      aria-label={t('每日用量趋势', 'Daily usage trend')}
                    >
                      {entityTimeline.slice(-14).map((r) => (
                        <button
                          key={r.date}
                          title={
                            r.date + ' ' + exact(r.totalTokens) + ' tokens'
                          }
                          onClick={() => {
                            setSelectedDay(r.date);
                            go('overview');
                          }}
                        >
                          <span
                            style={{
                              height: Math.max(
                                r.totalTokens > 0 ? 2 : 0,
                                (n(r.totalTokens) /
                                  Math.max(
                                    1,
                                    ...entityTimeline.map((d) =>
                                      n(d.totalTokens),
                                    ),
                                  )) *
                                  120,
                              ),
                            }}
                          />
                          <small>{r.date.slice(5)}</small>
                        </button>
                      ))}
                    </div>
                    <div className="section-heading">
                      <h3>
                        {route === 'models'
                          ? t('项目分布', 'Projects')
                          : t('模型分布', 'Models')}
                      </h3>
                    </div>
                    {distribution.slice(0, 8).map(([name, value]) => (
                      <div className="distribution-line" key={name}>
                        <span>{name}</span>
                        <div>
                          <i
                            style={{
                              width:
                                (value /
                                  Math.max(1, activeEntity.totalTokens)) *
                                  100 +
                                '%',
                            }}
                          />
                        </div>
                        <strong>
                          {(
                            (value / Math.max(1, activeEntity.totalTokens)) *
                            100
                          ).toFixed(1)}
                          %
                        </strong>
                      </div>
                    ))}
                    <div className="section-heading entity-sessions-title">
                      <h3>{t('相关会话', 'Related sessions')}</h3>
                      <button
                        className="text-button"
                        onClick={() =>
                          showSessions(
                            route === 'projects' ? activeEntity.name : '',
                            route === 'models' ? activeEntity.name : '',
                          )
                        }
                      >
                        {t('查看全部', 'View all')}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    {entitySessions.slice(0, 5).map((r) => (
                      <button
                        className="related-session"
                        key={sliceKey(r)}
                        onClick={() => {
                          setSessionId(sliceKey(r));
                          showSessions(
                            route === 'projects' ? activeEntity.name : '',
                            route === 'models' ? activeEntity.name : '',
                          );
                        }}
                      >
                        <MessageSquare size={15} />
                        <span>{shortId(r.id)}</span>
                        <small>{compact(r.totalTokens)}</small>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                    {!entitySessions.length && (
                      <p className="quiet-note">
                        {t(
                          '未保留对应的会话明细。',
                          'No matching session details were retained.',
                        )}
                      </p>
                    )}
                    {route === 'projects' && (
                      <p className="quiet-note">
                        {t(
                          '项目按工作目录末级名称分组；同名目录可能合并。',
                          'Projects use the final directory name. Identically named directories may be combined.',
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <Empty title={t('没有匹配的数据', 'No matching data')} />
                )}
              </section>
            </div>
          )}
          {route === 'settings' && (
            <SettingsPanel
              settings={settings}
              saveSettings={saveSettings}
              t={t}
              action={action}
              refresh={refresh}
            />
          )}
          {!!snapshot.status?.warnings?.length && (
            <details className="data-warnings">
              <summary>
                {t('数据说明', 'Data notes')} ({snapshot.status.warnings.length}
                )
              </summary>
              {snapshot.status.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </details>
          )}
        </main>
        {(compactWindow || accountVisible) && (
          <aside
            id="account-panel"
            ref={accountRef}
            popover={compactWindow ? 'auto' : undefined}
            onToggle={() =>
              setAccountOpen(
                accountRef.current?.matches(':popover-open') || false,
              )
            }
            className="account-sidebar"
          >
            <AccountPanel
              quota={snapshot.quota || {}}
              status={snapshot.status || {}}
              t={t}
              refresh={refresh}
              onSettings={() => go('settings')}
              compact={compactWindow}
              onClose={() => accountRef.current?.hidePopover()}
            />
          </aside>
        )}
      </div>
      <footer className="status-bar">
        <span className="demo-indicator" />
        {snapshot.mode === 'demo'
          ? t('合成演示数据', 'Synthetic demo data')
          : t('本机统计', 'Local statistics')}
        <span className="status-separator" />
        {all.source?.sessionFiles || 0} {t('份日志', 'log files')}
        <span className="status-right">
          <button onClick={() => action('open-data-folder')}>
            {t('数据目录', 'Data folder')}
          </button>
          <span>Ctrl K</span>
          <button
            onClick={() =>
              saveSettings({
                motionLevel: motion === 'off' ? 'gentle' : 'off',
                reducedMotion: false,
              })
            }
          >
            {t('动效', 'Motion')}{' '}
            {motion === 'off' ? t('关闭', 'off') : t('开启', 'on')}
          </button>
        </span>
      </footer>
      <dialog
        ref={searchDialog}
        className="search-dialog"
        onCancel={() => setSearchOpen(false)}
        onClick={(e) => {
          if (e.target === searchDialog.current) setSearchOpen(false);
        }}
      >
        <div className="global-search-input">
          <Search size={19} />
          <input
            ref={searchInput}
            aria-label={t('全局搜索', 'Global search')}
            placeholder={t(
              '搜索页面、项目和模型',
              'Search pages, projects and models',
            )}
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
          />
          <IconButton
            label={t('关闭搜索', 'Close search')}
            onClick={() => setSearchOpen(false)}
          >
            <X size={17} />
          </IconButton>
        </div>
        <div className="search-results">
          {[
            ...NAV.map(([id, zh, en, Icon]) => ({
              key: id,
              label: t(zh, en),
              Icon,
              run: () => go(id),
            })),
            ...(snapshot.projects || []).map((r) => ({
              key: 'p' + r.name,
              label: r.name,
              Icon: Folder,
              run: () => {
                setProject(r.name);
                setEntityQuery('');
                go('projects');
              },
            })),
            ...(snapshot.models || []).map((r) => ({
              key: 'm' + r.name,
              label: r.name,
              Icon: Layers,
              run: () => {
                setModel(r.name);
                setEntityQuery('');
                go('models');
              },
            })),
          ]
            .filter((r) =>
              r.label
                .toLocaleLowerCase()
                .includes(globalQuery.toLocaleLowerCase()),
            )
            .map(({ key, label, Icon, run }) => (
              <button
                key={key}
                onClick={() => {
                  run();
                  setSearchOpen(false);
                }}
              >
                <Icon size={16} />
                {label}
                <ChevronRight size={13} />
              </button>
            ))}
        </div>
        <p>
          {t(
            'Tab 选择，Enter 打开，Esc 关闭。',
            'Tab to select, Enter to open, Esc to close.',
          )}
        </p>
      </dialog>
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
    </div>
  );
}
