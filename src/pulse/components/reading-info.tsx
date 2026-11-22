import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import "./reading-info.css";

export function ReadingInfo({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false);
  const keyboardFocused = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);

  function cancelHide() {
    window.clearTimeout(hideTimer.current);
  }

  function dismiss() {
    cancelHide();
    pinned.current = false;
    setOpen(false);
  }

  function show() {
    cancelHide();
    setOpen(true);
  }

  function hideAfterPointerLeaves() {
    cancelHide();
    hideTimer.current = window.setTimeout(() => {
      if (!pinned.current && !keyboardFocused.current) setOpen(false);
    }, 120);
  }

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return <Popover.Root open={open} onOpenChange={next => { if (!next) dismiss(); }}>
    <Popover.Anchor asChild>
      <button ref={trigger} type="button" className="pulse-reading-info" aria-label={label} aria-describedby={open ? id : undefined}
        onPointerEnter={event => { if (event.pointerType !== "touch") show(); }}
        onPointerLeave={hideAfterPointerLeaves}
        onFocus={event => {
          keyboardFocused.current = event.currentTarget.matches(":focus-visible");
          if (keyboardFocused.current) show();
        }}
        onBlur={() => { keyboardFocused.current = false; if (!pinned.current) dismiss(); }}
        onClick={() => {
          if (pinned.current) dismiss();
          else { pinned.current = true; show(); }
        }}><Info size={15} aria-hidden="true"/></button>
    </Popover.Anchor>
    <Popover.Portal>
      <Popover.Content id={id} role="tooltip" className="pulse-reading-tip" side="top" sideOffset={5} collisionPadding={8}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => { if (trigger.current?.contains(event.target as Node)) event.preventDefault(); }}
        onEscapeKeyDown={event => { event.preventDefault(); dismiss(); }}
        onPointerEnter={cancelHide}
        onPointerLeave={hideAfterPointerLeaves}>
        {children}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
