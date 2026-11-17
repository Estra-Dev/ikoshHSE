"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { ToolboxTalkForm } from "@/components/toolbox-talks/toolbox-talk-form";

export default function NewToolboxTalkPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="Schedule toolbox talk"
        description="Plan a site briefing, record the facilitator and invite employees and contractor personnel."
        actions={
          <Link href="/toolbox-talks" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <ToolboxTalkForm />
    </div>
  );
}
