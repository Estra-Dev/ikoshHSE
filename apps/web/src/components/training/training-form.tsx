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
import {
  ParticipantKindBadge,
} from "@/components/attendance-records/attendance-badges";
import { useMe } from "@/lib/api/employees";
import {
  useCreateTrainingSession,
  useTrainingCourses,
} from "@/lib/api/training";
import { useProjects, useSites } from "@/lib/api/worksites";
import type { CreateTrainingSessionInput } from "@/lib/api/types";
import {
  createTrainingParticipantRow,
  trainingDetailHref,
  trainingRowsToInput,
  validateTrainingParticipantRows,
  type TrainingParticipantRow,
} from "@/lib/training";
import { canCreateTraining } from "@/lib/permissions";

/**
 * Training scheduling form. Training is always site-bound: the site must be
 * active and belong to the selected project. Attendees are added as invited
 * and attendance is recorded after the session.
 */
export function TrainingForm() {
  const router = useRouter();
  const me = useMe();
  const createSession = useCreateTrainingSession();
  const courses = useTrainingCourses();
  const projects = useProjects();

  const [courseId, setCourseId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [rows, setRows] = useState<TrainingParticipantRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const projectSites = useSites({ projectId, page: 1, limit: 100 });

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!courseId) {
      nextErrors.courseId = "Choose a training course.";
    }

    if (!projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    if (!siteId) {
      nextErrors.siteId = "Choose an active site.";
    }

    if (!topic.trim()) {
      nextErrors.topic = "Give this session a topic.";
    } else if (topic.trim().length > 300) {
      nextErrors.topic = "Keep the topic under 300 characters.";
    }

    if (!trainerName.trim()) {
      nextErrors.trainerName = "Record the trainer's name.";
    } else if (trainerName.trim().length > 200) {
      nextErrors.trainerName = "Keep the trainer name under 200 characters.";
    }

    if (!scheduledDate) {
      nextErrors.scheduledDate = "Choose when the session is scheduled.";
    } else if (!Number.isFinite(new Date(scheduledDate).getTime())) {
      nextErrors.scheduledDate = "Enter a valid date and time.";
    }

    const duration = Number.parseInt(durationMinutes, 10);

    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
      nextErrors.durationMinutes =
        "Duration must be between 1 and 1,440 minutes.";
    }

    if (description.trim().length > 5000) {
      nextErrors.description = "Keep the description under 5,000 characters.";
    }

    const participantError = validateTrainingParticipantRows(rows);

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

    const input: CreateTrainingSessionInput = {
      courseId,
      projectId,
      siteId,
      topic: topic.trim(),
      trainerName: trainerName.trim(),
      scheduledDate: new Date(scheduledDate).toISOString(),
      durationMinutes: Number.parseInt(durationMinutes, 10),
    };

    if (description.trim()) {
      input.description = description.trim();
    }

    if (rows.length > 0) {
      input.participants = trainingRowsToInput(rows);
    }

    try {
      const result = await createSession.mutateAsync(input);
      router.push(trainingDetailHref(result.session.id));
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The training session could not be scheduled. Please try again.",
      );
    }
  }

  const role = me.data?.employee.ikoshRole;

  if (!me.isLoading && !canCreateTraining(role)) {
    return (
      <ErrorState
        title="Access restricted"
        message="Training sessions can be scheduled by HSE officers, HSE managers and administrators."
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title="Training session"
        description="Choose the course, site and trainer. Attendees are invited first and attendance is recorded after delivery."
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
              label="Course"
              id="training-course"
              value={courseId}
              error={errors.courseId}
              onChange={(event) => {
                const nextCourseId = event.target.value;
                setCourseId(nextCourseId);
                setErrors((current) => ({ ...current, courseId: "" }));
                const course = (courses.data?.courses ?? []).find(
                  (entry) => entry.id === nextCourseId,
                );

                if (course?.defaultDurationMinutes) {
                  setDurationMinutes(String(course.defaultDurationMinutes));
                }

                if (course && !topic.trim()) {
                  setTopic(course.title);
                }
              }}
              options={[
                { value: "", label: "Choose an active course" },
                ...(courses.data?.courses ?? []).map((course) => ({
                  value: course.id,
                  label: `${course.title} · ${course.code}`,
                })),
              ]}
              disabled={courses.isLoading}
              hint="Only active catalogue courses can be scheduled."
            />

            <TextField
              label="Topic"
              id="training-topic"
              value={topic}
              error={errors.topic}
              onChange={(event) => {
                setTopic(event.target.value);
                setErrors((current) => ({ ...current, topic: "" }));
              }}
              maxLength={300}
              placeholder="e.g. Scaffold erection refresher"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="training-project"
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
              id="training-site"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Trainer"
              id="training-trainer"
              value={trainerName}
              error={errors.trainerName}
              onChange={(event) => {
                setTrainerName(event.target.value);
                setErrors((current) => ({ ...current, trainerName: "" }));
              }}
              maxLength={200}
              placeholder="Trainer name"
            />

            <TextField
              label="Scheduled for"
              id="training-scheduled-date"
              type="datetime-local"
              value={scheduledDate}
              error={errors.scheduledDate}
              onChange={(event) => {
                setScheduledDate(event.target.value);
                setErrors((current) => ({ ...current, scheduledDate: "" }));
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Duration (minutes)"
              id="training-duration"
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

            <TextareaField
              label="Description (optional)"
              id="training-description"
              value={description}
              error={errors.description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((current) => ({ ...current, description: "" }));
              }}
              rows={3}
              maxLength={5000}
              placeholder="What will the session cover?"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-navy-50/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">Attendees</p>
                <p className="text-sm leading-6 text-muted">
                  IKOSH employees and contractor personnel stay separate. Contractor
                  personnel must be currently assigned to the selected site.
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
                  createTrainingParticipantRow(picked),
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

          {courses.isError && (
            <p role="alert" className="text-sm text-red-700">
              Unable to load training courses.{" "}
              {courses.error instanceof Error ? courses.error.message : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={createSession.isPending}>
              Schedule training
            </Button>
            <Link href="/training" className={buttonStyles("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
