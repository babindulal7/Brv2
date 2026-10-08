import type { CSSProperties } from 'react'
import {
  IconCheck,
  IconPhone,
  IconMail,
  IconSun,
  IconBolt,
  IconX,
  IconChevronRight,
  IconChevronLeft,
  IconChevronDown,
  IconTruck,
  IconCalendarEvent,
  IconPackage,
  IconCalendarDue,
  IconCalendarWeek,
  IconCalendar,
  IconArrowUp,
  IconArrowDown,
  IconArrowRight,
  IconArrowBackUp,
  IconExternalLink,
  IconCopy,
  IconArchive,
  IconEdit,
  IconDownload,
  IconRefresh,
  IconEye,
  IconEyeOff,
  IconDotsVertical,
  IconAlertCircle,
  IconAlertTriangle,
  IconFlag,
  IconInfoCircle,
  IconClock,
  IconSearch,
  IconPlus,
  IconBell,
  IconHome,
  IconChecklist,
  IconBox,
  IconUsers,
  IconStack2,
  IconCreditCard,
  IconUserStar,
  IconFileText,
  IconReceipt,
  IconChartBar,
  IconTool,
  IconSettings,
  IconHeadset,
  IconBriefcase,
  IconCurrencyDollar,
  IconBattery1,
  IconFileInvoice,
  IconCalendarStats,
  IconCircleFilled,
  IconMoon,
  IconRobot,
  IconPlug,
  IconSparkles,
  IconActivity,
  IconChevronUp,
  IconCamera,
  IconVideo,
  IconUpload,
  IconFolder,
  IconPhoto,
  IconBuilding,
  IconUser,
  IconSchool,
  IconId,
  IconLock,
  IconMinus,
  IconMessage,
  IconBarcode,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconFilter,
  IconBuildingBank,
  IconCash,
  IconQrcode,
  IconWallet,
  type Icon as TablerIconType,
} from '@tabler/icons-react'
import { captureError } from '../../lib/monitoring'

/**
 * Tabler icon registry. Keys are stable semantic names used by call sites, so a
 * screen never imports a Tabler component directly — swapping the underlying
 * glyph is a one-line change here.
 */
