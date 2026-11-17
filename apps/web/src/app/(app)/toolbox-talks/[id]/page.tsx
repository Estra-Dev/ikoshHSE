"use client";

import { useParams } from "next/navigation";
import { ToolboxTalkDetail } from "@/components/toolbox-talks/toolbox-talk-detail";

export default function ToolboxTalkDetailPage() {
  const params = useParams<{ id: string }>();

  return <ToolboxTalkDetail talkId={params.id} />;
}
