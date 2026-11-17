"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Button,
  buttonStyles,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { Badge } from "@/components/ui/badge";
import { PlusIcon, RefreshIcon } from "@/components/icons";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import { useMe } from "@/lib/api/employees";
import {
  useCreateTrainingCourse,
  useTrainingCourses,
  useUpdateTrainingCourse,
} from "@/lib/api/training";
import {
  TRAINING_COURSE_CATEGORIES,
  type TrainingCourseCategory,
  type TrainingCourseSummary,
} from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { canManageTraining } from "@/lib/permissions";
import {
  TrainingCourseCategoryBadge,
  TrainingCourseStatusBadge,
} from "./training-badges";

const COURSE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

interface CourseDraft {
  code: string;
  title: string;
  category: TrainingCourseCategory;
  defaultDurationMinutes: string;
  description: string;
}

const EMPTY_DRAFT: CourseDraft = {
  code: "",
  title: "",
  category: "INDUCTION",
  defaultDurationMinutes: "",
  description: "",
};

function draftFromCourse(course: TrainingCourseSummary): CourseDraft {
  return {
    code: course.code,
    title: course.title,
    category: course.category,
    defaultDurationMinutes:
      course.defaultDurationMinutes === null
        ? ""
        : String(course.defaultDurationMinutes),
    description: course.description,
  };
}

/**
 * Training course catalogue. Courses are never hard-deleted: deactivating hides
 * them from new sessions while preserving every historical session.
 */
