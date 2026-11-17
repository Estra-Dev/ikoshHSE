"use client";

import { ErrorState, Spinner } from "@/components/ui/feedback";
import { useMe } from "@/lib/api/employees";
import { canViewToolboxTalks } from "@/lib/permissions";
import { MyToolboxTalkHistory } from "./my-toolbox-talk-history";
import { ToolboxTalkRegister } from "./toolbox-talk-register";

/**
 * Toolbox talk entry point. HSE staff receive the site-scoped register; every
 * other employee receives only their own participation history.
 */
export function ToolboxTalkPage() {
  const me = useMe();

  if (me.isLoading) {
    return <Spinner label="Checking toolbox talk access..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (canViewToolboxTalks(me.data?.employee.ikoshRole)) {
    return <ToolboxTalkRegister />;
  }

  return <MyToolboxTalkHistory />;
}
