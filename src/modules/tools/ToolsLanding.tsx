import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, FooterNote, cardStyle } from '../../components/ui/Page'
import { useViewport } from '../../lib/device'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { isMoneySurface } from '../../data/nav'

/**
 * **Tools (landing) — `10_TOOLS.md` §10.1.**
 *
 * > **Nav position 10.** Six cards. Calculators + Admin. Nothing else.
 * > CALCULATORS: Depreciation · Pricing (2-up)
 * > ADMIN: Audit Log · Activity Log · Numbering (3-up) · Backup & Restore
 * > TABLET 2-up · PHONE 1-up full-width cards.
 *
 * Deliberately a landing page and nothing else — it owns no logic and holds no
 * state. Four of the six cards open screens that already exist under
 * `modules/admin/`, unchanged and unmoved; a later agent owns their content.
 *
 * **"Nothing else" has one exception, and it is the user's ruling, not ours:**
 * the cinematography calculator suite at `modules/settings/Tools.tsx` is KEPT
 * and stays reachable. It is fifteen categories of real, working formulas (crop
 * factor, depth of field, ND stops, timecode, storage, battery runtime) built
 * against `Tools.md` v3.1, and `10_TOOLS.md` never mentions it — the spec cuts
 * the *duplicate front doors* the old render carried, not that engine. It gets
 * its own group below rather than being folded into CALCULATORS, so a reader can
 * see that the spec's two calculators and this suite are different things.
 *
 * **RULED 12 Aug 2026 — the suite lives at `/tools/cinematography`.**
 * `WIREFRAME_RULINGS_2026-08-12.md` §6 closes the TODO(decision) that stood
 * here: *"Spec 10's 'Six cards… Nothing else' does not license deleting the
 * 1,616-line suite… It gets its own group on the Tools landing, a seventh card.
 * Pick `/tools/cinematography`, redirect the old path, and note it."*
 *
 * The reasoning behind the ruling, kept because the next reader will ask: the
 * suite's own header calls itself "Settings ▸ Tools" and says it *"lives inside
 * Settings and never takes a sidebar slot"* — written when Tools was on
 * Foundation §5.1's exclusion list. Tools is nav item 10 now, so that reasoning
 * is spent, and `11_SETTINGS.md`'s eight sections include no Tools, so
 * `/settings/tools` has no home in either spec. `/settings/tools` still
 * **resolves** — Law 3, nothing is deleted, so it is a `replace` redirect in
 * `App.tsx` rather than a 404, exactly as the four `/admin/*` paths are.
 */

interface ToolCard {
  label: string
  hint: string
  icon: IconName
  to: string
  /** Not built yet — the card says so rather than opening a convincing empty screen. */
  unbuilt?: boolean
}

interface ToolGroup {
  heading: string
  /** Desktop column count from the wireframe: CALCULATORS 2-up, ADMIN 3-up. */
  desktopColumns: number
  note?: string
  cards: ToolCard[]
}

const GROUPS: ToolGroup[] = [
  {
    heading: 'Calculators',
    desktopColumns: 2,
    cards: [
      {
        label: 'Depreciation',
        /* The hint names both tabs because both exist. The IRD one opens on a
           stated blocked reason — no spec or table in this repo supplies pool
           classes or statutory rates — which is a truthful destination, not an
           unbuilt one. */
        hint: 'Book view · IRD pool view (blocked on rates)',
        icon: 'chart',
        to: '/tools/depreciation',
      },
      {
        label: 'Pricing',
        hint: 'Rate, days, discount — a quote sandbox that books nothing',
        icon: 'dollar',
        to: '/tools/pricing',
      },
    ],
  },
  /*
   * The **Admin** group was removed on 15 Aug. Audit Log, Activity Log,
   * Numbering and Backup & Restore now live in one place — Settings ▸ System ▸
   * Administration — instead of two.
   *
   * They were never two screens, only two URLs: `/tools/audit-log` and
   * `/admin/audit-log` both resolved to the same component, four pages behind
   * eight routes. `/admin/*` is now the only spelling, and Tools is what its
   * name says — calculators.
   */
  {
    heading: 'Cinematography suite',
    desktopColumns: 2,
    note: 'Kept by ruling (Rulings §6) — 15 categories of camera, lens, exposure, timecode and power calculators.',
    cards: [
      {
        label: 'Camera & lens tools',
        hint: 'Crop factor · field of view · depth of field · ND · timecode · storage · battery',
        icon: 'camera',
        /* Ruled home. `/settings/tools` still resolves as a redirect. */
        to: '/tools/cinematography',
      },
    ],
  },
]

