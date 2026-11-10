import { Button } from "./feedback";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: PaginationProps) {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-zinc-500">
        Showing {from}-{to} of {total}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
