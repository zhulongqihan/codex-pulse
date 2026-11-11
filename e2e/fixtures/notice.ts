import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Consumed only by the e2e feature, in offline mode. Never a real announcement.
export function writeNoticeFixture(data: string, id = 'fixture-post', now = Date.now()) {
  const at = (offset: number) => new Date(now + offset).toISOString();
  const url = `https://x.com/synthetic/status/${encodeURIComponent(id)}`;
  const fixture = {
    updated_at: at(0), last_reset_at: null, has_official_signal: true,
    latest_alert: { id, kind: 'watch', state: 'active', source_at: at(-60_000),
      summary: 'Synthetic notice fixture (not a real announcement)', url, score: 93,
      window: { start_at: at(600_000), end_at: at(3_600_000), time_zone: 'UTC' } },
    recent_posts: null, evidence_posts: [{ id, text: 'Synthetic test data', url, at: at(-60_000) }],
    evidence_stale: false, evidence_updated_at: at(0),
  };
  writeFileSync(join(data, 'pulse-notice-e2e.json'), JSON.stringify(fixture));
  return fixture;
}