/**
 * **Law 6 — the floor gets a Tools page without the calculators in it.**
 *
 * Tools is nav item 10 for every role, which is right: `10_TOOLS.md` restricts
 * none of the four admin cards, Audit Log is "view-only for every role including
 * Owner", and a restore is already Owner-gated inside `SystemRestoreModal`. But
 * Depreciation (§10.2 — "purchase date · price … year │ opening │ dep │ WDV")
 * and Pricing (§10.3 — "qty · days · rate / discount chips / VAT") are money
 * screens, and nav item 10 was carrying a labelled entry point to both into
 * Warehouse, Technician, Driver and Client sidebars.
 *
 * The gate is `data/nav.ts`'s `isMoneySurface()` — the same predicate
 * `permittedNav()` and `App.tsx`'s Shell guard read — so a card cannot be listed
 * here and refused there, and a future money card is caught by adding one route
 * to one list. `rbac.ts`: forbidden items are **absent**, not disabled, so an
 * emptied group drops out entirely rather than showing a heading with nothing
 * under it.
 */
function visibleGroups(money: boolean): ToolGroup[] {
  if (money) return GROUPS
  return GROUPS.map((g) => ({ ...g, cards: g.cards.filter((c) => !isMoneySurface(c.to)) })).filter(
    (g) => g.cards.length > 0,
  )
}

export default function ToolsLanding() {
  const viewport = useViewport()
  const money = useCanViewMoney()
  const groups = visibleGroups(money)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="tool"
        title="Tools"
        /* The description names only what this role can actually open — a page
           that advertises calculators it then withholds tells a money-blind user
           there is a door they cannot find. */
        description={`${
          money ? 'Calculators and administration utilities' : 'Administration utilities'
        }. Every destination here has one home — Tools owns only what has no home elsewhere.`}
      />

      {groups.map((group) => (
        <section key={group.heading} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text2)',
            }}
          >
            {group.heading}
          </h2>
          {group.note && (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>{group.note}</p>
          )}
          <div
            style={{
              display: 'grid',
              /* Law 13 — the band comes from `useViewport()`, the only place the
                 768/1180 thresholds are defined. Phone is 1-up full-width,
                 tablet 2-up, desktop is the group's own count. */
              gridTemplateColumns: `repeat(${
                viewport === 'phone' ? 1 : viewport === 'tablet' ? Math.min(2, group.cards.length) : Math.min(group.desktopColumns, group.cards.length)
              }, minmax(0, 1fr))`,
              gap: 'var(--sp-md)',
            }}
          >
            {group.cards.map((card) => (
              <ToolTile key={card.to} card={card} />
            ))}
          </div>
        </section>
      ))}

      <FooterNote />
    </div>
  )
}

function ToolTile({ card }: { card: ToolCard }) {
  return (
    <Link
      to={card.to}
      style={{
        ...cardStyle,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        /* Law 15 — 44×44 at every width, desktop included. */
        minHeight: 88,
        padding: 14,
        textDecoration: 'none',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 34,
          height: 34,
          borderRadius: 'var(--r-sm)',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--nav-active-bg)',
          color: 'var(--nav-active-accent)',
          flexShrink: 0,
        }}
      >
        <Icon name={card.icon} size={18} />
      </span>
      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{card.label}</span>
          {card.unbuilt && (
            /* Law 11 — never colour alone. Icon + label + colour, all three. */
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 7px',
                borderRadius: 'var(--r-badge)',
                background: 'var(--st-progress-bg)',
                color: 'var(--st-progress-fg)',
                fontSize: 'var(--t-th)',
                fontWeight: 700,
              }}
            >
              <Icon name="timer" size={11} />
              Not built yet
            </span>
          )}
        </span>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>{card.hint}</span>
      </span>
      <Icon name="chevron_right" size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
    </Link>
  )
}
