import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/audit'
import { captureError } from '../../lib/monitoring'

/**
 * # CREATE_STOCK_TRANSFER — the write
 *
 * ## What this replaced
 *
 * ```ts
 * const transferId = input.transferId ?? `TR-${Date.now().toString().slice(-4)}`
 * console.log(`[DB TX] Stock transfer ${transferId} state: ...`)
 * ```
 *
 * Four digits off a clock as the reference operators quote between warehouses,
 * behind an input that dropped the transfer type, the asset, the serial and
 * the operator's notes (audit: `docs/pages/18_warehouses.md` §7 — "the create
 * path hardcodes a single asset"). The old input also carried `transferId`/
 * `status` fields that existed only so the deleted `advance()` could typecheck
 * — a create is not a transition, and those fields are gone.
 *
 * ## Schema facts this body is built on (0004_inventory.sql:433-506)
 *
 * 1. `stock_transfers` needs `source_branch_id`/`source_warehouse_id`/
 *    `destination_branch_id`/`destination_warehouse_id` (all NOT NULL uuids)
 *    and `requested_by`. The screen collects warehouse NAMES, so both are
 *    resolved by SELECT on `warehouses` before anything is written.
 * 2. `transfer_type` is the `transfer_kind` enum (0001:592): its members are
 *    the PLURAL forms ('Branch Transfers', …) while the screen's labels are
 *    singular ('Branch Transfer'). `TRANSFER_KIND_OF` below is that wire
 *    translation and nothing more — an unknown label is refused, never guessed.
 * 3. `status` is deliberately ABSENT from the payload: the column defaults to
 *    'Pending' and this build has no transition action, so a created transfer
 *    opens at Pending and stays there (the modal says so on its face).
 * 4. `stock_transfer_lines.product_id` is NOT NULL — the typed asset name must
 *    resolve to a `products` row or the whole transfer is refused. Writing a
 *    header that silently omits WHAT is being moved would re-create the exact
 *    dropped-input defect this rewrite closes.
 * 5. Header + line are two inserts with no transaction (same shape as
 *    `createBundle`'s bundles + bundle_items). Every lookup runs BEFORE the
 *    header insert so the only way to strand a header is a mid-flight
 *    constraint/network failure — and that failure names what landed, and a
 *    resubmit resolves to the same header via `client_uuid` (Law 8).
 *
 * ## ⚠ TODO(decision) — the transfer number series (unchanged, but now honest)
 *
 * `data/warehouse.ts` seeds `TR-2026-00xx`, the numbering registry's Transfer
 * row is coded `TRF`, and `number_sequences` has NO transfer row at all
 * (0012:20-29 seeds seven keys; 0056 adds membership/quote/bundle — none is a
 * transfer). This action picks neither side: it asks
 * `next_document_number('transfer')` and writes whatever the database is
 * configured to issue. On the live project that RPC today raises
 * `Number sequence transfer does not exist`, which surfaces here as a sentence
 * naming the missing ruling — the fix is a migration seeding the sequence
 * under whichever prefix is ruled, not an edit to this file. The in-memory
 * mock mints `TRANSFER-2026-0001` for the unruled key, so local creates land.
 *
 * ## Permission
 *
 * `inventory.transfer` → `rbac.canWriteFloor` (Owner/Admin/Manager/Warehouse),
 * mapped 16 Aug 2026 (core.ts:202) mirroring `stock_transfers_all`
 * (0028:77-80) — the same four roles, read off pg_policies.
 *
 * ## Audit
 *
 * `stock_transfers` has no audit trigger (0010 covers six tables), so the
 * create is logged through `lib/audit`; failure is reported and the verb
 * proceeds (PLAN.md §4.36, still open).
 *
 * ## How the write was driven
 *
 * Driven through the exported `createStockTransferConfig` in vitest with
 * `lib/dataAccess` and `lib/supabase` mocked at the same seams
 * `createClient`'s suite uses (`__tests__/inventoryWrites.test.ts`); the role
 * denial is pinned separately through the dispatched action. Not driven
 * against live Supabase — this session may not run the dev server or apply
 * migrations, and the live sequence gap above means a live drive today ends
 * at the named allocator refusal by design.
 */

/** The screen's labels. Translated — never guessed — onto `transfer_kind`. */
export type StockTransferTypeLabel =
  | 'Branch Transfer'
  | 'Warehouse Transfer'
  | 'Zone Transfer'
  | 'Temporary Holding'
  | 'Transit'

