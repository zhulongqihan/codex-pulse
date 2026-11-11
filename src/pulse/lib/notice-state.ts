import type { PaceNoticeState, PaceResetNotice } from "./pulse-pace";

const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const statuses: PaceNoticeState["status"][] = ["active", "expired", "stale", "unavailable", "none", "unknown"];
export function noticeAllowsActive(state: PaceNoticeState | undefined): boolean {
  return state == null || state.status === "active" || state.status === "unknown";
}
/** Validate the source and date shape before using its dates as an explanation. */
export function noticeHasValidBasis(notice: PaceResetNotice | null | undefined, now: number): notice is PaceResetNotice {
  if (!notice || notice.verification !== "third_party" || notice.scope !== "global" || ![notice.id, notice.summary, notice.sourceLabel].every(value => typeof value === "string" && value.trim())) return false;
  try { const url = new URL(notice.sourceUrl); if (url.protocol !== "https:" || url.username || url.password) return false; } catch { return false; }
  const updated = timestamp(notice.updatedAt), published = timestamp(notice.publishedAt), start = timestamp(notice.startAt), end = timestamp(notice.endAt);
  return updated != null && published != null && updated <= now + 120_000 && published <= now + 120_000 && (notice.startAt == null || start != null) && (notice.endAt == null || end != null) && !(start != null && end != null && end < start);
}

/** A notice's lifetime and its source freshness are independent of account quota. */
export function resolveNoticeState(state: PaceNoticeState | undefined, raw: PaceResetNotice | null | undefined, validActive: boolean, now: number): PaceNoticeState {
  raw = noticeHasValidBasis(raw, now) ? raw : null;
  const checked = timestamp(state?.checkedAt), until = timestamp(state?.validUntil);
  const checkedAt = checked != null && checked <= now + 120_000 ? new Date(checked).toISOString() : null;
  const rawEnd = timestamp(raw?.endAt), published = timestamp(raw?.publishedAt), updated = timestamp(raw?.updatedAt);
  const rawUntil = rawEnd ?? (published != null ? published + 86_400_000 : null);
  const validUntil = noticeAllowsActive(state) ? rawUntil ?? until : until ?? rawUntil;
  const result: PaceNoticeState = { status: "unknown", checkedAt, validUntil: validUntil != null ? new Date(validUntil).toISOString() : null };
  if (!Number.isFinite(now)) return { status: "unknown", checkedAt: null, validUntil: null };
  if (validActive && noticeAllowsActive(state)) return { ...result, status: "active" };
  const status = statuses.includes(state?.status as PaceNoticeState["status"]) ? state!.status : "unknown";
  if (status === "active" || (status === "unknown" && raw != null)) {
    if ((rawUntil ?? validUntil) != null && (rawUntil ?? validUntil)! <= now) return { ...result, status: "expired" };
    if (updated != null && (now - updated > 300_000 || now - updated < -120_000)) return { ...result, status: "stale" };
    return result;
  }
  if (status === "none") {
    if (checkedAt == null) return result;
    return { ...result, status: now - checked! > 300_000 ? "stale" : "none" };
  }
  if (status === "unavailable" && checkedAt != null && now - checked! > 300_000) return { ...result, status: "stale" };
  if (status === "expired" && (validUntil == null || validUntil > now)) return result;
  return { ...result, status };
}
