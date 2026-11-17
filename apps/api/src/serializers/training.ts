export interface TrainingCourseLike {
  _id: unknown;
  code: string;
  title: string;
  category: string;
  defaultDurationMinutes?: number | null;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingParticipantLike {
  _id?: unknown;
  kind: string;
  employee?: unknown;
  contractorPersonnel?: unknown;
  contractor?: unknown;
  name: string;
  attendance: string;
  completed: boolean;
  certificateNumber?: string | null;
  certificateIssuedOn?: Date | null;
  certificateExpiresOn?: Date | null;
  notes?: string | null;
}

export interface TrainingSessionLike {
  _id: unknown;
  course: unknown;
  project: unknown;
  site: unknown;
  topic: string;
  description?: string | null;
  trainerName: string;
  scheduledDate: Date;
  durationMinutes: number;
  status: string;
  participants?: readonly TrainingParticipantLike[];
  completedBy?: unknown;
  completedAt?: Date | null;
  cancelledBy?: unknown;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  createdBy?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingCourseRef {
  id: string;
  code: string | null;
  title: string | null;
  category: string | null;
}

export interface TrainingProjectRef {
  id: string;
  name: string | null;
}

export interface TrainingSiteRef {
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

/**
 * Certificate state derived from recorded dates only. It never asserts
 * competence; it only describes what the HSE team recorded.
 */
export type CertificateState =
  | "NOT_RECORDED"
  | "RECORDED"
  | "VALID"
  | "EXPIRING_SOON"
  | "EXPIRED";

export interface SerializedTrainingParticipant {
  id: string;
  kind: string;
  employeeId: string | null;
  contractorPersonnelId: string | null;
  contractor: ContractorRef | null;
  name: string;
  attendance: string;
  completed: boolean;
  certificateNumber: string | null;
  certificateIssuedOn: string | null;
  certificateExpiresOn: string | null;
  certificateState: CertificateState;
  notes: string | null;
}

export interface SerializedTrainingSession {
  id: string;
  course: TrainingCourseRef;
  project: TrainingProjectRef;
  site: TrainingSiteRef;
  topic: string;
  description: string;
  trainerName: string;
  scheduledDate: string;
  durationMinutes: number;
  status: string;
  participantCount: number;
  employeeParticipantCount: number;
  contractorParticipantCount: number;
  attendedCount: number;
  completedCount: number;
  participants: SerializedTrainingParticipant[];
  completedBy: UserRef | null;
  completedAt: string | null;
  cancelledBy: UserRef | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

/** Session summary shown to an employee, without other attendees' details. */
export interface SerializedMyTrainingSession
  extends Omit<SerializedTrainingSession, "participants"> {
  participation: SerializedTrainingParticipant;
}

interface RefDocument {
  _id: unknown;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  code?: string | null;
  title?: string | null;
  category?: string | null;
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

/** ObjectId references arrive raw or populated; only the id matters here. */
function referenceId(value: unknown): string | null {
  const document = asDocument(value);
  return document ? String(document._id) : null;
}

const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveCertificateState(
  participant: Pick<
    TrainingParticipantLike,
    "certificateNumber" | "certificateIssuedOn" | "certificateExpiresOn"
  >,
  now: number = Date.now(),
): CertificateState {
  const expiresOn = participant.certificateExpiresOn;
  const hasDetails = Boolean(
    participant.certificateNumber || participant.certificateIssuedOn,
  );

  if (!expiresOn) {
    return hasDetails ? "RECORDED" : "NOT_RECORDED";
  }

  const expires = expiresOn.getTime();

  if (!Number.isFinite(expires)) {
    return "RECORDED";
  }

  if (expires < now) {
    return "EXPIRED";
  }

  if (expires - now <= EXPIRING_SOON_DAYS * DAY_MS) {
    return "EXPIRING_SOON";
  }

  return "VALID";
}

function toParticipant(
  participant: TrainingParticipantLike,
): SerializedTrainingParticipant {
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
    completed: participant.completed,
    certificateNumber: participant.certificateNumber ?? null,
    certificateIssuedOn: dateOf(participant.certificateIssuedOn),
    certificateExpiresOn: dateOf(participant.certificateExpiresOn),
    certificateState: deriveCertificateState(participant),
    notes: participant.notes ?? null,
  };
}

export function toTrainingCourseSummary(
  course: TrainingCourseLike,
): SerializedTrainingCourse {
  return {
    id: String(course._id),
    code: course.code,
    title: course.title,
    category: course.category,
    defaultDurationMinutes: course.defaultDurationMinutes ?? null,
    description: course.description ?? "",
    isActive: course.isActive,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

export interface SerializedTrainingCourse {
  id: string;
  code: string;
  title: string;
  category: string;
  defaultDurationMinutes: number | null;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function baseSession(session: TrainingSessionLike) {
  const course = asDocument(session.course);
  const project = asDocument(session.project);
  const site = asDocument(session.site);
  const participants = session.participants ?? [];

  return {
    course: {
      id: course ? String(course._id) : "",
      code: course?.code ?? null,
      title: course?.title ?? null,
      category: course?.category ?? null,
    },
    project: {
      id: project ? String(project._id) : "",
      name: project?.name ?? null,
    },
    site: {
      id: site ? String(site._id) : "",
      name: site?.name ?? null,
      code: site?.code ?? null,
    },
    topic: session.topic,
    description: session.description ?? "",
    trainerName: session.trainerName,
    scheduledDate: session.scheduledDate.toISOString(),
    durationMinutes: session.durationMinutes,
    status: session.status,
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
    completedCount: participants.filter(
      (participant) => participant.completed,
    ).length,
    completedBy: userRef(session.completedBy),
    completedAt: dateOf(session.completedAt),
    cancelledBy: userRef(session.cancelledBy),
    cancelledAt: dateOf(session.cancelledAt),
    cancellationReason: session.cancellationReason ?? null,
    createdBy: userRef(session.createdBy),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * Whitelists training response fields. Populated references are flattened and
 * certificate state is derived at response time from recorded dates.
 */
export function toTrainingSessionSummary(
  session: TrainingSessionLike,
): SerializedTrainingSession {
  return {
    id: String(session._id),
    ...baseSession(session),
    participants: (session.participants ?? []).map(toParticipant),
  };
}

/**
 * Employee self-service view: the session metadata plus only the caller's own
 * participant row. Other attendees are never included.
 */
export function toTrainingPersonHistory(
  session: TrainingSessionLike,
  kind: "EMPLOYEE" | "CONTRACTOR",
  personId: string,
): SerializedMyTrainingSession | null {
  const participation = (session.participants ?? []).find((participant) => {
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
    id: String(session._id),
    ...baseSession(session),
    participation: toParticipant(participation),
  };
}

/** Employee self-history convenience wrapper. */
export function toMyTrainingSession(
  session: TrainingSessionLike,
  employeeId: string,
): SerializedMyTrainingSession | null {
  return toTrainingPersonHistory(session, "EMPLOYEE", employeeId);
}
