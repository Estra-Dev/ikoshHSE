"use client";

import { useCallback, useState, type ReactNode } from "react";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Authenticated application frame: fixed navy sidebar on desktop, sticky top
 * bar, and an off-canvas drawer on smaller screens.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <Sidebar />
      </aside>

      <div className="lg:pl-72">
        <Topbar onOpenMobileNav={openMobileNav} />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>

      <MobileNav open={mobileNavOpen} onClose={closeMobileNav} />
    </div>
  );
}
