"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { useUpdateToolboxTalk } from "@/lib/api/toolbox-talks";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  ToolboxTalkSummary,
  UpdateToolboxTalkInput,
} from "@/lib/api/types";
import { toDateTimeLocalValue } from "@/lib/training";

/**
 * Scheduled-talk editor. Attendance and status have dedicated controls; this
 * panel only changes content and scheduling metadata.
 */
export function ToolboxTalkEditPanel({
  talk,
  onDone,
  onCancel,
}: {
  talk: ToolboxTalkSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const updateTalk = useUpdateToolboxTalk();
  const projects = useProjects();

  const [projectId, setProjectId] = useState(talk.project.id);
  const [siteId, setSiteId] = useState(talk.site.id);
  const [topic, setTopic] = useState(talk.topic);
  const [discussionPoints, setDiscussionPoints] = useState(
    talk.discussionPoints,
  );
  const [facilitatorName, setFacilitatorName] = useState(talk.facilitatorName);
  const [scheduledDate, setScheduledDate] = useState(
    toDateTimeLocalValue(talk.scheduledDate),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    String(talk.durationMinutes),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const sites = useSites({ projectId, page: 1, limit: 100 });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");

    const nextErrors: Record<string, string> = {};

    if (!projectId) nextErrors.projectId = "Choose a project.";
    if (!siteId) nextErrors.siteId = "Choose an active site.";
    if (!topic.trim()) nextErrors.topic = "Give this talk a topic.";

    if (!facilitatorName.trim()) {
      nextErrors.facilitatorName = "Record the facilitator's name.";
    }

    if (!scheduledDate || !Number.isFinite(new Date(scheduledDate).getTime())) {
      nextErrors.scheduledDate = "Enter a valid date and time.";
    }

    const duration = Number.parseInt(durationMinutes, 10);

    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
      nextErrors.durationMinutes =
        "Duration must be between 1 and 1,440 minutes.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const input: UpdateToolboxTalkInput = {
      topic: topic.trim(),
      discussionPoints: discussionPoints.trim(),
      facilitatorName: facilitatorName.trim(),
      scheduledDate: new Date(scheduledDate).toISOString(),
      durationMinutes: Number.parseInt(durationMinutes, 10),
    };

    if (projectId !== talk.project.id) {
      input.projectId = projectId;
    }

    if (siteId !== talk.site.id) {
      input.siteId = siteId;
    }

    try {
      await updateTalk.mutateAsync({ id: talk.id, input });
      onDone();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The talk could not be updated.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Edit talk"
        description="Update the site, facilitator or schedule while the talk is still scheduled."
      />
      <CardBody>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-5"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="toolbox-talk-edit-project"
              value={projectId}
              error={errors.projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setSiteId("");
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
              id="toolbox-talk-edit-site"
              value={siteId}
              error={errors.siteId}
              onChange={(event) => setSiteId(event.target.value)}
              options={[
                { value: "", label: "Choose an active site" },
                ...(sites.data?.sites ?? []).map((site) => ({
                  value: site.id,
                  label: `${site.name} · ${site.code}`,
                })),
              ]}
              disabled={!projectId || sites.isLoading}
            />
          </div>

          <TextField
            label="Topic"
            id="toolbox-talk-edit-topic"
            value={topic}
            error={errors.topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={300}
          />

          <TextareaField
            label="Discussion points"
            id="toolbox-talk-edit-discussion-points"
            value={discussionPoints}
            onChange={(event) => setDiscussionPoints(event.target.value)}
            rows={4}
            maxLength={5000}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Facilitator"
              id="toolbox-talk-edit-facilitator"
              value={facilitatorName}
              error={errors.facilitatorName}
              onChange={(event) => setFacilitatorName(event.target.value)}
              maxLength={200}
            />

            <TextField
              label="Scheduled for"
              id="toolbox-talk-edit-scheduled-date"
              type="datetime-local"
              value={scheduledDate}
              error={errors.scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
            />

            <TextField
              label="Duration (minutes)"
              id="toolbox-talk-edit-duration"
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              error={errors.durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={updateTalk.isPending}>
              Save changes
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
