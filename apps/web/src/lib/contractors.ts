/**
 * Pure helpers for the contractor management screens.
 *
 * Kept free of React and network imports so filtering, form validation and
 * assignment eligibility rules can be unit-tested directly.
 */

import type {
  ContractorInput,
  ContractorPersonnelInput,
  ContractorPersonnelSummary,
  ContractorSummary,
  SiteSummary,
} from "./api/types";

/* -------------------------------------------------------------------------- */
/* Register filters                                                           */
/* -------------------------------------------------------------------------- */

export const CONTRACTOR_STATUS_FILTERS = ["all", "active", "inactive"] as const;

export type ContractorStatusFilter = (typeof CONTRACTOR_STATUS_FILTERS)[number];

export const CONTRACTOR_PAGE_SIZE = 20;

export interface ContractorRegisterFilters {
  query: string;
  status: ContractorStatusFilter;
}

export const EMPTY_CONTRACTOR_FILTERS: ContractorRegisterFilters = {
  query: "",
  status: "all",
};

/**
 * Client-side search across the bounded contractor register. The API does not
 * expose a contractor search parameter, so the complete register is loaded by
 * the query hook and filtered here.
 */
export function filterContractors(
  contractors: readonly ContractorSummary[],
  filters: ContractorRegisterFilters,
): ContractorSummary[] {
  const query = filters.query.trim().toLowerCase();

  return contractors.filter((contractor) => {
    if (filters.status === "active" && !contractor.isActive) {
      return false;
    }

    if (filters.status === "inactive" && contractor.isActive) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      contractor.name,
      contractor.registrationNumber,
      contractor.trade,
      contractor.contactName,
      contractor.contactEmail,
      contractor.contactPhone,
    ].some((value) => value?.toLowerCase().includes(query));
  });
}

/* -------------------------------------------------------------------------- */
/* Query strings                                                              */
/* -------------------------------------------------------------------------- */

export const CONTRACTOR_DIRECTORY_PAGE_SIZE = 100;

export function buildContractorDirectorySearchParams({
  page = 1,
  limit = CONTRACTOR_DIRECTORY_PAGE_SIZE,
  includeInactive = true,
}: {
  page?: number;
  limit?: number;
  includeInactive?: boolean;
} = {}): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(page));
  searchParams.set("limit", String(limit));

  if (includeInactive) {
    searchParams.set("includeInactive", "true");
  }

  return searchParams;
}

export interface ContractorPersonnelListQuery {
  contractorId?: string;
  siteId?: string;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

export function buildContractorPersonnelSearchParams(
  query: ContractorPersonnelListQuery = {},
): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(query.page ?? 1));
  searchParams.set("limit", String(query.limit ?? 20));

  if (query.contractorId) {
    searchParams.set("contractorId", query.contractorId);
  }

  if (query.siteId) {
    searchParams.set("siteId", query.siteId);
  }

  if (query.includeInactive) {
    searchParams.set("includeInactive", "true");
  }

  return searchParams;
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

export function formatPersonnelName(
  person: Pick<ContractorPersonnelSummary, "firstName" | "lastName">,
): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unnamed person";
}

export function contractorOptionLabel(contractor: ContractorSummary): string {
  const registration = contractor.registrationNumber
    ? ` · ${contractor.registrationNumber}`
    : "";
  return `${contractor.name}${registration}${contractor.isActive ? "" : " (inactive)"}`;
}

export interface ContractorSelectOption {
  value: string;
  label: string;
}

/**
 * Options for a controlled contractor select. The empty placeholder must
 * always be present and first: without a matching empty option, a controlled
 * select can display a contractor while its React state is still "".
 */
export function buildContractorSelectOptions(
  contractors: readonly ContractorSummary[],
  placeholder = "Select a contractor",
): ContractorSelectOption[] {
  return [
    { value: "", label: placeholder },
    ...contractors.map((contractor) => ({
      value: contractor.id,
      label: contractorOptionLabel(contractor),
    })),
  ];
}

/* -------------------------------------------------------------------------- */
/* Contractor form                                                            */
/* -------------------------------------------------------------------------- */

export const CONTRACTOR_NAME_MAX = 120;
export const CONTRACTOR_REGISTRATION_MAX = 50;
export const CONTRACTOR_TRADE_MAX = 80;
export const CONTRACTOR_CONTACT_NAME_MAX = 100;
export const CONTRACTOR_CONTACT_EMAIL_MAX = 120;
export const CONTRACTOR_CONTACT_PHONE_MAX = 30;

export interface ContractorFormValues {
  name: string;
  registrationNumber: string;
  trade: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projects: string[];
  isActive: boolean;
}

export type ContractorFormErrors = Partial<
  Record<keyof ContractorFormValues, string>
>;

