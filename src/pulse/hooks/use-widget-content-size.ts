import { useEffect, type RefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function preferredWidgetHeight(expanded: boolean, empty: boolean, contentHeight: number): number {
  if (!expanded) return 180;
  if (!empty || !Number.isFinite(contentHeight)) return 480;
  return Math.max(220, Math.min(480, Math.ceil(contentHeight)));
}

/** Resize only the actual widget. Browser demo preferences never resize a host window. */
export function useWidgetContentSize(element: RefObject<HTMLElement | null>, expanded: boolean, empty: boolean, revision: string, onFailure: () => void) {
  useEffect(() => {
    if (!expanded || !isTauri() || new URLSearchParams(location.search).get("demo") === "1") return;
    const panel = element.current, windowHandle = getCurrentWindow();
    if (!panel || windowHandle.label !== "widget") return;
    let active = true, frame = 0, requested: number | null = null, rejected = false, resizedWhilePending = false;
    let unlisten: (() => void) | undefined;
    const measure = () => {
      frame = 0;
      if (!active || rejected) return;
      const body = panel.querySelector<HTMLElement>(".coach-body"), footer = panel.querySelector<HTMLElement>(".pulse-pace-footer");
      if (!body || !footer || !body.firstElementChild || !body.lastElementChild) return;
      const panelStyle = getComputedStyle(panel), bodyStyle = getComputedStyle(body);
      const bodyHeight = body.lastElementChild.getBoundingClientRect().bottom - body.firstElementChild.getBoundingClientRect().top;
      const top = body.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      const errorHeight = [...panel.querySelectorAll<HTMLElement>(":scope > .pulse-error")].reduce((total, error) => {
        const style = getComputedStyle(error);
        return total + error.getBoundingClientRect().height + parseFloat(style.marginTop || "0") + parseFloat(style.marginBottom || "0");
      }, 0);
      const natural = top + bodyHeight + parseFloat(bodyStyle.paddingTop || "0") + parseFloat(bodyStyle.paddingBottom || "0") + footer.getBoundingClientRect().height + errorHeight + parseFloat(panelStyle.paddingBottom || "0") + 2;
      const target = preferredWidgetHeight(expanded, empty, natural);
      // A native preference update can restore 480 without changing any child size.
      if (Math.abs(innerHeight - target) <= 1 || requested === target) return;
      requested = target;
      void windowHandle.setSize(new LogicalSize(350, target)).then(() => {
        if (!active) return;
        requested = null;
        if (resizedWhilePending) { resizedWhilePending = false; schedule(); }
      }).catch(() => {
        if (!active) return;
        rejected = true; requested = null; onFailure();
      });
    };
    const schedule = () => { if (active && !frame && !rejected) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const observeParts = () => { for (const child of panel.querySelectorAll(".pulse-widget-header,.pulse-widget-close-hint,.coach-body>*,.pulse-pace-footer,:scope > .pulse-error")) observer.observe(child); };
    observeParts();
    const mutation = new MutationObserver(() => { observeParts(); schedule(); });
    mutation.observe(panel, { childList: true });
    void windowHandle.onResized(() => { if (requested != null) resizedWhilePending = true; schedule(); }).then(cleanup => { if (active) unlisten = cleanup; else cleanup(); }).catch(() => { if (active) { rejected = true; onFailure(); } });
    schedule();
    return () => { active = false; observer.disconnect(); mutation.disconnect(); unlisten?.(); if (frame) cancelAnimationFrame(frame); };
  }, [element, expanded, empty, revision, onFailure]);
}
