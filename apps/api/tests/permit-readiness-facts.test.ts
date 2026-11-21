import { describe, expect, it } from "vitest";
import {
  buildPermitReadinessFacts,
  type PermitReadinessFactPermit,
  type PermitReadinessFactPerson,
} from "../src/lib/permit-readiness-facts.js";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const LATER = new Date("2026-11-20T18:00:00.000Z");

const BLOCKED_REQUIREMENTS = [
  "authorized_issuer",
  "personnel_competence",
  "client_requirements",
  "stop_work_authority",
  "no_retrospective_permit",
];

function fullPermit(
  overrides: Partial<PermitReadinessFactPermit> = {},
): PermitReadinessFactPermit {
  return {
    workDescription: "Hot work on the north storage tank",
    workType: "HOT_WORK",
    status: "DRAFT",
    project: "64b000000000000000000001",
    site: "64b000000000000000000002",
    location: "Tank farm, bay 3",
    validFrom: NOW,
    validTo: LATER,
    responsiblePerson: "64b000000000000000000003",
    workersInvolved: ["Ade Worker"],
    requiredPrecautions: ["PPE", "FIRE_WATCH"],
    hazards: [
      {
        hazard: "Sparks igniting flammable vapour",
        controlMeasures: "Gas testing and a dedicated fire watch",
      },
    ],
    createdBy: "64b000000000000000000004",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function readiness(
  overrides: NonNullable<PermitReadinessFactPermit["readiness"]> = {},
): NonNullable<PermitReadinessFactPermit["readiness"]> {
  return {
    personnel: [],
    equipment: [],
    isolations: [],
    gasTests: [],
    links: {
      inspectionIds: [],
      ppeIssuanceIds: [],
      correctiveActionIds: [],
      contractorIds: [],
      toolboxTalkId: null,
    },
    worksiteVerification: null,
    attestations: [],
    ...overrides,
  };
}

describe("buildPermitReadinessFacts", () => {
  it("reports no positive facts for an empty permit", () => {
    const result = buildPermitReadinessFacts({
      permit: { readiness: null },
    });

    expect(result.facts).toEqual({});
    expect(result.automatic).toEqual([]);
    expect(result.recorded).toEqual([]);
    expect(result.notApplicable).toEqual([]);
    expect(result.blocked).toEqual(BLOCKED_REQUIREMENTS);
  });

  it("derives automatic facts from actual permit fields", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        status: "APPROVED",
        submittedBy: "64b000000000000000000004",
        approvedBy: "64b000000000000000000005",
        approvedAt: NOW,
      }),
    });

    expect(result.automatic).toEqual(
      expect.arrayContaining([
        "scope_and_permit_type",
        "people_defined",
        "hazards_and_controls",
        "independent_approval",
        "validity_window",
        "records_attributable",
      ]),
    );
    expect(result.recorded).toEqual([]);

    for (const id of result.automatic) {
      expect(result.facts[id]).toBe(true);
      expect(result.blocked).not.toContain(id);
    }
  });

  it("does not claim independent approval before approval exists", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit(),
    });

    expect(result.automatic).not.toContain("independent_approval");
    expect(result.facts.independent_approval).toBeUndefined();
  });

  it("reports captured readiness records as recorded rather than automatic", () => {
    const result = buildPermitReadinessFacts({
      permit: {
        // Deliberately sparse: people/equipment facts must come from captured
        // readiness, not from invented Permit defaults.
        project: "64b000000000000000000001",
        site: "64b000000000000000000002",
        readiness: readiness({
          personnel: [
            {
              kind: "EMPLOYEE",
              employee: "64b000000000000000000003",
              name: "Ade Worker",
            },
          ],
          equipment: [{ name: "Welding set" }],
          isolations: [{ point: "Pump P-101" }],
          gasTests: [{ area: "Tank farm" }],
          links: {
            inspectionIds: [],
            ppeIssuanceIds: [],
            correctiveActionIds: [],
            contractorIds: ["64b000000000000000000006"],
            toolboxTalkId: null,
          },
          worksiteVerification: {
            verifiedBy: "64b000000000000000000007",
            verifiedAt: NOW,
          },
        }),
      },
      contractors: [
        {
          _id: "64b000000000000000000006",
          isActive: true,
          projects: ["64b000000000000000000001"],
        },
      ],
    });

    expect(result.recorded).toEqual(
      expect.arrayContaining([
        "people_defined",
        "equipment_defined",
        "isolation_records",
        "gas_test_records",
        "worksite_verification",
        "contractor_simops_coordination",
      ]),
    );

    for (const id of result.recorded) {
      expect(result.facts[id]).toBe(true);
      expect(result.automatic).not.toContain(id);
    }
  });

  it("derives linked record facts only when the linked records are valid", () => {
    const project = "64b000000000000000000001";
    const site = "64b000000000000000000002";
    const inspectionId = "64b000000000000000000010";
    const ppeId = "64b000000000000000000011";
    const actionId = "64b000000000000000000012";

    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        project,
        site,
        readiness: readiness({
          personnel: [
            {
              kind: "EMPLOYEE",
              employee: "64b000000000000000000013",
              name: "Ade Worker",
            },
          ],
          equipment: [{ name: "Welding set", inspection: inspectionId }],
          links: {
            inspectionIds: [inspectionId],
            ppeIssuanceIds: [ppeId],
            correctiveActionIds: [actionId],
            contractorIds: [],
            toolboxTalkId: null,
          },
        }),
      }),
      inspections: [
        {
          _id: inspectionId,
          status: "COMPLETED",
          project,
          site,
        },
      ],
      ppeIssuances: [
        {
          _id: ppeId,
          status: "ISSUED",
          project,
          site,
        },
      ],
      correctiveActions: [
        {
          _id: actionId,
          status: "VERIFIED",
          project,
          site,
        },
      ],
      toolboxTalk: {
        status: "COMPLETED",
        project,
        site,
        participants: [
          {
            kind: "EMPLOYEE",
            employee: "64b000000000000000000013",
            attendance: "ATTENDED",
          },
        ],
      },
    });

    expect(result.facts.equipment_ppe_inspection).toBe(true);
    expect(result.facts.critical_actions_and_residual_risk).not.toBe(true);
    expect(result.facts.worker_briefing).toBe(true);
    expect(result.facts.current_risk_assessment).toBeUndefined();

    const incomplete = buildPermitReadinessFacts({
      permit: fullPermit({
        project,
        site,
        readiness: readiness({
          links: {
            inspectionIds: [inspectionId],
            ppeIssuanceIds: [ppeId],
            correctiveActionIds: [actionId],
            contractorIds: [],
            toolboxTalkId: null,
          },
        }),
      }),
      inspections: [
        {
          _id: inspectionId,
          status: "IN_PROGRESS",
          project,
          site,
        },
      ],
      ppeIssuances: [
        {
          _id: ppeId,
          status: "RETURNED",
          project,
          site,
        },
      ],
      correctiveActions: [
        {
          _id: actionId,
          status: "COMPLETED",
          project,
          site,
        },
      ],
    });

    expect(incomplete.facts.equipment_ppe_inspection).toBeUndefined();
    expect(incomplete.facts.critical_actions_and_residual_risk).toBeUndefined();
  });

  it("requires every linked contractor to resolve as active and engaged", () => {
    const project = "64b000000000000000000001";
    const site = "64b000000000000000000002";
    const firstContractorId = "64b000000000000000000020";
    const secondContractorId = "64b000000000000000000021";
    const otherProjectId = "64b000000000000000000099";

    function permitWithContractors(contractorIds: string[]) {
      return fullPermit({
        project,
        site,
        readiness: readiness({
          links: {
            inspectionIds: [],
            ppeIssuanceIds: [],
            correctiveActionIds: [],
            contractorIds,
            toolboxTalkId: null,
          },
        }),
      });
    }

    const valid = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId]),
      contractors: [
        { _id: firstContractorId, isActive: true, projects: [project] },
      ],
    });
    expect(valid.facts.contractor_simops_coordination).toBe(true);
    expect(valid.recorded).toContain("contractor_simops_coordination");

    const noContractorRecords = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId]),
      contractors: [],
    });
    expect(
      noContractorRecords.facts.contractor_simops_coordination,
    ).toBeUndefined();

    const partiallyResolved = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId, secondContractorId]),
      contractors: [
        { _id: firstContractorId, isActive: true, projects: [project] },
      ],
    });
    expect(
      partiallyResolved.facts.contractor_simops_coordination,
    ).toBeUndefined();

    const inactive = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId]),
      contractors: [
        { _id: firstContractorId, isActive: false, projects: [project] },
      ],
    });
    expect(inactive.facts.contractor_simops_coordination).toBeUndefined();

    const unengaged = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId]),
      contractors: [
        { _id: firstContractorId, isActive: true, projects: [otherProjectId] },
      ],
    });
    expect(unengaged.facts.contractor_simops_coordination).toBeUndefined();

    const unrelated = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId]),
      contractors: [
        { _id: secondContractorId, isActive: true, projects: [project] },
      ],
    });
    expect(unrelated.facts.contractor_simops_coordination).toBeUndefined();

    const bothValid = buildPermitReadinessFacts({
      permit: permitWithContractors([firstContractorId, secondContractorId]),
      contractors: [
        { _id: firstContractorId, isActive: true, projects: [project] },
        { _id: secondContractorId, isActive: true, projects: [project] },
      ],
    });
    expect(bothValid.facts.contractor_simops_coordination).toBe(true);
  });

  it("does not treat verified corrective actions as residual-risk acceptance", () => {
    const project = "64b000000000000000000001";
    const site = "64b000000000000000000002";
    const actionId = "64b000000000000000000012";

    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        project,
        site,
        readiness: readiness({
          links: {
            inspectionIds: [],
            ppeIssuanceIds: [],
            correctiveActionIds: [actionId],
            contractorIds: [],
            toolboxTalkId: null,
          },
        }),
      }),
      correctiveActions: [
        {
          _id: actionId,
          status: "VERIFIED",
          project,
          site,
        },
      ],
    });

    expect(result.facts.critical_actions_and_residual_risk).not.toBe(true);
    expect(result.automatic).not.toContain(
      "critical_actions_and_residual_risk",
    );
    expect(result.recorded).not.toContain(
      "critical_actions_and_residual_risk",
    );
  });

  it("does not let declarations establish evidence-required facts", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        readiness: readiness({
          attestations: [
            {
              requirementId: "critical_actions_and_residual_risk",
              state: "SATISFIED",
            },
            {
              requirementId: "worker_briefing",
              state: "SATISFIED",
            },
            {
              requirementId: "contractor_simops_coordination",
              state: "SATISFIED",
            },
          ],
        }),
      }),
    });

    for (const requirementId of [
      "critical_actions_and_residual_risk",
      "worker_briefing",
      "contractor_simops_coordination",
    ]) {
      expect(result.facts[requirementId]).toBe(false);
      expect(result.recorded).not.toContain(requirementId);
      expect(result.automatic).not.toContain(requirementId);
    }
  });

  it("requires captured permit workers to have attended the toolbox talk", () => {
    const project = "64b000000000000000000001";
    const site = "64b000000000000000000002";
    const employeeId = "64b000000000000000000030";
    const contractorPersonnelId = "64b000000000000000000031";

    function completedTalk(
      participants: readonly PermitReadinessFactPerson[],
      talkSite = site,
    ) {
      return {
        status: "COMPLETED",
        project,
        site: talkSite,
        participants,
      };
    }

    const permit = fullPermit({
      project,
      site,
      readiness: readiness({
        personnel: [
          {
            kind: "EMPLOYEE",
            employee: employeeId,
            name: "Ade Worker",
          },
          {
            kind: "CONTRACTOR",
            contractorPersonnel: contractorPersonnelId,
            name: "Contractor Worker",
          },
        ],
      }),
    });

    const allAttended = buildPermitReadinessFacts({
      permit,
      toolboxTalk: completedTalk([
        {
          kind: "EMPLOYEE",
          employee: employeeId,
          attendance: "ATTENDED",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnel: contractorPersonnelId,
          attendance: "ATTENDED",
        },
      ]),
    });
    expect(allAttended.facts.worker_briefing).toBe(true);
    expect(allAttended.automatic).toContain("worker_briefing");

    const invited = buildPermitReadinessFacts({
      permit,
      toolboxTalk: completedTalk([
        {
          kind: "EMPLOYEE",
          employee: employeeId,
          attendance: "ATTENDED",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnel: contractorPersonnelId,
          attendance: "INVITED",
        },
      ]),
    });
    expect(invited.facts.worker_briefing).toBeUndefined();

    const absent = buildPermitReadinessFacts({
      permit,
      toolboxTalk: completedTalk([
        {
          kind: "EMPLOYEE",
          employee: employeeId,
          attendance: "ABSENT",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnel: contractorPersonnelId,
          attendance: "ATTENDED",
        },
      ]),
    });
    expect(absent.facts.worker_briefing).toBeUndefined();

    const missingWorker = buildPermitReadinessFacts({
      permit,
      toolboxTalk: completedTalk([
        {
          kind: "EMPLOYEE",
          employee: employeeId,
          attendance: "ATTENDED",
        },
      ]),
    });
    expect(missingWorker.facts.worker_briefing).toBeUndefined();

    const noParticipants = buildPermitReadinessFacts({
      permit,
      toolboxTalk: completedTalk([]),
    });
    expect(noParticipants.facts.worker_briefing).toBeUndefined();

    const wrongSite = buildPermitReadinessFacts({
      permit,
      toolboxTalk: completedTalk(
        [
          {
            kind: "EMPLOYEE",
            employee: employeeId,
            attendance: "ATTENDED",
          },
          {
            kind: "CONTRACTOR",
            contractorPersonnel: contractorPersonnelId,
            attendance: "ATTENDED",
          },
        ],
        "64b000000000000000000098",
      ),
    });
    expect(wrongSite.facts.worker_briefing).toBeUndefined();

    const noCapturedWorkers = buildPermitReadinessFacts({
      permit: fullPermit({ project, site }),
      toolboxTalk: completedTalk([
        {
          kind: "EMPLOYEE",
          employee: employeeId,
          attendance: "ATTENDED",
        },
      ]),
    });
    expect(noCapturedWorkers.facts.worker_briefing).toBeUndefined();

    const unreferencedWorker = buildPermitReadinessFacts({
      permit: fullPermit({
        project,
        site,
        readiness: readiness({
          personnel: [{ kind: "EMPLOYEE", name: "No reference" }],
        }),
      }),
      toolboxTalk: completedTalk([
        {
          kind: "EMPLOYEE",
          name: "No reference",
          attendance: "ATTENDED",
        },
      ]),
    });
    expect(unreferencedWorker.facts.worker_briefing).toBeUndefined();
  });

  it("keeps blocked requirements unresolved even when an attestation exists", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        readiness: readiness({
          personnel: [
            {
              kind: "EMPLOYEE",
              employee: "64b000000000000000000003",
              name: "Ade Worker",
              attendance: "ATTENDED",
            },
          ],
          attestations: [
            {
              requirementId: "authorized_issuer",
              state: "SATISFIED",
            },
            {
              requirementId: "personnel_competence",
              state: "SATISFIED",
            },
          ],
        }),
      }),
    });

    expect(result.blocked).toEqual(BLOCKED_REQUIREMENTS);
    expect(result.recorded).not.toContain("authorized_issuer");
    expect(result.recorded).not.toContain("personnel_competence");
    expect(result.facts.authorized_issuer).toBe(false);
    expect(result.facts.personnel_competence).toBe(false);
    expect(result.automatic).not.toContain("personnel_competence");
  });

  it("reports NOT_APPLICABLE separately and never as a true fact", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        readiness: readiness({
          attestations: [
            {
              requirementId: "interfaces_defined",
              state: "NOT_APPLICABLE",
            },
          ],
        }),
      }),
    });

    expect(result.notApplicable).toEqual(["interfaces_defined"]);
    expect(result.facts.interfaces_defined).toBe(false);
    expect(result.recorded).not.toContain("interfaces_defined");
    expect(result.automatic).not.toContain("interfaces_defined");
  });

  it("ignores NOT_APPLICABLE for universal and blocked requirements", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        readiness: readiness({
          attestations: [
            {
              requirementId: "worksite_verification",
              state: "NOT_APPLICABLE",
            },
            {
              requirementId: "client_requirements",
              state: "NOT_APPLICABLE",
            },
          ],
        }),
      }),
    });

    expect(result.notApplicable).toEqual([]);
    expect(result.facts.worksite_verification).toBeUndefined();
    expect(result.facts.client_requirements).toBe(false);
  });

  it("records SATISFIED declarations for non-blocked conditional requirements", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        readiness: readiness({
          attestations: [
            {
              requirementId: "method_statement",
              state: "SATISFIED",
            },
          ],
        }),
      }),
    });

    expect(result.recorded).toContain("method_statement");
    expect(result.facts.method_statement).toBe(true);
    expect(result.blocked).not.toContain("method_statement");
  });

  it("uses the latest declaration for a requirement and ignores unknown ids", () => {
    const result = buildPermitReadinessFacts({
      permit: fullPermit({
        readiness: readiness({
          attestations: [
            {
              requirementId: "interfaces_defined",
              state: "SATISFIED",
            },
            {
              requirementId: "not_a_real_requirement",
              state: "SATISFIED",
            },
            {
              requirementId: "interfaces_defined",
              state: "NOT_APPLICABLE",
            },
          ],
        }),
      }),
    });

    expect(result.recorded).not.toContain("interfaces_defined");
    expect(result.notApplicable).toEqual(["interfaces_defined"]);
    expect(result.facts.interfaces_defined).toBe(false);
    expect(result.facts.not_a_real_requirement).toBeUndefined();
  });
});
