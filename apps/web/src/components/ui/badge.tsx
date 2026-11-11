import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "navy"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "violet";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-navy-50 text-navy-700 ring-navy-100",
  navy: "bg-navy-900 text-white ring-navy-900",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-navy-400",
  navy: "bg-white",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`}
        />
      )}
      {children}
    </span>
  );
}
