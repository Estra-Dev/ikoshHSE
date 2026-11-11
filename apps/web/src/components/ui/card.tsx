import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  );
}

export function CardBody({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`px-5 py-5 ${className}`} />;
}

export function CardFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`border-t border-line px-5 py-4 ${className}`}
    />
  );
}
