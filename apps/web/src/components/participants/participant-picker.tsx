"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
import {
  useParticipantContractorPersonnel,
  useParticipantEmployees,
} from "@/lib/api/workforce";
import type { WorkforceParticipantKind } from "@/lib/api/types";
import { PARTICIPANT_KIND_LABELS } from "@/lib/attendance-records";

export interface PickedParticipant {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  name: string;
}

function personName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim() || "Unnamed person";
}

export function ParticipantPicker({
  siteId,
  exclude,
  onAdd,
  disabled = false,
}: {
  siteId: string;
  exclude: readonly string[];
  onAdd: (participant: PickedParticipant) => void;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<WorkforceParticipantKind>("EMPLOYEE");
  const [selection, setSelection] = useState<{
    kind: WorkforceParticipantKind;
    siteId: string;
    personId: string;
  }>({
    kind: "EMPLOYEE",
    siteId,
    personId: "",
  });

  const personId =
    selection.kind === kind && selection.siteId === siteId
      ? selection.personId
      : "";

  const employees = useParticipantEmployees(kind === "EMPLOYEE" ? siteId : "");
  const contractorPersonnel = useParticipantContractorPersonnel(
    kind === "CONTRACTOR" ? siteId : "",
  );

  const excluded = useMemo(() => new Set(exclude), [exclude]);

  const options = useMemo(() => {
    if (kind === "EMPLOYEE") {
      return (employees.data?.employees ?? [])
        .map((employee) => ({
          id: employee.id,
          label: personName(employee),
        }))
        .filter((option) => !excluded.has(`employee:${option.id}`));
    }

    return (contractorPersonnel.data?.personnel ?? [])
      .map((person) => ({
        id: person.id,
        label: person.personnelId
          ? `${personName(person)} · ${person.personnelId}`
          : personName(person),
      }))
      .filter((option) => !excluded.has(`contractor:${option.id}`));
  }, [kind, employees.data, contractorPersonnel.data, excluded]);

  const loading =
    kind === "EMPLOYEE" ? employees.isLoading : contractorPersonnel.isLoading;

  const canAdd = personId.length > 0 && !disabled;

  function handleAdd() {
    const option = options.find((candidate) => candidate.id === personId);

    if (!option) {
      return;
    }

    onAdd({
      kind,
      employeeId: kind === "EMPLOYEE" ? option.id : undefined,
      contractorPersonnelId: kind === "CONTRACTOR" ? option.id : undefined,
      name: option.label.split(" · ")[0] ?? option.label,
    });

    setSelection({ kind, siteId, personId: "" });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] sm:items-end">
      <SelectField
        label="Participant type"
        id="participant-kind"
        value={kind}
        onChange={(event) =>
          setKind(event.target.value as WorkforceParticipantKind)
        }
        options={[
          { value: "EMPLOYEE", label: PARTICIPANT_KIND_LABELS.EMPLOYEE },
          { value: "CONTRACTOR", label: PARTICIPANT_KIND_LABELS.CONTRACTOR },
        ]}
      />

      <SelectField
        label={kind === "EMPLOYEE" ? "Employee" : "Contractor personnel"}
        id="participant-person"
        value={personId}
        onChange={(event) =>
          setSelection({
            kind,
            siteId,
            personId: event.target.value,
          })
        }
        disabled={!siteId || disabled || loading}
        hint={
          !siteId
            ? "Select a site before adding attendees."
            : loading
              ? "Loading people..."
              : options.length === 0
                ? kind === "EMPLOYEE"
                  ? "No eligible employees for this site."
                  : "No active contractor personnel assigned to this site."
                : undefined
        }
        options={[
          { value: "", label: "Select a person" },
          ...options.map((option) => ({
            value: option.id,
            label: option.label,
          })),
        ]}
      />

      <Button
        type="button"
        variant="secondary"
        onClick={handleAdd}
        disabled={!canAdd}
      >
        Add attendee
      </Button>
    </div>
  );
}
