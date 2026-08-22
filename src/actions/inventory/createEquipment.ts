import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/audit'
import { toRupees, type Paisa } from '../../lib/money'

/**
 * # CREATE_EQUIPMENT — the write
 *
 * ## What this replaced
 *
 * ```ts
 * const generatedId = `${prefixOf('EQ')}-${Date.now().toString().slice(-4)}`
 * console.log(`[DB TX] Created equipment ${generatedId}: ${input.name} …`)
 * return { result: { success: true, equipmentId: generatedId }, events }
 * ```
 *
 * A `console.log` and an id minted off the wall clock, behind an input of two
 * fields (`name`, `isDraft`) that dropped the other ~40 things the seven-section
 * Add Equipment form collects (audit: `docs/pages/17_add_equipment.md` §7 gap 3).
 * This file is now the insert: one `products` row plus one `product_units` row
 * per serialised unit, both through `lib/dataAccess.idempotentInsert`.
 *
 * ## Schema facts this body is built on (0004_inventory.sql:83-245)
 *
 * 1. `products.asset_code` is NOT NULL, unique, CHECK `^EQ[0-9]{6}$`. The
 *    'equipment' row in `number_sequences` (0012:28, prefix `EQ`, padding 6) is
 *    the allocator, and `next_document_number()` special-cases the `EQ` prefix
 *    to mint `EQ000001` with no year segment (0007:386-390). The old
 *    TODO(decision) — `numbering.ts` says `EQ-CAT-NNNNNN`, the CHECK says
 *    `EQ000234` — is dodged the same way `createClient` dodges the client-code
 *    dispute: ask the database and write whatever it is configured to issue.
 *    ⚠ MOCK DRIFT: `lib/mock/client.ts:nextDocumentNumber` has no `EQ` special
 *    case and mints `EQ-2026-0001` for this key. The mock enforces no CHECK so
 *    the insert still lands, but the identifier shape differs from live.
 *    Fixing that is a mock change, outside this file.
 * 2. `products.category_id` / `brand` / `name` are NOT NULL — so `validate`
 *    requires them even though the page's 12 Aug ruling stopped gating Create
 *    on name/category/brand. The page rule governs its own summary banner; the
 *    database refuses the row regardless, and a named sentence beats a 23502.
 * 3. `product_units.warehouse_id` and `branch_id` are NOT NULL, so serialised
 *    units cannot be written without a resolved warehouse — a draft carrying
 *    serials but no location is refused with the reason, never half-written
 *    with its units silently dropped.
 * 4. `product_units.asset_tag` is NOT NULL unique. Tags are derived HERE from
 *    the allocated asset code (`EQ000123-01`), never taken from the form —
 *    the form composes them from the `'Assigned on save'` placeholder
 *    (audit gap 5), which must not reach the database.
 * 5. `products` has an audit trigger nowhere (0010 covers six tables;
 *    `products` is not one), so this body logs via `lib/audit`.
 *    `product_units` HAS `trg_audit_product_units` (0010:127) — no double log.
 *
 * ## Permission
 *
 * `inventory.create` → `rbac.canCreateBundle` (Owner/Admin/Manager), mapped
 * 15 Aug 2026 (core.ts:166). The live INSERT policy on `products` is
 * `products_insert` = Owner/Admin/Manager/**Warehouse** (0027:29-31) — one
 * seat wider than the capability. The narrower app rule stands until re-ruled:
 * widening it here without a ruling is the invented decision CLAUDE.md
 * forbids, and fail-narrow cannot write a row RLS would refuse.
 *
 * ## What is COLLECTED by the form and still has no schema home
 *
 * Stated so the drop is a decision, not an accident: supplier (free-typed name
 * vs `products.supplier_id` uuid FK with no supplier intake), asset owner,
 * insurance policy number, inspection interval, maintenance cycle, service
 * vendor (no columns), images/documents (no storage layer), and the
 * relationships pickers (`storedIn`/`contains`/`compatible`/`requires` carry
 * seed-catalogue model ids that do not exist in `products` — the two
 * catalogues are different universes, audit gap 16). TODO(decision) on each.
 *
 * ## Money
 *
 * Law 6: money arrives as Paisa (branded ints) and crosses to `numeric(14,2)`
 * rupees exactly once, here, via `toRupees()`. A money-blind session's form
 * omits the Purchase/Pricing sections entirely, so those fields are simply
 * absent from the input — never zeroed.
 *
 * ## How the write was driven
 *
 * Driven through the exported `createEquipmentConfig` in vitest with
 * `lib/dataAccess` and `lib/supabase` mocked at the same seams
 * `createClient`'s suite uses (`__tests__/inventoryWrites.test.ts`): payloads,
 * lookups, allocator, tag derivation, refusal branches and the role denial
 * are all pinned there. Not driven against live Supabase — this session may
 * not run the dev server or apply migrations. In mock mode (`IS_MOCK`, the
 * current source of truth) the store serves every table this body touches,
 * so the write lands end-to-end from the screen.
 */

