import type { PaceSnapshot } from "../pulse/lib/pulse-pace";

const DEMO_COOLDOWN_MS = 5_000;
const refreshEvents = new EventTarget();
let availableAt: number | undefined;
let queued = false;
let inFlight = false;
let observedAt: string | undefined;

function readDemoQuota() {
  queued = false;
  inFlight = true;
  refreshEvents.dispatchEvent(new Event("change"));
  window.setTimeout(() => {
    observedAt = new Date().toISOString();
    availableAt = Date.now() + DEMO_COOLDOWN_MS;
    inFlight = false;
    refreshEvents.dispatchEvent(new Event("change"));
  }, 300);
}

export function decorateDemoPaceRefresh(snapshot: PaceSnapshot, refresh: boolean): PaceSnapshot {
  const now = Date.now();
  availableAt ??= now + DEMO_COOLDOWN_MS;
  if (refresh && !queued && !inFlight) {
    const remaining = availableAt - now;
    if (remaining > 0) {
      queued = true;
      window.setTimeout(readDemoQuota, remaining);
      refreshEvents.dispatchEvent(new Event("change"));
    } else {
      readDemoQuota();
    }
  }
  if (observedAt && snapshot.updatedAt) {
    snapshot.updatedAt = observedAt;
    if (snapshot.status === "stale") {
      snapshot.status = "idle";
      for (const item of snapshot.windows) {
        if (item.state === "stale") item.state = "idle";
      }
    }
  }
  return {
    ...snapshot,
    refreshQueued: queued,
    refreshInFlight: inFlight,
    refreshAfterSeconds: Math.max(0, Math.ceil((availableAt - now) / 1_000)),
  };
}

export function subscribeDemoPaceRefresh(listener: () => void): () => void {
  refreshEvents.addEventListener("change", listener);
  return () => refreshEvents.removeEventListener("change", listener);
}
