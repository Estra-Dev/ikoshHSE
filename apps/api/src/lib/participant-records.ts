import { Types, type ClientSession } from "mongoose";
import { HttpError } from "./http-error.js";
import type { ParticipantInput } from "./validation/participant.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../models/ContractorPersonnelSiteAssignment.js";
import { User } from "../models/User.js";

/**
 * Resolved participant reference stored on a session or talk.
 *
 * `employee` and `contractorPersonnel` are mutually exclusive by design: the
 * two workforce populations are never merged into one identifier.
 */
export interface ResolvedParticipant {
  kind: "EMPLOYEE" | "CONTRACTOR";
  employee: Types.ObjectId | null;
  contractorPersonnel: Types.ObjectId | null;
  contractor: Types.ObjectId | null;
  name: string;
}

function displayName(firstName?: string | null, lastName?: string | null) {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return name || "Unnamed person";
}

/**
 * Resolves client participant references against the existing workforce
 * records. Employees must be active. Contractor personnel must be active and
 * currently assigned to the session's site, so a talk or training record cannot
 * silently pull in a contractor from another site.
 *
 * Duplicate references are rejected so attendance cannot be double-counted.
 */
export async function resolveParticipants(
  inputs: readonly ParticipantInput[],
  siteId: Types.ObjectId,
  session: ClientSession,
): Promise<ResolvedParticipant[]> {
  const seen = new Set<string>();
  const resolved: ResolvedParticipant[] = [];

  for (const [index, input] of inputs.entries()) {
    const position = index + 1;

    if (input.kind === "EMPLOYEE") {
      const employeeId = input.employeeId;

      if (!employeeId) {
        throw new HttpError(400, `Participant ${position} has no employee.`);
      }

      const key = `employee:${employeeId}`;

      if (seen.has(key)) {
        throw new HttpError(
          400,
          `Participant ${position} duplicates an employee already on this record.`,
        );
      }

      seen.add(key);

      const employee = await User.findById(employeeId).session(session);

      if (!employee || !employee.isActive) {
        throw new HttpError(
          400,
          `Participant ${position} is not an active IKOSH employee.`,
        );
      }

      resolved.push({
        kind: "EMPLOYEE",
        employee: employee._id,
        contractorPersonnel: null,
        contractor: null,
        name: displayName(employee.firstName, employee.lastName),
      });
      continue;
    }

    const personnelId = input.contractorPersonnelId;

    if (!personnelId) {
      throw new HttpError(
        400,
        `Participant ${position} has no contractor personnel record.`,
      );
    }

    const key = `contractor:${personnelId}`;

    if (seen.has(key)) {
      throw new HttpError(
        400,
        `Participant ${position} duplicates contractor personnel already on this record.`,
      );
    }

    seen.add(key);

    const person = await ContractorPersonnel.findById(personnelId).session(
      session,
    );

    if (!person || !person.isActive) {
      throw new HttpError(
        400,
        `Participant ${position} is not an active contractor person.`,
      );
    }

    const assignment = await ContractorPersonnelSiteAssignment.findOne({
      personnel: person._id,
      site: siteId,
      isActive: true,
    }).session(session);

    if (!assignment) {
      throw new HttpError(
        400,
        `Participant ${position} is not currently assigned to this site.`,
      );
    }

    resolved.push({
      kind: "CONTRACTOR",
      employee: null,
      contractorPersonnel: person._id,
      contractor: person.contractor,
      name: displayName(person.firstName, person.lastName),
    });
  }

  return resolved;
}
