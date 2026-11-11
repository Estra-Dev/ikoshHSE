export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-navy-100/80 ${className}`}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={`h-3 animate-pulse rounded bg-navy-100/80 ${
            index === lines - 1 ? "w-2/3" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}
