import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hidden &&
      element.closest("[hidden]") === null &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

interface HubDrawerProps {
  readonly children: ReactNode;
  readonly closeLabel: string;
  readonly contentKey: string;
  readonly eyebrow: string;
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
}

export function HubDrawer({
  children,
  closeLabel,
  contentKey,
  eyebrow,
  open,
  title,
  onClose,
}: HubDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    if (open) {
      if (!wasOpenRef.current) {
        openerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      wasOpenRef.current = true;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
      return () => {
        window.cancelAnimationFrame(frame);
        document.body.style.overflow = previousOverflow;
      };
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const opener = openerRef.current;
      openerRef.current = null;
      frame = window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    }
    return () => window.cancelAnimationFrame(frame);
  }, [contentKey, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) throw new Error("Open Hub drawer is missing its dialog element");
      const focusable = focusableElements(dialog);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) throw new Error("Open Hub drawer must contain a focusable control");
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, open]);

  return (
    <div
      className={`hub-drawer${open ? " is-open" : ""}`}
      aria-hidden={!open}
      inert={!open}
      data-panel={contentKey}
    >
      <button
        className="hub-drawer__backdrop"
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        className="hub-drawer__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-drawer-title"
      >
        <header className="hub-drawer__heading">
          <div>
            <span className="micro-label">{eyebrow}</span>
            <h2 id="hub-drawer-title">{title}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}>
            {closeLabel} <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="hub-drawer__content">{children}</div>
      </section>
    </div>
  );
}
