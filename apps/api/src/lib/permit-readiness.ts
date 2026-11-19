/**
 * Permit readiness policy registry and pure evaluator.
 *
 * The registry contains the original empty working draft and a documented A03
 * candidate. The candidate records A03 requirements and their fact mappings,
 * but it is DRAFT, is not approved for activation, and has no transition gates.
 * Production activation stays `null` until the governing document is formally
 * approved, and the activation guard refuses a draft.
 *
 * `evaluatePermitReadiness` is pure: it never reads module state and never
 * assumes a requirement when no policy is supplied. Callers resolve a policy
 * for a permit's stamped `policyVersion` and pass it in explicitly.
 */

import {
  A03_CANDIDATE_POLICY,
  A03_CANDIDATE_VERSION,
  A03_DECISION_IDS,
  A03_OPEN_DECISIONS,
  A03_REQUIREMENT_IDS,
  A03_REQUIREMENT_MAPPINGS,
  A03_SOURCE,
  a03RequirementsBlockedBy,
  getA03RequirementMapping,
  type A03DecisionId,
  type A03DecisionScope,
  type A03EnforcementState,
  type A03OpenDecision,
  type A03RequirementMapping,
  type A03RequirementType,
} from "./permit-readiness-a03.js";

export {
  A03_CANDIDATE_POLICY,
  A03_CANDIDATE_VERSION,
  A03_DECISION_IDS,
  A03_OPEN_DECISIONS,
  A03_REQUIREMENT_IDS,
  A03_REQUIREMENT_MAPPINGS,
  A03_SOURCE,
  a03RequirementsBlockedBy,
  getA03RequirementMapping,
};

export type {
  A03DecisionId,
  A03DecisionScope,
  A03EnforcementState,
  A03OpenDecision,
  A03RequirementMapping,
  A03RequirementType,
};

/** Lifecycle transitions a policy may gate. */
export const PERMIT_READINESS_TRANSITIONS = [
  "approve",
  "activate",
  "resume",
] as const;

export type PermitReadinessTransition =
  (typeof PERMIT_READINESS_TRANSITIONS)[number];

/** Approval state of the source document a policy encodes. */
export type PermitReadinessSourceStatus = "DRAFT" | "APPROVED";

export interface PermitReadinessSource {
  readonly documentId: string;
  readonly revision: string;
  /** ISO calendar date (`YYYY-MM-DD`) the revision is dated. */
  readonly dated: string;
  readonly status: PermitReadinessSourceStatus;
}

/**
 * One named requirement. `id` is the stable key a caller answers with a fact;
 * `label` is display text only. A draft policy may document requirement ids
 * without gating them; only an approved policy may activate gates.
 */
export interface PermitReadinessRequirement {
  readonly id: string;
  readonly label: string;
}

export interface PermitReadinessPolicy {
  readonly version: number;
  readonly source: PermitReadinessSource;
  /** Both this flag and an APPROVED source are required to activate. */
  readonly approvedForActivation: boolean;
  readonly requirements: readonly PermitReadinessRequirement[];
  readonly gates: Readonly<
    Record<PermitReadinessTransition, readonly string[]>
  >;
}

export interface PermitReadinessConfiguration {
  readonly registry?: ReadonlyMap<number, PermitReadinessPolicy>;
  /** `null` keeps readiness policy dormant. */
  readonly activeVersion?: number | null;
}

/** Facts keyed by requirement id. Only an explicit `true` satisfies a gate. */
export type PermitReadinessFacts = Readonly<
  Record<string, boolean | undefined>
>;

export interface PermitReadinessResult {
  readonly policyVersion: number | null;
  /** False when the permit is grandfathered or no matching policy was given. */
  readonly applicable: boolean;
  readonly transition: PermitReadinessTransition | null;
  readonly unmet: readonly PermitReadinessRequirement[];
}

/**
 * Baseline registry entry for the working draft. It carries no requirements
 * and cannot be activated until the document is approved.
 */
const WORKING_DRAFT_POLICY: PermitReadinessPolicy = Object.freeze({
  version: 1,
  source: Object.freeze({
    documentId: "IKNL-QHSE-DOPR-002",
    revision: "A03",
    dated: "2026-10-28",
    status: "DRAFT",
  }),
  approvedForActivation: false,
  requirements: Object.freeze([]),
  gates: Object.freeze({
    approve: Object.freeze([]),
    activate: Object.freeze([]),
    resume: Object.freeze([]),
  }),
});

const PRODUCTION_REGISTRY: ReadonlyMap<number, PermitReadinessPolicy> = new Map([
  [WORKING_DRAFT_POLICY.version, WORKING_DRAFT_POLICY],
  [A03_CANDIDATE_POLICY.version, A03_CANDIDATE_POLICY],
]);

