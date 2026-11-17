import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type { TrainingCourseCategory } from "@/lib/api/types";

const CATEGORY_TONES: Record<TrainingCourseCategory, BadgeTone> = {
  INDUCTION: "navy",
  PPE: "blue",
  WORK_AT_HEIGHT: "violet",
  CONFINED_SPACE: "amber",
  FIRE_SAFETY: "red",
  FIRST_AID: "green",
  PERMIT_TO_WORK: "blue",
  ENVIRONMENTAL: "green",
  DRIVING: "neutral",
  OTHER: "neutral",
};

export function TrainingCourseCategoryBadge({
  category,
}: {
  category: TrainingCourseCategory;
}) {
  return (
    <Badge tone={CATEGORY_TONES[category]}>
      {formatHseLabel(category)}
    </Badge>
  );
}

export function TrainingCourseStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge tone={isActive ? "green" : "neutral"} dot>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}
