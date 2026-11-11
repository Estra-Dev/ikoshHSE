import type { ButtonHTMLAttributes, ReactNode } from "react";
import { InfoIcon } from "@/components/icons";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-navy-900 text-white shadow-sm hover:bg-navy-800 active:bg-navy-950 disabled:hover:bg-navy-900",
  secondary:
    "border border-line bg-surface text-navy-800 hover:border-navy-200 hover:bg-navy-50 active:bg-navy-100",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:hover:bg-red-600",
  ghost: "text-muted hover:bg-navy-50 hover:text-navy-900",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

/** Shared button classes for links that must look like buttons. */
export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonStyles(variant, size, className)}
    >
      {isLoading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

interface ActionLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ActionLink({
  href,
  children,
  className = "",
  variant = "primary",
  size = "md",
}: ActionLinkProps) {
  return (
    <a href={href} className={buttonStyles(variant, size, className)}>
      {children}
    </a>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-10 text-sm text-muted"
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-navy-800"
      />
      <span>{label ?? "Loading..."}</span>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-red-200 bg-surface p-6 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <InfoIcon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-red-700">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {message ?? "Please try again."}
          </p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-navy-200 bg-surface/60 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-navy-900">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
