import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultSettings, getDemoSnapshot, DEMO_TODAY } from './demo-data.js';
import { rangeFrom } from './analytics.js';
import { localDay } from './utils.js';

export const bridge = window.pulse || null;
export const isPreview = !bridge;
const empty = {
  mode: 'live',
  daily: [],
  models: [],
  projects: [],
  sessions: [],
  totals: {},
  today: { available: false },
  quota: { available: false, windows: [] },
  status: {},
  source: { logsAvailable: false },
};
function storedSettings() {
  try {
    return isPreview
      ? JSON.parse(localStorage.getItem('pulse-preview-settings') || '{}')
      : {};
  } catch {
    return {};
  }
}
export function useMedia(query) {
  const [value, setValue] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setValue(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return value;
}

export function usePulse() {
  const [settings, setSettings] = useState(() => ({
    ...defaultSettings,
    skinId: 'meter',
    compactMode: false,
    ...storedSettings(),
  }));
  const [all, setAll] = useState(() => (isPreview ? getDemoSnapshot() : empty));
  const [snapshot, setSnapshot] = useState(() =>
    isPreview ? getDemoSnapshot({ from: '2026-10-31', to: DEMO_TODAY }) : empty,
  );
  const [preset, setPreset] = useState('7'),
    [custom, setCustom] = useState({ from: '', to: '' }),
    [error, setError] = useState(''),
    [refreshing, setRefreshing] = useState(false);
  const anchor = all.today?.date || (isPreview ? DEMO_TODAY : localDay());
  const range = useMemo(() => {
    try {
      return rangeFrom(
        preset,
        anchor,
        all.daily?.[0]?.date,
        custom.from,
        custom.to,
      );
    } catch {
      return null;
    }
  }, [preset, anchor, all.daily, custom.from, custom.to]);
  const read = useRef(0);
  useEffect(() => {
    if (!bridge) {
      try {
        localStorage.setItem(
          'pulse-preview-settings',
          JSON.stringify(settings),
        );
      } catch {
        setError('SETTINGS_SAVE');
      }
    }
  }, [settings]);
  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    bridge
      .getSettings()
      .then((value) => {
        if (!disposed) setSettings((s) => ({ ...s, ...value }));
      })
      .catch(() => {
        if (!disposed) setError('SETTINGS_READ');
      });
    bridge
      .getSnapshot()
      .then((value) => {
        if (!disposed) setAll(value);
      })
      .catch(() => {
        if (!disposed) setError('SNAPSHOT_READ');
      });
    const offSnapshot = bridge.onSnapshot((value) => {
      if (!disposed) setAll(value);
    });
    const offSettings = bridge.onSettings((value) => {
      if (!disposed) setSettings((s) => ({ ...s, ...value }));
    });
    return () => {
      disposed = true;
      offSnapshot?.();
      offSettings?.();
    };
  }, []);
  useEffect(() => {
    if (!range) return;
    if (!bridge) {
      setSnapshot(getDemoSnapshot(range));
      return;
    }
    let disposed = false;
    const version = ++read.current;
    bridge
      .getSnapshot(range)
      .then((value) => {
        if (!disposed && version === read.current) {
          setSnapshot(value);
          setError('');
        }
      })
      .catch(() => {
        if (!disposed) setError('SNAPSHOT_READ');
      });
    return () => {
      disposed = true;
    };
  }, [all, range?.from, range?.to]);
  const saveSettings = useCallback(async (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (!bridge) return true;
    try {
      const saved = await bridge.saveSettings(patch);
      setSettings((s) => ({ ...s, ...saved }));
      return true;
    } catch {
      setError('SETTINGS_SAVE');
      bridge
        .getSettings()
        .then((value) => setSettings((s) => ({ ...s, ...value })))
        .catch(() => {});
      return false;
    }
  }, []);
  const refresh = useCallback(async (options = { logs: true, quota: true }) => {
    setRefreshing(true);
    try {
      if (bridge) await bridge.refresh(options);
      else await new Promise((r) => setTimeout(r, 240));
      setError('');
    } catch {
      setError('REFRESH');
    } finally {
      setRefreshing(false);
    }
  }, []);
  const action = useCallback(async (name) => {
    if (!bridge) {
      if (name === 'open-repo')
        window.open(
          'https://github.com/zhulongqihan/codex-pulse',
          '_blank',
          'noopener',
        );
      return false;
    }
    try {
      const value = await bridge.action(name);
      if (name === 'choose-codex' && value)
        setSettings((s) => ({ ...s, ...value }));
      return value;
    } catch {
      setError('ACTION');
      return false;
    }
  }, []);
  const displayRange = snapshot.range || range;
  const rangeReady =
    !!range &&
    snapshot.range?.from === range.from &&
    snapshot.range?.to === range.to;
  return {
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
    error,
    refreshing,
    refresh,
    action,
  };
}
