import { newClientUuid, supabase } from './supabase'
import { readLocal, writeLocal } from './safeStorage'

/**
 * Shared saved list views (0159, G2). The database owns who sees what — a view that filters on money is
 * never returned to a money-blind role (Law 6), a retired view is never returned, and a system view cannot
 * be changed — so this module only maps rows and calls the two RPCs.
 */
export interface SharedListView {
  id: string
  name: string
  query: string
  hiddenColumns: string[]
  visibility: 'private' | 'team'
  isSystem: boolean
  ownerId: string | null
  createdAt: string
}

interface ViewRow {
  id: string
  name: string
  query: string
  hidden_columns: string[] | null
  visibility: 'private' | 'team'
  is_system: boolean
  owner_id: string | null
  created_at: string
}

export function rowToView(r: ViewRow): SharedListView {
  return {
    id: r.id,
    name: r.name,
    query: r.query,
    hiddenColumns: r.hidden_columns ?? [],
    visibility: r.visibility,
    isSystem: r.is_system,
    ownerId: r.owner_id,
    createdAt: r.created_at,
  }
}

export async function listSharedViews(listKey: string): Promise<SharedListView[]> {
  const { data, error } = await supabase
    .from('saved_views' as never)
    .select('id, name, query, hidden_columns, visibility, is_system, owner_id, created_at')
    .eq('list_key', listKey)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as ViewRow[])
    .filter((r) => typeof r?.id === 'string' && typeof r.name === 'string' && typeof r.query === 'string')
    .map(rowToView)
}

function unwrap(message: string): string {
  return message.replace(/^GATE:[^|]*\|/, '')
}

export async function saveSharedView(input: {
  id?: string | null
  listKey: string
  name: string
  query: string
  hiddenColumns: readonly string[]
  visibility: 'private' | 'team'
  clientUuid?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_view' as never, {
    p_client_uuid: input.clientUuid ?? newClientUuid(),
    p_list_key: input.listKey,
    p_name: input.name,
    p_query: input.query,
    p_hidden_columns: [...input.hiddenColumns],
    p_visibility: input.visibility,
    p_id: input.id ?? null,
  } as never)
  if (error) throw new Error(unwrap(error.message))
  return data as unknown as string
}

export async function retireSharedView(id: string): Promise<void> {
  const { error } = await supabase.rpc('retire_view' as never, { p_id: id } as never)
  if (error) throw new Error(unwrap(error.message))
}

interface LegacyView {
  name: string
  query: string
  hiddenColumns: string[]
}

function parseLegacy(raw: string | null): LegacyView[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is LegacyView =>
        !!v &&
        typeof v === 'object' &&
        typeof (v as LegacyView).name === 'string' &&
        typeof (v as LegacyView).query === 'string' &&
        Array.isArray((v as LegacyView).hiddenColumns),
    )
  } catch {
    return []
  }
}

/**
 * First load after G2: this browser's old views become the signed-in user's private views, once.
 * The marker is written only after every save succeeded or was refused, so a network failure retries
 * next load; the old list is left in place as a backup (nothing is deleted).
 */
export async function migrateLocalViews(listKey: string, legacyStorageKey: string): Promise<number> {
  const marker = `${legacyStorageKey}:migrated-to-db`
  if (readLocal(marker) === 'done') return 0
  const legacy = parseLegacy(readLocal(legacyStorageKey))
  let moved = 0
  for (const v of legacy) {
    try {
      await saveSharedView({ listKey, name: v.name, query: v.query, hiddenColumns: v.hiddenColumns, visibility: 'private' })
      moved++
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      /* A name that already exists, or a money view this role may not save, will never succeed — skip it.
         Anything else (network) leaves the marker unset so the next load tries again. */
      if (!/unique|duplicate|money/i.test(msg)) return moved
    }
  }
  writeLocal(marker, 'done')
  return moved
}
