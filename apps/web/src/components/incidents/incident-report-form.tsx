"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  incidentKeys,
  useCreateIncident,
  useUpdateIncident,
} from "@/lib/api/incidents";
import { useSites } from "@/lib/api/worksites";
import type { IncidentSummary, IncidentType } from "@/lib/api/types";
import {
  buildCreateIncidentInput,
  buildUpdateIncidentInput,
  defaultIncidentFormValues,
  incidentToFormValues,
  toDateTimeLocalValue,
  validateIncidentForm,
  type IncidentFormErrors,
  type IncidentFormValues,
} from "@/lib/incident-form";
import { incidentDetailHref } from "@/lib/incident-workflow";
import { formatHseLabel } from "@/lib/hse-dashboard";

interface IncidentReportFormProps {
  mode: "create" | "edit";
  /** Locked report type for the create routes. */
  lockedType?: IncidentType;
  incident?: IncidentSummary;
  /** Display name for the immutable site shown in edit mode. */
  siteName?: string;
  onSaved?: (incident: IncidentSummary) => void;
  onCancel?: () => void;
}

/**
 * Shared report form. Creation is locked to the route's report type; editing
 * may change the type because `PATCH /api/incidents/:id` explicitly supports
 * it. Site, classification and status are never submitted from this form.
 */
export function IncidentReportForm({
  mode,
  lockedType,
  incident,
  siteName,
  onSaved,
  onCancel,
}: IncidentReportFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sites = useSites();
  const createIncident = useCreateIncident();
  const updateIncident = useUpdateIncident();

  const [values, setValues] = useState<IncidentFormValues>(() => {
    if (mode === "edit" && incident) {
      return incidentToFormValues(incident);
    }

    return {
      ...defaultIncidentFormValues(lockedType ?? "INCIDENT"),
      // Kept blank so server and client markup match; the user can pick a
      // time or use the "Use current time" shortcut.
      occurredAt: "",
    };
  });
  const [errors, setErrors] = useState<IncidentFormErrors>({});
  const [serverError, setServerError] = useState("");

  function updateField<K extends keyof IncidentFormValues>(
    key: K,
    value: IncidentFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setServerError("");

    const nextErrors = validateIncidentForm(values, {
      requireSite: mode === "create",
    });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      if (mode === "create") {
        const result = await createIncident.mutateAsync(
          buildCreateIncidentInput(values),
        );
        router.push(incidentDetailHref(result.incident.type, result.incident.id));
        return;
      }

      if (!incident) {
        return;
      }

      const result = await updateIncident.mutateAsync({
        id: incident.id,
        input: buildUpdateIncidentInput(values),
      });
      onSaved?.(result.incident);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The report could not be saved. Please try again.",
      );

      // A 409 means the report moved on (or the reporter lost edit rights),
      // so refresh the authoritative record.
      if (incident) {
        void queryClient.invalidateQueries({
          queryKey: incidentKeys.detail(incident.id),
        });
      }
    }
  }

  const isSubmitting = createIncident.isPending || updateIncident.isPending;
  const siteOptions = sites.data?.sites ?? [];
  const noSites =
    !sites.isLoading && !sites.isError && siteOptions.length === 0;
  const sitesUnavailable = sites.isError && mode === "create";

  return (
    <Card>
      <CardHeader
        title={mode === "create" ? "Report details" : "Edit report content"}
        description={
          mode === "create"
            ? "Record what happened and any immediate action taken. Classification and workflow status are added by HSE management after reporting."
            : "Update the observational details of this report. Classification and status are managed separately."
        }
      />
      <CardBody>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          {serverError && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "create" ? (
              <SelectField
                label="Site"
                id="incident-site"
                value={values.siteId}
                onChange={(event) =>
                  updateField("siteId", event.target.value)
                }
                error={errors.siteId}
                hint="Only sites in your scope are listed."
                disabled={sites.isLoading}
                options={[
                  {
                    value: "",
                    label: sites.isLoading ? "Loading sites…" : "Select a site",
                  },
                  ...siteOptions.map((site) => ({
                    value: site.id,
                    label: `${site.name} · ${site.code}`,
                  })),
                ]}
              />
            ) : (
              <TextField
                label="Site"
                id="incident-site"
                value={siteName ?? "Current site"}
                readOnly
                disabled
                hint="The site cannot be changed after a report is filed."
              />
            )}

            {mode === "create" ? (
              <SelectField
                label="Report type"
                id="incident-type"
                value={values.type}
                onChange={() => undefined}
                disabled
                hint="Set by the register you started from."
                options={[
                  {
                    value: lockedType ?? "INCIDENT",
                    label: formatHseLabel(lockedType ?? "INCIDENT"),
                  },
                ]}
              />
            ) : (
              <SelectField
                label="Report type"
                id="incident-type"
                value={values.type}
                onChange={(event) =>
                  updateField("type", event.target.value as IncidentType)
                }
                hint="Change this if the report was filed under the wrong type."
                options={[
                  { value: "INCIDENT", label: "Incident" },
                  { value: "NEAR_MISS", label: "Near miss" },
                ]}
              />
            )}

            <TextField
              label="Title"
              id="incident-title"
              value={values.title}
              onChange={(event) => updateField("title", event.target.value)}
              error={errors.title}
              maxLength={160}
              placeholder="Short factual summary"
              className="sm:col-span-2"
            />

            <div>
              <TextField
                label="Occurred at"
                id="incident-occurred-at"
                type="datetime-local"
                value={values.occurredAt}
                onChange={(event) =>
                  updateField("occurredAt", event.target.value)
                }
                error={errors.occurredAt}
                hint="Local time of the event."
              />
              <button
                type="button"
                onClick={() =>
                  updateField(
                    "occurredAt",
                    toDateTimeLocalValue(new Date().toISOString()),
                  )
                }
                className="mt-2 text-xs font-medium text-navy-700 underline-offset-2 hover:underline"
              >
                Use current time
              </button>
            </div>

            <TextField
              label="Location"
              id="incident-location"
              value={values.location}
              onChange={(event) => updateField("location", event.target.value)}
              error={errors.location}
              maxLength={200}
              placeholder="Area, level or equipment"
              hint={
                mode === "edit"
                  ? "Leave blank to keep the current value."
                  : "Optional."
              }
            />

            <TextareaField
              label="Description"
              id="incident-description"
              value={values.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              error={errors.description}
              maxLength={5000}
              rows={6}
              placeholder="What happened, who was involved and what was affected?"
              className="sm:col-span-2"
            />

            <TextareaField
              label="Immediate actions"
              id="incident-immediate-actions"
              value={values.immediateActions}
              onChange={(event) =>
                updateField("immediateActions", event.target.value)
              }
              error={errors.immediateActions}
              maxLength={2000}
              rows={4}
              placeholder="Cordon, isolate, stop work or first-aid steps taken."
              hint={
                mode === "edit"
                  ? "Leave blank to keep the current value."
                  : "Optional."
              }
              className="sm:col-span-2"
            />
          </div>

          {noSites && mode === "create" && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"
            >
              You are not assigned to any site, so a report cannot be filed.
              Your site access must be configured by HSE management before you
              can report incidents or near misses.
            </p>
          )}

          {sitesUnavailable && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
            >
              Your site list could not be loaded, so a site cannot be selected.
              Refresh the page and try again.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={(noSites || sitesUnavailable) && mode === "create"}
            >
              {mode === "create" ? "Submit report" : "Save changes"}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