interface ActiveConfiguration {
  readonly registry: ReadonlyMap<number, PermitReadinessPolicy>;
  readonly activeVersion: number | null;
}

let configuration: ActiveConfiguration = {
  registry: PRODUCTION_REGISTRY,
  activeVersion: null,
};

function assertValidPolicy(policy: PermitReadinessPolicy): void {
  if (!Number.isInteger(policy.version) || policy.version <= 0) {
    throw new Error(
      "Permit readiness policy versions must be positive integers.",
    );
  }

  if (
    !policy.source.documentId.trim() ||
    !policy.source.revision.trim() ||
    !policy.source.dated.trim()
  ) {
    throw new Error(
      `Permit readiness policy ${policy.version} is missing source metadata.`,
    );
  }

  const requirementIds = new Set<string>();

  for (const requirement of policy.requirements) {
    if (!requirement.id.trim() || !requirement.label.trim()) {
      throw new Error(
        `Permit readiness policy ${policy.version} has an empty requirement.`,
      );
    }

    if (requirementIds.has(requirement.id)) {
      throw new Error(
        `Permit readiness policy ${policy.version} repeats requirement "${requirement.id}".`,
      );
    }

    requirementIds.add(requirement.id);
  }

  for (const transition of PERMIT_READINESS_TRANSITIONS) {
    for (const requirementId of policy.gates[transition]) {
      if (!requirementIds.has(requirementId)) {
        throw new Error(
          `Permit readiness policy ${policy.version} gates on unknown requirement "${requirementId}".`,
        );
      }
    }
  }
}

/**
 * Installs the registry and the active version. With no arguments it restores
 * the production configuration: the draft policy only, nothing active.
 *
 * A version may only be activated when the registry entry is explicitly
 * approved and its source status is APPROVED. This keeps a draft such as A03
 * from being switched on by configuration alone.
 */
export function configurePermitReadiness(
  options: PermitReadinessConfiguration = {},
): void {
  const registry = options.registry ?? PRODUCTION_REGISTRY;
  const activeVersion = options.activeVersion ?? null;

  for (const policy of registry.values()) {
    assertValidPolicy(policy);
  }

  if (activeVersion !== null) {
    const policy = registry.get(activeVersion);

    if (!policy) {
      throw new Error(
        `Cannot activate unknown permit readiness policy version ${activeVersion}.`,
      );
    }

    if (!policy.approvedForActivation || policy.source.status !== "APPROVED") {
      throw new Error(
        `Permit readiness policy version ${activeVersion} is not approved for activation.`,
      );
    }
  }

  configuration = { registry, activeVersion };
}

/** The server-stamped version for newly created permits, or null. */
export function activePermitPolicyVersion(): number | null {
  return configuration.activeVersion;
}

export function getPermitReadinessPolicy(
  version: number | null | undefined,
): PermitReadinessPolicy | null {
  if (version === null || version === undefined) {
    return null;
  }

  return configuration.registry.get(version) ?? null;
}

/** Resolves the active policy, or null while readiness is dormant. */
export function getActivePermitReadinessPolicy(): PermitReadinessPolicy | null {
  return getPermitReadinessPolicy(configuration.activeVersion);
}

/**
 * Evaluates one permit against one policy.
 *
 * - A `null` or missing permit version is grandfathered: not applicable.
 * - Missing or mismatched policy yields the same inert result, so callers can
 *   never accidentally invent a requirement.
 * - With a transition, only that transition's gated requirements apply;
 *   without one, every policy requirement applies.
 * - A requirement is met only by an explicit `true` fact.
 */
export function evaluatePermitReadiness(
  permit: { readonly policyVersion?: number | null },
  policy: PermitReadinessPolicy | null | undefined,
  facts: PermitReadinessFacts = {},
  transition?: PermitReadinessTransition,
): PermitReadinessResult {
  const policyVersion = permit.policyVersion ?? null;
  const resolvedTransition = transition ?? null;

  if (
    policyVersion === null ||
    !policy ||
    policy.version !== policyVersion
  ) {
    return {
      policyVersion,
      applicable: false,
      transition: resolvedTransition,
      unmet: [],
    };
  }

  const required = transition
    ? new Set(policy.gates[transition])
    : new Set(policy.requirements.map((requirement) => requirement.id));

  const unmet = policy.requirements.filter(
    (requirement) =>
      required.has(requirement.id) && facts[requirement.id] !== true,
  );

  return {
    policyVersion,
    applicable: true,
    transition: resolvedTransition,
    unmet: Object.freeze([...unmet]),
  };
}
