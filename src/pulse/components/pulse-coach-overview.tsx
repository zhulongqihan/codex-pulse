import { usePulsePace } from "@/lib/pulse-pace";
import { useShellCopy } from "@/lib/shell-copy";
import { PulsePaceCard } from "./pulse-pace";
import { PulsePaceSummary } from "./pulse-pace-summary";

/** The workspace shares observations and presentation with both companions. */
export function PulseCoachOverview({ onDetails, onRecover, observationsExpanded, summary = false }: {
  onDetails: () => void; onRecover: () => void; observationsExpanded: boolean; summary?: boolean;
}) {
  const { data, error, refreshing, refresh, markNoticeRead, noticePending, noticeError } = usePulsePace();
  const copy = useShellCopy();
  const Card = summary ? PulsePaceSummary : PulsePaceCard;
  return <section id="pulse-pace-details" className="pulse-coach-overview" data-testid="pulse-coach-overview" tabIndex={-1} aria-label={copy("paceDetails")}>
    <Card variant="workspace" data={data} failed={error} refreshing={refreshing}
      onRefresh={() => void refresh()} onDetails={onDetails} onRecover={onRecover} observationsExpanded={observationsExpanded}
      onMarkNoticeRead={markNoticeRead} noticePending={noticePending} noticeFailed={noticeError}/>
  </section>;
}
