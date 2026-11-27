import { usePulsePace } from "@/lib/pulse-pace";
import { useShellCopy } from "@/lib/shell-copy";
import { PulsePaceCard } from "./pulse-pace";
import { PulsePaceSummary } from "./pulse-pace-summary";

/** The workspace shares observations and presentation with both companions. */
export function PulseCoachOverview({ onDetails, onRecover, summary = false, paper = false, pacingOnly = false }: {
  onDetails: () => void; onRecover: () => void; summary?: boolean; paper?: boolean; pacingOnly?: boolean;
}) {
  const { data, error, refresh, markNoticeRead, noticePending, noticeError } = usePulsePace();
  const copy = useShellCopy();

  const props = {
    variant: "workspace" as const, data, failed: error, onDetails, onRecover,
    onRefresh: () => void refresh(), onMarkNoticeRead: markNoticeRead, noticePending, noticeFailed: noticeError,
  };
  return <section id="pulse-pace-details" className="pulse-coach-overview" data-testid="pulse-coach-overview" tabIndex={-1} aria-label={copy("paceDetails")}>
    {paper || summary ? <PulsePaceSummary {...props} paper={paper} pacingOnly={pacingOnly}/> : <PulsePaceCard {...props}/>}
  </section>;
}
