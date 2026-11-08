import { usePulsePace } from "@/lib/pulse-pace";
import { PulsePaceCard } from "./pulse-pace";

/** The workspace shares observations and presentation with both companions. */
export function PulseCoachOverview({ onDetails }: { onDetails: () => void }) {
  const { data, error, refreshing, refresh, markNoticeRead, noticePending, noticeError } = usePulsePace();
  return <div className="pulse-coach-overview" data-testid="pulse-coach-overview">
    <PulsePaceCard variant="workspace" data={data} failed={error} refreshing={refreshing}
      onRefresh={() => void refresh()} onDetails={onDetails}
      onMarkNoticeRead={markNoticeRead} noticePending={noticePending} noticeFailed={noticeError}/>
  </div>;
}