/** UI label → `transfer_kind` enum member (0001:592-598). Pure wire translation. */
const TRANSFER_KIND_OF: Record<StockTransferTypeLabel, string> = {
  'Branch Transfer': 'Branch Transfers',
  'Warehouse Transfer': 'Warehouse Transfers',
  'Zone Transfer': 'Zone Transfers',
  'Temporary Holding': 'Temporary Holding',
  Transit: 'Transit',
}

export type CreateStockTransferInput = {
  /** Law 8 — the header row key, minted when the modal opened, stable across retries. */
  clientUuid: string
  /** Law 8 — the line's own key: one per ROW, not per action. */
  lineClientUuid: string
  transferType: StockTransferTypeLabel
  /**
   * `warehouses.id` — how the screen identifies a facility now.
   *
   * It used to send only the NAME, taken from `data/warehouse.ts`'s four seed
   * facilities, and not one of those is a row in `warehouses` (which holds
   * 'Central Camera Vault' and 'Lakeside Equipment Hub'). Every transfer was
   * refused by the lookup below. Same defect `createEquipment` carried.
   */
  sourceWarehouseId?: string | undefined
  destinationWarehouseId?: string | undefined
  /** `warehouses.name` — the fallback for callers that still name a facility. */
  sourceWarehouse?: string | undefined
  destinationWarehouse?: string | undefined
  /** `products.id` — sent when the asset was picked from the catalogue. */
  productId?: string | undefined
  /**
   * `products.name`, exactly as catalogued — the fallback when no id is sent.
   * Exact-match only, which is why the screen no longer asks an operator to type it.
   */
  assetName?: string | undefined
  /** `product_units.serial_no` — optional; when given it must resolve, and to a unit of the named product. */
  serial?: string | undefined
  /** The operator's reason/notes — `stock_transfers.notes`. */
  notes?: string | undefined
}

export type CreateStockTransferResult = {
  /** `stock_transfers.id` — the row's uuid, generated by Postgres. */
  transferId: string
  /** `stock_transfers.transfer_no` — allocated by `next_document_number('transfer')`. */
  transferNo: string
  /** Always 'Pending' — the column default; there is no transition action yet. */
  status: 'Pending'
  productName: string
}

/** The exact column sets written — typechecked against 0004:433-506, because
 *  the hand-written `Database` type has no `stock_transfers` entry at all. */
type TransferInsertPayload = {
  client_uuid: string
  transfer_no: string
  transfer_type: string
  source_branch_id: string
  source_warehouse_id: string
  destination_branch_id: string
  destination_warehouse_id: string
  requested_by: string
  notes: string | null
  created_by: string
}

type TransferLineInsertPayload = {
  client_uuid: string
  transfer_id: string
  product_id: string
  product_unit_id?: string
  requested_quantity: number
}

