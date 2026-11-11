"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@digit-auth/react";
import { ChevronDownIcon, ProfileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/lib/api/employees";
import { SignOutButton } from "@/components/sign-out-button";

function initialsOf(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "IK";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Account menu in the top bar: identity, role and sign out. */
export function ProfileMenu() {
  const { user } = useAuth();
  const me = useMe();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const employee = me.data?.employee;
  const email = user?.email ?? "";
  const name =
    [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() ||
    email ||
    "Account";
  const roleLabel = employee?.ikoshRole
    ? employee.ikoshRole.replaceAll("_", " ")
    : "Authenticated";

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3 transition hover:border-navy-200 hover:bg-navy-50"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white"
        >
          {initialsOf(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[160px] truncate text-xs font-semibold text-ink">
            {name}
          </span>
          <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">
            {roleLabel}
          </span>
        </span>
        <ChevronDownIcon
          size={14}
          className={`text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-popover"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            {email && <p className="mt-0.5 truncate text-xs text-muted">{email}</p>}
            <div className="mt-2">
              <Badge tone="navy">{roleLabel}</Badge>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              href="/employees/me"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-navy-800 transition hover:bg-navy-50"
            >
              <ProfileIcon size={16} />
              My profile
            </Link>
            <SignOutButton variant="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
