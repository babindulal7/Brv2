/**
 * Project Type — the single source of truth (spec §37).
 *
 * "What kind of production is this rental supporting?" Captured once at
 * creation, read everywhere. Every screen, filter, export and card imports
 * this module — no component re-declares the list.
 *
 * Law 11 / spec §3: Project Type is NEVER color-coded. It renders as neutral
 * text or a muted chip; color remains reserved for operational state.
 */

export const PROJECT_TYPES = [
  'Feature Film',
  'Short Film',
  'Documentary',
  'Commercial / Advertisement',
  'Music Video',
  'Corporate',
  'Wedding',
  'Event',
  'TV / Broadcast',
  'Web / Digital Content',
  'Photography',
  'Student Project',
  'Personal / Test Shoot',
  'Rental House / Sub-rental',
  'Other',
] as const

export type ProjectType = (typeof PROJECT_TYPES)[number]

/** The placeholder rendered for legacy rows that predate the field. */
export const PROJECT_TYPE_UNSET_LABEL = '—'

export function isProjectType(value: string | null | undefined): value is ProjectType {
  return typeof value === 'string' && (PROJECT_TYPES as readonly string[]).includes(value)
}

export interface ProjectTypeValidation {
  valid: boolean
  /** Human sentence for inline errors — never a toast (Law 12). */
  message: string | null
}

/**
 * Application-level validation (mirrors the DB CHECK in `0144`).
 * - `null` is valid here: Drafts may omit it; Confirm refuses it instead.
 * - `Other` requires a custom description; anything else must not carry one.
 */
export function validateProjectType(
  projectType: string | null | undefined,
  projectTypeOther: string | null | undefined,
): ProjectTypeValidation {
  if (projectType === null || projectType === undefined || projectType === '') {
    return { valid: true, message: null }
  }
  if (!isProjectType(projectType)) {
    return { valid: false, message: 'Select a project type from the list.' }
  }
  const other = (projectTypeOther ?? '').trim()
  if (projectType === 'Other') {
    if (other === '') return { valid: false, message: 'Describe the project type.' }
    return { valid: true, message: null }
  }
  if (other !== '') {
    return { valid: false, message: 'A custom description is only used with Other.' }
  }
  return { valid: true, message: null }
}

/** What the user reads: the custom text for Other, the value itself, or a dash. */
export function displayProjectType(
  projectType: string | null | undefined,
  projectTypeOther?: string | null | undefined,
): string {
  if (projectType === 'Other') {
    const other = (projectTypeOther ?? '').trim()
    return other === '' ? 'Other' : other
  }
  if (isProjectType(projectType)) return projectType
  return PROJECT_TYPE_UNSET_LABEL
}
