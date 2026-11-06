import React, { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  FolderOpen,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { StylePreview } from './variant-ui.jsx';

const THEMES = [
  [
    'clear',
    '清爽',
    'Clear',
    '横向日期比较，轻量的连续列表。',
    'Horizontal date comparisons and light, continuous lists.',
  ],
  [
    'meter',
    '刻度',
    'Meter',
    '刻度图表，更鲜明的数据层次。',
    'A measured chart and a stronger data hierarchy.',
  ],
];
const COLOR_MODES = [
  ['light', '浅色', 'Light', Sun],
  ['dark', '深色', 'Dark', Moon],
  ['system', '跟随系统', 'System', Monitor],
];
const REFRESH_INTERVALS = [60, 120, 300, 600];

function SettingsSwitch({ label, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-label={label}
      aria-checked={Boolean(checked)}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

export default function SettingsPanel({
  settings,
  saveSettings,
  t,
  action,
  refresh,
}) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const disabled = pending !== null;
  const skinId = settings.skinId || 'meter';
  const colorMode = settings.theme || 'light';
  const motionLevel = settings.reducedMotion
    ? 'off'
    : settings.motionLevel || 'gentle';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  async function run(name, task) {
    if (pending !== null) return;
    setPending(name);
    setError('');
    try {
      await task();
    } catch {
      setError(
        name === 'settings'
          ? t(
              '设置未能保存，请重试。',
              'Settings could not be saved. Please retry.',
            )
          : t(
              '操作未能完成，请重试。',
              'The action could not be completed. Please retry.',
            ),
      );
    } finally {
      setPending(null);
    }
  }

  function change(patch) {
    return run('settings', () => saveSettings(patch));
  }

  function changeMotion(value) {
    return change({ motionLevel: value, reducedMotion: value === 'off' });
  }

  return (
    <div className="settings-page" aria-busy={disabled}>
      <section
        className="settings-section style-section"
        aria-labelledby="settings-style-title"
      >
        <h2 id="settings-style-title">{t('界面风格', 'Interface style')}</h2>
        <p>
          {t(
            '切换风格会保留当前页面、筛选和会话选择。',
            'Switch styles while keeping your page, filters, and session selection.',
          )}
        </p>
        <div
          className="variant-gallery"
          role="group"
          aria-label={t('界面风格', 'Interface style')}
        >
          {THEMES.map(([id, zh, en, descriptionZh, descriptionEn]) => (
            <button
              type="button"
              key={id}
              className={'variant-option ' + (skinId === id ? 'chosen' : '')}
              aria-label={t(zh + '主题', en + ' theme')}
              aria-pressed={skinId === id}
              disabled={disabled}
              onClick={() => change({ skinId: id })}
            >
              <StylePreview variant={id} />
              <div>
                <strong>{t(zh, en)}</strong>
                {skinId === id && <Check size={16} aria-hidden="true" />}
              </div>
              <p>{t(descriptionZh, descriptionEn)}</p>
            </button>
          ))}
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-display-title"
      >
        <h2 id="settings-display-title">{t('显示模式', 'Color mode')}</h2>
        <p>
          {t(
            '选择适合当前工作环境的显示方式。',
            'Choose the appearance that suits your workspace.',
          )}
        </p>
        <div
          className="skin-options"
          role="group"
          aria-label={t('显示模式', 'Color mode')}
          style={{ flexWrap: 'wrap' }}
        >
          {COLOR_MODES.map(([id, zh, en, Icon]) => (
            <button
              type="button"
              key={id}
              className={'skin-option ' + (colorMode === id ? 'chosen' : '')}
              aria-pressed={colorMode === id}
              aria-label={t(zh + '显示模式', en + ' color mode')}
              disabled={disabled}
              onClick={() => change({ theme: id })}
            >
              <div className={'skin-preview ' + id} aria-hidden="true">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <aside />
              </div>
              <div>
                <Icon size={16} aria-hidden="true" />
                <strong>{t(zh, en)}</strong>
                {colorMode === id && <Check size={16} aria-hidden="true" />}
              </div>
            </button>
          ))}
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('紧凑显示', 'Compact display')}</h3>
            <p>
              {t(
                '减少表格与会话列表的行距。',
                'Use tighter rows in tables and session lists.',
              )}
            </p>
          </div>
          <SettingsSwitch
            label={t('紧凑显示', 'Compact display')}
            checked={settings.compactMode}
            disabled={disabled}
            onChange={(value) => change({ compactMode: value })}
          />
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('界面动效', 'Interface motion')}</h3>
            <p>
              {t(
                '控制详情展开与操作反馈的动态效果。',
                'Control motion for opening details and action feedback.',
              )}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <select
              aria-label={t('动效强度', 'Motion level')}
              value={motionLevel}
              disabled={disabled}
              onChange={(event) => changeMotion(event.target.value)}
            >
              <option value="off">{t('关闭', 'Off')}</option>
              <option value="gentle">{t('轻柔', 'Gentle')}</option>
              <option value="full">{t('完整', 'Full')}</option>
            </select>
            <SettingsSwitch
              label={t('动效开关', 'Toggle motion')}
              checked={motionLevel !== 'off'}
              disabled={disabled}
              onChange={(value) => changeMotion(value ? 'gentle' : 'off')}
            />
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('遵循系统减少动态效果', 'Respect reduced motion')}</h3>
            <p>
              {t(
                '系统要求减少动态效果时，降低界面动效。',
                'Reduce interface motion when requested by your operating system.',
              )}
            </p>
          </div>
          <SettingsSwitch
            label={t('遵循系统减少动态效果', 'Respect reduced motion')}
            checked={settings.respectReducedMotion !== false}
            disabled={disabled}
            onChange={(value) => change({ respectReducedMotion: value })}
          />
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-data-title"
      >
        <h2 id="settings-data-title">{t('显示与数据', 'Display and data')}</h2>
        <div className="settings-row">
          <div>
            <h3>{t('语言', 'Language')}</h3>
            <p>
              {t(
                '界面文字的显示语言。',
                'The language used for interface text.',
              )}
            </p>
          </div>
          <select
            aria-label={t('界面语言', 'Interface language')}
            value={settings.language || 'zh'}
            disabled={disabled}
            onChange={(event) => change({ language: event.target.value })}
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('时区', 'Time zone')}</h3>
            <p>
              {t(
                '日期分组与重置时间使用本机时区。',
                'Date groups and reset times use your local time zone.',
              )}
            </p>
          </div>
          <span>{timeZone}</span>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('悬浮窗', 'Floating widget')}</h3>
            <p>
              {t(
                '在桌面旁置顶显示用量与剩余额度。',
                'Keep usage and remaining capacity visible beside your work.',
              )}
            </p>
          </div>
          <SettingsSwitch
            label={t('显示悬浮窗', 'Show floating widget')}
            checked={settings.widgetVisible}
            disabled={disabled}
            onChange={(value) => change({ widgetVisible: value })}
          />
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('登录时启动', 'Launch at sign-in')}</h3>
            <p>
              {t(
                '登录系统后在后台启动 Codex Pulse。',
                'Start Codex Pulse in the background when you sign in to your computer.',
              )}
            </p>
          </div>
          <SettingsSwitch
            label={t('登录时启动', 'Launch at sign-in')}
            checked={settings.launchAtLogin}
            disabled={disabled}
            onChange={(value) => change({ launchAtLogin: value })}
          />
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('刷新间隔', 'Refresh interval')}</h3>
            <p>
              {t(
                '自动更新本机统计和账号额度的间隔。',
                'How often local statistics and account limits are refreshed.',
              )}
            </p>
          </div>
          <select
            aria-label={t('刷新间隔', 'Refresh interval')}
            value={settings.refreshSeconds || 60}
            disabled={disabled}
            onChange={(event) =>
              change({ refreshSeconds: Number(event.target.value) })
            }
          >
            {REFRESH_INTERVALS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds / 60}{' '}
                {t('分钟', seconds === 60 ? 'minute' : 'minutes')}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('数据来源', 'Data sources')}</h3>
            <p>
              {t(
                '正式桌面模式读取本机 Codex 日志，账号额度来自官方服务。浏览器预览与演示模式使用合成数据。',
                'Normal desktop mode reads local Codex logs, with account limits from the official service. Browser previews and demo mode use synthetic data.',
              )}
            </p>
          </div>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-local-title"
      >
        <h2 id="settings-local-title">{t('本机数据', 'Local data')}</h2>
        <div className="settings-row">
          <div>
            <h3>{t('数据目录', 'Data folder')}</h3>
            <p>
              {t(
                '查看 Codex Pulse 的设置、统计缓存和应用日志。',
                'View Codex Pulse preferences, statistics caches, and app logs.',
              )}
            </p>
          </div>
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() => run('folder', () => action('open-data-folder'))}
          >
            <FolderOpen size={15} aria-hidden="true" />
            {t('打开目录', 'Open folder')}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('Codex 程序', 'Codex executable')}</h3>
            <p>
              {settings.codexExecutable
                ? t(
                    '已选择自定义 Codex 程序。',
                    'A custom Codex executable is selected.',
                  )
                : t(
                    '自动检测官方安装，也可手动选择。',
                    'Detect the official installation automatically, or choose it yourself.',
                  )}
            </p>
          </div>
          <button
            type="button"
            className="button"
            aria-label={t('选择 Codex 可执行文件', 'Choose Codex executable')}
            disabled={disabled}
            onClick={() => run('codex', () => action('choose-codex'))}
          >
            {t('选择程序', 'Choose executable')}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <h3>{t('重新扫描本机日志', 'Rescan local logs')}</h3>
            <p>
              {t(
                '重新读取本机保留的 Codex 日志，只更新本机统计，不请求账号额度。',
                'Reread retained local Codex logs. This updates local statistics without requesting account limits.',
              )}
            </p>
          </div>
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() =>
              run('rescan', () =>
                refresh({ logs: true, quota: false, force: true }),
              )
            }
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={pending === 'rescan' ? 'spin' : undefined}
            />
            {pending === 'rescan'
              ? t('扫描中', 'Scanning')
              : t('重新扫描', 'Rescan')}
          </button>
        </div>
        {pending === 'rescan' && (
          <p className="quiet-note" role="status">
            {t('正在重新扫描本机日志。', 'Rescanning local Codex logs.')}
          </p>
        )}
        {error && (
          <p className="quiet-note" role="alert">
            {error}
          </p>
        )}
      </section>

      <div className="settings-bottom">
        <span className="brand-mark small" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>
          Codex Pulse
          <span>{t('本机用量与额度', 'Local usage and account limits')}</span>
        </span>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          style={{ marginLeft: 'auto' }}
          onClick={() => run('repo', () => action('open-repo'))}
        >
          GitHub
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
