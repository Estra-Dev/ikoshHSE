import type { ManagementOfChangeStatus } from "@/lib/api/management-of-change";

export const MANAGEMENT_OF_CHANGE_STATUS_LABELS: Record<
  ManagementOfChangeStatus,
  string
> = {
  DRAFT: "Draft",
  ASSESSMENT: "Assessment",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  IMPLEMENTING: "Implementing",
  VERIFICATION: "Verification",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<ManagementOfChangeStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ASSESSMENT: "bg-blue-100 text-blue-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  IMPLEMENTING: "bg-indigo-100 text-indigo-800",
  VERIFICATION: "bg-purple-100 text-purple-800",
  CLOSED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-200 text-slate-700",
};

export function ManagementOfChangeStatusBadge({
  status,
}: {
  status: ManagementOfChangeStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {MANAGEMENT_OF_CHANGE_STATUS_LABELS[status]}
    </span>
  );
}

export const MANAGEMENT_OF_CHANGE_WORKFLOW = [
  {
    status: "DRAFT" as const,
    label: "Draft",
    description: "Record created and scope captured.",
  },
  {
    status: "ASSESSMENT" as const,
    label: "Assessment",
    description: "QHSE impacts and controls documented.",
  },
  {
    status: "PENDING_APPROVAL" as const,
    label: "Pending approval",
    description:
      "Technical/HSE approval followed by management approval.",
  },
  {
    status: "APPROVED" as const,
    label: "Approved",
    description: "Both technical and management approvals recorded.",
  },
  {
    status: "IMPLEMENTING" as const,
    label: "Implementing",
    description: "Approved change implemented (requires approvals).",
  },
  {
    status: "VERIFICATION" as const,
    label: "Verification",
    description: "Implementation checked and actions closed.",
  },
  {
    status: "CLOSED" as const,
    label: "Closed",
    description: "Verification and closeout completed.",
  },
] as const;

export const MANAGEMENT_OF_CHANGE_APPROVAL_NOTICE =
  "A03 management-of-change approval is not activated. The SOP is still a draft and activation requires formal management confirmation. Once active, an HSE manager records technical/HSE approval and an administrator records management approval; both are required before implementation.";

export function ManagementOfChangeApprovalNotice({
  active = false,
  message = MANAGEMENT_OF_CHANGE_APPROVAL_NOTICE,
}: {
  active?: boolean;
  message?: string;
}) {
  return (
    <div
      role="note"
      className={`rounded-xl border p-4 text-sm ${
        active
          ? "border-navy-200 bg-navy-50 text-navy-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">
        {active
          ? "Two-stage approval is active"
          : "Approval control currently restricted"}
      </p>
      <p className="mt-1 leading-6">{message}</p>
    </div>
  );
}
