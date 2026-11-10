import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-700 text-white hover:bg-blue-800 disabled:hover:bg-blue-700",
  secondary:
    "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
  danger:
    "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40",
  ghost:
    "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}

interface ActionLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function ActionLink({ href, children, className = "" }: ActionLinkProps) {
  return (
    <a
      href={href}
      className={`rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800 ${className}`}
    >
      {children}
    </a>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-700" />
      {label ?? "Loading..."}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
        {title}
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {message ?? "Please try again."}
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </p>
      {description && (
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      )}
    </div>
  );
}
