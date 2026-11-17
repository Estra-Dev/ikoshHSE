"use client";

import { ErrorState, Spinner } from "@/components/ui/feedback";
import { useMe } from "@/lib/api/employees";
import { canViewTraining } from "@/lib/permissions";
import { MyTrainingHistory } from "./my-training-history";
import { TrainingRegister } from "./training-register";

/**
 * Training entry point. HSE staff receive the site-scoped register; every
 * other employee receives only their own participation history.
 */
export function TrainingPage() {
  const me = useMe();

  if (me.isLoading) {
    return <Spinner label="Checking training access..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (canViewTraining(me.data?.employee.ikoshRole)) {
    return <TrainingRegister />;
  }

  return <MyTrainingHistory />;
}
