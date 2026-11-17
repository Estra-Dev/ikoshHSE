import { Schema } from "mongoose";
import {
  PARTICIPANT_ATTENDANCE_STATES,
  WORKFORCE_PARTICIPANT_KINDS,
} from "../lib/hse-constants.js";

/**
 * Shared participant fields for training sessions and toolbox talks.
 *
 * Participants are references to existing workforce records: an IKOSH
 * employee (`User`) or a contractor person (`ContractorPersonnel`). The two
 * populations are kept in separate fields and never merged, and a name
 * snapshot preserves what was recorded even if the source record is later
 * renamed or deactivated.
 */
export const participantFields = {
  kind: {
    type: String,
    enum: [...WORKFORCE_PARTICIPANT_KINDS],
    required: true,
  },
  employee: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  contractorPersonnel: {
    type: Schema.Types.ObjectId,
    ref: "ContractorPersonnel",
    default: null,
  },
  // Contractor company of the participant, denormalised for reporting while
  // keeping the person reference authoritative.
  contractor: {
    type: Schema.Types.ObjectId,
    ref: "Contractor",
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  attendance: {
    type: String,
    enum: [...PARTICIPANT_ATTENDANCE_STATES],
    default: "INVITED",
    required: true,
  },
  notes: {
    type: String,
    default: null,
    trim: true,
  },
};
