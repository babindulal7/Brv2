import { LANGUAGE_LABEL, coverage } from '../../../lib/i18n'
import { BRANCH } from '../../../data/nav'
import type { Section } from './shared'

/**
 * **Settings ▸ Organisation** — §11.2: *"name, VAT, description · languages,
 * calendar, timezone, number format, units"*. Every one of those eight is a row
 * below; nothing was added and nothing was dropped.
 *
 * ⚠ 15 Aug — the "Translations" row was DELETED, not moved. It carried no
 * value and no destination; its whole content was that the string catalogue
 * has no screen. Twelve rows like it across the old eight tabs were the single
 * largest reason Settings read as heavy: a row that exists to report its own
 * absence is one the reader must process and then discard. The catalogue is no
 * less missing for the row being gone.
 *
 * Four of them are **product laws, not settings**. Foundation fixes each, no
 * other branch is implemented anywhere in the app, and the select that used to
 * sit on them opened nothing. They keep their value and gain the reason; they
 * never gain an input.
 */

/** Computed once — the Language row reports the real gap rather than a claim. */
const NE_COVERAGE = coverage('ne')

export const ORGANISATION_SECTIONS: Section[] = [
  {
    key: 'general',
    title: 'General',
    icon: 'settings',
    fields: [
      {
        label: 'Organisation name',
        note: 'Shown on documents and the sidebar.',
        settingKey: 'organisationName',
        readBy: 'every generated document header',
      },
      {
        label: 'Branch',
        note: 'The operating branch for this session.',
        value: BRANCH.address,
        readOnlyWhy: 'The active branch is chosen per session, not set here. Manage the list on the Branches & Warehouses tab.',
      },
      { label: 'VAT number', note: 'Printed on tax invoices.', settingKey: 'vatNumber', readBy: 'the invoice header' },
      { label: 'Business description', note: 'One line, used on quotes and the portal.', settingKey: 'businessDescription' },
    ],
  },
  {
    key: 'localization',
    title: 'Languages & Localization',
    icon: 'calendar',
    fields: [
      {
        label: 'Calendar mode',
        note: 'BS leads AD everywhere. Latin digits always.',
        value: 'BS + AD (Default)',
        readOnlyWhy: 'Foundation §4.2 — every date shows both calendars. There is no single-calendar mode to switch to.',
      },
      {
        label: 'Language',
        /* Ruled 12 Aug 2026 (PLAN.md §4.26). The catalogue reached 100%, Asar
           and Hind are installed, and `canEnable('ne')` now returns true — so
           this stopped being a read-only row with an excuse and became a real
           setting. `lib/i18n.ts` still owns the gate; if coverage ever
           regresses below 100% the option disappears again on its own. */
        note: `English and ${LANGUAGE_LABEL.ne}. Nepali is at ${NE_COVERAGE.percent}% coverage (${NE_COVERAGE.translated}/${NE_COVERAGE.total} strings); numbers, IDs and NPR stay Latin in both.`,
        settingKey: 'language',
      },
      {
        label: 'Timezone',
        note: 'All dates are stored in UTC and rendered here.',
        value: 'Asia/Kathmandu (UTC+05:45)',
        readOnlyWhy: 'Law 7 — storage is UTC and rendering is Kathmandu. Neither is configurable; a second zone would need every screen re-checked.',
      },
      { label: 'Week starts', note: 'Saturday is the weekend in Nepal.', settingKey: 'weekStarts' },
      {
        /* D4, ruled 30 Aug 2026 (REFERENCE_SPEC v2.5 Appendix A0): the rental
           day runs 06:00→06:00 as a setting. Read by the day boundaries in
           queries/bookings.ts — Dashboard panels, Operations day scope and the
           pickups drill-down all move with it. 00:00 = plain calendar days. */
        label: 'Operational day starts',
        note: "The floor's day. Today's pickups and returns run from this time today to this time tomorrow — a 05:30 return belongs to yesterday's day.",
        settingKey: 'operationalDayStart',
        readBy: 'every "today" list — Dashboard, Operations, the pickups report',
      },
      {
        label: 'Number format',
        note: 'South Asian grouping — Rs 1,85,000.',
        value: 'Lakh / crore grouping',
        readOnlyWhy: '`lib/money.ts` groups this way and nothing else. Changing it is a code change, not a setting.',
      },
      {
        label: 'Units',
        note: 'Weights on gate passes and transport dockets.',
        value: 'Metric (kg, cm)',
        readOnlyWhy: 'No imperial rendering is implemented anywhere in the app.',
      },
    ],
  },
]
