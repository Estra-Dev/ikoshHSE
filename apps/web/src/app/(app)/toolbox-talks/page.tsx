"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { ToolboxTalkPage } from "@/components/toolbox-talks/toolbox-talk-page";

export default function ToolboxTalksIndexPage() {
  return (
    <Suspense fallback={<Spinner label="Loading toolbox talks..." />}>
      <ToolboxTalkPage />
    </Suspense>
  );
}
