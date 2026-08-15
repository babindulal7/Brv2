import type { TabKey } from '../../../data/settings'
import type { Section } from './shared'
import { ORGANISATION_SECTIONS } from './Organisation'
import { SYSTEM_SECTIONS } from './System'

/**
 * **The split, in one map.** Two entries now, down from five.
 *
 * `Overview` and `Apps & API` are gone with their tabs; `Security` is two more
 * cards inside `SYSTEM_SECTIONS`. What is left is the row lists — a `Field[]`
 * per card — declared here so the config export can walk every setting on the
 * page without knowing which pane renders it.
 *
 * `FINANCIAL_SECTIONS` is deliberately NOT in this map. It is money end to end
 * and reaches the page through `FinancialPane`, which `Settings.tsx` renders
 * only for a session that can see money — Law 6. Putting it here would leak its
 * labels into the CSV export for a Warehouse operator, which is the exact leak
 * the tab-level gate used to prevent. `Settings.tsx` appends it to the export
 * under the same money test.
 */
export const FIELD_SECTIONS: Partial<Record<TabKey, Section[]>> = {
  business: ORGANISATION_SECTIONS,
  system: SYSTEM_SECTIONS,
}

export { ORGANISATION_SECTIONS } from './Organisation'
export { FINANCIAL_SECTIONS, FinancialPane } from './Financial'
export { SYSTEM_SECTIONS } from './System'
export { UsersPane } from './UsersRoles'
export { BranchesPane, BranchesRail, branchCsvRows } from './BranchesWarehouses'
