import type { PaceSnapshot } from "../pulse/lib/pulse-pace";

const refreshEvents = new EventTarget();
let inFlight = false;
let observedAt: string | undefined;

function readDemoQuota() {
  inFlight = true;
  refreshEvents.dispatchEvent(new Event("change"));
  window.setTimeout(() => {
    observedAt = new Date().toISOString();
    inFlight = false;
    refreshEvents.dispatchEvent(new Event("change"));
  }, 300);
}

export function decorateDemoPaceRefresh(snapshot: PaceSnapshot, refresh: boolean): PaceSnapshot {
  if (refresh && !inFlight) readDemoQuota();
  if (observedAt && snapshot.updatedAt) {
    snapshot.updatedAt = observedAt;
    if (snapshot.status === "stale") {
      snapshot.status = "idle";
      for (const item of snapshot.windows) {
        if (item.state === "stale") item.state = "idle";
      }
    }
  }
  return { ...snapshot, refreshQueued: false, refreshInFlight: inFlight, refreshAfterSeconds: 0 };
}

export function subscribeDemoPaceRefresh(listener: () => void): () => void {
  refreshEvents.addEventListener("change", listener);
  return () => refreshEvents.removeEventListener("change", listener);
}
