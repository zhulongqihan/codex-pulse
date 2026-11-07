import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useShellCopy } from "@/lib/shell-copy";

export function PulseAccountDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const copy = useShellCopy();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus({ preventScroll: true });
    const controls = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])].filter(node => !node.closest('[hidden],[inert]'));
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); }
      if (event.key === "Tab") {
        const nodes = controls(), first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) close.current?.focus({ preventScroll: true }); };
    window.addEventListener("keydown", key, true);
    document.addEventListener("focusin", focus);
    return () => { window.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus); opener?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="pulse-account-backdrop" data-testid="account-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} id="pulse-account-drawer" className="pulse-account-drawer" role="dialog" aria-modal="true" aria-labelledby="pulse-account-drawer-title" data-testid="account-drawer">
      <header><h2 id="pulse-account-drawer-title">{copy("account")}</h2><button ref={close} type="button" className="pulse-icon-button" aria-label={copy("closeAccount")} onClick={onClose}><X size={18}/></button></header>
      <div className="pulse-drawer-content">{children}</div>
    </div>
  </div>, document.body);
}