export function TrainingCourseManager() {
  const me = useMe();
  const createCourse = useCreateTrainingCourse();
  const updateCourse = useUpdateTrainingCourse();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const courses = useTrainingCourses({ q: search, includeInactive: true });

  const [editing, setEditing] = useState<TrainingCourseSummary | null>(null);
  const [draft, setDraft] = useState<CourseDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const items = courses.data?.courses ?? [];
  const canManage = canManageTraining(me.data?.employee.ikoshRole);

  function resetForm(): void {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setErrors({});
  }

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};
    const code = draft.code.trim();

    if (!editing) {
      if (!code) {
        nextErrors.code = "Enter a course code.";
      } else if (code.length < 2 || code.length > 32) {
        nextErrors.code = "Course code must be 2–32 characters.";
      } else if (!COURSE_CODE_PATTERN.test(code)) {
        nextErrors.code =
          "Use letters, digits, dashes and underscores only, starting with a letter or digit.";
      }
    }

    if (!draft.title.trim()) {
      nextErrors.title = "Enter a course title.";
    } else if (draft.title.trim().length > 200) {
      nextErrors.title = "Keep the title under 200 characters.";
    }

    if (draft.defaultDurationMinutes.trim()) {
      const duration = Number.parseInt(draft.defaultDurationMinutes, 10);

      if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
        nextErrors.defaultDurationMinutes =
          "Duration must be between 1 and 1,440 minutes.";
      }
    }

    if (draft.description.trim().length > 2000) {
      nextErrors.description = "Keep the description under 2,000 characters.";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFeedback("");

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const duration = draft.defaultDurationMinutes.trim()
      ? Number.parseInt(draft.defaultDurationMinutes, 10)
      : undefined;

    try {
      if (editing) {
        await updateCourse.mutateAsync({
          id: editing.id,
          input: {
            title: draft.title.trim(),
            category: draft.category,
            ...(duration !== undefined
              ? { defaultDurationMinutes: duration }
              : {}),
            description: draft.description.trim(),
          },
        });
        setFeedback("Course updated.");
      } else {
        await createCourse.mutateAsync({
          code: draft.code.trim(),
          title: draft.title.trim(),
          category: draft.category,
          ...(duration !== undefined
            ? { defaultDurationMinutes: duration }
            : {}),
          ...(draft.description.trim()
            ? { description: draft.description.trim() }
            : {}),
        });
        setFeedback("Course created.");
      }

      resetForm();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The course could not be saved.",
      );
    }
  }

  async function toggleActive(course: TrainingCourseSummary): Promise<void> {
    setError("");
    setFeedback("");

    try {
      await updateCourse.mutateAsync({
        id: course.id,
        input: { isActive: !course.isActive },
      });
      setFeedback(
        `${course.title} ${course.isActive ? "deactivated" : "activated"}.`,
      );
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The course status could not be changed.",
      );
    }
  }

  if (!me.isLoading && !canManage) {
    return (
      <ErrorState
        title="Access restricted"
        message="The training course catalogue is managed by HSE managers and administrators."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Courses are reusable reference data. Deactivating a course keeps every
          historical session intact.
        </p>
        <Link href="/training" className={buttonStyles("secondary")}>
          Back to register
        </Link>
      </div>

      <Card>
        <CardHeader
          title={editing ? `Edit ${editing.title}` : "New course"}
          description={
            editing
              ? "Course codes are permanent; title, category and availability can change."
              : "Add a reusable course to the HSE catalogue."
          }
          action={
            editing ? (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : (
              <Badge tone="neutral">Catalogue</Badge>
            )
          }
        />
        <CardBody>
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-4"
          >
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            {feedback && (
              <p
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                {feedback}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField
                label="Course code"
                id="training-course-code"
                value={draft.code}
                error={errors.code}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))
                }
                maxLength={32}
                disabled={Boolean(editing)}
                placeholder="e.g. WAH-01"
              />

              <TextField
                label="Title"
                id="training-course-title"
                value={draft.title}
                error={errors.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={200}
              />

              <SelectField
                label="Category"
                id="training-course-category"
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as TrainingCourseCategory,
                  }))
                }
                options={TRAINING_COURSE_CATEGORIES.map((category) => ({
                  value: category,
                  label: formatHseLabel(category),
                }))}
              />

              <TextField
                label="Default duration (minutes)"
                id="training-course-duration"
                type="number"
                min={1}
                max={1440}
                value={draft.defaultDurationMinutes}
                error={errors.defaultDurationMinutes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    defaultDurationMinutes: event.target.value,
                  }))
                }
              />
            </div>

            <TextareaField
              label="Description (optional)"
              id="training-course-description"
              value={draft.description}
              error={errors.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              maxLength={2000}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                isLoading={createCourse.isPending || updateCourse.isPending}
              >
                <PlusIcon size={16} />
                {editing ? "Save course" : "Create course"}
              </Button>
              {editing && (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="space-y-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim().slice(0, 200));
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <TextField
              label="Search catalogue"
              id="training-course-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              maxLength={200}
              placeholder="Search code or title"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void courses.refetch()}
            isLoading={courses.isFetching}
          >
            <RefreshIcon size={16} />
            Refresh
          </Button>
        </form>

        {courses.isError && !courses.data ? (
          <ErrorState
            title="Unable to load the course catalogue"
            message={
              courses.error instanceof Error
                ? courses.error.message
                : "Please try again."
            }
          />
        ) : courses.isLoading ? (
          <Spinner label="Loading courses..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No courses found"
            description="Create a course above to start scheduling training."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TH scope="col">Course</TH>
                <TH scope="col">Category</TH>
                <TH scope="col">Default duration</TH>
                <TH scope="col">Status</TH>
                <TH scope="col">Actions</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((course) => (
                <TableRow key={course.id}>
                  <TD>
                    <p className="font-medium text-ink">{course.title}</p>
                    <p className="text-xs text-muted">{course.code}</p>
                  </TD>
                  <TD>
                    <TrainingCourseCategoryBadge
                      category={course.category}
                    />
                  </TD>
                  <TD className="text-muted">
                    {course.defaultDurationMinutes
                      ? `${course.defaultDurationMinutes} minutes`
                      : "—"}
                  </TD>
                  <TD>
                    <TrainingCourseStatusBadge isActive={course.isActive} />
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(course);
                          setDraft(draftFromCourse(course));
                          setErrors({});
                          setFeedback("");
                          setError("");
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant={course.isActive ? "ghost" : "secondary"}
                        size="sm"
                        onClick={() => void toggleActive(course)}
                        disabled={updateCourse.isPending}
                      >
                        {course.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
