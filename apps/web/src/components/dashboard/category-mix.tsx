import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { HseCategoryCount } from "@/lib/api/types";
import {
  formatHseLabel,
  topCategoryCounts,
} from "@/lib/hse-dashboard";
import { DonutChart, type ChartSegment } from "./chart-panels";

function categoryHref(category: string, siteId: string): string {
  const base = category === "NEAR_MISS" ? "/near-misses" : "/incidents";
  const params = new URLSearchParams();
  if (siteId) {
    params.set("siteId", siteId);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function CategoryMix({
  categories,
  unclassified,
  siteId = "",
}: {
  categories: HseCategoryCount[];
  unclassified: number;
  siteId?: string;
}) {
  const { categories: visible, otherCount } = topCategoryCounts(categories, 6);
  const segments: ChartSegment[] = visible.map((category) => ({
    key: category.category,
    label: formatHseLabel(category.category),
    count: category.count,
    href: categoryHref(category.category, siteId),
  }));

  if (otherCount > 0) {
    segments.push({
      key: "OTHER",
      label: "Other categories",
      count: otherCount,
      href: categoryHref("OTHER", siteId),
    });
  }

  if (unclassified > 0) {
    segments.push({
      key: "UNCLASSIFIED",
      label: "Unclassified",
      count: unclassified,
      href: categoryHref("UNCLASSIFIED", siteId),
    });
  }

  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <Card>
      <CardHeader
        title="Incident categories"
        description="Management classification of reports in the selected scope."
        action={
          <Link
            href={categoryHref("ALL", siteId)}
            className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
          >
            View reports
          </Link>
        }
      />
      <CardBody>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No classified reports in this period.
          </p>
        ) : (
          <DonutChart segments={segments} total={total} totalLabel="Reports" />
        )}
      </CardBody>
    </Card>
  );
}
