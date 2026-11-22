import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePulsePace } from "@/lib/pulse-pace";
import { useShellCopy } from "@/lib/shell-copy";
import { PulsePaceCard } from "./pulse-pace";
import { PulsePaceSummary } from "./pulse-pace-summary";

/** The workspace shares observations and presentation with both companions. */
export function PulseCoachOverview({ onDetails, onRecover, observationsExpanded, summary = false, pacingOnly = false, children }: {
  onDetails: () => void; onRecover: () => void; observationsExpanded: boolean; summary?: boolean;
  pacingOnly?: boolean;
  children?: (slots: { summary: ReactNode; details: ReactNode }) => ReactNode;
}) {
  const { data, error, refreshing, refresh, markNoticeRead, noticePending, noticeError } = usePulsePace();
  const copy = useShellCopy();
  const [expanded, setExpanded] = useState(observationsExpanded);
  const detailsRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const moveFocusOnOpen = useRef(false);
  const restoreDetailsFocus = useRef(false);
  const attachDetails = useCallback((element: HTMLElement | null) => {
    // The first overview response moves the same open details into the dashboard spread.
    if (!element) restoreDetailsFocus.current = detailsRef.current === document.activeElement;
    detailsRef.current = element;
    if (element && restoreDetailsFocus.current) {
      restoreDetailsFocus.current = false;
      if (!element.hidden && document.hasFocus()) element.focus();
    }
  }, []);
  const detailsId = "pulse-pace-details";
  const split = children != null;
  useLayoutEffect(() => {
    if (split && observationsExpanded) setExpanded(true);
  }, [split, observationsExpanded]);
  useLayoutEffect(() => {
    if (expanded && moveFocusOnOpen.current) {
      moveFocusOnOpen.current = false;
      detailsRef.current?.focus();
    }
  }, [expanded]);

  const props = {
    variant: "workspace" as const, data, failed: error, refreshing, observationsExpanded, onDetails, onRecover,
    onRefresh: () => void refresh(), onMarkNoticeRead: markNoticeRead, noticePending, noticeFailed: noticeError,
  };
  if (children) {
    const close = () => {
      setExpanded(false);
      triggerRef.current?.focus();
    };
    const changeExpanded = (next: boolean) => {
      if (!next) {
        close();
      } else if (expanded) {
        detailsRef.current?.focus();
      } else {
        moveFocusOnOpen.current = true;
        setExpanded(true);
      }
    };
    return children({
      summary: <PulsePaceSummary {...props} detailsPlacement="external" expanded={expanded} pacingOnly={pacingOnly}
        detailsId={detailsId} detailsTriggerRef={triggerRef} onExpandedChange={changeExpanded}/>,
      details: <section id={detailsId} ref={attachDetails} className="pulse-coach-overview pulse-coach-details"
        data-testid="pulse-coach-overview" tabIndex={-1} aria-label={copy("paceDetails")} hidden={!expanded}
        onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); } }}>
        {expanded ? <PulsePaceCard {...props} layout="spread" onClose={close}/> : null}
      </section>,
    });
  }
  const Card = summary ? PulsePaceSummary : PulsePaceCard;
  return <section id={detailsId} className="pulse-coach-overview" data-testid="pulse-coach-overview" tabIndex={-1} aria-label={copy("paceDetails")}>
    <Card {...props}/>
  </section>;
}
