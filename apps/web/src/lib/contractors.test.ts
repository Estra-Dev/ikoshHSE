import { describe, expect, it } from "vitest";
import type {
  ContractorPersonnelSummary,
  ContractorSummary,
  SiteSummary,
} from "./api/types";
import {
  EMPTY_CONTRACTOR_FORM,
  EMPTY_CONTRACTOR_PERSONNEL_FORM,
  buildContractorCreateInput,
  buildContractorDirectorySearchParams,
  buildContractorPersonnelCreateInput,
  buildContractorPersonnelSearchParams,
  buildContractorPersonnelUpdateInput,
  buildContractorSelectOptions,
  buildContractorUpdateInput,
  canChangePersonnelContractor,
  contractorOptionLabel,
  contractorToFormValues,
  filterContractors,
  getEligibleAssignmentSites,
  personnelToFormValues,
  validateContractorForm,
  validateContractorPersonnelForm,
} from "./contractors";

function contractor(
  overrides: Partial<ContractorSummary> = {},
): ContractorSummary {
  return {
    id: "contractor-1",
    name: "Delta Industrial",
    registrationNumber: "RC-100",
    trade: "Electrical",
    contactName: "Ada Obi",
    contactEmail: "ada@delta.example",
    contactPhone: "+234 800 000",
    projects: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function site(overrides: Partial<SiteSummary> = {}): SiteSummary {
  return {
    id: "site-1",
    project: { id: "project-1", name: "Project One" },
    name: "Jetty",
    code: "JTY-1",
    location: null,
    description: "",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function personnel(
  overrides: Partial<ContractorPersonnelSummary> = {},
): ContractorPersonnelSummary {
  return {
    id: "personnel-1",
    contractor: { id: "contractor-1" },
    firstName: "Sam",
    lastName: "Worker",
    personnelId: "BADGE-1",
    jobTitle: "Welder",
    phone: null,
    email: null,
    site: null,
    activeSites: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("contractor register filtering", () => {
  it("searches name, registration, trade and contact fields", () => {
    const contractors = [
      contractor(),
      contractor({
        id: "contractor-2",
        name: "Prime Scaffolding",
        registrationNumber: "RC-200",
        trade: "Scaffolding",
        contactName: "Bola Eze",
        contactEmail: "bola@prime.example",
        contactPhone: "+234 811 111",
      }),
      contractor({
        id: "contractor-3",
        name: "Harbour Logistics",
        registrationNumber: null,
        trade: "Logistics",
        contactName: null,
        contactEmail: null,
        contactPhone: null,
      }),
    ];

    expect(
      filterContractors(contractors, { query: "scaffold", status: "all" }),
    ).toHaveLength(1);
    expect(
      filterContractors(contractors, { query: "rc-200", status: "all" })[0].id,
    ).toBe("contractor-2");
    expect(
      filterContractors(contractors, { query: "bola@prime", status: "all" }),
    ).toHaveLength(1);
    expect(
      filterContractors(contractors, { query: "234 811", status: "all" }),
    ).toHaveLength(1);
    expect(
      filterContractors(contractors, { query: "", status: "all" }),
    ).toHaveLength(3);
  });

  it("filters by active status", () => {
    const contractors = [
      contractor(),
      contractor({ id: "contractor-2", name: "Inactive Co", isActive: false }),
    ];

    expect(
      filterContractors(contractors, { query: "", status: "active" }),
    ).toHaveLength(1);
    expect(
      filterContractors(contractors, { query: "", status: "inactive" })[0].id,
    ).toBe("contractor-2");
    expect(
      filterContractors(contractors, { query: "", status: "all" }),
    ).toHaveLength(2);
  });
});

describe("query string builders", () => {
  it("requests inactive contractors and bounded pages", () => {
    const params = buildContractorDirectorySearchParams({ page: 2 });

    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("100");
    expect(params.get("includeInactive")).toBe("true");
  });

  it("builds contractor personnel filters", () => {
    const params = buildContractorPersonnelSearchParams({
      contractorId: "contractor-1",
      siteId: "site-1",
      includeInactive: true,
      page: 3,
      limit: 20,
    });

    expect(params.get("contractorId")).toBe("contractor-1");
    expect(params.get("siteId")).toBe("site-1");
    expect(params.get("includeInactive")).toBe("true");
    expect(params.get("page")).toBe("3");
    expect(params.get("limit")).toBe("20");
  });

  it("omits unset personnel filters", () => {
    const params = buildContractorPersonnelSearchParams({});

    expect(params.has("contractorId")).toBe(false);
    expect(params.has("siteId")).toBe(false);
    expect(params.has("includeInactive")).toBe(false);
  });
});

describe("contractor select options", () => {
  it("always puts an empty placeholder first", () => {
    const options = buildContractorSelectOptions(
      [contractor(), contractor({ id: "contractor-2", name: "Prime" })],
      "Select a contractor",
    );

    expect(options[0]).toEqual({
      value: "",
      label: "Select a contractor",
    });
    expect(options).toHaveLength(3);
  });

  it("preserves contractor IDs and labels", () => {
    const contractors = [
      contractor(),
      contractor({
        id: "contractor-2",
        name: "Prime Scaffolding",
        registrationNumber: "RC-200",
        isActive: false,
      }),
    ];

    const options = buildContractorSelectOptions(contractors);

    expect(options.slice(1)).toEqual([
      { value: "contractor-1", label: contractorOptionLabel(contractors[0]) },
      { value: "contractor-2", label: contractorOptionLabel(contractors[1]) },
    ]);
    expect(options[1].value).toBe("contractor-1");
    expect(options[2].label).toContain("(inactive)");
  });

  it("keeps a valid default contractor ID selectable", () => {
    const contractors = [
      contractor(),
      contractor({ id: "contractor-2", name: "Prime Scaffolding" }),
    ];
    const defaultContractorId = "contractor-2";
    const options = buildContractorSelectOptions(contractors);

    expect(options.some((option) => option.value === defaultContractorId)).toBe(
      true,
    );
    expect(
      options.find((option) => option.value === defaultContractorId),
    ).toEqual({
      value: defaultContractorId,
      label: contractorOptionLabel(contractors[1]),
    });
  });
});

describe("contractor form", () => {
  it("requires a name and validates contact email", () => {
    const errors = validateContractorForm({
      ...EMPTY_CONTRACTOR_FORM,
      contactEmail: "not-an-email",
    });

    expect(errors.name).toBeDefined();
    expect(errors.contactEmail).toBeDefined();
  });

  it("accepts valid values and converts an existing contractor", () => {
    const values = contractorToFormValues(
      contractor({ projects: [{ id: "project-1" }] }),
    );

    expect(values.projects).toEqual(["project-1"]);
    expect(validateContractorForm(values)).toEqual({});
  });

  it("omits blank optional fields and includes status on update", () => {
    const input = buildContractorCreateInput({
      ...EMPTY_CONTRACTOR_FORM,
      name: "  Prime  ",
      projects: ["project-1"],
    });

    expect(input).toEqual({
      name: "Prime",
      projects: ["project-1"],
    });

    expect(
      buildContractorUpdateInput({
        ...EMPTY_CONTRACTOR_FORM,
        name: "Prime",
        isActive: false,
      }),
    ).toEqual({ name: "Prime", isActive: false });
  });
});

describe("contractor personnel form", () => {
  it("requires names and contractor and validates email", () => {
    const errors = validateContractorPersonnelForm({
      ...EMPTY_CONTRACTOR_PERSONNEL_FORM,
      email: "bad-email",
    });

    expect(errors.contractorId).toBeDefined();
    expect(errors.firstName).toBeDefined();
    expect(errors.lastName).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it("builds a create payload without siteId", () => {
    const input = buildContractorPersonnelCreateInput({
      ...EMPTY_CONTRACTOR_PERSONNEL_FORM,
      contractorId: " contractor-1 ",
      firstName: " Sam ",
      lastName: " Worker ",
      personnelId: " BADGE-1 ",
    });

    expect(input).toEqual({
      contractorId: "contractor-1",
      firstName: "Sam",
      lastName: "Worker",
      personnelId: "BADGE-1",
    });
    expect("siteId" in input).toBe(false);
  });

  it("omits the contractor when the field is locked", () => {
    const values = {
      ...personnelToFormValues(
        personnel({ contractor: { id: "contractor-1" } }),
      ),
      jobTitle: " Electrician ",
      isActive: false,
    };

    const locked = buildContractorPersonnelUpdateInput(values, {
      lockContractor: true,
    });
    const unlocked = buildContractorPersonnelUpdateInput(values);

    expect(locked).not.toHaveProperty("contractorId");
    expect(unlocked.contractorId).toBe("contractor-1");
    expect(locked).toMatchObject({
      firstName: "Sam",
      lastName: "Worker",
      jobTitle: "Electrician",
      isActive: false,
    });
    expect("siteId" in locked).toBe(false);
  });
});

describe("assignment eligibility", () => {
  it("returns active sites in the contractor projects that are not assigned", () => {
    const sites = [
      site(),
      site({ id: "site-2", code: "JTY-2" }),
      site({ id: "site-3", project: { id: "project-2", name: "Two" } }),
      site({ id: "site-4", status: "ON_HOLD" }),
      site({ id: "site-5" }),
    ];

    const eligible = getEligibleAssignmentSites({
      sites,
      contractorProjectIds: ["project-1"],
      activeAssignedSiteIds: ["site-2"],
    });

    expect(eligible.map((entry) => entry.id)).toEqual(["site-1", "site-5"]);
  });

  it("blocks contractor changes while assignments or a legacy site exist", () => {
    expect(canChangePersonnelContractor(personnel())).toBe(true);
    expect(
      canChangePersonnelContractor(
        personnel({ activeSites: [{ id: "site-1", name: "Jetty" }] }),
      ),
    ).toBe(false);
    expect(
      canChangePersonnelContractor(personnel({ site: { id: "site-1" } })),
    ).toBe(false);
  });
});
