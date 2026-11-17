export interface ToolboxParticipantLike {
  _id?: unknown;
  kind: string;
  employee?: unknown;
  contractorPersonnel?: unknown;
  contractor?: unknown;
  name: string;
  attendance: string;
  acknowledged: boolean;
  acknowledgedAt?: Date | null;
  notes?: string | null;
}

export interface ToolboxTalkLike {
  _id: unknown;
  project: unknown;
  site: unknown;
  topic: string;
  discussionPoints?: string | null;
  facilitatorName: string;
  scheduledDate: Date;
  durationMinutes: number;
  status: string;
  participants?: readonly ToolboxParticipantLike[];
  completedBy?: unknown;
  completedAt?: Date | null;
  cancelledBy?: unknown;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  createdBy?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolboxProjectRef {
  id: string;
  name: string | null;
}

export interface ToolboxSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ContractorRef {
  id: string;
  name: string | null;
}

export interface SerializedToolboxParticipant {
  id: string;
  kind: string;
  employeeId: string | null;
  contractorPersonnelId: string | null;
  contractor: ContractorRef | null;
  name: string;
  attendance: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  notes: string | null;
}

export interface SerializedToolboxTalk {
  id: string;
  project: ToolboxProjectRef;
  site: ToolboxSiteRef;
  topic: string;
  discussionPoints: string;
  facilitatorName: string;
  scheduledDate: string;
  durationMinutes: number;
  status: string;
  participantCount: number;
  employeeParticipantCount: number;
  contractorParticipantCount: number;
  attendedCount: number;
  acknowledgedCount: number;
  participants: SerializedToolboxParticipant[];
  completedBy: UserRef | null;
  completedAt: string | null;
  cancelledBy: UserRef | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

/** Talk summary shown to an employee, without other attendees' details. */
export interface SerializedMyToolboxTalk
  extends Omit<SerializedToolboxTalk, "participants"> {
  participation: SerializedToolboxParticipant;
}

interface RefDocument {
  _id: unknown;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  code?: string | null;
}

function asDocument(value: unknown): RefDocument | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    return value as RefDocument;
  }

  return { _id: value };
}

function dateOf(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function userRef(value: unknown): UserRef | null {
  const document = asDocument(value);

  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    firstName: document.firstName ?? "",
    lastName: document.lastName ?? "",
  };
}

function referenceId(value: unknown): string | null {
  const document = asDocument(value);
  return document ? String(document._id) : null;
}

function toParticipant(
  participant: ToolboxParticipantLike,
): SerializedToolboxParticipant {
  const contractor = asDocument(participant.contractor);

  return {
    id: participant._id ? String(participant._id) : String(participant.name),
    kind: participant.kind,
    employeeId: referenceId(participant.employee),
    contractorPersonnelId: referenceId(participant.contractorPersonnel),
    contractor: contractor
      ? { id: String(contractor._id), name: contractor.name ?? null }
      : null,
    name: participant.name,
    attendance: participant.attendance,
    acknowledged: participant.acknowledged,
    acknowledgedAt: dateOf(participant.acknowledgedAt),
    notes: participant.notes ?? null,
  };
}

function baseTalk(talk: ToolboxTalkLike) {
  const project = asDocument(talk.project);
  const site = asDocument(talk.site);
  const participants = talk.participants ?? [];

  return {
    project: {
      id: project ? String(project._id) : "",
      name: project?.name ?? null,
    },
    site: {
      id: site ? String(site._id) : "",
      name: site?.name ?? null,
      code: site?.code ?? null,
    },
    topic: talk.topic,
    discussionPoints: talk.discussionPoints ?? "",
    facilitatorName: talk.facilitatorName,
    scheduledDate: talk.scheduledDate.toISOString(),
    durationMinutes: talk.durationMinutes,
    status: talk.status,
    participantCount: participants.length,
    employeeParticipantCount: participants.filter(
      (participant) => participant.kind === "EMPLOYEE",
    ).length,
    contractorParticipantCount: participants.filter(
      (participant) => participant.kind === "CONTRACTOR",
    ).length,
    attendedCount: participants.filter(
      (participant) => participant.attendance === "ATTENDED",
    ).length,
    acknowledgedCount: participants.filter(
      (participant) => participant.acknowledged,
    ).length,
    completedBy: userRef(talk.completedBy),
    completedAt: dateOf(talk.completedAt),
    cancelledBy: userRef(talk.cancelledBy),
    cancelledAt: dateOf(talk.cancelledAt),
    cancellationReason: talk.cancellationReason ?? null,
    createdBy: userRef(talk.createdBy),
    createdAt: talk.createdAt.toISOString(),
    updatedAt: talk.updatedAt.toISOString(),
  };
}

export function toToolboxTalkSummary(
  talk: ToolboxTalkLike,
): SerializedToolboxTalk {
  return {
    id: String(talk._id),
    ...baseTalk(talk),
    participants: (talk.participants ?? []).map(toParticipant),
  };
}

/**
 * Person history view: the talk metadata plus only the requested person's
 * participant row. Other attendees are never included.
 */
export function toToolboxPersonHistory(
  talk: ToolboxTalkLike,
  kind: "EMPLOYEE" | "CONTRACTOR",
  personId: string,
): SerializedMyToolboxTalk | null {
  const participation = (talk.participants ?? []).find((participant) => {
    if (participant.kind !== kind) {
      return false;
    }

    const reference =
      kind === "EMPLOYEE"
        ? referenceId(participant.employee)
        : referenceId(participant.contractorPersonnel);

    return reference === personId;
  });

  if (!participation) {
    return null;
  }

  return {
    id: String(talk._id),
    ...baseTalk(talk),
    participation: toParticipant(participation),
  };
}

/** Employee self-history convenience wrapper. */
export function toMyToolboxTalk(
  talk: ToolboxTalkLike,
  employeeId: string,
): SerializedMyToolboxTalk | null {
  return toToolboxPersonHistory(talk, "EMPLOYEE", employeeId);
}
