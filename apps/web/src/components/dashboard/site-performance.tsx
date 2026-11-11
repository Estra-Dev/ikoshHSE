import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import type { HseDashboard, SiteSummary } from "@/lib/api/types";
import {
  deriveDashboardKpis,
  type DashboardKpis,
} from "@/lib/hse-dashboard";

function Metric({
  value,
  loading,
}: {
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <span className="tabular text-sm font-semibold text-ink">
      {value !== undefined ? value : loading ? "…" : "—"}
    </span>
  );
}

function SiteRow({
  site,
  kpis,
  isLoading,
}: {
  site: SiteSummary;
  kpis: DashboardKpis | null;
  isLoading: boolean;
}) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-5 py-3 text-left font-medium text-ink">
        <span className="block max-w-[220px] truncate text-sm">
          {site.name}
        </span>
        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.08em] text-muted">
          {site.code}
        </span>
      </th>
      <td className="px-5 py-3 text-right">
        <Metric value={kpis?.totalReports} loading={isLoading} />
      </td>
      <td className="px-5 py-3 text-right">
        <Metric value={kpis?.incidents} loading={isLoading} />
      </td>
      <td className="px-5 py-3 text-right">
        <Metric value={kpis?.nearMisses} loading={isLoading} />
      </td>
      <td className="px-5 py-3 text-right">
        <Metric value={kpis?.openCases} loading={isLoading} />
      </td>
    </tr>
  );
}

/**
 * Bounded site comparison. The overall scope aggregate is shown as a baseline
 * against at most four per-site aggregates; no other site data is requested.
 */
export function SitePerformance({
  sites,
  dashboards,
  overall,
  totalSites,
  isLoading,
  failedSites,
  siteFilterActive,
}: {
  sites: readonly SiteSummary[];
  dashboards: readonly (HseDashboard | undefined)[];
  overall: HseDashboard | undefined;
  totalSites: number;
  isLoading: boolean;
  failedSites: number;
  siteFilterActive: boolean;
}) {
  if (siteFilterActive) {
    return (
      <Card>
        <CardHeader
          title="Site performance"
          description="Compare HSE reporting across sites in the selected scope."
        />
        <CardBody>
          <p className="py-8 text-center text-sm leading-6 text-muted">
            Site comparison is paused while the dashboard is filtered to a
            single site. Clear the site filter to compare up to four sites.
          </p>
        </CardBody>
      </Card>
    );
  }

  const overallKpis = deriveDashboardKpis(overall);

  return (
    <Card>
      <CardHeader
        title="Site performance"
        description="Reporting position of up to four sites against the overall scope."
        action={
          <Badge tone="neutral">
            {sites.length} of {totalSites} site{totalSites === 1 ? "" : "s"}
          </Badge>
        }
      />

      {sites.length === 0 ? (
        <CardBody>
          <p className="py-8 text-center text-sm leading-6 text-muted">
            {isLoading
              ? "Loading sites in scope…"
              : "No accessible sites in this scope. Site assignments and the selected project determine which sites are available."}
          </p>
        </CardBody>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <caption className="sr-only">
                HSE reporting by site, compared with the overall dashboard
                scope
              </caption>
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <th scope="col" className="px-5 py-3 text-left">
                    Site
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Reports
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Incidents
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Near misses
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line bg-navy-50/60">
                  <th scope="row" className="px-5 py-3 text-left">
                    <span className="block text-sm font-semibold text-ink">
                      Scope total
                    </span>
                    <span className="mt-0.5 block text-[11px] uppercase tracking-[0.08em] text-muted">
                      All sites in scope
                    </span>
                  </th>
                  <td className="px-5 py-3 text-right">
                    <Metric
                      value={overallKpis?.totalReports}
                      loading={isLoading}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Metric
                      value={overallKpis?.incidents}
                      loading={isLoading}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Metric
                      value={overallKpis?.nearMisses}
                      loading={isLoading}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Metric
                      value={overallKpis?.openCases}
                      loading={isLoading}
                    />
                  </td>
                </tr>

                {sites.map((site, index) => (
                  <SiteRow
                    key={site.id}
                    site={site}
                    kpis={deriveDashboardKpis(dashboards[index])}
                    isLoading={isLoading}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <CardFooter className="space-y-1">
            <p className="text-xs leading-5 text-muted">
              Sites are listed alphabetically from the accessible site list.
              {totalSites > sites.length
                ? ` Refine the project filter to compare other sites.`
                : ""}
            </p>
            {failedSites > 0 && (
              <p className="text-xs leading-5 text-amber-700">
                {failedSites === 1
                  ? "One site aggregate could not be loaded. Its cells show a dash."
                  : `${failedSites} site aggregates could not be loaded. Their cells show a dash.`}
              </p>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}
