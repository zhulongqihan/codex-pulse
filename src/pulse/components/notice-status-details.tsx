import type { PaceNoticeState } from "@/lib/pulse-pace";
import { noticeStateCopy } from "@/lib/notice-state-copy";
import { formatCoachReset } from "@/lib/quota-pace-coach-copy";

export function NoticeStatusDetails({ state, language }: { state: PaceNoticeState; language: string }) {
  if (state.status === "active") return null;
  const copy = (key: Parameters<typeof noticeStateCopy>[1], values?: Record<string, string>) => noticeStateCopy(language, key, values);
  const time = (value: string) => formatCoachReset(Date.parse(value), language);
  return <details className="coach-notice-state" data-testid="notice-status-details" data-notice-state={state.status}>
    <summary>{copy(state.status)}</summary>
    <p>{copy(`${state.status}Detail`)}</p>
    {state.checkedAt ? <p><time dateTime={state.checkedAt}>{copy("checked", { time: time(state.checkedAt) })}</time></p> : null}
    {state.validUntil ? <p><time dateTime={state.validUntil}>{copy("validUntil", { time: time(state.validUntil) })}</time></p> : null}
    <p>{copy("independent")}</p>
  </details>;
}
