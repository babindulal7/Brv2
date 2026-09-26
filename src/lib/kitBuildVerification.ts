/**
 * # Kit-Build Verification Engine — Outbound Cinema Checklist & Dependency Guard
 *
 * Law 1: Pages never implement business logic. Ten engines own it (`src/lib/`).
 *
 * Implements cinema kit completeness verification before dispatch.
 * Prevents missing cables, unverified media, uncertified power, and missing
 * gimbal plates from leaving the warehouse and causing field shoot failure.
 */

export type KitCategory =
  | 'cinema_camera'
  | 'gimbal'
  | 'wireless_video'
  | 'lighting'
  | 'audio'
  | 'general'

export interface KitDependencyCheck {
  id: string
  label: string
  description: string
  critical: boolean
}

export function detectKitCategory(productName: string): KitCategory {
  const lower = productName.toLowerCase()
  if (
    lower.includes('alexa') ||
    lower.includes('komodo') ||
    lower.includes('raptor') ||
    lower.includes('fx3') ||
    lower.includes('fx6') ||
    lower.includes('fx9') ||
    lower.includes('burano') ||
    lower.includes('red ') ||
    lower.includes('cinema camera') ||
    lower.includes('c70') ||
    lower.includes('c300')
  ) {
    return 'cinema_camera'
  }
  if (lower.includes('ronin') || lower.includes('rs3') || lower.includes('rs4') || lower.includes('gimbal')) {
    return 'gimbal'
  }
  if (
    lower.includes('teradek') ||
    lower.includes('accsoon') ||
    lower.includes('hollyland') ||
    lower.includes('mars ') ||
    lower.includes('wireless video') ||
    lower.includes('transmitter') ||
    lower.includes('receiver')
  ) {
    return 'wireless_video'
  }
  if (
    lower.includes('aputure') ||
    lower.includes('nanlite') ||
    lower.includes('600x') ||
    lower.includes('300d') ||
    lower.includes('light dome')
  ) {
    return 'lighting'
  }
  if (
    lower.includes('mic') ||
    lower.includes('sound devices') ||
    lower.includes('zoom h') ||
    lower.includes('wireless go') ||
    lower.includes('sennheiser')
  ) {
    return 'audio'
  }
  return 'general'
}

export function getCinemaKitDependencies(productName: string): KitDependencyCheck[] {
  const cat = detectKitCategory(productName)
  switch (cat) {
    case 'cinema_camera':
      return [
        {
          id: 'media',
          label: 'Media Card & Reader',
          description: 'CFexpress Type B / CFast 2.0 / SD V90 card + USB-C card reader',
          critical: true,
        },
        {
          id: 'power',
          label: 'Power Solution & V-Mount',
          description: 'V-Mount plate / BP-U batteries + D-Tap power cable & charger',
          critical: true,
        },
        {
          id: 'mount',
          label: 'Mount Adapter / Body Cap',
          description: 'PL/EF/E mount adapter, front sensor body cap & 15mm baseplate',
          critical: true,
        },
        {
          id: 'cables',
          label: 'Monitor & Video Cables',
          description: 'Right-angle 12G-SDI / Micro-HDMI to Full HDMI braided cable',
          critical: false,
        },
      ]
    case 'gimbal':
      return [
        {
          id: 'plate',
          label: 'Quick Release Plate & Screws',
          description: 'Arca-Swiss / Manfrotto quick release plate + 1/4" & 3/8" screws',
          critical: true,
        },
        {
          id: 'focus_motor',
          label: 'Focus Motor & Rod Mount',
          description: 'DJI Focus motor, 12mm/15mm rod, gear strip & USB-C control cable',
          critical: false,
        },
        {
          id: 'briefcase',
          label: 'Handle & Counterweights',
          description: 'Briefcase handle, tripod feet & roll axis counterweight set',
          critical: false,
        },
      ]
    case 'wireless_video':
      return [
        {
          id: 'antennas',
          label: 'TX & RX Antennas (Pair)',
          description: 'Check antenna threads. Never power TX without antennas attached',
          critical: true,
        },
        {
          id: 'patch_cables',
          label: 'SDI & HDMI Patch Cables',
          description: 'Thin high-flex SDI / HDMI patch leads tested on bench monitor',
          critical: true,
        },
        {
          id: 'power_cable',
          label: 'D-Tap / LEMO Power Lead',
          description: 'D-Tap to 2-pin LEMO or NP-F battery plate with locking barrel',
          critical: false,
        },
      ]
    case 'lighting':
      return [
        {
          id: 'cstand_sandbag',
          label: 'C-Stand + Sandbag (Safety)',
          description: 'Heavy duty C-stand with grip head + 10kg sandbag counterweight',
          critical: true,
        },
        {
          id: 'ballast_power',
          label: 'Control Box & Head Cable',
          description: 'High-voltage head cable, Neutrik powerCON cable & clamp',
          critical: true,
        },
      ]
    case 'audio':
      return [
        {
          id: 'adapters',
          label: '3.5mm TRS / XLR Patch Cable',
          description: 'Camera audio patch lead + locking 3.5mm screw-in connectors',
          critical: true,
        },
        {
          id: 'wind_protection',
          label: 'Deadcat / Windshield',
          description: 'Acoustic furry wind muff + magnetic clip mounts',
          critical: false,
        },
      ]
    default:
      return []
  }
}

export interface KitEvaluationItem {
  key: string
  name: string
  category: KitCategory
  dependencies: KitDependencyCheck[]
  verifiedDependencyIds: string[]
}

export interface KitEvaluationResult {
  hasCinemaGear: boolean
  totalDependencies: number
  verifiedCount: number
  allCriticalPassed: boolean
  unverifiedCriticalItems: Array<{ itemName: string; dependencyLabel: string }>
}

export function evaluateKitCompleteness(
  items: Array<{
    key: string
    name: string
    verifiedDependencyIds?: string[] | undefined
  }>,
): KitEvaluationResult {
  const evaluated: KitEvaluationItem[] = items.map((item) => {
    const category = detectKitCategory(item.name)
    const dependencies = getCinemaKitDependencies(item.name)
    return {
      key: item.key,
      name: item.name,
      category,
      dependencies,
      verifiedDependencyIds: item.verifiedDependencyIds ?? [],
    }
  })

  const cinemaItems = evaluated.filter((i) => i.dependencies.length > 0)
  const hasCinemaGear = cinemaItems.length > 0

  let totalDependencies = 0
  let verifiedCount = 0
  const unverifiedCriticalItems: Array<{ itemName: string; dependencyLabel: string }> = []

  for (const item of cinemaItems) {
    for (const dep of item.dependencies) {
      totalDependencies += 1
      const isVerified = item.verifiedDependencyIds.includes(dep.id)
      if (isVerified) {
        verifiedCount += 1
      } else if (dep.critical) {
        unverifiedCriticalItems.push({
          itemName: item.name,
          dependencyLabel: dep.label,
        })
      }
    }
  }

  return {
    hasCinemaGear,
    totalDependencies,
    verifiedCount,
    allCriticalPassed: unverifiedCriticalItems.length === 0,
    unverifiedCriticalItems,
  }
}
