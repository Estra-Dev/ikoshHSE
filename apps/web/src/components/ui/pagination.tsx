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
      <p className="text-sm text-muted">
        Showing <span className="tabular font-medium text-ink">{from}</span>–
        <span className="tabular font-medium text-ink">{to}</span> of{" "}
        <span className="tabular font-medium text-ink">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="px-1 text-sm text-muted">
          Page <span className="tabular font-medium text-ink">{page}</span> of{" "}
          <span className="tabular font-medium text-ink">{totalPages}</span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