/** Matches `unit_condition` (0001:541) — also the form's INTAKE_CONDITIONS. */
export type EquipmentUnitCondition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Lost'

export type EquipmentUnitInput = {
  /** `product_units.serial_no` — the manufacturer's, typed or scanned, never generated. */
  serial: string
  condition: EquipmentUnitCondition
  /** `product_units.purchase_date` (date). */
  purchaseDateIso?: string | undefined
  /** Law 8 — one key per ROW, minted where the operator pressed Save. */
  clientUuid: string
}

export type CreateEquipmentInput = {
  /** Law 8 — the `products` row key, minted at the call site, stable across retries. */
  clientUuid: string
  name: string
  shortName?: string | undefined
  /** `inventory_categories.name` — resolved to `category_id` by SELECT. */
  category: string
  brand: string
  model?: string | undefined
  /** Only when it differs from brand — the form's own rule. */
  manufacturer?: string | undefined
  description?: string | undefined
  tracking: 'Serialised' | 'Quantity' | 'Consumable'
  /** Serialised only. */
  units?: EquipmentUnitInput[] | undefined
  /** Quantity/Consumable only. */
  quantity?: number | undefined
  reorderLevel?: number | undefined
  quantityUnit?: 'piece' | 'metre' | 'roll' | 'pack' | undefined
  /** `warehouses.name` — resolved to warehouse + branch uuids by SELECT. Required when `units` are sent. */
  warehouseName?: string | undefined
  /** Free-text position of the chosen bin. `storage_zone_id` stays null: the
   *  form's zone labels are seed strings, not `storage_zones` rows. */
  location?: { rack: string; shelf: string; bin: string } | undefined
  /**
   * `products.status` — `'Draft'` on Save Draft; on Create the CALLER passes
   * `'Active'` only when its own Ready-to-Rent gate cleared. That rule already
   * lives on the page (AddEquipmentContext `rentable`); restating it here
   * would fork it.
   */
  status: 'Draft' | 'Active'
  /* ── money — Paisa in, rupees at the boundary; absent for money-blind sessions ── */
  purchaseDateIso?: string | undefined
  purchasePricePaisa?: Paisa | undefined
  replacementValuePaisa?: Paisa | undefined
  dailyRatePaisa?: Paisa | undefined
  weeklyRatePaisa?: Paisa | undefined
  monthlyRatePaisa?: Paisa | undefined
  hourlyRatePaisa?: Paisa | undefined
  weekendRatePaisa?: Paisa | undefined
  depositPercent?: number | undefined
  depositFixedPaisa?: Paisa | undefined
  /** `product_units.warranty_expires_at` = purchase date + months (mechanical derivation, documented). */
  warrantyMonths?: number | undefined
  insuranceExpiryIso?: string | undefined
  /* ── rental & operational rules ── */
  minRentalDays?: number | undefined
  rentalEnabled?: boolean | undefined
  prepMinutes?: number | undefined
  cleaningMinutes?: number | undefined
  inspectionRequired?: boolean | undefined
  packingRequired?: boolean | undefined
  internalNotes?: string | undefined
  warehouseNotes?: string | undefined
}

export type CreateEquipmentResult = {
  /** `products.id` — Postgres', never a client-side string. */
  productId: string
  /** `products.asset_code` — allocated by `next_document_number('equipment')`. */
  assetCode: string
  status: 'Draft' | 'Active'
  unitCount: number
}