const REGISTRY = {
  // shell + chrome
  search: IconSearch,
  plus: IconPlus,
  bell: IconBell,
  headset: IconHeadset,
  settings: IconSettings,
  moon: IconMoon,
  sun: IconSun,
  zap: IconBolt,
  close: IconX,
  x: IconX,
  chevron_right: IconChevronRight,
  chevron_left: IconChevronLeft,
  chevron_down: IconChevronDown,
  more_vert: IconDotsVertical,
  arrow_right: IconArrowRight,
  external_link: IconExternalLink,
  edit: IconEdit,
  filter: IconFilter,
  copy: IconCopy,
  archive: IconArchive,

  // sidebar nav
  home: IconHome,
  checklist: IconChecklist,
  calendar: IconCalendar,
  box: IconBox,
  users: IconUsers,
  queues: IconStack2,
  card: IconCreditCard,
  crew: IconUserStar,
  file: IconFileText,
  receipt: IconReceipt,
  chart: IconChartBar,
  tool: IconTool,
  automation: IconRobot,
  plug: IconPlug,
  sparkles: IconSparkles,
  activity: IconActivity,
  chevron_up: IconChevronUp,

  // kpi tiles
  briefcase: IconBriefcase,
  truck: IconTruck,
  return_arrow: IconArrowBackUp,
  dollar: IconCurrencyDollar,
  alert_triangle: IconAlertTriangle,

  // content
  // No star glyph is registered on purpose — Dashboard.md §6 requires VIP to be
  // a badge, "never a star", and an unregistered icon cannot be reached for.
  battery: IconBattery1,
  invoice: IconFileInvoice,
  calendar_stats: IconCalendarStats,
  calendar_event: IconCalendarEvent,
  calendar_due: IconCalendarDue,
  calendar_week: IconCalendarWeek,
  dot: IconCircleFilled,
  package: IconPackage,
  arrow_up: IconArrowUp,
  arrow_down: IconArrowDown,
  download: IconDownload,
  refresh: IconRefresh,
  eye: IconEye,
  // Password reveal toggles (modules/auth/PasswordInput) — the pressed state
  // must read in shape, not colour alone, so hide gets its own glyph.
  eye_off: IconEyeOff,
  error: IconAlertCircle,
  alert_circle: IconAlertCircle,
  flag: IconFlag,
  info: IconInfoCircle,
  timer: IconClock,

  // evidence
  camera: IconCamera,
  video: IconVideo,
  upload: IconUpload,
  folder: IconFolder,
  photo: IconPhoto,

  /*
   * Added for the Inventory screens (Stock Check, Warehouses, Purchase
   * Requests, Add Equipment) and the Unified Inbox, which each reached for a
   * tick, a phone or an envelope and found nothing. A screen that needs a glyph
   * the registry lacks has two bad options — ship a raw SVG or ship a wrong
   * icon — so the registry grows instead. `check` in particular is what every
   * completed checklist row, verified gate and satisfied condition wants.
   */
  check: IconCheck,
  phone: IconPhone,
  mail: IconMail,

  // Add Client — client type segmented control + document rows
  company: IconBuilding,
  person: IconUser,
  user: IconUser,
  student: IconSchool,
  id_card: IconId,

  // Restricted state (StateViews.tsx) — no permission-gate icon existed
  lock: IconLock,
  minus: IconMinus,
  message: IconMessage,
  barcode: IconBarcode,
  panel_left_close: IconLayoutSidebarLeftCollapse,
  panel_left_open: IconLayoutSidebarLeftExpand,

  // Record Payment — the payment-method tap cards
  bank: IconBuildingBank,
  cash: IconCash,
  qr: IconQrcode,
  wallet: IconWallet,
} satisfies Record<string, TablerIconType>

export type IconName = keyof typeof REGISTRY

interface IconProps {
  name: IconName
  /** Bumps stroke weight for emphasis rather than switching to a filled glyph. */
  fill?: boolean
  size?: number
  /** Set to make this a labelled graphic for assistive tech; omit for decorative use. */
  label?: string
  className?: string
  style?: CSSProperties
  color?: string
}

export default function Icon({ name, fill = false, size = 20, label, className, style, color }: IconProps) {
  const Cmp = REGISTRY[name]
  if (!Cmp) {
    // BUG-001: this branch used to render `[Icon:name]` in bold red UNCONDITIONALLY,
    // so three bad names in `lib/status.ts` put 51 pieces of developer text inside
    // status chips on `/clients` and `/crew` — visible to a client. The marker is
    // worth keeping for whoever is developing, so it is kept in DEV and dropped in
    // the build. Rendering nothing is safe: Law 11 (§7.4) guarantees the label
    // always renders beside the icon, so a missing glyph costs decoration, never
    // meaning. `name` is typed `IconName`, so reaching here at all now takes a cast.
    console.error(`Icon "${name}" is not in the REGISTRY — rendering nothing.`)
    captureError(new Error('Icon not in REGISTRY: ' + name), { where: 'Icon.registry', name })
    if (import.meta.env.DEV) {
      return <span style={{ color: 'red', fontWeight: 'bold' }}>[Icon:{name}]</span>
    }
    return null
  }
  const resolvedClass = ['ui-icon', className].filter(Boolean).join(' ') || undefined
  const resolvedStyle = color ? { color, ...style } : style
  // Standardized stroke weights per design system: 1.5 regular, 2.0 fill (matches --icon-stroke / --icon-stroke-fill)
  const strokeWidth = fill ? 2.0 : 1.5
  return (
    <Cmp
      size={size}
      stroke={strokeWidth}
      className={resolvedClass}
      style={resolvedStyle}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  )
}
