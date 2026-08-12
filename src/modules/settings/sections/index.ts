import type { TabKey } from '../../../data/settings'
import type { Section } from './shared'
import { ORGANISATION_SECTIONS } from './Organisation'
import { FINANCIAL_SECTIONS } from './Financial'
import { SYSTEM_SECTIONS } from './System'
import { APPS_API_SECTIONS } from './AppsApi'
import { SECURITY_SECTIONS } from './Security'

/**
 * **The split, in one map.**
 *
 * §11.1's closing note: *"Settings is currently one 2,502-line file; these
 * eight sections are the split."* Four of the eight are row lists — a `Field[]`
 * per card — and are declared here so the config export can walk every setting
 * on the page without knowing which pane renders it. The other four (Overview,
 * Branches & Warehouses, Users & Roles, and Financial's three extra panels) are
 * components, because they carry tables and charts a row list cannot express.
 */
export const FIELD_SECTIONS: Partial<Record<TabKey, Section[]>> = {
  organization: ORGANISATION_SECTIONS,
  financial: FINANCIAL_SECTIONS,
  system: SYSTEM_SECTIONS,
  integrations: APPS_API_SECTIONS,
  security: SECURITY_SECTIONS,
}

export { ORGANISATION_SECTIONS } from './Organisation'
export { FINANCIAL_SECTIONS, FinancialPane } from './Financial'
export { SYSTEM_SECTIONS } from './System'
export { APPS_API_SECTIONS } from './AppsApi'
export { SECURITY_SECTIONS } from './Security'
export { OverviewPane, OverviewRail } from './Overview'
export { UsersPane } from './UsersRoles'
export { BranchesPane, BranchesRail, branchCsvRows } from './BranchesWarehouses'
