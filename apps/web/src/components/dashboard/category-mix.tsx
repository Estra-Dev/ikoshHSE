import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { HseCategoryCount } from "@/lib/api/types";
import { formatHseLabel, topCategoryCounts } from "@/lib/hse-dashboard";

function CategoryRow({
  label,
  count,
  max,
  barClass,
}: {
  label: string;
  count: number;
  max: number;
  barClass: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-ink">{label}</span>
        <span className="tabular text-sm font-semibold text-ink">{count}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-100">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${(count / max) * 100}%` }}
        />
      </div>
    </li>
  );
}

export function CategoryMix({
  categories,
  unclassified,
}: {
  categories: HseCategoryCount[];
  unclassified: number;
}) {
  const { categories: visible, otherCount } = topCategoryCounts(categories, 6);
  const max = Math.max(
    ...visible.map((category) => category.count),
    otherCount,
    unclassified,
    1,
  );
  const isEmpty = visible.length === 0 && unclassified === 0;

  return (
    <Card>
      <CardHeader
        title="Incident categories"
        description="Management classification of reports in the selected scope."
      />
      <CardBody>
        {isEmpty ? (
          <p className="py-8 text-center text-sm text-muted">
            No classified reports in this period.
          </p>
        ) : (
          <ul className="space-y-4">
            {visible.map((category) => (
              <CategoryRow
                key={category.category}
                label={formatHseLabel(category.category)}
                count={category.count}
                max={max}
                barClass="bg-navy-700"
              />
            ))}

            {otherCount > 0 && (
              <CategoryRow
                label="Other categories"
                count={otherCount}
                max={max}
                barClass="bg-navy-400"
              />
            )}

            {unclassified > 0 && (
              <CategoryRow
                label="Unclassified"
                count={unclassified}
                max={max}
                barClass="bg-amber-500"
              />
            )}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