export const EMPTY_CONTRACTOR_FORM: ContractorFormValues = {
  name: "",
  registrationNumber: "",
  trade: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  projects: [],
  isActive: true,
};

export function contractorToFormValues(
  contractor: ContractorSummary,
): ContractorFormValues {
  return {
    name: contractor.name,
    registrationNumber: contractor.registrationNumber ?? "",
    trade: contractor.trade ?? "",
    contactName: contractor.contactName ?? "",
    contactEmail: contractor.contactEmail ?? "",
    contactPhone: contractor.contactPhone ?? "",
    projects: contractor.projects.map((project) => project.id),
    isActive: contractor.isActive,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContractorForm(
  values: ContractorFormValues,
): ContractorFormErrors {
  const errors: ContractorFormErrors = {};
  const name = values.name.trim();
  const registrationNumber = values.registrationNumber.trim();
  const trade = values.trade.trim();
  const contactName = values.contactName.trim();
  const contactEmail = values.contactEmail.trim();
  const contactPhone = values.contactPhone.trim();

  if (!name) {
    errors.name = "Contractor name is required.";
  } else if (name.length > CONTRACTOR_NAME_MAX) {
    errors.name = `Name must be ${CONTRACTOR_NAME_MAX} characters or fewer.`;
  }

  if (registrationNumber.length > CONTRACTOR_REGISTRATION_MAX) {
    errors.registrationNumber = `Registration number must be ${CONTRACTOR_REGISTRATION_MAX} characters or fewer.`;
  }

  if (trade.length > CONTRACTOR_TRADE_MAX) {
    errors.trade = `Trade must be ${CONTRACTOR_TRADE_MAX} characters or fewer.`;
  }

  if (contactName.length > CONTRACTOR_CONTACT_NAME_MAX) {
    errors.contactName = `Contact name must be ${CONTRACTOR_CONTACT_NAME_MAX} characters or fewer.`;
  }

  if (contactEmail) {
    if (contactEmail.length > CONTRACTOR_CONTACT_EMAIL_MAX) {
      errors.contactEmail = `Email must be ${CONTRACTOR_CONTACT_EMAIL_MAX} characters or fewer.`;
    } else if (!EMAIL_PATTERN.test(contactEmail)) {
      errors.contactEmail = "Enter a valid email address.";
    }
  }

  if (contactPhone.length > CONTRACTOR_CONTACT_PHONE_MAX) {
    errors.contactPhone = `Phone must be ${CONTRACTOR_CONTACT_PHONE_MAX} characters or fewer.`;
  }

  return errors;
}

/**
 * The API rejects empty strings for optional fields, so blank values are
 * omitted from the payload.
 */
export function buildContractorCreateInput(
  values: ContractorFormValues,
): ContractorInput {
  const input: ContractorInput = { name: values.name.trim() };

  if (values.registrationNumber.trim()) {
    input.registrationNumber = values.registrationNumber.trim();
  }
  if (values.trade.trim()) {
    input.trade = values.trade.trim();
  }
  if (values.contactName.trim()) {
    input.contactName = values.contactName.trim();
  }
  if (values.contactEmail.trim()) {
    input.contactEmail = values.contactEmail.trim();
  }
  if (values.contactPhone.trim()) {
    input.contactPhone = values.contactPhone.trim();
  }
  if (values.projects.length > 0) {
    input.projects = values.projects;
  }

  return input;
}

export function buildContractorUpdateInput(
  values: ContractorFormValues,
): ContractorInput {
  return {
    ...buildContractorCreateInput(values),
    isActive: values.isActive,
  };
}

/* -------------------------------------------------------------------------- */
/* Contractor personnel form                                                  */
/* -------------------------------------------------------------------------- */

export const PERSONNEL_FIRST_NAME_MAX = 80;
export const PERSONNEL_LAST_NAME_MAX = 80;
export const PERSONNEL_ID_MAX = 50;
export const PERSONNEL_JOB_TITLE_MAX = 120;
export const PERSONNEL_PHONE_MAX = 30;
export const PERSONNEL_EMAIL_MAX = 120;

export interface ContractorPersonnelFormValues {
  contractorId: string;
  firstName: string;
  lastName: string;
  personnelId: string;
  jobTitle: string;
  phone: string;
  email: string;
  isActive: boolean;
}

export type ContractorPersonnelFormErrors = Partial<
  Record<keyof ContractorPersonnelFormValues, string>
>;

export const EMPTY_CONTRACTOR_PERSONNEL_FORM: ContractorPersonnelFormValues = {
  contractorId: "",
  firstName: "",
  lastName: "",
  personnelId: "",
  jobTitle: "",
  phone: "",
  email: "",
  isActive: true,
};

export function personnelToFormValues(
  person: ContractorPersonnelSummary,
): ContractorPersonnelFormValues {
  return {
    contractorId: person.contractor.id,
    firstName: person.firstName,
    lastName: person.lastName,
    personnelId: person.personnelId ?? "",
    jobTitle: person.jobTitle ?? "",
    phone: person.phone ?? "",
    email: person.email ?? "",
    isActive: person.isActive,
  };
}

export function validateContractorPersonnelForm(
  values: ContractorPersonnelFormValues,
): ContractorPersonnelFormErrors {
  const errors: ContractorPersonnelFormErrors = {};
  const contractorId = values.contractorId.trim();
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const personnelId = values.personnelId.trim();
  const jobTitle = values.jobTitle.trim();
  const phone = values.phone.trim();
  const email = values.email.trim();

  if (!contractorId) {
    errors.contractorId = "Select a contractor.";
  }

  if (!firstName) {
    errors.firstName = "First name is required.";
  } else if (firstName.length > PERSONNEL_FIRST_NAME_MAX) {
    errors.firstName = `First name must be ${PERSONNEL_FIRST_NAME_MAX} characters or fewer.`;
  }

  if (!lastName) {
    errors.lastName = "Last name is required.";
  } else if (lastName.length > PERSONNEL_LAST_NAME_MAX) {
    errors.lastName = `Last name must be ${PERSONNEL_LAST_NAME_MAX} characters or fewer.`;
  }

  if (personnelId.length > PERSONNEL_ID_MAX) {
    errors.personnelId = `Personnel ID must be ${PERSONNEL_ID_MAX} characters or fewer.`;
  }

  if (jobTitle.length > PERSONNEL_JOB_TITLE_MAX) {
    errors.jobTitle = `Job title must be ${PERSONNEL_JOB_TITLE_MAX} characters or fewer.`;
  }

  if (phone.length > PERSONNEL_PHONE_MAX) {
    errors.phone = `Phone must be ${PERSONNEL_PHONE_MAX} characters or fewer.`;
  }

  if (email) {
    if (email.length > PERSONNEL_EMAIL_MAX) {
      errors.email = `Email must be ${PERSONNEL_EMAIL_MAX} characters or fewer.`;
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = "Enter a valid email address.";
    }
  }

  return errors;
}

/**
 * Create payload. Deliberately contains no `siteId`: sites are managed only
 * through the assignment endpoints.
 */
export function buildContractorPersonnelCreateInput(
  values: ContractorPersonnelFormValues,
): ContractorPersonnelInput {
  const input: ContractorPersonnelInput = {
    contractorId: values.contractorId.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
  };

  if (values.personnelId.trim()) {
    input.personnelId = values.personnelId.trim();
  }
  if (values.jobTitle.trim()) {
    input.jobTitle = values.jobTitle.trim();
  }
  if (values.phone.trim()) {
    input.phone = values.phone.trim();
  }
  if (values.email.trim()) {
    input.email = values.email.trim();
  }

  return input;
}

export function buildContractorPersonnelUpdateInput(
  values: ContractorPersonnelFormValues,
  { lockContractor = false }: { lockContractor?: boolean } = {},
): Partial<ContractorPersonnelInput> {
  const input: Partial<ContractorPersonnelInput> = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    isActive: values.isActive,
  };

  if (!lockContractor) {
    input.contractorId = values.contractorId.trim();
  }
  if (values.personnelId.trim()) {
    input.personnelId = values.personnelId.trim();
  }
  if (values.jobTitle.trim()) {
    input.jobTitle = values.jobTitle.trim();
  }
  if (values.phone.trim()) {
    input.phone = values.phone.trim();
  }
  if (values.email.trim()) {
    input.email = values.email.trim();
  }

  return input;
}

/* -------------------------------------------------------------------------- */
/* Assignment rules                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Sites that can receive a new assignment for this person: active sites in one
 * of the contractor's projects, excluding sites already actively assigned.
 */
export function getEligibleAssignmentSites({
  sites,
  contractorProjectIds,
  activeAssignedSiteIds,
}: {
  sites: readonly SiteSummary[];
  contractorProjectIds: readonly string[];
  activeAssignedSiteIds: readonly string[];
}): SiteSummary[] {
  const projectIds = new Set(contractorProjectIds);
  const assignedSiteIds = new Set(activeAssignedSiteIds);

  return sites.filter(
    (site) =>
      site.status === "ACTIVE" &&
      projectIds.has(site.project.id) &&
      !assignedSiteIds.has(site.id),
  );
}

/**
 * Mirrors the API guard: a contractor change is blocked while active site
 * assignments exist or a legacy site reference is still set.
 */
export function canChangePersonnelContractor(
  person: Pick<ContractorPersonnelSummary, "site" | "activeSites">,
): boolean {
  return person.site === null && person.activeSites.length === 0;
}

export function formatAssignmentTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAssignmentUser(
  user: { firstName: string; lastName: string } | null,
): string {
  if (!user) {
    return "—";
  }

  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || "—";
}
