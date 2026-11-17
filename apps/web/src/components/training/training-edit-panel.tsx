"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useTrainingCourses,
  useUpdateTrainingSession,
} from "@/lib/api/training";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  TrainingSessionSummary,
  UpdateTrainingSessionInput,
} from "@/lib/api/types";
import { toDateTimeLocalValue } from "@/lib/training";

/**
 * Scheduled-session editor. Attendance and status have dedicated controls; this
 * panel only changes catalogue and scheduling metadata.
 */
export function TrainingEditPanel({
  session,
  onDone,
  onCancel,
}: {
  session: TrainingSessionSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const updateSession = useUpdateTrainingSession();
  const courses = useTrainingCourses();
  const projects = useProjects();

  const [courseId, setCourseId] = useState(session.course.id);
  const [projectId, setProjectId] = useState(session.project.id);
  const [siteId, setSiteId] = useState(session.site.id);
  const [topic, setTopic] = useState(session.topic);
  const [description, setDescription] = useState(session.description);
  const [trainerName, setTrainerName] = useState(session.trainerName);
  const [scheduledDate, setScheduledDate] = useState(
    toDateTimeLocalValue(session.scheduledDate),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    String(session.durationMinutes),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const sites = useSites({ projectId, page: 1, limit: 100 });
  const courseOptions = courses.data?.courses ?? [];
  const currentCourseMissing = !courseOptions.some(
    (course) => course.id === session.course.id,
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");

    const nextErrors: Record<string, string> = {};

    if (!projectId) nextErrors.projectId = "Choose a project.";
    if (!siteId) nextErrors.siteId = "Choose an active site.";
    if (!topic.trim()) nextErrors.topic = "Give this session a topic.";

    if (!trainerName.trim()) {
      nextErrors.trainerName = "Record the trainer's name.";
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

    const input: UpdateTrainingSessionInput = {
      topic: topic.trim(),
      description: description.trim(),
      trainerName: trainerName.trim(),
      scheduledDate: new Date(scheduledDate).toISOString(),
      durationMinutes: Number.parseInt(durationMinutes, 10),
    };

    if (courseId && courseId !== session.course.id) {
      input.courseId = courseId;
    }

    if (projectId !== session.project.id) {
      input.projectId = projectId;
    }

    if (siteId !== session.site.id) {
      input.siteId = siteId;
    }

    try {
      await updateSession.mutateAsync({ id: session.id, input });
      onDone();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The session could not be updated.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Edit session"
        description="Update the course, site or schedule while the session is still scheduled."
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
              label="Course"
              id="training-edit-course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              options={[
                ...(currentCourseMissing && session.course.title
                  ? [
                      {
                        value: session.course.id,
                        label: `${session.course.title} (current)`,
                      },
                    ]
                  : []),
                ...courseOptions.map((course) => ({
                  value: course.id,
                  label: `${course.title} · ${course.code}`,
                })),
              ]}
              disabled={courses.isLoading}
            />

            <TextField
              label="Topic"
              id="training-edit-topic"
              value={topic}
              error={errors.topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={300}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="training-edit-project"
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
              id="training-edit-site"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Trainer"
              id="training-edit-trainer"
              value={trainerName}
              error={errors.trainerName}
              onChange={(event) => setTrainerName(event.target.value)}
              maxLength={200}
            />

            <TextField
              label="Scheduled for"
              id="training-edit-scheduled-date"
              type="datetime-local"
              value={scheduledDate}
              error={errors.scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Duration (minutes)"
              id="training-edit-duration"
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              error={errors.durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />

            <TextareaField
              label="Description"
              id="training-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={updateSession.isPending}>
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
