"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  buttonStyles,
  ErrorState,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { Badge } from "@/components/ui/badge";
import { ParticipantPicker } from "@/components/participants/participant-picker";
import { ParticipantKindBadge } from "@/components/attendance-records/attendance-badges";
import { useMe } from "@/lib/api/employees";
import { useCreateToolboxTalk } from "@/lib/api/toolbox-talks";
import { useProjects, useSites } from "@/lib/api/worksites";
import type { CreateToolboxTalkInput } from "@/lib/api/types";
import {
  createToolboxTalkParticipantRow,
  toolboxTalkDetailHref,
  toolboxTalkRowsToInput,
  validateToolboxTalkParticipantRows,
  type ToolboxTalkParticipantRow,
} from "@/lib/toolbox-talks";
import { canCreateToolboxTalks } from "@/lib/permissions";

/**
 * Toolbox talk scheduling form. Talks are always site-bound. Attendees are
 * added as invited and acknowledgement is recorded after delivery.
 */
export function ToolboxTalkForm() {
  const router = useRouter();
  const me = useMe();
  const createTalk = useCreateToolboxTalk();
  const projects = useProjects();

  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [topic, setTopic] = useState("");
  const [discussionPoints, setDiscussionPoints] = useState("");
  const [facilitatorName, setFacilitatorName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [rows, setRows] = useState<ToolboxTalkParticipantRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const projectSites = useSites({ projectId, page: 1, limit: 100 });

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    if (!siteId) {
      nextErrors.siteId = "Choose an active site.";
    }

    if (!topic.trim()) {
      nextErrors.topic = "Give this talk a topic.";
    } else if (topic.trim().length > 300) {
      nextErrors.topic = "Keep the topic under 300 characters.";
    }

    if (!facilitatorName.trim()) {
      nextErrors.facilitatorName = "Record the facilitator's name.";
    } else if (facilitatorName.trim().length > 200) {
      nextErrors.facilitatorName =
        "Keep the facilitator name under 200 characters.";
    }

    if (!scheduledDate) {
      nextErrors.scheduledDate = "Choose when the talk is scheduled.";
    } else if (!Number.isFinite(new Date(scheduledDate).getTime())) {
      nextErrors.scheduledDate = "Enter a valid date and time.";
    }

    const duration = Number.parseInt(durationMinutes, 10);

    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
      nextErrors.durationMinutes =
        "Duration must be between 1 and 1,440 minutes.";
    }

    if (discussionPoints.trim().length > 5000) {
      nextErrors.discussionPoints =
        "Keep the discussion points under 5,000 characters.";
    }

    const participantError = validateToolboxTalkParticipantRows(rows);

    if (participantError) {
      nextErrors.participants = participantError;
    }

    return nextErrors;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setServerError("");

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const input: CreateToolboxTalkInput = {
      projectId,
      siteId,
      topic: topic.trim(),
      facilitatorName: facilitatorName.trim(),
      scheduledDate: new Date(scheduledDate).toISOString(),
      durationMinutes: Number.parseInt(durationMinutes, 10),
    };

    if (discussionPoints.trim()) {
      input.discussionPoints = discussionPoints.trim();
    }

    if (rows.length > 0) {
      input.participants = toolboxTalkRowsToInput(rows);
    }

    try {
      const result = await createTalk.mutateAsync(input);
      router.push(toolboxTalkDetailHref(result.talk.id));
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The toolbox talk could not be scheduled. Please try again.",
      );
    }
  }

  if (!me.isLoading && !canCreateToolboxTalks(me.data?.employee.ikoshRole)) {
    return (
      <ErrorState
        title="Access restricted"
        message="Toolbox talks can be scheduled by supervisors, HSE officers, HSE managers and administrators."
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title="Toolbox talk"
        description="Choose the site and facilitator. Attendees are invited first and acknowledgement is recorded after delivery."
      />
      <CardBody>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-5"
        >
          {serverError && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="toolbox-talk-project"
              value={projectId}
              error={errors.projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setSiteId("");
                setErrors((current) => ({
                  ...current,
                  projectId: "",
                  siteId: "",
                }));
              }}
              options={[
                { value: "", label: "Choose a project" },
                ...(projects.data?.projects ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.name} · ${project.code}`,
                })),
              ]}
              disabled={projects.isLoading}
            />

            <SelectField
              label="Site"
              id="toolbox-talk-site"
              value={siteId}
              error={errors.siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
                setErrors((current) => ({ ...current, siteId: "" }));
              }}
              options={[
                { value: "", label: "Choose an active site" },
                ...(projectSites.data?.sites ?? []).map((site) => ({
                  value: site.id,
                  label: `${site.name} · ${site.code}`,
                })),
              ]}
              disabled={!projectId || projectSites.isLoading}
              hint={
                projectId
                  ? "Contractor attendees must be assigned to this site."
                  : "Choose a project first."
              }
            />
          </div>

          <TextField
            label="Topic"
            id="toolbox-talk-topic"
            value={topic}
            error={errors.topic}
            onChange={(event) => {
              setTopic(event.target.value);
              setErrors((current) => ({ ...current, topic: "" }));
            }}
            maxLength={300}
            placeholder="e.g. Working near mobile plant"
          />

          <TextareaField
            label="Discussion points (optional)"
            id="toolbox-talk-discussion-points"
            value={discussionPoints}
            error={errors.discussionPoints}
            onChange={(event) => {
              setDiscussionPoints(event.target.value);
              setErrors((current) => ({ ...current, discussionPoints: "" }));
            }}
            rows={4}
            maxLength={5000}
            placeholder="Key hazards, controls and questions to cover."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Facilitator"
              id="toolbox-talk-facilitator"
              value={facilitatorName}
              error={errors.facilitatorName}
              onChange={(event) => {
                setFacilitatorName(event.target.value);
                setErrors((current) => ({ ...current, facilitatorName: "" }));
              }}
              maxLength={200}
              placeholder="Facilitator name"
            />

            <TextField
              label="Scheduled for"
              id="toolbox-talk-scheduled-date"
              type="datetime-local"
              value={scheduledDate}
              error={errors.scheduledDate}
              onChange={(event) => {
                setScheduledDate(event.target.value);
                setErrors((current) => ({ ...current, scheduledDate: "" }));
              }}
            />

            <TextField
              label="Duration (minutes)"
              id="toolbox-talk-duration"
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              error={errors.durationMinutes}
              onChange={(event) => {
                setDurationMinutes(event.target.value);
                setErrors((current) => ({ ...current, durationMinutes: "" }));
              }}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-navy-50/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">Attendees</p>
                <p className="text-sm leading-6 text-muted">
                  IKOSH employees and contractor personnel stay separate.
                  Contractor personnel must be currently assigned to the
                  selected site.
                </p>
              </div>
              <Badge tone="neutral">
                {rows.length} attendee{rows.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <ParticipantPicker
              siteId={siteId}
              exclude={rows.map((row) =>
                row.kind === "EMPLOYEE"
                  ? `employee:${row.employeeId}`
                  : `contractor:${row.contractorPersonnelId}`,
              )}
              onAdd={(picked) =>
                setRows((current) => [
                  ...current,
                  createToolboxTalkParticipantRow(picked),
                ])
              }
              disabled={!siteId}
            />

            {errors.participants && (
              <p role="alert" className="text-sm text-red-700">
                {errors.participants}
              </p>
            )}

            {rows.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {rows.map((row) => (
                  <li
                    key={row.key}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ParticipantKindBadge kind={row.kind} />
                      <span className="text-sm font-medium text-ink">
                        {row.name}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRows((current) =>
                          current.filter((entry) => entry.key !== row.key),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {!siteId && (
              <p className="text-xs text-muted">
                Select an active site before adding attendees.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={createTalk.isPending}>
              Schedule talk
            </Button>
            <Link href="/toolbox-talks" className={buttonStyles("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
