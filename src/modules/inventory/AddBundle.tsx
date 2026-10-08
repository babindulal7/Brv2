import { useEffect, useMemo, useRef, useState } from 'react'
import { newClientUuid } from '../../lib/supabase'
import { useInventoryCategories, listInventory } from '../../lib/queries/inventory'
import { readProductAvailability } from '../../lib/queries/productAvailability'
import { useRentalWindowParams, dayValue } from '../../lib/rentalWindowParams'
import { DateField } from '../../components/ui/DateField'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Select } from '../../components/ui/Select'
import { InfoTooltip } from '../../components/ui/InfoTooltip'
import { Card, Button, Rail, SummaryRows, cardStyle } from '../../components/ui/Page'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { DataTableShell } from '../../components/ui/DataTable'
import { Unavailable } from '../../components/ui/Unavailable'
import { RestrictedState } from '../../components/ui/StateViews'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, parseMoney, rupees, roundHalfUp, toRupees } from '../../lib/money'
import { useBundleWithItems } from '../../lib/queries/useBundles'
import { readRecordEditor } from '../../lib/queries/recordEditor'
import { UnsavedLeaveDialog, useUnsavedRecord } from '../../components/ui/RecordWorkspace'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { BundleWithItems, BundleComponent } from '../../lib/queries/bundles'
import type {
  UpdateBundlePatch,
  UpdateBundleLineEdit,
  UpdateBundleLineAdd,
  UpdateBundleLineDeactivate,
} from '../../actions/inventory/updateBundle'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { validateDiscount } from '../../lib/discount'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import {
  BOX_CATEGORIES,
  CREW_ROLES,
  VEHICLE_TYPES,
  TAG_OPTIONS,
  TEMPLATE_BUNDLES,
  INITIAL_CREW,
  INITIAL_VEHICLE,
  SEED_ERRORS,
  iconForCategory,
  totalsOf,
  pricingOf,
  availabilityOf,
  breakdownOf,
  rateDriftOf,
  parentsHolding,
  duplicateFrom,
} from '../../lib/queries/addBundle'
import type {
  DraftLine,
  CrewPick,
  CrewRole,
  VehicleType,
  InventoryCategory,
  InventoryModel,
} from '../../lib/queries/addBundle'

/**
 * **Inventory ▸ Bundles ▸ New Bundle** — rebuilt 8 Aug against
 * `06 Inventory/Add Bundle.PNG` and spec v1.1.
 *
 * The render's structure is kept: four numbered sections down the main column,
 * the inventory tree beside the Bundle Items table, and a four-card right rail
 * — Bundle Summary, Pricing Summary, Availability Summary, Quick Actions.
 *
 * What is deliberately **not** copied, each one named by the spec's own §0:
 *  · §7.2 — the render's Pricing Summary recites `Rs 22,500 / −4,500 / 18,000`
 *    while its ten lines total `26,100 / 2,320 / 23,780`. *"Not one of the three
 *    responds to the discounts the user just entered — on the only screen where
 *    those discounts are set."* Every figure here comes from `pricingOf`.
 *  · §8.1 — the render flags NISI Athena 35mm blocked while it holds 2 of 3
 *    units free against a required quantity of 1. Blocked is `available <
 *    required`, so the honest reading of these lines is **13 / 13 ready**.
 *  · §8.2 — a donut reading `18/18` above a panel reading `16/18 · 2 blocked`
 *    cannot occur, because both read one array.
 *  · §5.3 — the render's FX3 line claims 5 children while Battery and Charger
 *    are *also* their own lines. An item is a child **or** a line, never both.
 *  · §3 — `Save Draft` and `Create Bundle` appear in the render's header *and*
 *    its footer. The footer owns them; the header keeps Import Template and
 *    Duplicate Existing.
 *  · §4 — the render's Primary Category offers `DIT` and `Production`, which are
 *    not Inventory categories.
 *  · §6.2 — a **Line Total** column, absent from the render, so a battery at
 *    Rs 300 × 4 visibly contributes Rs 1,200 a day.
 *  · §10 — Crew, Vehicle and Boxes sections, which the render's rail counts but
 *    its builder cannot set.
 *
 * Locked rules, never copied back from the render: the numbered 20-item sidebar
 * (the shell owns an 8-section rail), the render's violet accents, and raw hex.
 */

/* ── field geometry ────────────────────────────────────────────────────── */

const subtle: CSSProperties = { fontSize: 'var(--t-th)', color: 'var(--muted)' }

const controlBase: CSSProperties = {
  height: 34,
  padding: '0 9px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  width: '100%',
  minWidth: 0,
}

const selectStyle: CSSProperties = { ...controlBase, cursor: 'pointer' }

/* Law 15 — hit area, not paint, and the number comes from `--tap`. These four
   are the one part of this file the density argument above does not cover: they
   sit in a wrapping filter card, not the ten-column pricing grid, so they take
   the floor directly. `height: 'auto'` sheds `controlBase`'s 34 so the box is
   governed by --tap alone instead of by two rules fighting. */
const filterSelect: CSSProperties = { ...selectStyle, height: 'auto', minHeight: 'var(--tap)', width: 'auto' }

/*
 * The render fits ten Bundle Items columns into roughly 600px beside the tree
 * and the rail. That density is the point — a line you have to scroll to price
 * is a line nobody checks — so the cells run tight rather than the table running
 * wide. It still scrolls inside its own container below that.
 *
 * RULED 26 Aug 2026 — this argument and the §7.3 row floor DO NOT CONFLICT, so
 * no exception is carved for this table and none is needed.
 *
 * The reasoning above is entirely about HORIZONTAL width: ten columns inside
 * ~600px, cells running tight rather than the table running wide. §7.3's
 * "rows >= 56px" is VERTICAL and costs nothing horizontally. A row-floor sweep
 * flagged this file for a ruling on the strength of the words "that density is
 * the point"; the ruling is that the two rules are about different axes and the
 * flag was a false positive.
 *
 * So the `td` below deliberately does NOT carry `height: var(--row-min-h)`,
 * and that is the ruled state rather than an oversight — recorded here so the
 * next sweep does not re-open it. Note also that the exposure here is latent,
 * not live: this file imports no `TouchTarget`, so no 44px hit area currently
 * overhangs these rows. It would arrive the moment a row control adopts one,
 * and THAT is the trigger to revisit — not the width argument above.
 */
const th: CSSProperties = {
  textAlign: 'left',
  padding: '7px 6px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'bottom',
}

const td: CSSProperties = {
  padding: '7px 6px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top',
}

function Caption({ label, required }: { label: string; required?: boolean }) {
  return (
    <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>
      {label}
      {required && (
        <span style={{ color: 'var(--danger-text)', marginLeft: 3 }} aria-label="required">
          *
        </span>
      )}
    </span>
  )
}

const fieldBox: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }

/** A caption over exactly **one** labelable control. */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <label style={fieldBox}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Caption label={label} {...(required ? { required } : {})} />
        {hint && <InfoTooltip content={hint} />}
      </div>
      {children}
    </label>
  )
}

/**
 * A caption over a *group* — a toggle, a chip row, a file picker. Not a
 * `<label>`: a label forwards its click to the first labelable descendant, so a
 * hidden file input inside one opens the dialog twice.
 */
function FieldBlock({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div style={fieldBox} role="group" aria-label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Caption label={label} {...(required ? { required } : {})} />
        {hint && <InfoTooltip content={hint} />}
      </div>
      {children}
    </div>
  )
}

/** The render's numbered section chrome — 1 Bundle Details … 4 Notes. */
function Section({
  n,
  title,
  action,
  children,
  bodyStyle,
}: {
  n: number
  title: string
  action?: ReactNode
  children: ReactNode
  bodyStyle?: CSSProperties
}) {
  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '11px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          className="figure"
          aria-hidden
          style={{
            width: 21,
            height: 21,
            flexShrink: 0,
            borderRadius: 'var(--r-badge)',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--nav-active-bg)',
            color: 'var(--nav-active-accent)',
            fontSize: 'var(--t-th)',
            fontWeight: 700,
          }}
        >
          {n}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {action && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>{action}</span>}
      </div>
      <div style={{ padding: 14, minWidth: 0, ...bodyStyle }}>{children}</div>
    </section>
  )
}

/** Foundation §3.1 — BS above AD, Latin digits, always with a year. */
function BsAd({ date, prefix }: { date: Date; prefix?: string }) {
  const bs = toBs(date)
  return (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
        {prefix ? `${prefix} ` : ''}
        {bs ? formatBs(bs) : formatAd(date)}
      </span>
      {bs && (
        <span className="figure" style={subtle}>
          {formatAd(date)}
        </span>
      )}
    </span>
  )
}

/** §10.4 — crew and vehicle ride along; the money is calculated once, elsewhere. */
function NotInRate({ what }: { what: string }) {
  const reason = `Not in the bundle rate — ${what} is priced in the booking's own section, at its own rate.`
  return (
    <span
      title={reason}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        height: 19,
        padding: '0 7px',
        borderRadius: 'var(--r-badge)',
        border: '1px solid var(--border)',
        color: 'var(--muted)',
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="info" size={10} label={reason} />
      Not in Rate
    </span>
  )
}

function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: 'danger' | 'warning' | 'info'
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  const skin =
    tone === 'danger'
      ? { border: 'var(--danger)', background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)' }
      : tone === 'warning'
        ? { border: 'var(--ready-text)', background: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)' }
        : { border: 'var(--border)', background: 'var(--card2)', color: 'var(--text2)' }
  return (
    <div
      role={tone === 'info' ? undefined : 'alert'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--r-card)',
        border: `1px solid ${skin.border}`,
        background: skin.background,
        color: skin.color,
        fontSize: 'var(--t-meta)',
        lineHeight: 1.55,
      }}
    >
      <Icon name={icon} size={15} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: children ? 2 : 0 }}>{title}</strong>
        {children}
      </span>
      {action && <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{action}</span>}
    </div>
  )
}

/* ── export ────────────────────────────────────────────────────────────── */

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/* ── the screen ────────────────────────────────────────────────────────── */

/*
 * ── This screen does not mint a bundle number, and must not ────────────────
 *
 * What stood here:
 *
 *   const BUNDLE_ID = issue('BND', Number(sequence('BND')?.counter ?? 0) + 1)
 *
 * — the Bundle counter *as printed on the Settings ▸ Numbering render*,
 * advanced by one, computed once at module scope and then shown to the operator
 * in a read-only box labelled "Bundle ID · Auto generated", stamped on every row
 * of the CSV export and quoted in both save toasts.
 *
 * It is the identical defect `finance/modals/CreateInvoiceModal.tsx` (~9-42)
 * documents and refuses to repeat, and that decision is followed here rather
 * than re-litigated:
 *
 *  · **It collides.** Two operators building a bundle at the same time read the
 *    same counter and are both shown the same number. So does one operator in
 *    two tabs. A module-scope constant additionally freezes the value for the
 *    life of the page load, so it cannot even follow a bundle saved in between.
 *  · **It is a prediction of a figure the database owns.** `next_document_number
 *    (p_sequence_key)` takes a row lock and increments under it — the only way
 *    two concurrent inserts cannot collide — and `recordPayment.ts` and
 *    `createClient.ts` already call it by RPC for `payment_no` / `client_code`.
 *    Whatever eventually writes a bundle does the same.
 *  · **It is a prediction from the wrong source.** `data/numbering.ts` transcribes
 *    the numbering *screen*, not `number_sequences.current_value`, so the two
 *    are not the same counter and the operator would carry a number the ledger
 *    never issues.
 *
 * So the field says the number is assigned on save, the export no longer stamps
 * one, and the success toast quotes only what the action hands back.
 */
const NOTES_LIMIT = 500

export interface AddBundleProps {
  bundleRef?: string | undefined
  bundleId?: string | undefined
  initialBundle?: BundleWithItems | undefined
  embedded?: boolean | undefined
  onDone?: (() => void) | undefined
}

