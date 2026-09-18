import { Button, PageHeader, EmptyState } from '../../components/ui'
import { Unavailable } from '../../components/ui/Unavailable'

/**
 * **Presence Log & Timesheet.**
 *
 * This screen rendered four rows of `MOCK_TIMESHEET` — Ramesh 8.2h / 24 jobs,
 * Sita 8.5h / 18 jobs, Hari 9.0h / 4 jobs across 27–28 Jul 2026 — under column
 * headers reading "Hours Present" and "Jobs Completed", one row badged `Manual`
 * as though a correction had been made and audited. Attendance and job counts
 * are payroll-adjacent: those rows asserted that named people were present for
 * paid hours, and they were literals inside this component, not records.
 *
 * Nothing derives presence in this build — there is no timesheet query in
 * `src/lib/queries/`, no timesheet action in `src/actions/`, and no first/last
 * action feed to derive an hour from. So the screen states that it is unbuilt
 * instead of showing attendance nobody logged. (The hardcoded people in
 * `src/data/*.ts` are seed fixtures and stay: legitimate demo data. The
 * difference is that these were rendered as live records.)
 */

const WHY_UNBUILT =
  'Nothing in this build derives presence from first and last system actions, and no timesheet is stored, so there is no attendance to show.'

export default function Timesheet() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Presence Log & Timesheet"
        description="Specified to derive presence from first and last system actions, with every manual correction audited. Not built yet."
        actions={
          <>
            <Unavailable reason={`There is nothing to export — ${WHY_UNBUILT}`}>
              <Button disabled>Export CSV</Button>
            </Unavailable>
            <Unavailable reason="A manual correction is an audited payroll edit. It needs a timesheet to correct and an action to record the correction against a real user; this build has neither.">
              <Button variant="primary" disabled>
                Manual Correction
              </Button>
            </Unavailable>
          </>
        }
      />

      {/*
        Was: a Date / User / First Action / Last Action / Hours Present / Jobs
        Completed / Source table over `MOCK_TIMESHEET`, with a per-row "View
        Audit Log" button that opened nothing. The table is gone with the rows —
        an empty presence table would read as "nobody was present", which is
        itself a claim; this states that nothing is measured instead.
      */}
      <EmptyState title="Presence log — not built yet" description={WHY_UNBUILT} />
    </div>
  )
}
