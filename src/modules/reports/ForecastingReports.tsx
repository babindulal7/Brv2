import { PageHeader, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'

/*
 * RULING 2026-10-06: Forecasting & AI shows no figures until a validated model
 * exists (Law 16). It used to render hardcoded revenue, booking, shortage and
 * accuracy constants plus invented asset tables, and exported them to CSV as if
 * they were real. Revert = restore this file, `data/forecastingReports.ts` and
 * `lib/queries/forecastingReports.ts` from git history.
 * TODO(decision): which real figures (if any) belong here first.
 */
export default function ForecastingReports() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Forecasting & AI"
        description="Predictive models for revenue, purchases, and maintenance."
      />
      <section aria-label="Forecasting status" style={cardStyle}>
        <EmptyState
          kind="nothing-yet"
          title="Not computed yet"
          description="No validated forecast model backs this report, so it shows no figures rather than invented ones."
        />
      </section>
    </div>
  )
}
