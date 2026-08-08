import type { CSSProperties } from 'react'
import {
  IconCheck,
  IconPhone,
  IconMail,
  IconSun,
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
  IconDownload,
  IconRefresh,
  IconEye,
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
  type Icon as TablerIconType,
} from '@tabler/icons-react'

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
  close: IconX,
  chevron_right: IconChevronRight,
  chevron_left: IconChevronLeft,
  chevron_down: IconChevronDown,
  more_vert: IconDotsVertical,
  arrow_right: IconArrowRight,
  external_link: IconExternalLink,

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
  error: IconAlertCircle,
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
  student: IconSchool,
  id_card: IconId,

  // Restricted state (StateViews.tsx) — no permission-gate icon existed
  lock: IconLock,
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
}

export default function Icon({ name, fill = false, size = 20, label, className, style }: IconProps) {
  const Cmp = REGISTRY[name]
  return (
    <Cmp
      size={size}
      stroke={fill ? 2.4 : 1.9}
      className={className}
      style={style}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  )
}
