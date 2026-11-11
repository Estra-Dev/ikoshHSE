import type { IkoshRole } from "./api/types";

/** Icon keys resolved by the sidebar; kept as data so nav stays testable. */
export type NavIconName =
  | "dashboard"
  | "incidents"
  | "nearMisses"
  | "inspections"
  | "audits"
  | "risk"
  | "actions"
  | "permit"
  | "projects"
  | "sites"
  | "workforce"
  | "contractors"
  | "contractorPersonnel"
  | "reports"
  | "training"
  | "toolbox"
  | "ppe"
  | "auditLog"
  | "departments";

interface NavItemBase {
  label: string;
  icon: NavIconName;
  /** Omit to make the item visible to every authenticated employee. */
  roles?: readonly IkoshRole[];
}

export interface NavLinkItem extends NavItemBase {
  kind: "link";
  href: string;
}

/**
 * A capability that is visible in the HSE operating model but has no route
 * yet. Planned items are rendered as muted, non-clickable rows so the shell
 * never links to a dead page or implies missing backend functionality.
 */
export interface NavPlannedItem extends NavItemBase {
  kind: "planned";
}

export type NavItem = NavLinkItem | NavPlannedItem;

export interface NavSection {
  label: string;
  items: readonly NavItem[];
}

/**
 * Primary navigation organized around HSE operations. Active links are added
 * as their screens land; everything else stays explicitly planned until the
 * supporting workflow exists.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "Command centre",
    items: [
      {
        kind: "link",
        href: "/dashboard",
        label: "HSE dashboard",
        icon: "dashboard",
      },
    ],
  },
  {
    label: "Safety operations",
    items: [
      {
        kind: "planned",
        label: "Incidents",
        icon: "incidents",
      },
      {
        kind: "planned",
        label: "Near misses",
        icon: "nearMisses",
      },
      {
        kind: "planned",
        label: "Inspections",
        icon: "inspections",
      },
      {
        kind: "planned",
        label: "Audits",
        icon: "audits",
      },
      {
        kind: "planned",
        label: "Risk assessments",
        icon: "risk",
      },
      {
        kind: "planned",
        label: "Corrective actions",
        icon: "actions",
      },
      {
        kind: "planned",
        label: "Permit to work",
        icon: "permit",
      },
    ],
  },
  {
    label: "Worksites",
    items: [
      {
        kind: "planned",
        label: "Projects",
        icon: "projects",
      },
      {
        kind: "planned",
        label: "Sites",
        icon: "sites",
      },
    ],
  },
  {
    label: "People & partners",
    items: [
      {
        kind: "link",
        href: "/employees",
        label: "HSE workforce",
        icon: "workforce",
      },
      {
        kind: "planned",
        label: "Contractors",
        icon: "contractors",
      },
      {
        kind: "planned",
        label: "Contractor personnel",
        icon: "contractorPersonnel",
      },
    ],
  },
  {
    label: "Assurance",
    items: [
      {
        kind: "planned",
        label: "HSE reports",
        icon: "reports",
      },
      {
        kind: "planned",
        label: "Training",
        icon: "training",
      },
      {
        kind: "planned",
        label: "Toolbox talks",
        icon: "toolbox",
      },
      {
        kind: "planned",
        label: "PPE",
        icon: "ppe",
      },
      {
        kind: "planned",
        label: "Audit log",
        icon: "auditLog",
        roles: ["HSE_MANAGER", "ADMIN"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        kind: "link",
        href: "/departments",
        label: "Departments",
        icon: "departments",
      },
    ],
  },
];

/** Whether a nav item is visible to the given IKOSH role. */
export function isNavItemVisible(
  item: NavItem,
  role: IkoshRole | undefined,
): boolean {
  if (!item.roles) {
    return true;
  }

  return role !== undefined && item.roles.includes(role);
}

/** Sections filtered for the viewer, dropping empty sections. */
export function visibleNavSections(
  role: IkoshRole | undefined,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items.filter((item) => isNavItemVisible(item, role)),
  })).filter((section) => section.items.length > 0);
}

/**
 * Finds the active link that owns a pathname. The longest matching href wins,
 * so a nested route always resolves to its most specific nav destination.
 * Planned items never become active.
 */
export function findActiveNavItem(pathname: string): NavLinkItem | undefined {
  let match: NavLinkItem | undefined;

  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.kind !== "link") {
        continue;
      }

      const matches =
        pathname === item.href || pathname.startsWith(`${item.href}/`);

      if (matches && (!match || item.href.length > match.href.length)) {
        match = item;
      }
    }
  }

  return match;
}
