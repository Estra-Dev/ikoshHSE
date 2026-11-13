"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
import { useHseReference } from "@/lib/api/hse";
import { useClassifyIncident } from "@/lib/api/incidents";
import type { IncidentSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";

/**
 * Management-only classification control. The API allows reclassification at
 * any workflow stage, so the panel deliberately stays available after triage.
 */
export function IncidentClassificationPanel({
  incident,
}: {
  incident: IncidentSummary;
}) {
  const reference = useHseReference();
  const classify = useClassifyIncident();
  const [category, setCategory] = useState(incident.category ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const categories = reference.data?.data.incidentCategories ?? [];
  const currentCategory = incident.category ?? "";
  const changed = category !== "" && category !== currentCategory;

  async function handleSave(): Promise<void> {
    setMessage("");
    setError("");

    try {
      await classify.mutateAsync({
        id: incident.id,
        input: { category },
      });
      setMessage("Classification saved.");
    } catch (classifyError) {
      setError(
        classifyError instanceof Error
          ? classifyError.message
          : "The classification could not be saved.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Classification"
        description="HSE management only. Classification can be updated at any workflow stage."
      />
      <CardBody className="space-y-4">
        {reference.isError ? (
          <p role="alert" className="text-sm text-red-700">
            Classification categories could not be loaded. Please refresh.
          </p>
        ) : (
          <SelectField
            label="Category"
            id="incident-classification"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setMessage("");
              setError("");
            }}
            disabled={reference.isLoading || classify.isPending}
            hint={
              currentCategory
                ? `Current classification: ${formatHseLabel(currentCategory)}.`
                : "This report is currently unclassified."
            }
            options={[
              {
                value: "",
                label: reference.isLoading
                  ? "Loading categories…"
                  : "Select a category",
              },
              ...categories.map((value) => ({
                value,
                label: formatHseLabel(value),
              })),
            ]}
          />
        )}

        <Button
          onClick={() => void handleSave()}
          isLoading={classify.isPending}
          disabled={!changed || reference.isError}
        >
          Save classification
        </Button>

        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