/** The exact `products` column set this action writes — typechecked against
 *  0004:83-144, because the hand-written `Database` type's `products` entry
 *  describes columns that do not exist (`slug`, `rental_rate_daily`, …). */
type ProductInsertPayload = {
  client_uuid: string
  asset_code: string
  name: string
  short_name: string | null
  category_id: string
  brand: string
  model: string | null
  manufacturer: string | null
  description: string | null
  tracking_mode: 'Serialised' | 'Quantity' | 'Consumable'
  status: 'Draft' | 'Active'
  total_quantity: number
  reorder_level?: number
  quantity_unit?: string
  purchase_date?: string
  purchase_price?: number
  replacement_value?: number
  daily_rate?: number
  weekly_rate?: number
  monthly_rate?: number
  hourly_rate?: number
  weekend_rate?: number
  deposit_percent?: number
  deposit_fixed?: number
  min_rental_days?: number
  rental_enabled?: boolean
  prep_time_minutes?: number
  cleaning_time_minutes?: number
  inspection_required?: boolean
  packing_required?: boolean
  notes_internal: string | null
  notes_warehouse: string | null
  created_by: string
}

type UnitInsertPayload = {
  client_uuid: string
  product_id: string
  serial_no: string
  asset_tag: string
  condition: EquipmentUnitCondition
  branch_id: string
  warehouse_id: string
  rack?: string
  shelf?: string
  bin?: string
  purchase_date?: string
  warranty_expires_at?: string
  insurance_expires_at?: string
  created_by: string
}

