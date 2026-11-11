"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "@/components/icons";
import { Sidebar } from "./sidebar";

/**
 * Off-canvas navigation for small screens. Focus moves to the close control
 * on open, Escape closes the drawer, and background scrolling is locked while
 * it is visible.
 */
export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 w-[290px] max-w-[85vw] shadow-popover"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-navy-200 transition hover:bg-white/10 hover:text-white"
        >
          <CloseIcon size={18} />
        </button>

        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}
