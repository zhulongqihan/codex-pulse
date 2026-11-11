import { useEffect, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Subscribe before consuming the startup request so a cold launch cannot lose it. */
export function usePaceDetailsRequest(action: RefObject<() => void>) {
  useEffect(() => {
    let disposed = false;
    let handledEvent = false;
    let stop: (() => void) | undefined;
    void listen("pulse-show-pace-details", () => {
      if (disposed) return;
      handledEvent = true;
      action.current();
      if (isTauri()) void invoke("take_pending_pace_details").catch(() => {});
    }).then(async unlisten => {
      if (disposed) { unlisten(); return; }
      stop = unlisten;
      if (isTauri()) {
        const pending = await invoke<boolean>("take_pending_pace_details");
        if (pending && !disposed && !handledEvent) action.current();
      }
    }).catch(() => { /* The browser preview has no native navigation requests. */ });
    return () => { disposed = true; stop?.(); };
  }, [action]);
}