/** Trimmed, or null — a blank optional column is NULL, never an empty string. */
function orNull(v: string | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

/** Present-and-converted, or absent — `exactOptionalPropertyTypes` is on, and
 *  a money column the operator left blank must be ABSENT from the payload. */
function moneyCol(key: string, paisa: Paisa | null | undefined): Record<string, number> {
  return paisa == null ? {} : { [key]: Number(toRupees(paisa).toFixed(2)) }
}

/** purchase date + N months, ISO date — the only derivation in this file. */
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Turn a Postgres failure into a sentence an operator can act on. Constraint
 *  names below are live on the project (0004); unmatched messages pass through. */
function describeProductInsertFailure(message: string, assetCode: string): string {
  if (message.includes('products_asset_code_key')) {
    return (
      `The database allocated asset code ${assetCode} and a product already carries it — the 'equipment' ` +
      `number sequence is behind the codes already in the table. Nothing was saved. This needs the sequence ` +
      `corrected, not a retry.`
    )
  }
  if (message.includes('products_asset_code_format')) {
    return (
      `The database allocated ${assetCode} and its own products_asset_code_format CHECK (^EQ[0-9]{6}$) ` +
      `rejected it — the allocator and the CHECK are out of step. Nothing was saved; this needs a ` +
      `migration, not a retry.`
    )
  }
  if (message.includes('products_category_id_fkey') || message.includes('category_id')) {
    return `The chosen category no longer exists in inventory_categories, so nothing was saved.`
  }
  return message
}

export const createEquipmentConfig: ActionConfig<CreateEquipmentInput, CreateEquipmentResult> = {
  name: 'CREATE_EQUIPMENT',
  permissions: ['inventory.create'],

  /**
   * `true` because `execute` inserts through `lib/dataAccess.idempotentInsert`
   * and verifies a uuid came back from the store. See the header for how the
   * write was driven.
   */
  implemented: true,

  validate: (input) => {
    if (!input.name || input.name.trim() === '') {
      throw new Error('Equipment needs a name — products.name is NOT NULL.')
    }
    if (!input.category || input.category.trim() === '') {
      throw new Error('Equipment needs a category — products.category_id is NOT NULL (0004:89).')
    }
    if (!input.brand || input.brand.trim() === '') {
      throw new Error('Equipment needs a brand — products.brand is NOT NULL (0004:90).')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This record carries no idempotency key, so a retry could create a second product under a second ' +
          'asset code. Nothing was sent. (Law 8)',
      )
    }
    if (input.status !== 'Draft' && input.status !== 'Active') {
      throw new Error('Record status must be Draft or Active — product_record_state has no other creatable member.')
    }

    if (input.tracking === 'Serialised') {
      const units = input.units ?? []
      const seen = new Set<string>()
      for (const [i, u] of units.entries()) {
        if (!u.serial || u.serial.trim() === '') {
          throw new Error(`Unit ${i + 1} has no serial. A serialised unit without its manufacturer serial cannot be scanned or told from its siblings.`)
        }
        const key = u.serial.trim().toUpperCase()
        if (seen.has(key)) {
          throw new Error(`Serial ${u.serial.trim()} is entered twice on this record — every serial is unique across the whole system.`)
        }
        seen.add(key)
        if (!u.clientUuid || u.clientUuid.trim() === '') {
          throw new Error(`Unit ${i + 1} carries no idempotency key — Law 8 wants one per row, minted where the operator acted. Nothing was sent.`)
        }
      }
      if (units.length > 0 && (!input.warehouseName || !input.location)) {
        throw new Error(
          'Serialised units need a warehouse and storage bin — product_units.warehouse_id is NOT NULL ' +
            '(0004:203). Pick the location in Section 4, or remove the serials before saving a draft.',
        )
      }
    } else {
      const qty = input.quantity ?? 0
      if (!Number.isFinite(qty) || qty < 1) {
        throw new Error('Quantity-tracked equipment needs a quantity of at least 1.')
      }
      if (input.reorderLevel !== undefined && input.reorderLevel > qty) {
        throw new Error('Reorder level cannot exceed the total quantity.')
      }
    }

    if (input.depositPercent !== undefined && (input.depositPercent < 0 || input.depositPercent > 100)) {
      throw new Error('A deposit percentage runs from 0 to 100 — products_deposit_pct_range refuses anything else.')
    }
    if (input.minRentalDays !== undefined && input.minRentalDays < 1) {
      throw new Error('Minimum rental days is at least 1 — products_min_rental_days_positive refuses less.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /* OFFLINE — refused, not queued: the asset code comes from the database's
       allocator and cannot be issued here, and Add Equipment navigates away on
       success. Same reasoning, same shape as `createClient`. */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. New equipment is not queued for later — the asset code comes from the ' +
          'database and cannot be issued here. Save it when you are back online.',
      )
    }

    /* Natural keys → uuids, all BEFORE the first insert so a resolution
       failure writes nothing at all. */
    const categoryName = input.category.trim()
    const { data: categoryRow, error: categoryError } = await supabase
      .from('inventory_categories')
      .select('id, name')
      .eq('name', categoryName)
      .maybeSingle()
    if (categoryError) {
      throw new Error(`Could not look up the category, so nothing was saved: ${categoryError.message}`)
    }
    if (!categoryRow) {
      throw new Error(
        `"${categoryName}" is not a category in inventory_categories, so nothing was saved. The Add Equipment ` +
          `category list is a seed constant and the database's category table is a different universe ` +
          `(docs/pages/17_add_equipment.md gap 16) — pick a category that exists in the database.`,
      )
    }

    const serialised = input.tracking === 'Serialised'
    const units = serialised ? (input.units ?? []) : []

    let warehouse: { id: string; branch_id: string; name: string } | null = null
    if (units.length > 0) {
      const { data: warehouseRow, error: warehouseError } = await supabase
        .from('warehouses')
        .select('id, branch_id, name')
        .eq('name', input.warehouseName?.trim() ?? '')
        .maybeSingle()
      if (warehouseError) {
        throw new Error(`Could not look up the warehouse, so nothing was saved: ${warehouseError.message}`)
      }
      if (!warehouseRow) {
        throw new Error(
          `"${input.warehouseName ?? ''}" is not a warehouse the database knows, so nothing was saved. The ` +
            `form's warehouse list is seed data; only a name that matches a warehouses row can hold units.`,
        )
      }
      warehouse = warehouseRow as { id: string; branch_id: string; name: string }
    }

    /* The code from the database's allocator, never from the clock. A retry
       re-enters the RPC before the insert, so a Law 8 replay that conflicts on
       client_uuid has burned a sequence value — gaps are possible and are not
       a defect (same caveat as createClient / recordPayment). */
    const { data: assetCode, error: numberError } = await supabase.rpc('next_document_number', {
      p_sequence_key: 'equipment',
    })
    if (numberError) {
      throw new Error(`Could not allocate an asset code, so nothing was saved: ${numberError.message}`)
    }
    if (!assetCode) {
      throw new Error('next_document_number returned no asset code, so nothing was saved.')
    }

    const totalQuantity = serialised ? units.length : (input.quantity ?? 0)

    const payload: ProductInsertPayload = {
      client_uuid: input.clientUuid,
      asset_code: assetCode as string,
      name: input.name.trim(),
      short_name: orNull(input.shortName),
      category_id: (categoryRow as { id: string }).id,
      brand: input.brand.trim(),
      model: orNull(input.model),
      manufacturer: orNull(input.manufacturer),
      description: orNull(input.description),
      tracking_mode: input.tracking,
      status: input.status,
      total_quantity: totalQuantity,
      ...(serialised ? {} : { ...(input.reorderLevel !== undefined ? { reorder_level: input.reorderLevel } : {}), ...(input.quantityUnit ? { quantity_unit: input.quantityUnit } : {}) }),
      ...(input.purchaseDateIso ? { purchase_date: input.purchaseDateIso } : {}),
      ...moneyCol('purchase_price', input.purchasePricePaisa),
      ...moneyCol('replacement_value', input.replacementValuePaisa),
      ...moneyCol('daily_rate', input.dailyRatePaisa),
      ...moneyCol('weekly_rate', input.weeklyRatePaisa),
      ...moneyCol('monthly_rate', input.monthlyRatePaisa),
      ...moneyCol('hourly_rate', input.hourlyRatePaisa),
      ...moneyCol('weekend_rate', input.weekendRatePaisa),
      ...(input.depositPercent !== undefined ? { deposit_percent: input.depositPercent } : {}),
      ...moneyCol('deposit_fixed', input.depositFixedPaisa),
      ...(input.minRentalDays !== undefined ? { min_rental_days: input.minRentalDays } : {}),
      ...(input.rentalEnabled !== undefined ? { rental_enabled: input.rentalEnabled } : {}),
      ...(input.prepMinutes !== undefined ? { prep_time_minutes: input.prepMinutes } : {}),
      ...(input.cleaningMinutes !== undefined ? { cleaning_time_minutes: input.cleaningMinutes } : {}),
      ...(input.inspectionRequired !== undefined ? { inspection_required: input.inspectionRequired } : {}),
      ...(input.packingRequired !== undefined ? { packing_required: input.packingRequired } : {}),
      notes_internal: orNull(input.internalNotes),
      notes_warehouse: orNull(input.warehouseNotes),
      created_by: ctx.userId,
    }

    let productResult: Awaited<ReturnType<typeof idempotentInsert>>
    try {
      /* `'products' as never` / `payload as never` — the sanctioned cast from
         createClient.ts:389-405: `dataAccess` is generic over the hand-written
         `types/database.ts`, whose `products` entry describes columns this
         table does not have. `ProductInsertPayload` above is what actually
         typechecks the payload. */
      /* Explicit RETURNING list: products is one of the four tables 0062 locks
         down, and a bare echo is RETURNING * — which names ungranted money
         columns and throws AFTER the row commits (AUDIT_0062.md). This caller
         consumes exactly id + asset_code. */
      productResult = await idempotentInsert('products' as never, payload as never, {
        returningColumns: 'id, asset_code',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(describeProductInsertFailure(message, assetCode as string))
    }

    /* PERSISTENCE CHECK — same three branches as createClient: the offline
       queue (guarded above) and the network branch both return the SENT
       payload, which has no `id`; only Postgres fills that column. */
    const product = productResult.data as unknown as { id?: string; asset_code?: string } | null
    if (productResult.error) {
      throw new Error(
        `The equipment record could not be confirmed against the database, so treat it as not saved: ${
          (productResult.error as { message?: string }).message ?? String(productResult.error)
        }`,
      )
    }
    if (!product || typeof product.id !== 'string') {
      throw new Error(
        'The equipment record was queued rather than written — the database has not confirmed it, so it has ' +
          'no asset code yet. Check the connection and save it again.',
      )
    }

    const savedCode = product.asset_code ?? (assetCode as string)

    /* `products` has no audit trigger (0010 covers six tables; products is not
       one), so the row is logged here. Failure is reported and the verb
       proceeds — what a caller does about a failed audit write is PLAN.md
       §4.36, still open; every current caller proceeds. */
    const productAudit = await logAuditEvent({
      eventClass: 'status change',
      category: 'Inventory',
      module: 'Inventory',
      action: 'Create',
      tableName: 'products',
      recordId: product.id,
      actorId: ctx.userId,
      actorRole: ctx.role,
      newValues: { asset_code: savedCode, name: payload.name, status: payload.status, tracking_mode: payload.tracking_mode, total_quantity: payload.total_quantity },
    })
    if (!productAudit.ok) {
      console.error('[CREATE_EQUIPMENT] audit write failed (verb proceeded, §4.36):', productAudit.error)
    }

    /* Units — one row each, each under its own Law 8 key. Asset tags are
       derived from the code the database just issued, so `Assigned on save-01`
       can never reach a row. No app-side audit call: product_units carries
       trg_audit_product_units (0010:127). */
    const writtenUnits: Array<{ serial: string; assetTag: string }> = []
    for (const [i, unit] of units.entries()) {
      const assetTag = `${savedCode}-${String(i + 1).padStart(2, '0')}`
      const w = warehouse as { id: string; branch_id: string; name: string }
      const purchaseIso = unit.purchaseDateIso ?? input.purchaseDateIso
      const unitPayload: UnitInsertPayload = {
        client_uuid: unit.clientUuid,
        product_id: product.id,
        serial_no: unit.serial.trim(),
        asset_tag: assetTag,
        condition: unit.condition,
        /* status is deliberately ABSENT: `inventory_state` is engine-owned and
           the column's own default is 'In Stock' (§5.3 — what creation sets). */
        branch_id: w.branch_id,
        warehouse_id: w.id,
        ...(input.location ? { rack: input.location.rack, shelf: input.location.shelf, bin: input.location.bin } : {}),
        ...(purchaseIso ? { purchase_date: purchaseIso } : {}),
        ...(purchaseIso && input.warrantyMonths ? { warranty_expires_at: addMonthsIso(purchaseIso, input.warrantyMonths) } : {}),
        ...(input.insuranceExpiryIso ? { insurance_expires_at: input.insuranceExpiryIso } : {}),
        created_by: ctx.userId,
      }
      try {
        /* Same 0062 rule as the products insert above: explicit granted list. */
        const unitResult = await idempotentInsert('product_units' as never, unitPayload as never, {
          returningColumns: 'id',
        })
        const savedUnit = unitResult.data as unknown as { id?: string } | null
        if (unitResult.error || !savedUnit || typeof savedUnit.id !== 'string') {
          throw new Error('the database did not confirm the row')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const friendly = message.includes('product_units_serial_no_key')
          ? `serial ${unit.serial.trim()} already belongs to another unit in the system`
          : message
        throw new Error(
          `The equipment record WAS created as ${savedCode} (${writtenUnits.length} of ${units.length} unit${
            units.length === 1 ? '' : 's'
          } written), but unit ${i + 1} failed: ${friendly}. Fix the unit and save again — the same form ` +
            `resubmitted resolves to the same record instead of creating a second one (Law 8).`,
        )
      }
      writtenUnits.push({ serial: unit.serial.trim(), assetTag })
    }

    const events = [
      {
        type: EVENT_TYPES.EQUIPMENT_CREATED,
        payload: {
          equipmentId: product.id,
          assetCode: savedCode,
          name: payload.name,
          category: categoryName,
          status: input.status,
          trackingMode: input.tracking,
          quantity: totalQuantity,
          units: writtenUnits,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        productId: product.id,
        assetCode: savedCode,
        status: input.status,
        unitCount: writtenUnits.length,
      },
      events,
    }
  },
}

export const createEquipment = createAction(createEquipmentConfig)
