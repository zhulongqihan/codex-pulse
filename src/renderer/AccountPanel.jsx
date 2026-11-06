import React from 'react';
import {
  ChevronRight,
  Clock3,
  RefreshCw,
  Settings,
  UserRound,
  X,
} from 'lucide-react';

const chinese = (zh) => zh;

function percentage(entry) {
  const value = entry?.remainingPercent;
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

function resetDate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(
    typeof value === 'number' && value < 1e12 ? value * 1000 : value,
  );
  return Number.isFinite(date.getTime()) ? date : null;
}

function quotaTimeZone(quota) {
  const supplied = quota?.timeZone ?? quota?.timezone;
  if (typeof supplied === 'string') {
    try {
      return new Intl.DateTimeFormat('en', {
        timeZone: supplied,
      }).resolvedOptions().timeZone;
    } catch {
      /* Use the system zone for invalid metadata. */
    }
  }
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function quotaMessage(available, stale, error, busy, t) {
  if (stale)
    return t(
      '当前显示上次成功查询的数据，请刷新账号额度。',
      'Showing the last successful result. Refresh account limits for an update.',
    );
  if (busy && !available)
    return t(
      '正在通过官方 Codex 客户端查询额度。',
      'Reading account limits through the official Codex client.',
    );
  if (error === 'AUTH_REQUIRED')
    return t(
      '请先在官方 Codex 客户端登录，再刷新额度。',
      'Sign in to the official Codex client, then refresh account limits.',
    );
  if (error === 'CODEX_NOT_FOUND' || error === 'CODEX_EXECUTABLE_INVALID')
    return t(
      '未找到可用的 Codex 客户端，可在偏好设置中选择。',
      'No usable Codex client was found. Choose one in preferences.',
    );
  if (error === 'CODEX_INCOMPATIBLE')
    return t(
      '客户端暂不支持额度查询，请更新官方 Codex 客户端。',
      'The client does not support this limit query. Update the official Codex client.',
    );
  if (error)
    return t(
      '暂时无法读取账号额度，请稍后刷新。',
      'Account limits are temporarily unavailable. Try refreshing again.',
    );
  if (!available)
    return t(
      '尚未获取账号额度，点击下方按钮查询。',
      'Account limits have not been loaded. Use the refresh button below.',
    );
  return '';
}

function QuotaWindow({
  entry,
  title,
  short = false,
  available,
  formatTime,
  timeZone,
  t,
}) {
  const value = available ? percentage(entry) : null;
  const known = value !== null;
  const reset = available ? resetDate(entry?.resetsAt) : null;
  const displayed = known ? Math.round(value * 10) / 10 : null;
  return (
    <section
      className={'quota-section' + (short ? ' short-window' : '')}
      aria-label={title}
    >
      <div className="quota-caption">
        <h3>{title}</h3>
        <span>{known ? t('剩余', 'Remaining') : t('未知', 'Unknown')}</span>
      </div>
      {known || !short ? (
        <div className="quota-number">
          {known ? displayed : '—'}
          {known ? <span>%</span> : null}
        </div>
      ) : null}
      {known ? (
        <div
          className="quota-ticks"
          role="meter"
          aria-label={`${title}${t('剩余', ' remaining')}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          {Array.from({ length: 25 }, (_, index) => (
            <i
              key={index}
              aria-hidden="true"
              className={index < Math.round(value / 4) ? 'filled' : ''}
            />
          ))}
        </div>
      ) : (
        <div className="unknown-track" aria-hidden="true" />
      )}
      <p>
        {reset ? (
          <>
            <time dateTime={reset.toISOString()}>{formatTime(reset)}</time>
            {t(' 重置', ' reset')}
          </>
        ) : entry && available ? (
          t('重置时间未知', 'Reset time unknown')
        ) : (
          t('当前未返回此窗口', 'This window was not returned')
        )}
      </p>
      {reset ? <small>{timeZone}</small> : null}
    </section>
  );
}

export default function AccountPanel({
  quota,
  status,
  t = chinese,
  refresh,
  onSettings,
  compact,
  onClose,
}) {
  const available = quota?.available === true;
  const stale = available && quota?.stale === true;
  const busy = status?.quotaRefreshing === true;
  const windows =
    available && Array.isArray(quota?.windows)
      ? quota.windows.filter((entry) => entry && typeof entry === 'object')
      : [];
  const weekly =
    windows.find((entry) => entry.windowMinutes === 10080) ||
    windows.find(
      (entry) =>
        typeof entry.windowMinutes === 'number' && entry.windowMinutes >= 10080,
    );
  const fiveHour = windows.find((entry) => entry.windowMinutes === 300);
  const plan = typeof quota?.plan === 'string' ? quota.plan.trim() : '';
  const timeZone = quotaTimeZone(quota);
  const formatter = new Intl.DateTimeFormat(t('zh-CN', 'en-US'), {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const formatTime = (date) => formatter.format(date);
  const resets = windows
    .map((entry) => resetDate(entry.resetsAt))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const nextReset = available ? resets[0] || resetDate(quota?.resetsAt) : null;
  const checkedAt = resetDate(status?.quotaAt ?? quota?.checkedAt);
  const explanation = quotaMessage(
    available,
    stale,
    quota?.errorCode || status?.quotaErrorCode,
    busy,
    t,
  );

  return (
    <>
      <div className="account-title">
        <h2>{t('账户额度', 'Account limits')}</h2>
        {compact ? (
          <button
            type="button"
            className="icon-button"
            aria-label={t('关闭账户额度', 'Close account limits')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="account-profile">
        <span className="account-avatar" aria-hidden="true">
          <UserRound size={17} />
        </span>
        <div>
          <strong>{t('当前 Codex 账户', 'Current Codex account')}</strong>
          {plan ? (
            <span>{plan}</span>
          ) : (
            <span>{t('官方账号额度', 'Official account limits')}</span>
          )}
        </div>
      </div>
      {explanation ? (
        <p className="account-explanation" role="status">
          {explanation}
        </p>
      ) : null}
      <QuotaWindow
        entry={weekly}
        title={t('每周额度', 'Weekly limit')}
        available={available}
        formatTime={formatTime}
        timeZone={timeZone}
        t={t}
      />
      <QuotaWindow
        entry={fiveHour}
        title={t('5 小时额度', '5-hour limit')}
        short
        available={available}
        formatTime={formatTime}
        timeZone={timeZone}
        t={t}
      />
      <button
        type="button"
        className="button quota-refresh"
        aria-label={t('刷新账号额度', 'Refresh account limits')}
        disabled={busy}
        onClick={() => refresh({ logs: false, quota: true })}
      >
        <RefreshCw
          size={14}
          className={busy ? 'spin' : undefined}
          aria-hidden="true"
        />
        {busy
          ? t('查询中…', 'Refreshing…')
          : t('刷新账号额度', 'Refresh account limits')}
      </button>
      <p className="quota-source">
        {t(
          '额度取自官方账号，与本机 Token 统计分别计算。',
          'Account limits come from the official account and are separate from local token statistics.',
        )}
      </p>
      <div className="account-secondary">
        <div>
          <span>{t('额度状态', 'Limit status')}</span>
          <strong>
            {stale
              ? t('上次成功数据', 'Last successful result')
              : available
                ? t('已获取', 'Available')
                : busy
                  ? t('查询中', 'Refreshing')
                  : t('未获取', 'Unavailable')}
          </strong>
        </div>
        <div>
          <span>{t('上次成功', 'Last success')}</span>
          <strong>
            {checkedAt ? (
              <time dateTime={checkedAt.toISOString()}>
                {formatTime(checkedAt)}
              </time>
            ) : (
              t('未知', 'Unknown')
            )}
          </strong>
        </div>
      </div>
      <section className="reset-section">
        <div className="section-heading">
          <h3>
            {stale
              ? t('已记录重置时间', 'Last reported reset')
              : t('下一次重置', 'Next reset')}
          </h3>
          <Clock3 size={14} aria-hidden="true" />
        </div>
        <p className="reset-time">
          {nextReset ? (
            <time dateTime={nextReset.toISOString()}>
              {formatTime(nextReset)}
            </time>
          ) : (
            t('未知', 'Unknown')
          )}
        </p>
        <span>
          {nextReset
            ? t(
                '按官方窗口返回时间显示',
                'As reported by the official limit window',
              )
            : t(
                '等待官方窗口返回重置时间',
                'Waiting for a reset time from the official limit window',
              )}
        </span>
        {nextReset ? <span>{timeZone}</span> : null}
      </section>
      <button
        type="button"
        className="account-setting text-button"
        onClick={onSettings}
      >
        <Settings size={14} aria-hidden="true" />
        {t('偏好设置', 'Preferences')}
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    </>
  );
}
