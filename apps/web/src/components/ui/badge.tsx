import type { ReactNode } from "react";

type BadgeTone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  green:
    "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300",
  amber:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  violet:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