function orNull(v: string | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

type WarehouseRow = { id: string; branch_id: string; name: string }

export const createStockTransferConfig: ActionConfig<CreateStockTransferInput, CreateStockTransferResult> = {
  name: 'CREATE_STOCK_TRANSFER',
  permissions: ['inventory.transfer'],

  /** `true` because `execute` inserts through `lib/dataAccess.idempotentInsert`
   *  and verifies a uuid came back. See the header for how it was driven. */
  implemented: true,

  validate: (input) => {
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error('This transfer carries no idempotency key, so a retry could raise it twice. Nothing was sent. (Law 8)')
    }
    if (!input.lineClientUuid || input.lineClientUuid.trim() === '') {
      throw new Error('The transfer line carries no idempotency key — Law 8 wants one per row. Nothing was sent.')
    }
    if (!(input.transferType in TRANSFER_KIND_OF)) {
      throw new Error(`"${String(input.transferType)}" is not a transfer type — transfer_kind has no such member.`)
    }
    /* An id identifies a facility; a name is accepted but is only a fallback.
       The two are compared like with like — comparing an id to a name would
       call every transfer valid. */
    const sourceKey = input.sourceWarehouseId?.trim() || input.sourceWarehouse?.trim() || ''
    const destinationKey = input.destinationWarehouseId?.trim() || input.destinationWarehouse?.trim() || ''
    if (sourceKey === '') {
      throw new Error('Source warehouse is required for new transfers.')
    }
    if (destinationKey === '') {
      throw new Error('Destination warehouse is required for new transfers.')
    }
    if (sourceKey === destinationKey) {
      throw new Error('Source and destination must be different warehouses.')
    }
    if (!(input.productId?.trim() || input.assetName?.trim())) {
      throw new Error('Name the asset being moved — stock_transfer_lines.product_id is NOT NULL, a transfer cannot move nothing.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /* OFFLINE — refused, not queued: the transfer number comes from the
       database's allocator, and a queued header would hand the operator a
       reference the registry never issued. Same reasoning as createClient. */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. A transfer is not queued for later — its number comes from the database ' +
          'and cannot be issued here. Raise it when you are back online.',
      )
    }

    /* Natural keys → uuids, all BEFORE the first insert. */
    const lookupWarehouse = async (
      id: string | undefined,
      name: string | undefined,
      roleInSentence: string,
    ): Promise<WarehouseRow> => {
      const byId = typeof id === 'string' && id.trim() !== ''
      const base = supabase.from('warehouses').select('id, branch_id, name')
      const { data, error } = await (byId ? base.eq('id', id.trim()) : base.eq('name', name?.trim() ?? '')).maybeSingle()
      if (error) {
        throw new Error(`Could not look up the ${roleInSentence} warehouse, so nothing was saved: ${error.message}`)
      }
      if (!data) {
        throw new Error(
          `"${(byId ? id : name) ?? ''}" is not a warehouse the database knows, so nothing was saved. ` +
            `Stock moves between real facilities — stock_transfers.source_warehouse_id is NOT NULL.`,
        )
      }
      return data as WarehouseRow
    }

    const source = await lookupWarehouse(input.sourceWarehouseId, input.sourceWarehouse, 'source')
    const destination = await lookupWarehouse(input.destinationWarehouseId, input.destinationWarehouse, 'destination')

    /*
     * `validate` compares whatever keys the caller sent, and it cannot see that
     * an ID and a NAME denote the same facility — so a transfer identifying its
     * source by uuid and its destination by that same warehouse's name passes
     * there. Only the resolved rows settle it, and stock moving from a facility
     * to itself is not a transfer.
     */
    if (source.id === destination.id) {
      throw new Error(
        `Source and destination are both ${source.name}, so nothing was saved. A transfer moves stock ` +
          `between two different facilities.`,
      )
    }

    /* By uuid when the screen picked from the catalogue; by exact name otherwise. */
    const assetName = input.assetName?.trim() ?? ''
    const productId = input.productId?.trim() ?? ''
    const productBase = supabase.from('products').select('id, name')
    const { data: productRow, error: productError } = await (productId !== ''
      ? productBase.eq('id', productId)
      : productBase.eq('name', assetName)
    ).maybeSingle()
    if (productError) {
      throw new Error(`Could not look up the asset, so nothing was saved: ${productError.message}`)
    }
    if (!productRow) {
      throw new Error(
        productId !== ''
          ? `No product has id ${productId}, so nothing was saved. The catalogue changed under the ` +
            `form — reopen it and pick the asset again.`
          : `"${assetName}" matches no product in the catalogue, so nothing was saved. A typed name has ` +
            `to match the products row exactly — a transfer recorded against a name the system cannot ` +
            `resolve would move nothing anyone can find.`,
      )
    }
    const product = productRow as { id: string; name: string }

    let productUnitId: string | undefined
    const serial = input.serial?.trim()
    if (serial) {
      const { data: unitRow, error: unitError } = await supabase
        .from('product_units')
        .select('id, product_id, serial_no')
        .eq('serial_no', serial)
        .maybeSingle()
      if (unitError) {
        throw new Error(`Could not look up serial ${serial}, so nothing was saved: ${unitError.message}`)
      }
      if (!unitRow) {
        throw new Error(
          `Serial ${serial} matches no unit in the system, so nothing was saved. Correct the serial, or ` +
            `leave it blank to transfer by product.`,
        )
      }
      const unit = unitRow as { id: string; product_id: string }
      if (unit.product_id !== product.id) {
        throw new Error(`Serial ${serial} belongs to a different product than "${product.name}", so nothing was saved.`)
      }
      productUnitId = unit.id
    }

    /* The number from the database's allocator, never from the clock. See the
       header TODO(decision): on a project whose number_sequences has no
       'transfer' row, this is where the create honestly stops. */
    const { data: transferNo, error: numberError } = await supabase.rpc('next_document_number', {
      p_sequence_key: 'transfer',
    })
    if (numberError) {
      throw new Error(
        `Could not allocate a transfer number, so nothing was saved: ${numberError.message}. ` +
          `The 'transfer' row in number_sequences does not exist yet — seeding it (and ruling the TR-vs-TRF ` +
          `prefix) is a migration, not a retry.`,
      )
    }
    if (!transferNo) {
      throw new Error('next_document_number returned no transfer number, so nothing was saved.')
    }

    const payload: TransferInsertPayload = {
      client_uuid: input.clientUuid,
      transfer_no: transferNo as string,
      transfer_type: TRANSFER_KIND_OF[input.transferType],
      source_branch_id: source.branch_id,
      source_warehouse_id: source.id,
      destination_branch_id: destination.branch_id,
      destination_warehouse_id: destination.id,
      requested_by: ctx.userId,
      notes: orNull(input.notes),
      created_by: ctx.userId,
    }

    let headerResult: Awaited<ReturnType<typeof idempotentInsert>>
    try {
      /* `as never` — the sanctioned cast from createClient.ts:389-405: the
         hand-written `Database` type has no `stock_transfers` entry, and
         `TransferInsertPayload` above is what actually typechecks the payload. */
      headerResult = await idempotentInsert('stock_transfers' as never, payload as never)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('stock_transfers_no_key')) {
        throw new Error(
          `The database allocated ${String(transferNo)} and a transfer already carries it — the 'transfer' ` +
            `sequence is behind the numbers already in the table. Nothing was saved; this needs the sequence ` +
            `corrected, not a retry.`,
        )
      }
      throw new Error(message)
    }

    /* PERSISTENCE CHECK — the offline queue (guarded above) and the network
       branch both return the SENT payload, which has no `id`. */
    const header = headerResult.data as unknown as { id?: string; transfer_no?: string } | null
    if (headerResult.error) {
      throw new Error(
        `The transfer could not be confirmed against the database, so treat it as not raised: ${
          (headerResult.error as { message?: string }).message ?? String(headerResult.error)
        }`,
      )
    }
    if (!header || typeof header.id !== 'string') {
      throw new Error(
        'The transfer was queued rather than written — the database has not confirmed it, so it has no ' +
          'transfer number yet. Check the connection and raise it again.',
      )
    }

    const savedNo = header.transfer_no ?? (transferNo as string)

    const linePayload: TransferLineInsertPayload = {
      client_uuid: input.lineClientUuid,
      transfer_id: header.id,
      product_id: product.id,
      ...(productUnitId ? { product_unit_id: productUnitId } : {}),
      requested_quantity: 1,
    }
    try {
      const lineResult = await idempotentInsert('stock_transfer_lines' as never, linePayload as never)
      const line = lineResult.data as unknown as { id?: string } | null
      if (lineResult.error || !line || typeof line.id !== 'string') {
        throw new Error('the database did not confirm the line')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Transfer ${savedNo} WAS raised but its line for "${product.name}" failed: ${message}. ` +
          `Submit the same form again — Law 8 resolves the header to the existing row and retries only the line.`,
      )
    }

    /* No audit trigger on stock_transfers (0010) — logged here. Failure is
       reported and the verb proceeds (§4.36, still open). */
    const audit = await logAuditEvent({
      eventClass: 'status change',
      category: 'Inventory',
      module: 'Inventory',
      action: 'Create',
      tableName: 'stock_transfers',
      recordId: header.id,
      actorId: ctx.userId,
      actorRole: ctx.role,
      branchId: source.branch_id,
      newValues: {
        transfer_no: savedNo,
        transfer_type: payload.transfer_type,
        source: source.name,
        destination: destination.name,
        product: product.name,
        ...(serial ? { serial } : {}),
      },
    })
    if (!audit.ok) {
      console.error('[CREATE_STOCK_TRANSFER] audit write failed (verb proceeded, §4.36):', audit.error)
      captureError(audit.error, { where: 'createStockTransfer.audit' })
    }

    const events = [
      {
        type: EVENT_TYPES.TRANSFER_UPDATED,
        payload: {
          transferId: header.id,
          transferNo: savedNo,
          sourceWarehouse: source.name,
          targetWarehouse: destination.name,
          status: 'Pending',
          productName: product.name,
          ...(serial ? { serial } : {}),
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        transferId: header.id,
        transferNo: savedNo,
        status: 'Pending',
        productName: product.name,
      },
      events,
    }
  },
}

export const createStockTransfer = createAction(createStockTransferConfig)
