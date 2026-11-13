"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookIcon,
  ChartIcon,
  ChatIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  ContractorIcon,
  DashboardIcon,
  DepartmentIcon,
  EmployeesIcon,
  FileTextIcon,
  HardHatIcon,
  IncidentIcon,
  InfoIcon,
  PersonnelIcon,
  ProjectIcon,
  SearchIcon,
  ShieldIcon,
  SiteIcon,
  ClockIcon,
  type IconProps,
} from "@/components/icons";
import {
  findActiveNavItem,
  visibleNavSections,
  type NavIconName,
} from "@/lib/nav";
import { useMe } from "@/lib/api/employees";

const NAV_ICONS: Record<NavIconName, ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  incidents: IncidentIcon,
  nearMisses: InfoIcon,
  inspections: SearchIcon,
  audits: ClipboardCheckIcon,
  risk: ShieldIcon,
  actions: CheckCircleIcon,
  permit: FileTextIcon,
  projects: ProjectIcon,
  sites: SiteIcon,
  workforce: EmployeesIcon,
  contractors: ContractorIcon,
  contractorPersonnel: PersonnelIcon,
  reports: ChartIcon,
  training: BookIcon,
  toolbox: ChatIcon,
  ppe: HardHatIcon,
  auditLog: ClockIcon,
  departments: DepartmentIcon,
};

/**
 * Primary sidebar. Rendered twice: fixed on desktop and inside the mobile
 * drawer. `onNavigate` lets the drawer close itself after a selection.
 * Planned capabilities are visible but deliberately non-interactive.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeItem = findActiveNavItem(pathname);
  const me = useMe();
  const sections = visibleNavSections(me.data?.employee.ikoshRole);

  return (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg focus-visible:outline-white"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-inset ring-white/15">
            <ShieldIcon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight">
              IKOSH HSE
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-navy-300">
              Operations platform
            </span>
          </span>
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const NavIcon = NAV_ICONS[item.icon];

                if (item.kind === "planned") {
                  return (
                    <li key={`planned-${item.label}`}>
                      <span
                        aria-disabled="true"
                        title="Planned HSE capability"
                        className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-navy-400"
                      >
                        <NavIcon
                          size={18}
                          className="shrink-0 text-navy-500"
                        />
                        <span className="truncate">{item.label}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-navy-400 ring-1 ring-inset ring-white/10">
                          Planned
                        </span>
                      </span>
                    </li>
                  );
                }

                const isActive = activeItem?.href === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-white/10 text-white ring-1 ring-inset ring-white/10"
                          : "text-navy-200 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <NavIcon
                        size={18}
                        className={
                          isActive
                            ? "text-white"
                            : "text-navy-300 transition group-hover:text-white"
                        }
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-4">
        <div className="rounded-lg bg-white/5 px-3 py-2.5 ring-1 ring-inset ring-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400">
            Session
          </p>
          <p className="mt-1 text-xs font-medium text-navy-100">
            DigitAuth secured
          </p>
        </div>
        <p className="mt-3 px-1 text-[10px] tracking-wide text-navy-400">
          IKOSH NIG LTD · Phase 3
        </p>
      </div>
    </div>
  );
}
