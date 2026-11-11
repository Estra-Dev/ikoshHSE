import { describe, expect, it } from "vitest";
import {
  findActiveNavItem,
  isNavItemVisible,
  NAV_SECTIONS,
  visibleNavSections,
  type NavItem,
  type NavLinkItem,
} from "./nav";

describe("navigation visibility", () => {
  it("shows unrestricted items to every role, including an unresolved role", () => {
    const item: NavItem = {
      kind: "link",
      href: "/dashboard",
      label: "HSE dashboard",
      icon: "dashboard",
    };

    expect(isNavItemVisible(item, undefined)).toBe(true);
    expect(isNavItemVisible(item, "EMPLOYEE")).toBe(true);
    expect(isNavItemVisible(item, "ADMIN")).toBe(true);
  });

  it("hides role-restricted items without a matching role", () => {
    const item: NavItem = {
      kind: "planned",
      label: "Audit log",
      icon: "auditLog",
      roles: ["ADMIN"],
    };

    expect(isNavItemVisible(item, "ADMIN")).toBe(true);
    expect(isNavItemVisible(item, "HSE_MANAGER")).toBe(false);
    expect(isNavItemVisible(item, undefined)).toBe(false);
  });

  it("filters the audit log planned item by role", () => {
    const employeeLabels = visibleNavSections("EMPLOYEE").flatMap(
      (section) => section.items.map((item) => item.label),
    );
    const managerLabels = visibleNavSections("HSE_MANAGER").flatMap(
      (section) => section.items.map((item) => item.label),
    );

    expect(employeeLabels).not.toContain("Audit log");
    expect(managerLabels).toContain("Audit log");
  });

  it("exposes only HSE navigation sections", () => {
    expect(NAV_SECTIONS.map((section) => section.label)).toEqual([
      "Command centre",
      "Safety operations",
      "Worksites",
      "People & partners",
      "Assurance",
      "Administration",
    ]);
  });

  it("keeps planned items non-clickable", () => {
    const plannedItems = NAV_SECTIONS.flatMap((section) => section.items).filter(
      (item) => item.kind === "planned",
    );

    expect(plannedItems.length).toBeGreaterThan(0);
    expect(plannedItems.some((item) => "href" in item)).toBe(false);
  });
});

describe("active navigation item", () => {
  it("matches the dashboard exactly", () => {
    expect(findActiveNavItem("/dashboard")?.href).toBe("/dashboard");
  });

  it("resolves employee routes to the HSE workforce destination", () => {
    expect(findActiveNavItem("/employees/me")?.href).toBe("/employees");
    expect(findActiveNavItem("/employees/507f1f77bcf86cd799439011")?.href).toBe(
      "/employees",
    );
  });

  it("never activates planned destinations", () => {
    expect(findActiveNavItem("/incidents")).toBeUndefined();
    expect(findActiveNavItem("/projects")).toBeUndefined();
  });

  it("returns undefined outside the navigation map", () => {
    expect(findActiveNavItem("/sign-in")).toBeUndefined();
  });

  it("only returns link items", () => {
    const item: NavLinkItem | undefined = findActiveNavItem("/departments");

    expect(item?.kind).toBe("link");
  });
});