export function AddBundle(props: AddBundleProps = {}) {
  const { bundleRef: propBundleRef, embedded, onDone } = props
  const routeParams = useParams<{ bundleRef: string }>()
  const bundleRef = propBundleRef ?? routeParams.bundleRef
  const isEditMode = Boolean(bundleRef)
  const navigate = useNavigate()
  const handleExit = () => (onDone ? onDone() : navigate('/inventory'))
  const money = useCanViewMoney()
  /*
    Spec 7.7: "TABLET: three panes become three stacked sections. PHONE: three
    accordion steps with a sticky [Save]." This screen had no width read at all
    and pinned a two-pane grid plus a 318px rail at every width, so the form was
    unusable below 1280. `viewport` now drives the three bands; the sticky save
    bar below 768 follows BookingDetail's in-repo precedent.
  */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)

  /* §4 — Bundle Details */
  const [name, setName] = useState('')
  const [category, setCategory] = useState<InventoryCategory | ''>('')
  const [active, setActive] = useState(true)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  /* §7.3 — the rate is computed; an override is declared, never hidden. */
  const [override, setOverride] = useState(false)
  const [overrideRate, setOverrideRate] = useState('')
  const [overrideReason, setOverrideReason] = useState('')

  /* §5 / §6 — the tree and the lines */
  /* Empty, not `INITIAL_LINES`. Those ten lines carry SEED model ids, so on
     a live catalogue every one is unresolvable — the screen used to boot
     pre-populated and refuse on line 1 the moment Create was pressed. */
  const [lines, setLines] = useState<DraftLine[]>([])
  const [originalBundle, setOriginalBundle] = useState<BundleWithItems | null>(props.initialBundle ?? null)
  const [initialLineKeys, setInitialLineKeys] = useState<Map<string, string>>(new Map()) // itemId -> lineKey
  const [deactivatedItemIds, setDeactivatedItemIds] = useState<string[]>([])
  const existingBundleRecord = useBundleWithItems(bundleRef, money)
  const [search, setSearch] = useState('')
  const [fCategory, setFCategory] = useState<'All' | InventoryCategory>('All')
  const [fBrand, setFBrand] = useState('All')
  const [fAvailability, setFAvailability] = useState<'Any' | 'Free now' | 'Nothing free'>('Any')
  const [fChildren, setFChildren] = useState<'Any' | 'Yes' | 'No'>('Any')
  const [treeOpen, setTreeOpen] = useState<Set<string>>(new Set())
  const [childrenOpen, setChildrenOpen] = useState<Set<string>>(new Set())

  /* §10 — crew, vehicle, boxes */
  const [crew, setCrew] = useState<CrewPick[]>([])
  const [vehicle, setVehicle] = useState<VehicleType | null>(null)

  const [notes, setNotes] = useState('')

  /*
   * ── The catalogue this screen builds a bundle FROM ─────────────────────
   *
   * `products`, not `data/addBundle.ts`'s twenty seed models. `bundle_items`
   * .product_id is a uuid FK, and 19 of those 20 model NAMES match no products
   * row — the real catalogue is Booqable-shaped ('Sony FX3 Full-Frame Camera',
   * not 'Sony FX3 Cinema Camera'), so `createBundle` refused on line 1 and every
   * Create Bundle and Save Draft failed after the form reported every gate green.
   *
   * `DraftLine.modelId` therefore now carries a real `products.id`. That id is
   * the join key for `availabilityOf`, `breakdownOf`, `rateDriftOf` and
   * `LineRow`, every one of which resolves it through a map and SKIPS SILENTLY
   * on a miss — which is why each of them is now handed `liveById` explicitly
   * rather than falling back to the seed map. Miss that and the screen empties
   * itself with no error at all.
   *
   * What is honestly available and what is not: `unitsByState` is per-UNIT, and
   * a quantity-tracked product has no units, so its stock is `totalQuantity` and
   * the state split is unknown rather than zero. Nothing here invents a
   * reservation. `children` has no schema behind it at all, so a live model
   * carries none and the child affordances simply have nothing to show.
   */
  /*
   * §4.44 — availability is the answer to "free *when*", so the operator picks
   * the window and it lives in the URL, exactly as the Bundles pane and the
   * bundle detail page do. A create form having one is not odd: the kit is a
   * template, but the question the picker used to answer badly — "can I field
   * this" — only has an answer against dates.
   */
  const { window: availabilityWindow, setWindow } = useRentalWindowParams()
  const { fromAd: winFromAd, toAd: winToAd } = availabilityWindow

  const [catalogue, setCatalogue] = useState<InventoryModel[]>([])
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [catalogueLoading, setCatalogueLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    /* Rebuilt from the two primitives, not captured from the object: the hook
       returns a fresh `window` every render, and depending on it would refetch
       the whole catalogue forever. */
    const win = { fromAd: winFromAd, toAd: winToAd }
    setCatalogueLoading(true)
    void (async () => {
      try {
        /* The same read New Rental's equipment picker uses
           (`rentals/NewRental.tsx:1731`). `withMoney` is true because this
           screen is Law 6-gated to money-visible roles already — it returns
           above for anyone else — and a bundle line stores the unit rate. */
        const inv = await listInventory({ page: { index: 0, size: 500 }, withMoney: true })
        if (cancelled) return
        const rows = inv.rows.filter((r) => r.isActive)
        /* §4.44 — the same engine the Bundles pane and New Rental ask, for the
           window the operator picked above.
           RULING 2026-09-09 (R-37): §4.45(a) is closed by asking the engine for a
           window, not by collapsing ten unit statuses into four pools. Revert =
           restore the `unitsByState` mapping in git and drop the window control. */
        const byProduct = await readProductAvailability(win, rows.map((r) => r.id))
        if (cancelled) return
        setCatalogue(
          rows.map((r): InventoryModel => {
              const answer = byProduct.get(r.id)
              /* The engine's own count of stock, whichever half answered:
                 non-retired unit rows, or `total_quantity` for bulk. Falling
                 back to the list read only if the product is missing from the
                 map, which `readProductAvailability` does not do. */
              const stock =
                answer?.unitsOwned ??
                (r.trackingMode === 'Serialised' ? r.unitCountExcludingRetired : r.totalQuantity)
              const free = answer?.unitsFree ?? 0
              const held = answer?.unitsHeld ?? 0
              return {
                id: r.id,
                sku: r.assetCode,
                name: r.name,
                brand: r.brand,
                category: (r.category ?? 'Other') as InventoryCategory,
                stock,
                available: free,
                /* `reserved` is renamed **Held** in the render, and it is the
                   engine's one figure for "another booking has this across the
                   window". It is not split into reserved-versus-on-rent because
                   nothing answers that for a window: `product_units.status` is
                   a now-state, and reading it here is exactly the defect this
                   replaced — a hold three weeks out left `status` at In Stock,
                   so the picker called four held C-stands free. */
                reserved: held,
                onRent: 0,
                /* The remainder, so §5.1's invariant holds by construction:
                   owned, but neither free nor claimed by a booking — a unit in
                   maintenance, cleaning, inspection, or missing. Named for the
                   largest of those rather than measured, and never rendered. */
                maintenance: Math.max(0, stock - free - held),
                unitRatePaisa: r.dailyRate ?? (0 as Paisa),
              }
            }),
        )
      } catch (e) {
        if (cancelled) return
        setCatalogueError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setCatalogueLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [winFromAd, winToAd])

  const liveById: ReadonlyMap<string, InventoryModel> = useMemo(
    () => new Map(catalogue.map((m) => [m.id, m])),
    [catalogue],
  )
  /* Shadows the seed `modelOf` this file used to import. Every lookup in this
     component resolves against the live catalogue. */
  const modelOf = (id: string): InventoryModel | undefined => liveById.get(id)

  const liveCategories2 = useMemo(
    () => [...new Set(catalogue.map((m) => m.category))].sort((a, b) => a.localeCompare(b)),
    [catalogue],
  )
  const liveBrands = useMemo(
    () => [...new Set(catalogue.map((m) => m.brand))].sort((a, b) => a.localeCompare(b)),
    [catalogue],
  )

  /* prompts */
  const [askParent, setAskParent] = useState<InventoryModel | null>(null)
  const [askPromote, setAskPromote] = useState<{ model: InventoryModel; parents: DraftLine[] } | null>(null)
  const [askRemoveChild, setAskRemoveChild] = useState<{ lineKey: string; child: InventoryModel } | null>(null)
  const [duplicateNote, setDuplicateNote] = useState<string | null>(null)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [packingOpen, setPackingOpen] = useState(false)
  const [seq, setSeq] = useState(100)

  /*
   * ── The save seam ─────────────────────────────────────────────────────────
   *
   * `saveError` is why a save did not happen, held until the operator resolves
   * it — Law 12: errors are inline and persistent, and `useToast()` exposes
   * only `showSuccessToast`, which is the wrong shape for a failure by
   * definition. It renders through this screen's existing `Banner tone="danger"`
   * (already used for the seed-reconciliation and unauthorised-discount cases),
   * so no new error affordance was invented for it.
   *
   * `saving` disables both buttons while a dispatch is in flight, so a second
   * click cannot start a second write.
   */
  /*
   * The categories that EXIST. This offered `data/addBundle.ts`'s
   * `INVENTORY_CATEGORIES` — sixteen labels off the `product_category` enum —
   * under a hint reading "From the Inventory category list", which was exactly
   * the false claim: `inventory_categories` holds SIX rows
   * (`0012_seed_data.sql:115-123`, the only insert into it in any migration).
   * `bundles.category_id` is a uuid FK, so ten of the sixteen refused the save.
   */
  const { rows: liveCategories } = useInventoryCategories()

  const fetchedBundle: BundleWithItems | undefined = props.initialBundle ?? existingBundleRecord.rows[0]
  useEffect(() => {
    if (!isEditMode || !fetchedBundle) return
    if (originalBundle?.id === fetchedBundle.id) return

    setOriginalBundle(fetchedBundle)
    setName(fetchedBundle.name)
    setDescription(fetchedBundle.description ?? '')
    setActive(fetchedBundle.isActive)

    if (fetchedBundle.category) {
      setCategory(fetchedBundle.category as InventoryCategory)
    } else if (fetchedBundle.categoryId && liveCategories.length > 0) {
      const match = liveCategories.find((c) => c.id === fetchedBundle.categoryId)
      if (match) setCategory(match.name as InventoryCategory)
    }

    const itemKeyMap = new Map<string, string>()
    const initialLines: DraftLine[] = (fetchedBundle.items ?? []).map((item: BundleComponent, index: number) => {
      const key = `L${100 + index}`
      itemKeyMap.set(item.itemId, key)
      const originalRate = item.dailyRate ?? (0 as Paisa)
      return {
        key,
        modelId: item.productId,
        qty: item.quantity,
        originalRatePaisa: originalRate,
        discountKind: 'pct',
        discountPct: 0,
        discountFixedPaisa: rupees(0),
        childIds: [],
        discountReason: '',
        approvedBy: null,
      }
    })
    setSeq(100 + initialLines.length)
    setLines(initialLines)
    setInitialLineKeys(itemKeyMap)

    const sumParts = initialLines.reduce((sum, l) => sum + l.originalRatePaisa * l.qty, 0)
    if (fetchedBundle.dailyRate !== sumParts && fetchedBundle.dailyRate > 0) {
      setOverride(true)
      setOverrideRate(String(toRupees(fetchedBundle.dailyRate)))
      setOverrideReason('Existing bundle daily rate override')
    }
  }, [isEditMode, fetchedBundle, originalBundle?.id, liveCategories])

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * **Law 8 — one key per row, minted where the operator acts** (the
   * AddEquipment `writeKeys` pattern). The bundle key and each line's key are
   * minted on the first press of a save button and reused by every retry of
   * that press, so a network wobble retried resolves to the SAME bundle
   * instead of minting a second one under a second code. Reset only after a
   * save that succeeded: the next press is then a new bundle on purpose,
   * which is what pressing Save Draft twice has always meant on this screen.
   */
  /* Record revision for the atomic save (update_bundle, 0153). Read when the edit opens; a save made
     against a bundle that has since changed is refused and the operator's entries are kept. */
  const [bundleRevision, setBundleRevision] = useState<string | null>(null)
  const [revisionError, setRevisionError] = useState<string | null>(null)
  const bundleKeyFingerprint = useRef<string | null>(null)
  const editingBundleId = isEditMode ? (fetchedBundle?.id ?? null) : null
  useEffect(() => {
    if (!editingBundleId) return
    let active = true
    void readRecordEditor('bundle', editingBundleId)
      .then((snap) => { if (active) { setBundleRevision(snap.revision); setRevisionError(null) } })
      .catch((err: unknown) => { if (active) setRevisionError(err instanceof Error ? err.message : String(err)) })
    return () => { active = false }
  }, [editingBundleId])

  /* Unsaved-change protection: the baseline is the form as first shown (hydrated record in edit mode,
     the empty form in create mode). Cancel and link navigation ask only when something differs. */
  const bundleFingerprint = JSON.stringify({ name, category, active, description, lines: lines.map((l) => [l.modelId, l.qty]), deactivatedItemIds, override, overrideRate })
  const bundleBaseline = useRef<string | null>(null)
  useEffect(() => {
    if (bundleBaseline.current !== null) return
    if (isEditMode && !originalBundle) return
    bundleBaseline.current = bundleFingerprint
  })
  const bundleDirty = bundleBaseline.current !== null && bundleFingerprint !== bundleBaseline.current
  useUnsavedRecord(bundleDirty)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const requestExit = () => (bundleDirty ? setConfirmCancel(true) : handleExit())
  const writeKeys = useRef<{ bundle: string | null; lines: Map<string, string> }>({
    bundle: null,
    lines: new Map(),
  })

  /*
   * ── derived, never typed ─────────────────────────────────────────────
   * ⛔ These four hooks must stay **above** the `if (!money) return` gate
   * below. React requires the same hooks in the same order on every render;
   * a role change (Owner/Admin → Warehouse) while this component stays
   * mounted flips `money` and previously left these `useMemo` calls skipped
   * on one render and executed on the next — "Rendered fewer/more hooks
   * than expected," reproduced live by toggling the session role in place.
   * Foundation §6: "A blank page is never acceptable" covers a crash here
   * exactly as it covers one anywhere else.
   */
  const pricing = useMemo(() => pricingOf(lines), [lines])
  const availability = useMemo(() => availabilityOf(lines, liveById), [lines, liveById])
  const breakdown = useMemo(() => breakdownOf(lines, crew, vehicle, liveById), [lines, crew, vehicle, liveById])
  const drift = useMemo(() => rateDriftOf(lines, liveById), [lines, liveById])

  /* ── §13 · this page sets prices, so the floor does not get it ────────── */
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <ScreenHeader
          embedded={embedded}
          icon={isEditMode ? 'queues' : 'plus'}
          title={isEditMode ? `Edit ${originalBundle?.name ?? 'Bundle'}` : 'New Bundle'}
          description={
            isEditMode
              ? `${originalBundle?.bundleCode ?? bundleRef ?? ''} · Edit equipment kit and pricing.`
              : 'Create a reusable equipment kit and set bundle pricing.'
          }
        />
        <RestrictedState
          reason={
            isEditMode
              ? 'Editing a bundle is not available for your role. A bundle sets prices — every rate, discount and the daily rate itself — so editing one is a commercial decision your role does not carry. Ask an Owner, Admin, Coordinator or Accounts user to update it.'
              : 'Creating a bundle is not available for your role. A bundle sets prices — every rate, discount and the daily rate itself — so building one is a commercial decision your role does not carry. You can open any saved bundle from Inventory ▸ Bundles to see its contents and print its packing list. Ask an Owner, Admin, Coordinator or Accounts user to create a new one.'
          }
          requiredRole="Owner, Admin, Coordinator or Accounts"
        />
      </div>
    )
  }

  const overrideRatePaisa = parseMoney(overrideRate) ?? (0 as Paisa)
  const effectiveRatePaisa = override ? overrideRatePaisa : pricing.computedRatePaisa
  const impliedExtraPaisa = (pricing.computedRatePaisa - overrideRatePaisa) as Paisa
  const impliedExtraPct =
    pricing.sumOfPartsPaisa === 0 ? 0 : roundHalfUp((impliedExtraPaisa / pricing.sumOfPartsPaisa) * 100)
  const totalSavingPaisa = (pricing.sumOfPartsPaisa - effectiveRatePaisa) as Paisa
  const totalSavingPct =
    pricing.sumOfPartsPaisa === 0 ? 0 : roundHalfUp((totalSavingPaisa / pricing.sumOfPartsPaisa) * 100)

  /* Law 10 as amended 31 Aug 2026 — ungated; the only refusals left are a
     negative percent (a price rise) and >100% (a negative price). */
  const discountProblems = lines
    .map((l) => {
      const t = totalsOf(l)
      const v = validateDiscount(t.discountPct, l.discountReason, l.approvedBy)
      return v.valid ? null : { line: l, model: modelOf(l.modelId), message: v.error ?? 'Discount is not valid.' }
    })
    .filter((x): x is { line: DraftLine; model: InventoryModel | undefined; message: string } => x !== null)

  const blockingReason =
    SEED_ERRORS.length > 0
      ? 'The inventory tree does not reconcile — see the banner above.'
      : name.trim().length === 0
        ? 'A bundle needs a name.'
        : category === ''
          ? 'A bundle needs a primary category.'
          : breakdown.equipment === 0
            ? 'A bundle needs at least one equipment line.'
            : discountProblems.length > 0
              ? (discountProblems[0]?.message ?? 'A line discount is not valid.')
              : override && overrideRatePaisa <= 0
                ? 'An override rate must be above Rs 0.'
                : override && overrideReason.trim().length < 10
                  ? 'An override rate is stored with a reason of at least 10 characters.'
                  : null

  /**
   * A draft is a weaker claim than a bundle, but it is still a row with a name
   * on it — `CreateBundleInput.name` is required and `createBundle.validate`
   * throws on an empty one. The old handler papered over that with
   * `name: name || 'New Bundle'`, so an operator who saved before typing got a
   * bundle called something they never chose. Named here instead, and the
   * button is `Unavailable` with this reason until it is fixed.
   */
  const draftBlockingReason =
    SEED_ERRORS.length > 0
      ? 'The inventory tree does not reconcile — see the banner above.'
      : name.trim().length === 0
        ? 'A draft still needs a name — nothing here will invent one for you.'
        : null

  /* ── saving ────────────────────────────────────────────────────────────────
   *
   * ⛔ What both footer buttons used to do:
   *
   *   import('../../actions/inventory/createBundle').then((m) => m.createBundle({…}))
   *   showSuccessToast('Bundle created', `${BUNDLE_ID} · …`)
   *
   * — a floating dynamic-import promise with **no `ActionContext`** and **no
   * `.catch()`**, and a success toast fired synchronously beside it, quoting a
   * bundle number this screen had predicted. Create Bundle also called
   * `navigate('/inventory')` on the same tick, which in this app is the
   * universal "the write landed" signal.
   *
   * Every part of that was a claim about work that had not happened, and could
   * not: `createBundle` carries no `implemented: true`, so `createAction`
   * throws `ActionNotImplementedError` before validate/execute/events — into an
   * unhandled rejection nobody saw, while the operator read "Bundle created"
   * and was returned to the list.
   *
   * Now: a real session or a refusal; the dispatch is awaited; success reporting
   * and the navigation live *only* on the resolved path; and the rejection is
   * surfaced inline where the operator can act on it. The toast quotes the code
   * the action hands back — never one chosen here.
   *
   * (An earlier revision of this comment recorded `inventory.create` as
   * unmapped and the action as unimplemented. Both are stale since Phase 1:
   * `actions/core.ts` maps it to `rbac.canCreateBundle` — Owner/Admin/Manager
   * — and `createBundle.ts` carries `implemented: true` and really inserts.)
   *
   * What the payload now carries that it used to drop (item 2.6a): each line's
   * MODEL NAME, which the action resolves to a real `products.id` uuid by
   * SELECT (the seed id `'M-FX3-BODY'` is carried for the refusal message
   * only); the category NAME, resolved to `inventory_categories.id` the same
   * way; and `effectiveRatePaisa` — the rate every card on this screen shows —
   * so the row's `daily_rate` is the figure the toast quotes, not zero.
   */
  const saveBundle = (isDraft: boolean) => {
    if (!user) {
      setSaveError(
        'You are not signed in, so this bundle cannot be attributed to anyone. Nothing was saved. Sign in and try again.',
      )
      return
    }
    if (isEditMode && !bundleRevision) {
      setSaveError(revisionError ? `Bundle not updated - the current version could not be read: ${revisionError} Everything you typed is still here.` : 'Still loading the latest version of this bundle - try again in a moment. Everything you typed is still here.')
      return
    }
    // Law 8: one key per press, per row, reused by every retry of that press.
    const keys = writeKeys.current
    if (!keys.bundle) keys.bundle = newClientUuid()
    setSaveError(null)
    setSaving(true)

    if (isEditMode && originalBundle) {
      const patch: UpdateBundlePatch = {}
      if (name.trim() !== originalBundle.name) patch.name = name.trim()
      const descVal = description.trim() || null
      if (descVal !== (originalBundle.description ?? null)) patch.description = descVal

      const catHit = liveCategories.find((c) => c.name === category)
      const nextCatId = catHit ? catHit.id : null
      if (nextCatId !== (originalBundle.categoryId ?? null)) patch.categoryId = nextCatId
      if (active !== originalBundle.isActive) patch.isActive = active
      if (effectiveRatePaisa !== originalBundle.dailyRate) patch.dailyRatePaisa = effectiveRatePaisa

      const lineEdits: UpdateBundleLineEdit[] = []
      const lineAdds: UpdateBundleLineAdd[] = []
      const lineDeactivations: UpdateBundleLineDeactivate[] = deactivatedItemIds.map((itemId) => ({
        itemId,
        clientUuid: newClientUuid(),
      }))

      for (const l of lines) {
        let matchedInitialItemId: string | undefined
        for (const [itemId, lineKey] of initialLineKeys.entries()) {
          if (lineKey === l.key) {
            matchedInitialItemId = itemId
            break
          }
        }

        if (matchedInitialItemId) {
          const originalItem = originalBundle.items.find((i) => i.itemId === matchedInitialItemId)
          if (originalItem && originalItem.quantity !== l.qty) {
            lineEdits.push({
              itemId: matchedInitialItemId,
              quantity: l.qty,
              clientUuid: newClientUuid(),
            })
          }
        } else {
          lineAdds.push({
            productId: l.modelId,
            qty: l.qty,
            days: 1,
            clientUuid: newClientUuid(),
          })
        }
      }

      /* A retry of the SAME content reuses its key (idempotent); changed content gets a new one. */
      const fingerprint = JSON.stringify({ patch, lineEdits: lineEdits.map((e) => [e.itemId, e.quantity]), lineAdds: lineAdds.map((a) => [a.productId, a.qty]), lineDeactivations: lineDeactivations.map((d) => d.itemId) })
      if (bundleKeyFingerprint.current !== fingerprint) {
        keys.bundle = newClientUuid()
        bundleKeyFingerprint.current = fingerprint
      }
      void import('../../actions/inventory/updateBundle')
        .then((m) =>
          m.updateBundle(
            {
              clientUuid: keys.bundle as string,
              expectedRevision: bundleRevision as string,
              bundleId: originalBundle.id,
              patch,
              lineEdits,
              lineAdds,
              lineDeactivations,
            },
            { userId: user.id, role: user.role },
          ),
        )
        .then((result) => {
          writeKeys.current = { bundle: null, lines: new Map() }
          showSuccessToast('Bundle saved', `${result.bundleCode} · Changes applied successfully`)
          if (onDone) {
            onDone()
          } else {
            navigate(`/inventory/bundles/${result.bundleCode}`)
          }
        })
        .catch((err: unknown) => {
          setSaveError(
            `Bundle not updated — ${
              err instanceof Error ? err.message : 'the update failed and no reason was reported.'
            } Everything you typed is still here.`,
          )
        })
        .finally(() => setSaving(false))
      return
    }
    const items = lines.map((l) => {
      let lineKey = keys.lines.get(l.key)
      if (!lineKey) {
        lineKey = newClientUuid()
        keys.lines.set(l.key, lineKey)
      }
      return {
        modelId: l.modelId,
        /* `l.modelId` IS `products.id` now, so the action resolves it directly
           instead of matching a name that existed in no row. The name still
           rides along so a refusal can say which line it was about. */
        productId: l.modelId,
        productName: modelOf(l.modelId)?.name ?? l.modelId,
        qty: l.qty,
        discountPct: l.discountPct,
        discountReason: l.discountReason,
        approvedBy: l.approvedBy,
        clientUuid: lineKey,
      }
    })
    setSaveError(null)
    setSaving(true)
    void import('../../actions/inventory/createBundle')
      .then((m) =>
        m.createBundle(
          {
            clientUuid: keys.bundle as string,
            name: name.trim(),
            /* `exactOptionalPropertyTypes` — an unset category is absent from
               the payload, never the empty string, which would reach the action
               as a category nobody picked. Create Bundle cannot reach here with
               one unset (`blockingReason`); a draft can. */
            /* The uuid when this screen can resolve it, the name as the fallback —
               same shape as the equipment and transfer pickers. */
            ...(category ? { category } : {}),
            ...(() => {
              const hit = liveCategories.find((c) => c.name === category)
              return hit ? { categoryId: hit.id } : {}
            })(),
            ...(description.trim() ? { description: description.trim() } : {}),
            items,
            itemCount: isDraft ? lines.length : breakdown.totalItems,
            isDraft,
            /* Law 6 — Paisa here, rupees exactly once inside the action. This
               is the same figure the Pricing Summary and the success toast
               show, so the row can no longer read 0 while the toast quotes a
               rate. This page is unreachable for money-blind roles (the
               RestrictedState gate above), so the rate is always present. */
            dailyRatePaisa: effectiveRatePaisa,
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then((result) => {
        // A landed save consumes its keys: the NEXT press is a new bundle.
        writeKeys.current = { bundle: null, lines: new Map() }
        if (isDraft) {
          showSuccessToast('Draft saved', `${result.bundleCode} · ${lines.length} lines`)
        } else {
          showSuccessToast(
            'Bundle created',
            `${result.bundleCode} · ${breakdown.totalItems} items · ${formatMoney(effectiveRatePaisa)} per day`,
          )
          /* Only a landed write leaves the page. Navigating on the failing path
             would discard everything the operator typed to show them a list
             their bundle is not in.

             Lands on the new bundle's own page, not `/inventory` — which was the
             EQUIPMENT tab, so the operator was sent somewhere their bundle could
             not appear even in principle. `result.bundleCode` is the same string
             the toast above quotes, so the URL and the confirmation agree at the
             one moment someone is checking them against each other. */
          navigate(`/inventory/bundles/${result.bundleCode}`)
        }
      })
      .catch((err: unknown) => {
        setSaveError(
          `${isDraft ? 'Draft not saved' : 'Bundle not created'} — ${
            err instanceof Error ? err.message : 'the save failed and no reason was reported.'
          } Everything you typed is still here.`,
        )
      })
      .finally(() => setSaving(false))
  }

  /* ── line editing ─────────────────────────────────────────────────────── */

  const nextKey = () => {
    const k = `L${seq}`
    setSeq((s) => s + 1)
    return k
  }

  const patch = (key: string, updates: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...updates } : l)))

  const removeLine = (key: string) => {
    for (const [itemId, lineKey] of initialLineKeys.entries()) {
      if (lineKey === key) {
        setDeactivatedItemIds((prev) => [...prev, itemId])
        break
      }
    }
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const addModel = (m: InventoryModel, includeRequiredChildren: boolean) => {
    const key = nextKey()
    const childIds = includeRequiredChildren
      ? (m.children ?? []).filter((c) => c.required && !lines.some((l) => l.modelId === c.id)).map((c) => c.id)
      : []
    setLines((prev) => [
      ...prev,
      {
        key,
        modelId: m.id,
        qty: 1,
        originalRatePaisa: m.unitRatePaisa,
        discountKind: 'pct',
        discountPct: 0,
        discountFixedPaisa: rupees(0),
        childIds,
        discountReason: '',
        approvedBy: null,
      },
    ])
  }

  /** §5.2 / §5.3 — the two prompts adding a model can raise. */
  const requestAdd = (m: InventoryModel) => {
    const existing = lines.find((l) => l.modelId === m.id)
    if (existing) {
      patch(existing.key, { qty: existing.qty + 1 })
      return
    }
    const parents = parentsHolding(lines, m.id)
    if (parents.length > 0) {
      setAskPromote({ model: m, parents })
      return
    }
    if ((m.children ?? []).length > 0) {
      setAskParent(m)
      return
    }
    addModel(m, false)
  }

  /** §5.3 — promoting removes the model from its parent's children. */
  const promote = (m: InventoryModel, parents: DraftLine[]) => {
    setLines((prev) =>
      prev.map((l) =>
        parents.some((p) => p.key === l.key) ? { ...l, childIds: l.childIds.filter((c) => c !== m.id) } : l,
      ),
    )
    addModel(m, false)
    setAskPromote(null)
  }

  const toggleChild = (lineKey: string, childId: string, required: boolean, on: boolean) => {
    if (!on && required) {
      const child = modelOf(childId)
      if (child) {
        setAskRemoveChild({ lineKey, child })
        return
      }
    }
    setLines((prev) =>
      prev.map((l) =>
        l.key === lineKey
          ? { ...l, childIds: on ? [...new Set([...l.childIds, childId])] : l.childIds.filter((c) => c !== childId) }
          : l,
      ),
    )
  }

  const toggleIn = (set: Set<string>, apply: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const applyDuplicate = (bundleId: string) => {
    const src = TEMPLATE_BUNDLES.find((b) => b.id === bundleId)
    if (!src) return
    const d = duplicateFrom(src)
    setName(d.name)
    setCategory(d.category)
    setTags(d.tags)
    setLines(d.lines)
    setCrew(d.crew)
    setVehicle(d.vehicle)
    setOverride(false)
    setDuplicateNote(
      d.unmatched.length === 0
        ? `Copied every line of ${src.id} — ${d.lines.length} equipment lines, priced at today's rates.`
        : `Copied ${d.lines.length} of ${d.lines.length + d.unmatched.length} lines from ${src.id}. ` +
            `Not in this inventory tree: ${d.unmatched.join(', ')}.`,
    )
  }

  const resetDraft = () => {
    setLines([])
    setCrew(INITIAL_CREW)
    setVehicle(INITIAL_VEHICLE)
    setOverride(false)
    setOverrideReason('')
    setDuplicateNote(null)
  }

  const exportLines = () => {
    /* Was 'Bundle ID' + `BUNDLE_ID` on every row, and `${BUNDLE_ID}-lines.csv`
       as the filename — a predicted number stamped into a file that leaves the
       app and gets mailed around. The draft has no number until it is saved, so
       the column carries the name the operator actually typed. */
    const head = [
      'Bundle',
      'Model',
      'SKU',
      'Category',
      'Required Qty',
      'Original Rate',
      'Discount',
      'Bundle Rate',
      'Line Total',
      'Children',
      'Units Available',
      'Units in Stock',
    ]
    const body = lines.map((l) => {
      const m = modelOf(l.modelId)
      const t = totalsOf(l)
      return [
        name.trim() || 'Untitled draft',
        m?.name ?? l.modelId,
        m?.sku ?? '—',
        m?.category ?? '—',
        String(l.qty),
        formatMoney(l.originalRatePaisa),
        l.discountKind === 'pct' ? `${l.discountPct}%` : formatMoney(l.discountFixedPaisa),
        formatMoney(t.bundleRate),
        formatMoney(t.lineTotal),
        String(l.childIds.length),
        String(m?.available ?? 0),
        String(m?.stock ?? 0),
      ]
    })
    downloadCsv('bundle-draft-lines.csv', [head, ...body])
  }

  /* ── the tree ─────────────────────────────────────────────────────────── */

  const filtersOn =
    search.trim() !== '' || fCategory !== 'All' || fBrand !== 'All' || fAvailability !== 'Any' || fChildren !== 'Any'

  /* Roots only while unfiltered — an accessory belongs under its parent, not beside it. */
  /* Every row is a root: `children` is a seed-only relationship with no
     column behind it, so a live catalogue has no parents to nest under. */
  const treeRows = catalogue.filter((m) => {
    const q = search.trim().toLowerCase()
    if (q && !`${m.name} ${m.sku} ${m.brand} ${m.category}`.toLowerCase().includes(q)) return false
    if (fCategory !== 'All' && m.category !== fCategory) return false
    if (fBrand !== 'All' && m.brand !== fBrand) return false
    if (fAvailability === 'Free now' && m.available === 0) return false
    if (fAvailability === 'Nothing free' && m.available > 0) return false
    if (fChildren !== 'Any' && ((m.children ?? []).length > 0) !== (fChildren === 'Yes')) return false
    return true
  })

  const clearFilters = () => {
    setSearch('')
    setFCategory('All')
    setFBrand('All')
    setFAvailability('Any')
    setFChildren('Any')
  }

  /* ── the rail ─────────────────────────────────────────────────────────── */

  const segTotal = availability.segments.reduce((s, x) => s + x.value, 0) || 1
  const slices: Slice[] = availability.segments.map((s) => ({
    label: s.label,
    value: s.value,
    display: String(s.value),
    percent: `${Math.round((s.value / segTotal) * 100)}%`,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {SEED_ERRORS.length > 0 && (
        <Banner tone="danger" icon="alert_triangle" title="The inventory tree does not reconcile.">
          <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
            {SEED_ERRORS.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Banner>
      )}

      {/* §2 — breadcrumb only, and the shell already renders it. No Back button. */}
      <ScreenHeader
        embedded={embedded}
        icon={isEditMode ? 'queues' : 'plus'}
        title={isEditMode ? `Edit ${originalBundle?.name ?? 'Bundle'}` : 'New Bundle'}
        description={
          isEditMode
            ? `${originalBundle?.bundleCode ?? bundleRef ?? ''} · Edit equipment kit and pricing.`
            : 'Create a reusable equipment kit and set bundle pricing.'
        }
        actions={
          isEditMode ? (
            embedded && onDone ? (
              <Button icon="chevron_left" onClick={onDone}>
                Back to Bundle
              </Button>
            ) : null
          ) : (
            <>
              {embedded && onDone && (
                <Button icon="chevron_left" onClick={onDone}>
                  Back to Bundles
                </Button>
              )}
              <Unavailable reason="Templates are not built — there is no bundle template store in this release.">
                <Button icon="upload" disabled>
                  Import Template
                </Button>
              </Unavailable>
              <select
                aria-label="Duplicate an existing bundle"
                value=""
                onChange={(e) => e.target.value && applyDuplicate(e.target.value)}
                style={{
                  ...selectStyle,
                  width: 'auto',
                  border: '1px solid var(--btn-secondary-border)',
                  background: 'var(--btn-secondary-bg)',
                  fontWeight: 600,
                }}
              >
                <option value="">Duplicate Existing…</option>
                {TEMPLATE_BUNDLES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.name}
                  </option>
                ))}
              </select>
            </>
          )
        }
      />

      {duplicateNote && (
        <Banner
          tone="info"
          icon="info"
          title="Copied from a saved bundle"
          action={
            <Button icon="close" onClick={() => setDuplicateNote(null)}>
              Dismiss
            </Button>
          }
        >
          {duplicateNote}
        </Banner>
      )}

      {/* §7.4 — rates that moved since this draft was priced. Never refreshed silently. */}
      {drift.length > 0 && (
        <Banner
          tone="warning"
          icon="alert_triangle"
          title={`${drift.length} component ${drift.length === 1 ? 'rate has' : 'rates have'} changed since this bundle was priced.`}
          action={
            <Button
              icon="refresh"
              onClick={() =>
                setLines((prev) =>
                  prev.map((l) => {
                    const m = modelOf(l.modelId)
                    return m ? { ...l, originalRatePaisa: m.unitRatePaisa } : l
                  }),
                )
              }
            >
              Refresh rates
            </Button>
          }
        >
          {drift
            .map((d) => `${d.model.name} ${formatMoney(d.from)} → ${formatMoney(d.to)}`)
            .join(' · ')}
          . Refreshing recomputes the sum of parts and the saving; existing bookings are never affected.
        </Banner>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {/* ── 1 · Bundle Details ─────────────────────────────────────── */}
          <Section n={1} title="Bundle Details">
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : desktop ? 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto' : 'repeat(2, minmax(0,1fr))', gap: 14 }}>
              <Field label="Bundle Name" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sony FX3 Documentary Kit"
                  style={controlBase}
                />
              </Field>
              {/* Not an input, and not a number: the box held a prediction of the
                  next Bundle counter (see the note above `NOTES_LIMIT`). A
                  `FieldBlock`, because there is no control here to label. */}
              <FieldBlock
                label="Bundle ID"
                hint={isEditMode ? 'Permanent bundle identifier' : 'Assigned on save, by the database — not by this form'}
              >
                <span
                  className="identifier"
                  style={{
                    ...controlBase,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--card2)',
                    color: isEditMode ? 'var(--text)' : 'var(--muted)',
                    fontWeight: isEditMode ? 600 : 'normal',
                  }}
                >
                  {isEditMode ? (originalBundle?.bundleCode ?? bundleRef) : 'Assigned on save'}
                </span>
              </FieldBlock>
              <Field
                label="Primary Category"
                required
                hint="The categories `inventory_categories` actually holds."
              >
                <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory | '')} style={selectStyle}>
                  <option value="">
                    {liveCategories.length === 0 ? 'No category exists to file this under' : 'Select category…'}
                  </option>
                  {liveCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <FieldBlock label="Status">
                <button
                  type="button"
                  onClick={() => setActive((v) => !v)}
                  aria-pressed={active}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--sp-sm)',
                    height: 34,
                    padding: '0 10px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 30,
                      height: 17,
                      borderRadius: 'var(--r-badge)',
                      background: active ? 'var(--success)' : 'var(--st-neutral-bg)',
                      position: 'relative',
                      transition: 'background-color var(--dur) ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        width: 13,
                        height: 13,
                        borderRadius: 'var(--r-badge)',
                        background: 'var(--card)',
                        transform: active ? 'translateX(13px)' : 'translateX(0)',
                        transition: 'transform var(--dur) ease',
                      }}
                    />
                  </span>
                  {active ? 'Active' : 'Inactive'}
                </button>
              </FieldBlock>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : desktop ? 'minmax(0,1.6fr) minmax(0,1fr) auto' : 'repeat(2, minmax(0,1fr))', gap: 14, marginTop: 14 }}>
              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ ...controlBase, height: 'auto', padding: '8px 9px', resize: 'vertical', lineHeight: 1.5 }}
                />
              </Field>

              <FieldBlock label="Tags">
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  {tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--sp-xs)',
                        height: 24,
                        padding: '0 4px 0 9px',
                        borderRadius: 'var(--r-badge)',
                        background: 'var(--st-primary-bg)',
                        color: 'var(--st-primary-fg)',
                        fontSize: 'var(--t-th)',
                        fontWeight: 600,
                      }}
                    >
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove tag ${t}`}
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          width: 17,
                          height: 17,
                          border: 'none',
                          borderRadius: 'var(--r-badge)',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="close" size={10} />
                      </button>
                    </span>
                  ))}
                  <select
                    aria-label="Add a tag"
                    value=""
                    onChange={(e) => e.target.value && setTags((prev) => [...prev, e.target.value])}
                    style={{ ...selectStyle, height: 26, width: 'auto' }}
                  >
                    <option value="">+ Add tag</option>
                    {TAG_OPTIONS.filter((t) => !tags.includes(t)).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </span>
              </FieldBlock>

              <FieldBlock label="Thumbnail" hint="JPG or PNG, held in this browser only">
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 76,
                      height: 54,
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                      color: 'var(--muted)',
                    }}
                  >
                    {thumbnail ? (
                      <img src={thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Icon name="photo" size={19} />
                    )}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const reader = new FileReader()
                      reader.onload = () => setThumbnail(typeof reader.result === 'string' ? reader.result : null)
                      reader.readAsDataURL(f)
                    }}
                  />
                  <Button icon="upload" onClick={() => fileRef.current?.click()}>
                    {thumbnail ? 'Change image' : 'Add image'}
                  </Button>
                </span>
              </FieldBlock>
            </div>

            {/* §7.3 — computed by default; an override is declared and reasoned. */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 'var(--sp-md)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                  <span
                    className="figure"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 34,
                      padding: '0 11px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontWeight: 700,
                      fontSize: 'var(--t-ui)',
                      minWidth: 130,
                    }}
                  >
                    {formatMoney(effectiveRatePaisa)}
                  </span>
                  <span style={subtle}>
                    {override ? 'Override active' : /* Computed from the lines below (§7.3) */ "Computed from the lines below"}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setOverride((v) => !v)}
                  aria-pressed={override}
                  style={{
                    height: 34,
                    padding: '0 11px',
                    borderRadius: 'var(--r-btn)',
                    border: `1px solid ${override ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: override ? 'var(--nav-active-bg)' : 'var(--card2)',
                    color: override ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {override ? 'Disable override' : 'Set override rate'}
                </button>
              </div>

              {override && (
                <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <Field label="Target daily rate" required>
                    <input
                      value={overrideRate}
                      onChange={(e) => setOverrideRate(e.target.value)}
                      inputMode="decimal"
                      className="figure"
                      style={{ ...controlBase, width: 140 }}
                    />
                  </Field>

                  <Field
                    label="Reason for the override"
                    required
                    hint={`Stored with the bundle and audited. ${overrideReason.trim().length}/10 characters minimum.`}
                  >
                    <input
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Long-term retainer price agreed with the client"
                      style={{ ...controlBase, width: 340 }}
                    />
                  </Field>

                  {impliedExtraPct !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', paddingTop: 'var(--sp-sm)', borderTop: '1px solid var(--border)', marginTop: 'auto', minWidth: '100%' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--r-badge)', background: impliedExtraPct > 0 ? 'var(--st-progress-bg)' : 'var(--st-in-bg)', color: impliedExtraPct > 0 ? 'var(--st-progress-fg)' : 'var(--st-in-fg)', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                        <Icon name={impliedExtraPct > 0 ? 'alert_triangle' : 'info'} size={12} />
                        Implied extra discount: {formatMoney(impliedExtraPaisa)} ({impliedExtraPct > 0 ? '+' : ''}{impliedExtraPct}%)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ── 2 · Search Inventory + 3 · Bundle Items ─────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'minmax(230px, 286px) minmax(0,1fr)' : '1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
            <Section
              n={2}
              title="Search Inventory"
              bodyStyle={{ padding: 0 }}
              action={
                <button
                  type="button"
                  onClick={() => setTreeOpen(treeOpen.size === 0 ? new Set(catalogue.filter((m) => m.children).map((m) => m.id)) : new Set())}
                  style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-th)', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
                >
                  {treeOpen.size === 0 ? 'Expand all' : 'Collapse all'}
                </button>
              }
            >
              <div style={{ padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>
                <span style={{ position: 'relative', display: 'block' }}>
                  <Icon name="search" size={14} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--muted)' }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search equipment by name, SKU, brand…"
                    aria-label="Search equipment by name, SKU, brand"
                    style={{ ...controlBase, paddingLeft: 29 }}
                  />
                </span>
                <p style={{ margin: '8px 0 0', ...subtle, lineHeight: 1.5 }}>
                  {/* Select equipment models and their children to add to the bundle. §5.1 — */}Select equipment models and their children to add to the bundle. {' '}
                  <span className="figure">stock = available + reserved + on rent + maintenance</span>, asserted per row.
                </p>
              </div>

              {/*
                §4.44 — the window Free and Held below are measured against. It is
                not a filter: it does not decide which models are listed, it decides
                what "free" means for all of them.
              */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-md)',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  paddingBottom: 'var(--sp-sm)',
                }}
              >
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  Free from
                  <DateField
                    ariaLabel="Availability window from"
                    value={dayValue(winFromAd)}
                    onChange={(v) => setWindow('from', v)}
                    showBs={false}
                  />
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  to
                  <DateField
                    ariaLabel="Availability window to"
                    value={dayValue(winToAd)}
                    onChange={(v) => setWindow('to', v)}
                    showBs={false}
                    align="right"
                  />
                </label>
              </div>
              <p style={{ margin: 0, ...subtle, lineHeight: 1.5 }}>
                Free and Held are measured for this window. Click any row to add it to the bundle — required children are included automatically.
              </p>
              <DataTableShell ariaLabel="Catalogue availability for bundle" style={{ maxHeight: 460, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      <th style={{ ...th, position: 'sticky', top: 0, background: 'var(--th-bg)' }} scope="col">
                        Model
                      </th>
                      {/* §4.44 — `Free` and `Held` are answers for the window above, not
                         for "now". `Rent` is gone: the engine reports what a booking holds
                         across the window, and does not split that into on-rent versus
                         reserved, so a fourth column could only be filled by guessing. */}
                      {(['Stock', 'Free', 'Held'] as const).map((h) => (
                        <th key={h} style={{ ...th, textAlign: 'right', position: 'sticky', top: 0, background: 'var(--th-bg)' }} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalogueError !== null ? (
                      <tr>
                        <td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--danger)', padding: '22px 12px' }}>
                          The catalogue could not be read, so there is nothing to build a bundle from:{' '}
                          {catalogueError}
                        </td>
                      </tr>
                    ) : catalogueLoading ? (
                      <tr>
                        <td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text2)', padding: '22px 12px' }}>
                          Reading the equipment catalogue…
                        </td>
                      </tr>
                    ) : catalogue.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text2)', padding: '22px 12px' }}>
                          No active equipment exists yet, so a bundle has nothing to contain.
                        </td>
                      </tr>
                    ) : treeRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text2)', padding: '22px 12px' }}>
                          No product matches this search.
                          <span style={{ display: 'block', marginTop: 'var(--sp-sm)' }}>
                            <Button icon="refresh" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ) : (
                      treeRows.map((m) => {
                        const kids = m.children ?? []
                        const open = treeOpen.has(m.id)
                        const inBundle = lines.some((l) => l.modelId === m.id)
                        return (
                          <TreeRow
                            key={m.id}
                            model={m}
                            open={open}
                            inBundle={inBundle}
                            onToggleOpen={() => toggleIn(treeOpen, setTreeOpen, m.id)}
                            onAdd={() => requestAdd(m)}
                            childRows={
                              open
                                ? kids
                                    .map((c) => ({ child: modelOf(c.id), required: c.required }))
                                    .filter((x): x is { child: InventoryModel; required: boolean } => !!x.child)
                                : []
                            }
                            onAddChild={(child) => requestAdd(child)}
                            childInBundle={(id) => lines.some((l) => l.modelId === id)}
                          />
                        )
                      })
                    )}
                  </tbody>
                </table>
              </DataTableShell>
            </Section>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
              {/* the render's filter row, every control wired */}
              <div style={{ ...cardStyle, padding: '9px 12px', display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...subtle }}>
                  Category
                  <Select value={fCategory} onChange={(e) => setFCategory(e.target.value as 'All' | InventoryCategory)} style={filterSelect}>
                    <option value="All">All</option>
                    {liveCategories2.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...subtle }}>
                  Brand
                  <Select value={fBrand} onChange={(e) => setFBrand(e.target.value)} style={filterSelect}>
                    <option value="All">All</option>
                    {liveBrands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...subtle }}>
                  Availability
                  <Select
                    value={fAvailability}
                    onChange={(e) => setFAvailability(e.target.value as 'Any' | 'Free now' | 'Nothing free')}
                    style={filterSelect}
                  >
                    <option value="Any">Any</option>
                    <option value="Free now">Units free now</option>
                    <option value="Nothing free">Nothing free</option>
                  </Select>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...subtle }}>
                  Has Children
                  <Select value={fChildren} onChange={(e) => setFChildren(e.target.value as 'Any' | 'Yes' | 'No')} style={filterSelect}>
                    <option value="Any">Any</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </Select>
                </label>
                {filtersOn ? (
                  <Button icon="close" onClick={clearFilters}>
                    Clear All
                  </Button>
                ) : (
                  <Unavailable reason="No filter is set, so there is nothing to clear.">
                    <Button icon="close" disabled>
                      Clear All
                    </Button>
                  </Unavailable>
                )}
                <span className="figure" style={{ marginLeft: 'auto', ...subtle }}>
                  {treeRows.length} shown of {catalogue.length} products
                </span>
              </div>

              <Section
                n={3}
                title={`Bundle Items (${lines.length})`}
                bodyStyle={{ padding: 0 }}
                action={
                  lines.length > 0 ? (
                    <Button icon="close" onClick={() => setLines([])}>
                      Clear All Items
                    </Button>
                  ) : (
                    <Unavailable reason="There are no lines to clear.">
                      <Button icon="close" disabled>
                        Clear All Items
                      </Button>
                    </Unavailable>
                  )
                }
              >
                {lines.length === 0 ? (
                  <div style={{ padding: '40px 24px', textAlign: 'center', background: 'var(--card2)', borderRadius: 'var(--r-card)' }}>
                    <Icon name="package" size={32} style={{ color: 'var(--muted)' }} />
                    <p style={{ margin: '12px 0 6px', fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
                      No items in this bundle yet
                    </p>
                    <p style={{ margin: '0 0 16px', fontSize: 'var(--t-meta)', color: 'var(--text2)', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
                      Search or browse the inventory tree on the left. Click any model to add it — required children (like batteries for a camera) are included automatically.
                    </p>
                    <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      {/* §14 — a bundle needs at least one equipment line to be created. */}a bundle needs at least one equipment line to be created. </p>
                  </div>
                ) : (
                  /* BOTTOM corners here, not top: the Section draws its own
                     numbered title bar above (which paints no background, so
                     the top arc is already clean), and this scroller is the
                     LAST child of a padding-0 body — its <tfoot> row carries an
                     opaque --th-bg that squared off the card's 14px bottom
                     corners once v4.2 §6 raised --r-card from 8. `overflowX:
                     auto` already makes this a clip box, so the radius rounds
                     the totals row with it. */
                  <DataTableShell ariaLabel="Bundle components and rate breakdown" style={{ borderRadius: '0 0 var(--r-card) var(--r-card)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                      <thead>
                        <tr style={{ background: 'var(--th-bg)' }}>
                          <th style={th} scope="col">
                            Equipment Model
                            <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>Category</span>
                          </th>
                          <th style={{ ...th, textAlign: 'right' }} scope="col">
                            Required
                            <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>Qty</span>
                          </th>
                          <th style={{ ...th, textAlign: 'right' }} scope="col">
                            Original Rate
                            <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>per day</span>
                          </th>
                          <th style={th} scope="col">
                            Discount
                          </th>
                          <th style={{ ...th, textAlign: 'right' }} scope="col">
                            Bundle Rate
                            <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>per day</span>
                          </th>
                          {/* §6.2 — new, and the reason the summary could not be checked by eye. */}
                          <th style={{ ...th, textAlign: 'right' }} scope="col">
                            Line Total
                            <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>rate × qty</span>
                          </th>
                          <th style={{ ...th, textAlign: 'right' }} scope="col">
                            Children
                          </th>
                          <th style={th} scope="col">
                            Availability
                          </th>
                          <th style={{ ...th, textAlign: 'right' }} scope="col">
                            Remove
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <LineRow
                            key={l.key}
                            line={l}
                            childrenOpen={childrenOpen.has(l.key)}
                            onToggleChildren={() => toggleIn(childrenOpen, setChildrenOpen, l.key)}
                            onPatch={(u) => patch(l.key, u)}
                            onRemove={() => removeLine(l.key)}
                            onToggleChild={(childId, required, on) => toggleChild(l.key, childId, required, on)}
                            childIsLine={(id) => lines.some((o) => o.modelId === id)}
                            lookup={liveById}
                          />
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--th-bg)', borderTop: '1px solid var(--border)' }}>
                          <td style={{ ...td, fontWeight: 700 }}>
                            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                            {availability.totalItems}
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(pricing.sumOfPartsPaisa)}
                          </td>
                          <td className="figure" style={{ ...td, color: 'var(--danger-text)', fontWeight: 700 }}>
                            − {formatMoney(pricing.discountsPaisa)}
                          </td>
                          <td style={td} />
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(pricing.computedRatePaisa)}
                          </td>
                          <td style={td} />
                          <td className="figure" style={{ ...td, color: 'var(--text2)' }}>
                            {availability.readyItems} / {availability.totalItems} ready
                          </td>
                          <td style={td} />
                        </tr>
                      </tfoot>
                    </table>
                  </DataTableShell>
                )}
              </Section>

              {discountProblems.length > 0 && (
                <Banner tone="danger" icon="alert_triangle" title="A line discount is not authorised.">
                  <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
                    {discountProblems.map((p) => (
                      <li key={p.line.key}>
                        {p.model?.name ?? p.line.modelId} — {p.message}
                      </li>
                    ))}
                  </ul>
                </Banner>
              )}
            </div>
          </div>

          {/* ── 4 · Crew, Vehicle and Boxes ─────────────────────────────── */}
          <Section n={4} title="Crew, Vehicle and Boxes">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-lg)' }}>
              <div style={{ background: 'var(--card2)', borderRadius: 'var(--r-card)', padding: 'var(--sp-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
                  <Icon name="crew" size={14} style={{ color: 'var(--text2)' }} />
                  <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Crew suggestions</span>
                  <NotInRate what="crew" />
                </div>
                <p style={{ margin: '0 0 8px', ...subtle, lineHeight: 1.5 }}>
                  Roles, not people. Adding this bundle to a booking creates crew lines in that booking's Crew section, at
                  their own rates.
                </p>
                {crew.length === 0 && <p style={{ margin: '0 0 8px', ...subtle }}>No crew role suggested.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {crew.map((c) => (
                    <div key={c.role} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', flex: 1, minWidth: 0 }}>{c.role}</span>
                      <input
                        type="number"
                        min={1}
                        aria-label={`Headcount for ${c.role}`}
                        value={c.headcount}
                        onChange={(e) =>
                          setCrew((prev) =>
                            prev.map((x) =>
                              x.role === c.role ? { ...x, headcount: Math.max(1, Number(e.target.value) || 1) } : x,
                            ),
                          )
                        }
                        className="figure"
                        style={{ ...controlBase, width: 62, height: 30, textAlign: 'right' }}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${c.role}`}
                        onClick={() => setCrew((prev) => prev.filter((x) => x.role !== c.role))}
                        style={{ border: 'none', background: 'transparent', color: 'var(--danger-text)', cursor: 'pointer', padding: 'var(--sp-xs)' }}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <select
                  aria-label="Add a crew role"
                  value=""
                  onChange={(e) => {
                    const role = e.target.value as CrewRole
                    if (role) setCrew((prev) => [...prev, { role, headcount: 1 }])
                  }}
                  style={{ ...selectStyle, marginTop: 'var(--sp-sm)', height: 30 }}
                >
                  <option value="">+ Add a crew role</option>
                  {CREW_ROLES.filter((r) => !crew.some((c) => c.role === r)).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ background: 'var(--card2)', borderRadius: 'var(--r-card)', padding: 'var(--sp-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
                  <Icon name="truck" size={14} style={{ color: 'var(--text2)' }} />
                  <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Vehicle suggestion</span>
                  <NotInRate what="transport" />
                </div>
                <p style={{ margin: '0 0 8px', ...subtle, lineHeight: 1.5 }}>
                  The bundle carries the van so it is not forgotten; the money is calculated once, in the booking's
                  Transport section.
                </p>
                <select
                  aria-label="Vehicle suggestion"
                  value={vehicle ?? ''}
                  onChange={(e) => setVehicle(e.target.value === '' ? null : (e.target.value as VehicleType))}
                  style={selectStyle}
                >
                  <option value="">No vehicle</option>
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ background: 'var(--card2)', borderRadius: 'var(--r-card)', padding: 'var(--sp-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
                  <Icon name="package" size={14} style={{ color: 'var(--text2)' }} />
                  <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Boxes and bags</span>
                </div>
                <p style={{ margin: '0 0 8px', ...subtle, lineHeight: 1.5 }}>
                  {/* §10.4 — */}Not tracked yet. <strong>boxes are different.</strong> A case is equipment and <em>is</em> priced in the bundle
                  rate, so each one is a Bundle Item line above with its own availability.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {lines
                    .map((l) => ({ line: l, model: modelOf(l.modelId) }))
                    .filter((x) => x.model && BOX_CATEGORIES.has(x.model.category))
                    .map((x) => (
                      <span key={x.line.key} className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                        {x.model?.name} ×{x.line.qty}
                      </span>
                    ))}
                  {breakdown.boxes === 0 && <span style={subtle}>No case or bag on this bundle yet.</span>}
                </div>
                <select
                  aria-label="Add a case or bag"
                  value=""
                  onChange={(e) => {
                    const m = modelOf(e.target.value)
                    if (m) requestAdd(m)
                  }}
                  style={{ ...selectStyle, marginTop: 'var(--sp-sm)', height: 30 }}
                >
                  <option value="">+ Add a case or bag</option>
                  {catalogue.filter((m) => BOX_CATEGORIES.has(m.category)).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          {/* ── 5 · Notes ──────────────────────────────────────────────── */}
          <Section n={5} title="Notes (Optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_LIMIT))}
              rows={3}
              placeholder="Internal notes about this bundle…"
              aria-label="Internal notes"
              style={{ ...controlBase, height: 'auto', padding: '8px 9px', resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', marginTop: 6 }}>
              <span style={subtle}>{/* §11 — internal only. Never printed, never visible to the client. */}internal only. Never printed, never visible to the client. </span>
              <span className="figure" style={{ marginLeft: 'auto', ...subtle }}>
                {notes.length} / {NOTES_LIMIT}
              </span>
            </div>
          </Section>

          {/* §3 — the footer owns Cancel, Save Draft and Create Bundle.
              Spec 7.7 PHONE: "three accordion steps with a sticky [Save]" — so
              below 768 this bar sticks to the bottom of the viewport instead of
              sitting at the end of a very long scroll. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              paddingTop: 'var(--sp-md)',
              borderTop: '1px solid var(--border)',
              ...(phone
                ? {
                    position: 'sticky' as const,
                    bottom: 0,
                    zIndex: 3,
                    background: 'var(--bg)',
                    paddingBottom: 'var(--sp-sm)',
                  }
                : {}),
            }}
          >
            <Button onClick={requestExit}>Cancel</Button>
            <UnsavedLeaveDialog />
            <ConfirmDialog isOpen={confirmCancel} title="Discard unsaved changes?" description="Your edits to this bundle have not been saved and will be lost." confirmLabel="Discard" cancelLabel="Keep editing" variant="danger" onClose={() => setConfirmCancel(false)} onConfirm={() => { setConfirmCancel(false); handleExit() }} />
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {isEditMode ? (
                blockingReason ? (
                  <Unavailable reason={blockingReason}>
                    <Button icon="check" variant="primary" disabled>
                      Save Changes
                    </Button>
                  </Unavailable>
                ) : (
                  <Button icon="check" variant="primary" disabled={saving} onClick={() => saveBundle(false)}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                )
              ) : (
                <>
                  {draftBlockingReason ? (
                    <Unavailable reason={draftBlockingReason}>
                      <Button icon="file" disabled>
                        Save Draft
                      </Button>
                    </Unavailable>
                  ) : (
                    <Button icon="file" disabled={saving} onClick={() => saveBundle(true)}>
                      {saving ? 'Saving…' : 'Save Draft'}
                    </Button>
                  )}
                  {blockingReason ? (
                    <Unavailable reason={blockingReason}>
                      <Button icon="plus" variant="primary" disabled>
                        Create Bundle
                      </Button>
                    </Unavailable>
                  ) : (
                    <Button icon="plus" variant="primary" disabled={saving} onClick={() => saveBundle(false)}>
                      {saving ? 'Saving…' : 'Create Bundle'}
                    </Button>
                  )}
                </>
              )}
            </span>
          </div>

          {/* Law 12 — inline and persistent, beside the control that failed, and
              below it so it cannot push the buttons out from under the cursor.
              `Banner tone="danger"` already carries `role="alert"`. */}
          {saveError && (
            <Banner tone="danger" icon="alert_triangle" title="Nothing was saved.">
              {saveError}
            </Banner>
          )}
        </div>

        {/* ── right rail ─────────────────────────────────────────────────── */}
        {(() => {
          const railContent = (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            <Card title="Bundle Summary">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', marginBottom: 10 }}>
                <Donut
                  slices={slices}
                  size={108}
                  centreValue={`${availability.readyItems} / ${availability.totalItems}`}
                  centreLabel="Ready"
                />
                <Legend slices={slices} showPercent={false} />
              </div>
              <SummaryRows
                rows={[
                  { label: 'Total Items', value: String(breakdown.totalItems) },
                  { label: 'Equipment', value: String(breakdown.equipment) },
                  { label: 'Crew (not in rate)', value: String(breakdown.crew) },
                  { label: 'Vehicle (not in rate)', value: String(breakdown.vehicle) },
                  { label: 'Boxes / Bags', value: String(breakdown.boxes) },
                  {
                    label: 'Total Weight',
                    value: breakdown.totalWeightKg === null ? '—' : `${breakdown.totalWeightKg.toFixed(2)} KG`,
                  },
                ]}
              />
              <p style={{ margin: '9px 0 0', ...subtle, lineHeight: 1.5 }}>
                {/* §9 — */}Not tracked yet. <span className="figure">{breakdown.equipment} + {breakdown.crew} + {breakdown.vehicle} + {breakdown.boxes} = {breakdown.totalItems}</span>
                , asserted on render. The donut counts the {availability.totalItems} stocked items these lines require;
                crew and vehicle carry no stock record here, so they count in Total Items but not in the ready ratio.
              </p>
              {breakdown.totalWeightKg === null && (
                <p style={{ margin: '6px 0 0', ...subtle, lineHeight: 1.5 }}>
                  No weight is recorded against these models, so the total shows `—` rather than 0.
                </p>
              )}
            </Card>

            {/* §7 — derived, never typed. */}
            <Card title="Pricing Summary" action={<span style={subtle}>(Equipment Only)</span>}>
              <SummaryRows
                rows={[
                  { label: 'Sum of Parts', value: formatMoney(pricing.sumOfPartsPaisa) },
                  { label: 'Bundle Discounts', value: `− ${formatMoney(pricing.discountsPaisa)}` },
                  ...(override
                    ? [
                        { label: 'Computed from lines', value: formatMoney(pricing.computedRatePaisa) },
                        { label: 'Override rate', value: formatMoney(overrideRatePaisa) },
                        {
                          label: 'Implied extra discount',
                          value: `${formatMoney(impliedExtraPaisa)} (${impliedExtraPct}%)`,
                        },
                      ]
                    : []),
                  { label: 'Bundle Daily Rate', value: formatMoney(effectiveRatePaisa) },
                ]}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-sm)',
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--st-in-bg)',
                  color: 'var(--st-in-fg)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                }}
              >
                <Icon name="check" size={13} />
                You Save
                <span className="figure" style={{ marginLeft: 'auto' }}>
                  {formatMoney(totalSavingPaisa)} ({totalSavingPct}%)
                </span>
              </div>
              <p style={{ margin: '9px 0 0', ...subtle, lineHeight: 1.5 }}>
                Every figure is the sum of the {lines.length} {/* lines above. Crew and vehicle are not in this rate — they
                are priced in the booking's Crew and Transport sections (§10.4). */}lines above. Crew and vehicle are not in this rate — they are priced in the booking's Crew and Transport sections . </p>
            </Card>

            {/* §8.2 — one computation, two views. */}
            <Card title="Availability Summary">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  color: availability.blockedItems === 0 ? 'var(--success-text)' : 'var(--ready-text)',
                }}
              >
                <Icon name={availability.blockedItems === 0 ? 'check' : 'alert_triangle'} size={14} />
                <span className="figure">
                  {availability.readyItems} / {availability.totalItems} Ready
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 5,
                  fontSize: 'var(--t-meta)',
                  color: availability.blockedItems === 0 ? 'var(--text2)' : 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                <Icon name={availability.blockedItems === 0 ? 'info' : 'error'} size={13} />
                <span className="figure">{availability.blockedItems} blocked items</span>
              </div>

              {availability.blocked.length === 0 ? (
                <p style={{ margin: '9px 0 0', ...subtle, lineHeight: 1.5 }}>
                  {/* §8.1 — a line is blocked only when it has fewer available units than it requires. Every line here is
                  satisfied. Raise a required quantity above its free units to see the shortfall and its return date. */}a line is blocked only when it has fewer available units than it requires. Every line here is satisfied. Raise a required quantity above its free units to see the shortfall and its return date. </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                    {(blockedOpen ? availability.blocked : availability.blocked.slice(0, 1)).map((b) => (
                      <div
                        key={b.key}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-sm)',
                          padding: '8px 9px',
                          background: 'var(--card2)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>
                            {b.model.name}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 'var(--sp-xs)',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 'var(--r-badge)',
                              background: 'var(--st-danger-bg)',
                              color: 'var(--st-danger-fg)',
                              fontSize: 'var(--t-th)',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Icon name="alert_triangle" size={10} />
                            Short by {b.short}
                          </span>
                        </div>
                        <div style={{ ...subtle, marginTop: 3 }}>Held by: {b.by}</div>
                        {b.freesAd ? (
                          <div style={{ marginTop: 3 }}>
                            <BsAd date={b.freesAd} prefix="Returns" />
                          </div>
                        ) : (
                          <div style={subtle}>No return date recorded</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {availability.blocked.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBlockedOpen((v) => !v)}
                      aria-expanded={blockedOpen}
                      style={{
                        marginTop: 'var(--sp-sm)',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--link)',
                        fontSize: 'var(--t-th)',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {blockedOpen ? 'Show fewer' : `View all blocked items (${availability.blocked.length})`}
                    </button>
                  )}
                  {availability.readyAd && (
                    <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                      <span style={{ ...subtle, display: 'block', marginBottom: 2 }}>Estimated bundle ready</span>
                      <BsAd date={availability.readyAd} />
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card title="Quick Actions">
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <Tile icon="checklist" label="Packing List" onClick={() => setPackingOpen((v) => !v)} disabled={lines.length === 0} disabledReason="There are no lines to pack." />
                <Tile icon="download" label="Export Lines" onClick={exportLines} disabled={lines.length === 0} disabledReason="There are no lines to export." />
                <Tile icon="refresh" label="Reset Draft" onClick={resetDraft} />
              </div>

              {packingOpen && (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                  <p style={{ margin: '0 0 6px', ...subtle, lineHeight: 1.5 }}>
                    {/* §12 — models only, never serials. A unit is assigned at packing from whatever is free. */}models only, never serials. A unit is assigned at packing from whatever is free. </p>
                  <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {lines.map((l) => {
                      const m = modelOf(l.modelId)
                      return (
                        <li key={l.key} className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                          {m?.name ?? l.modelId} ×{l.qty}
                          {l.childIds.length > 0 && ` (+${l.childIds.length} inside)`}
                        </li>
                      )
                    })}
                    {crew.map((c) => (
                      <li key={c.role} className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        {c.role} ×{c.headcount} — not in rate
                      </li>
                    ))}
                    {vehicle && (
                      <li className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        {vehicle} ×1 — not in rate
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </Card>
          </div>
          )
          /* Rulings §7 — reflow, not hide. The summary sits beside the form at
             desktop and beneath it below 1280, never behind the rail handle. */
          return desktop ? <Rail width={318} label="Bundle summary">{railContent}</Rail> : railContent
        })()}
      </div>

      {/* ── §5.2 · include required children? ─────────────────────────────── */}
      {askParent && (
        <Prompt
          title={`${askParent.name} — include required child items?`}
          body={
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(askParent.children ?? []).map((c) => {
                const child = modelOf(c.id)
                if (!child) return null
                return (
                  <li key={c.id} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    {child.name}
                    <span style={{ ...subtle, marginLeft: 6 }}>{c.required ? 'required' : 'optional'}</span>
                  </li>
                )
              })}
            </ul>
          }
          note={/* Children are priced inside this line's rate, at Rs 0 of their own (§5.3). */ "Children are priced inside this line's rate, at Rs 0 of their own ."}
          actions={[
            {
              key: 'all',
              label: 'Yes, include all required',
              primary: true,
              onSelect: () => {
                addModel(askParent, true)
                setAskParent(null)
              },
            },
            {
              key: 'manual',
              label: 'Choose manually',
              onSelect: () => {
                addModel(askParent, false)
                setAskParent(null)
              },
            },
            { key: 'cancel', label: 'Cancel', onSelect: () => setAskParent(null) },
          ]}
        />
      )}

      {/* ── §5.3 · a child or a line, never both ──────────────────────────── */}
      {askPromote && (
        <Prompt
          title={`${askPromote.model.name} is already included in ${askPromote.parents
            .map((p) => modelOf(p.modelId)?.name ?? p.modelId)
            .join(', ')}.`}
          body={
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
              Promoting it removes it from that line's children and gives it its own quantity, rate and availability. An
              item is a child <strong>or</strong> a line, never both — otherwise it is priced twice and counted twice.
            </p>
          }
          actions={[
            {
              key: 'promote',
              label: 'Promote it to its own line',
              primary: true,
              onSelect: () => promote(askPromote.model, askPromote.parents),
            },
            { key: 'cancel', label: 'Leave it as a child', onSelect: () => setAskPromote(null) },
          ]}
        />
      )}

      {/* ── §5.2 · required children need confirmation to remove ──────────── */}
      {askRemoveChild && (
        <Prompt
          title={`Remove ${askRemoveChild.child.name} from this line?`}
          body={
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
              It is marked a <strong>required</strong> child, so the parent normally ships with it. Removing it does not
              change the line's rate — children are priced inside the parent.
            </p>
          }
          actions={[
            {
              key: 'yes',
              label: 'Remove it anyway',
              primary: true,
              onSelect: () => {
                setLines((prev) =>
                  prev.map((l) =>
                    l.key === askRemoveChild.lineKey
                      ? { ...l, childIds: l.childIds.filter((c) => c !== askRemoveChild.child.id) }
                      : l,
                  ),
                )
                setAskRemoveChild(null)
              },
            },
            { key: 'no', label: 'Keep it', onSelect: () => setAskRemoveChild(null) },
          ]}
        />
      )}
    </div>
  )
}

/* ── pieces ────────────────────────────────────────────────────────────── */

function Tile({
  icon,
  label,
  onClick,
  disabled,
  disabledReason,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  const style: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    padding: '11px 6px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    fontSize: 'var(--t-th)',
    fontFamily: 'inherit',
    color: 'var(--text)',
    textAlign: 'center',
  }
  if (disabled) {
    return (
      <Unavailable reason={disabledReason ?? 'Not available yet.'} style={{ flex: 1 }}>
        <span style={{ ...style, color: 'var(--disabled)', cursor: 'not-allowed' }}>
          <Icon name={icon} size={17} />
          {label}
        </span>
      </Unavailable>
    )
  }
  return (
    <button type="button" onClick={onClick} style={{ ...style, cursor: 'pointer' }}>
      <Icon name={icon} size={17} style={{ color: 'var(--text2)' }} />
      {label}
    </button>
  )
}

/** A centred confirm, used by §5.2 and §5.3. Escape and the backdrop both close it. */
function Prompt({
  title,
  body,
  note,
  actions,
}: {
  title: string
  body: ReactNode
  note?: string
  actions: Array<{ key: string; label: string; primary?: boolean; onSelect: () => void }>
}) {
  const cancel = actions[actions.length - 1]
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)' as unknown as number,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--sp-lg)',
        background: 'var(--scrim, rgba(0,0,0,0.55))',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel?.onSelect()
      }}
    >
      <div
        style={{
          ...cardStyle,
          maxWidth: 460,
          width: '100%',
          padding: 'var(--sp-lg)',
          borderRadius: 'var(--r-modal)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <h3 style={{ margin: '0 0 9px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
          {title}
        </h3>
        {body}
        {note && <p style={{ margin: '9px 0 0', ...subtle, lineHeight: 1.5 }}>{note}</p>}
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {actions.map((a) => (
            <Button key={a.key} {...(a.primary ? { variant: 'primary' as const } : {})} onClick={a.onSelect}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** §5.1 — one tree row, with its pools and its expandable children. */
function TreeRow({
  model,
  open,
  inBundle,
  onToggleOpen,
  onAdd,
  childRows,
  onAddChild,
  childInBundle,
}: {
  model: InventoryModel
  open: boolean
  inBundle: boolean
  onToggleOpen: () => void
  onAdd: () => void
  childRows: Array<{ child: InventoryModel; required: boolean }>
  onAddChild: (m: InventoryModel) => void
  childInBundle: (id: string) => boolean
}) {
  const kids = model.children ?? []
  const num: CSSProperties = { ...td, textAlign: 'right', padding: '8px 6px' }
  const hasAvailable = model.available > 0
  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)', background: inBundle ? 'var(--success-bg)' : undefined }}>
        <td style={{ ...td, paddingRight: 'var(--sp-xs)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {kids.length > 0 ? (
              <button
                type="button"
                onClick={onToggleOpen}
                aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${model.name}`}
                style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
              >
                <Icon name={open ? 'chevron_down' : 'chevron_right'} size={12} />
              </button>
            ) : (
              <span style={{ width: 12 }} aria-hidden />
            )}
            <button
              type="button"
              onClick={onAdd}
              title={inBundle
                ? `Add one more ${model.name}`
                : hasAvailable
                  ? `Add ${model.name} to the bundle`
                  : 'No units free — add anyway to queue for later availability'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                background: inBundle ? 'transparent' : 'transparent',
                padding: 0,
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                color: inBundle ? 'var(--text)' : hasAvailable ? 'var(--text)' : 'var(--text2)',
                minWidth: 0,
                opacity: 1,
              }}
            >
              <Icon name={iconForCategory(model.category)} size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--t-meta)' }}>{model.name}</span>
                <span className="identifier" style={{ ...subtle, display: 'block' }}>
                  {model.sku}
                  {inBundle && <span style={{ color: 'var(--success-text)', marginLeft: 6 }}>in bundle</span>}
                </span>
              </span>
            </button>
          </span>
        </td>
        <td className="figure" style={num}>
          {model.stock}
        </td>
        <td className="figure" style={{ ...num, color: model.available > 0 ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600 }}>
          {model.available}
        </td>
        <td className="figure" style={num}>
          {model.reserved}
        </td>
      </tr>
      {open &&
        childRows.map(({ child, required }) => (
          <tr key={child.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ ...td, paddingLeft: 30 }}>
              <button
                type="button"
                onClick={() => onAddChild(child)}
                title={`Add ${child.name} as its own line${child.available === 0 ? ' (no units free)' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: childInBundle(child.id) ? 'var(--text)' : child.available > 0 ? 'var(--text2)' : 'var(--text2)',
                  minWidth: 0,
                  opacity: 1,
                }}
              >
                <Icon name={iconForCategory(child.category)} size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)' }}>{child.name}</span>
                  <span className="identifier" style={subtle}>
                    {child.sku} · {required ? 'required' : 'optional'}
                    {childInBundle(child.id) && <span style={{ color: 'var(--success-text)', marginLeft: 6 }}>own line</span>}
                  </span>
                </span>
              </button>
            </td>
            <td className="figure" style={num}>
              {child.stock}
            </td>
            <td className="figure" style={{ ...num, color: child.available > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
              {child.available}
            </td>
            <td className="figure" style={num}>
              {child.reserved}
            </td>
          </tr>
        ))}
    </>
  )
}

/** §6.1 — one Bundle Items line, with its discount, its children and its availability.
 *
 * `discountOpen` / `onToggleDiscount` / `role` / `approverName` left this
 * signature with the discount gate (31 Aug 2026 — D3, no gate): they existed
 * only to drive the approval panel. */
function LineRow({
  line,
  childrenOpen,
  onToggleChildren,
  onPatch,
  onRemove,
  onToggleChild,
  childIsLine,
  lookup,
}: {
  line: DraftLine
  childrenOpen: boolean
  onToggleChildren: () => void
  onPatch: (u: Partial<DraftLine>) => void
  onRemove: () => void
  onToggleChild: (childId: string, required: boolean, on: boolean) => void
  childIsLine: (id: string) => boolean
  lookup: ReadonlyMap<string, InventoryModel>
}) {
  const m = lookup.get(line.modelId)
  /*
   * ⛔ Was `if (!m) return null` against the SEED map: a line the catalogue
   * could not resolve simply vanished from the table, with the totals below
   * still counting it. That silent skip is the failure mode this whole change
   * exists to remove — so an unresolvable line now SAYS so and offers the one
   * action that helps, instead of disappearing.
   */
  if (!m) {
    return (
      <tr>
        <td colSpan={9} style={{ padding: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--danger)' }}>
          This line points at an item the catalogue no longer holds
          (<code>{line.modelId}</code>), so the bundle cannot be saved with it.{' '}
          <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--danger)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
            Remove this line
          </button>
        </td>
      </tr>
    )
  }

  const t = totalsOf(line)
  const short = Math.max(0, line.qty - m.available)
  /* Law 10 as amended 31 Aug 2026 — the gate is GONE (D3, Babin: "don't put
     any gate on discount"). The per-line approval affordance, the reason/
     approver panel and the role check that lived here left with it; the only
     refusal `validateDiscount` still makes is arithmetic (negative, >100%),
     surfaced through the parent's discountProblems banner. */
  const gate = validateDiscount(t.discountPct)
  const kids = m.children ?? []
  const cols = 9

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ ...td, maxWidth: 190 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                flexShrink: 0,
                borderRadius: 'var(--r-xs)',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <Icon name={iconForCategory(m.category)} size={13} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, lineHeight: 1.3 }}>{m.name}</span>
              <span style={{ display: 'block', ...subtle }}>{m.category}</span>
            </span>
          </span>
        </td>

        <td style={{ ...td, textAlign: 'right' }}>
          <input
            type="number"
            min={1}
            aria-label={`Required quantity for ${m.name}`}
            value={line.qty}
            onChange={(e) => onPatch({ qty: Math.max(1, Number(e.target.value) || 1) })}
            className="figure"
            style={{ ...controlBase, width: 52, height: 30, padding: '0 6px', textAlign: 'right' }}
          />
        </td>

        <td className="figure" style={{ ...td, textAlign: 'right' }}>
          {formatMoney(line.originalRatePaisa)}
        </td>

        {/* §6.3 — percentage or fixed, never both. Switching clears the other. */}
        <td style={td}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
            <select
              aria-label={`Discount type for ${m.name}`}
              value={line.discountKind}
              onChange={(e) =>
                onPatch(
                  e.target.value === 'pct'
                    ? { discountKind: 'pct', discountFixedPaisa: rupees(0) }
                    : { discountKind: 'fixed', discountPct: 0 },
                )
              }
              style={{ ...selectStyle, height: 30, width: 48, padding: '0 3px' }}
            >
              <option value="pct">%</option>
              <option value="fixed">Rs</option>
            </select>
            {line.discountKind === 'pct' ? (
              <input
                type="number"
                min={0}
                max={100}
                aria-label={`Discount percent for ${m.name}`}
                value={line.discountPct}
                onChange={(e) => onPatch({ discountPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className="figure"
                style={{ ...controlBase, width: 58, height: 30, padding: '0 6px', textAlign: 'right' }}
              />
            ) : (
              <input
                aria-label={`Fixed discount for ${m.name}`}
                value={String(line.discountFixedPaisa / 100)}
                onChange={(e) => onPatch({ discountFixedPaisa: parseMoney(e.target.value) ?? (0 as Paisa) })}
                inputMode="decimal"
                className="figure"
                style={{ ...controlBase, width: 58, height: 30, padding: '0 6px', textAlign: 'right' }}
              />
            )}
          </span>
          {!gate.valid && (
            <span
              style={{
                display: 'block',
                marginTop: 3,
                fontSize: 'var(--t-th)',
                fontWeight: 700,
                color: 'var(--danger-text)',
              }}
            >
              {gate.error}
            </span>
          )}
        </td>

        <td style={{ ...td, textAlign: 'right' }}>
          <span className="figure" style={{ display: 'block', fontWeight: 700, color: 'var(--success-text)' }}>
            {formatMoney(t.bundleRate)}
          </span>
          {t.discountPct > 0 && (
            <span className="figure" style={{ display: 'block', ...subtle, textDecoration: 'line-through' }}>
              {formatMoney(line.originalRatePaisa)}
            </span>
          )}
        </td>

        <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
          {formatMoney(t.lineTotal)}
        </td>

        <td style={{ ...td, textAlign: 'right' }}>
          {kids.length === 0 ? (
            <span className="figure" style={subtle}>
              0
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleChildren}
              aria-expanded={childrenOpen}
              className="figure"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--link)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {line.childIds.length} ▾
            </button>
          )}
        </td>

        <td style={td}>
          {short > 0 ? (
            <span className="figure" style={{ color: 'var(--danger-text)', fontWeight: 700 }}>
              Short by {short}
              <span style={{ display: 'block', ...subtle }}>
                {m.available} / {m.stock} free
              </span>
            </span>
          ) : (
            <span className="figure" style={{ color: 'var(--success-text)', fontWeight: 600 }}>
              {m.available} / {m.stock}
              <span style={{ display: 'block', ...subtle }}>Available</span>
            </span>
          )}
        </td>

        <td style={{ ...td, textAlign: 'right' }}>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${m.name} from the bundle`}
            title={`Remove ${m.name} from the bundle`}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 7,
              background: 'transparent',
              color: 'var(--danger-text)',
              cursor: 'pointer',
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="close" size={13} />
          </button>
        </td>
      </tr>

      {/* §5.3 — the children checklist, with Select all · Clear all. */}
      {childrenOpen && kids.length > 0 && (
        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
          <td colSpan={cols} style={{ ...td, paddingLeft: 46 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 'var(--t-meta)' }}>Included in this line</strong>
              <span style={subtle}>{/* Priced inside the line's rate, at Rs 0 of their own (§5.3). */}Priced inside the line's rate, at Rs 0 of their own . </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-sm)' }}>
                <button
                  type="button"
                  onClick={() =>
                    onPatch({ childIds: kids.filter((c) => !childIsLine(c.id)).map((c) => c.id) })
                  }
                  style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-th)', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => onPatch({ childIds: [] })}
                  style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-th)', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
                >
                  Clear all
                </button>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
              {kids.map((c) => {
                const child = lookup.get(c.id)
                if (!child) return null
                const isLine = childIsLine(c.id)
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      fontSize: 'var(--t-meta)',
                      color: isLine ? 'var(--muted)' : 'var(--text)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={line.childIds.includes(c.id)}
                      disabled={isLine}
                      onChange={(e) => onToggleChild(c.id, c.required, e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                    {child.name}
                    <span style={subtle}>{c.required ? 'required' : 'optional'}</span>
                    <span className="figure" style={{ ...subtle, marginLeft: 'auto' }}>
                      {child.available} / {child.stock} free
                    </span>
                    {isLine && (
                      <span style={{ ...subtle, color: 'var(--ready-text)' }}>
                        already its own line — a child or a line, never both
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </td>
        </tr>
      )}

      {/* The reason/approver panel that lived here left with the discount
          gate (31 Aug 2026 — D3, no gate). `discountReason`/`approvedBy`
          survive on the draft line as OPTIONAL record-keeping fields; nothing
          requires them any more. */}
    </>
  )
}

export { AddBundle as LegacyAddBundle }
export default AddBundle
