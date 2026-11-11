"use client";

import { usePathname } from "next/navigation";
import { MenuIcon } from "@/components/icons";
import { findActiveNavItem } from "@/lib/nav";
import { ProfileMenu } from "./profile-menu";

export function Topbar({
  onOpenMobileNav,
}: {
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const activeItem = findActiveNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-navy-700 transition hover:bg-navy-50 lg:hidden"
          >
            <MenuIcon size={18} />
          </button>

          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted sm:block">
              IKOSH HSE
            </p>
            <p className="truncate text-sm font-semibold text-ink">
              {activeItem?.label ?? "Workspace"}
            </p>
          </div>
        </div>

        <ProfileMenu />
      </div>
    </header>
  );
}
