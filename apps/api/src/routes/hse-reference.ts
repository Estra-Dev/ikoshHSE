import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { attachIkoshUser, getIkoshUser } from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import {
  isManagementRole,
  isHseManagementRole,
} from "../lib/ikosh-constants.js";
import { HttpError } from "../lib/http-error.js";

const router: Router = Router();

/**
 * HSE reference data endpoint (read-only, visible to all IKOSH employees).
 *
 * Returns stable lookup lists used by client-side forms and validation:
 * - Incident categories
 * - Body parts
 * - Permit types
 * - Waste types
 * - Project and site statuses
 */
router.get("/hse-reference", async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    success: true,
    data: {
      incidentCategories: [
        "FATALITY",
        "LOST_TIME_INJURY",
        "RESTRICTED_WORK_CASE",
        "MEDICAL_TREATMENT_CASE",
        "FIRST_AID_CASE",
        "NEAR_MISS",
        "PROPERTY_DAMAGE",
        "ENVIRONMENTAL_INCIDENT",
        "FIRE_OR_EXPLOSION",
        "VEHICLE_INCIDENT",
        "PROCESS_SAFETY_EVENT",
        "SECURITY_INCIDENT",
        "OTHER",
      ],
      injuredBodyParts: [
        "HEAD",
        "FACE",
        "EYE",
        "EAR",
        "NECK",
        "SHOULDER",
        "UPPER_ARM",
        "ELBOW",
        "FOREARM",
        "WRIST",
        "HAND",
        "FINGER",
        "CHEST",
        "ABDOMEN",
        "BACK",
        "PELVIS",
        "HIP",
        "THIGH",
        "KNEE",
        "LOWER_LEG",
        "ANKLE",
        "FOOT",
        "TOE",
        "INTERNAL",
        "MULTIPLE",
        "NONE",
      ],
      permitToWorkTypes: [
        "HOT_WORK",
        "COLD_WORK",
        "CONFINED_SPACE_ENTRY",
        "WORKING_AT_HEIGHT",
        "ELECTRICAL_WORK",
        "EXCAVATION",
        "LIFTING_OPERATION",
        "ENERGY_ISOLATION",
        "RADIOGRAPHY",
        "PRESSURE_TEST",
        "OTHER",
      ],
      wasteTypes: [
        "DOMESTIC",
        "INDUSTRIAL",
        "HAZARDOUS",
        "RECYCLABLE",
        "BIOMEDICAL",
        "CONSTRUCTION_DEBRIS",
        "OILY",
        "CHEMICAL",
        "ELECTRONIC",
        "SCRAP_METAL",
      ],
      projectStatuses: [
        "PLANNED",
        "ACTIVE",
        "ON_HOLD",
        "COMPLETED",
        "CANCELLED",
      ],
      siteStatuses: [
        "PLANNED",
        "ACTIVE",
        "ON_HOLD",
        "COMPLETED",
        "DECOMMISSIONED",
      ],
    },
  });
});

/**
 * HSE dashboard summary (action-oriented, not decorative KPI cards).
 *
 * Returns counts of critical operational items that require attention:
 * - Projects with active sites needing safety inspections
 * - Contractors with pending assignments
 * - Recent incidents/near-misses requiring investigation
 * - Safety observations overdue
 * - Permit requests awaiting approval
 * - Contractors personnel without recent certifications
 */
router.get(
  "/dashboard",
  async (_req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(_req);

    // Only HSE_MANAGER and ADMIN can access operational dashboard.
    if (!isHseManagementRole(viewer.ikoshRole)) {
      throw new HttpError(403, "HSE operational dashboard access requires HSE_MANAGER or ADMIN role.");
    }

    // Query counts would normally aggregate from incidents, observations, permits etc.
    // For Phase 1 MVP we return placeholders for the non-incident workflows.
    const projectsCount = await require("../models/Project.js")
      .default?.countDocuments?.() ?? 0;
    const sitesCount = await require("../models/Site.js")
      .default?.countDocuments?.() ?? 0;
    const contractorsCount = await require("../models/Contractor.js")
      .default?.countDocuments?.() ?? 0;
    const personnelCount = await require("../models/ContractorPersonnel.js")
      .default?.countDocuments?.() ?? 0;

    res.status(200).json({
      success: true,
      data: {
        metrics: {
          projectsWithSites: projectsCount,
          activeSites: sitesCount,
          activeContractors: contractorsCount,
          contractorPersonnel: personnelCount,
        },
        lastUpdated: new Date().toISOString(),
      },
    });
  },
);

/**
 * Attachment storage infrastructure: validate upload limits and MIME types,
 * generate a secure storage key, store metadata, and return signed download URL.
 *
 * Clients use the returned URL to POST multipart/form-data with the actual file.
 * The backend validates checksum on upload and records the file metadata.
 */
router.post(
  "/attachments/upload/url",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (_req: Request, res: Response): Promise<void> {
    // TODO: Implement signed URL generation (AWS S3, Azure Blob, or local disk).
    // For now we return a placeholder indicating the feature is planned.
    res.status(501).json({
      success: false,
      message: "Attachment upload infrastructure is planned for Phase 2.",
    });
  },
);

/** Audit log query endpoint (read-only, supports HSE and admin staff). */
router.get(
  "/audit-log",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (_req: Request, res: Response): Promise<void> {
    const parsed = require("../lib/validation/audit-log.js")
      .auditLogQuerySchema?.safeParse?.(_req.query) ?? { success: false };

    if (!parsed.success) {
      throw new HttpError(400, "Invalid query parameters.");
    }

    const { entityType, entityId, action, limit } = parsed.data;

    const AuditLog = require("../models/AuditLog.js").default;
    let query = AuditLog.find();

    if (entityType) query = query.match({ entityType });
    if (action) query = query.match({ action });
    if (entityId) query = query.match({ entityId });
    if (limit) query = query.limit(limit);

    const results = await query.sort({ createdAt: -1 }).exec();

    const auditLogSerializer = require("../serializers/audit-log.js")
      .toAuditLogSummary;

    res.status(200).json({
      success: true,
      data: {
        auditLog: results.map((entry) => auditLogSerializer(entry)),
      },
    });
  },
);

export default router;