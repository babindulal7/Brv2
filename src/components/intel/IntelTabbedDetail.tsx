import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IntelContext, IntelEntityType } from '../../lib/intel/context'
import type { GateContext } from '../../lib/fieldGating'
import { canViewMoneyField } from '../../lib/fieldGating'
import { defaultTabForContext, type HoverContext } from '../../lib/smartHover'
import { loadClientPreview, loadDocumentPreview, loadEquipmentPreview, loadInvoicePreview, loadPaymentPreview, loadRentalPreview } from '../../lib/smartHoverLoaders'
import type { ClientPreview, DocumentPreview, EquipmentPreview, InvoicePreview, PaymentPreview, RentalPreview } from '../smart-hover/previewTypes'
import { ClientHoverCard } from '../smart-hover/cards/ClientHoverCard'
import { EquipmentHoverCard } from '../smart-hover/cards/EquipmentHoverCard'
import { RentalHoverCard } from '../smart-hover/cards/RentalHoverCard'
import { DocumentHoverCard } from '../smart-hover/cards/DocumentHoverCard'
import { RegistryDocumentHoverCard } from '../smart-hover/cards/RegistryDocumentHoverCard'
import { PaymentHoverCard } from '../smart-hover/cards/PaymentHoverCard'
import { IntelDetailExtras } from './IntelDetailExtras'
import type { ActionContext } from '../../actions/core'

type CoreType = 'client' | 'equipment' | 'rental' | 'document' | 'invoice' | 'payment'
type Loaded =
  | { type: 'client'; preview: ClientPreview }
  | { type: 'equipment'; preview: EquipmentPreview }
  | { type: 'rental'; preview: RentalPreview }
  | { type: 'invoice'; preview: InvoicePreview }
  | { type: 'document'; preview: DocumentPreview }
  | { type: 'payment'; preview: PaymentPreview }

const CONTEXT: Record<IntelContext, HoverContext> = {
  dashboard: 'dashboard',
  inventory: 'inventory',
  'client-list': 'clients',
  'rental-list': 'rentals',
  'new-rental': 'new-rental',
  'rental-detail': 'rentals',
  calendar: 'calendar',
  packing: 'packing',
  handover: 'handover',
  return: 'return',
  inspection: 'inspection',
  payments: 'payments',
  documents: 'documents',
  search: 'search',
}

/** Shared tabbed body for the direct hover card and touch sheet. The overlay
 * owns navigation; each loader uses the same role gate. */
export function IntelTabbedDetail({ entityType, entityId, context, gateContext, actionContext, onFollow, fallback }: {
  entityType: IntelEntityType | undefined
  entityId: string | undefined
  context: IntelContext | undefined
  gateContext: GateContext | undefined
  onFollow: (path: string) => void
  fallback: ReactNode
  actionContext?: ActionContext | null
}) {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const core: CoreType | null =
    entityType === 'client' || entityType === 'equipment' || entityType === 'rental' || entityType === 'document' || entityType === 'invoice' || entityType === 'payment'
      ? entityType
      : null
  const role = gateContext?.role
  const surface = gateContext?.surface
  const deliveryLinked = gateContext?.deliveryLinked

  useEffect(() => {
    if (!core || !entityId || !role) return
    let cancelled = false
    setLoaded(null)
    setError(null)
    const gate: GateContext = { role, ...(surface ? { surface } : {}), ...(deliveryLinked !== undefined ? { deliveryLinked } : {}) }
    const request = core === 'client' ? loadClientPreview(entityId, gate)
      : core === 'equipment' ? loadEquipmentPreview(entityId, gate)
      : core === 'rental' ? loadRentalPreview(entityId, gate)
      : core === 'document' ? loadDocumentPreview(entityId, gate)
      : core === 'invoice' ? loadInvoicePreview(entityId, gate)
      : loadPaymentPreview(entityId, gate)
    void request.then((preview) => {
      if (!cancelled) setLoaded({ type: core, preview } as Loaded)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Preview unavailable')
    })
    return () => { cancelled = true }
  }, [core, entityId, role, surface, deliveryLinked])

  if (!core || !entityId || !gateContext || !context) return <>{fallback}</>
  if (error) return <><p role="alert">Tabbed preview unavailable: {error}</p>{fallback}</>
  if (!loaded || loaded.type !== core) return <><p role="status">Loading preview tabs…</p>{fallback}</>

  const defaultTab = defaultTabForContext(core, CONTEXT[context])
  const notesContent = loaded.type === 'client' || loaded.type === 'equipment' || loaded.type === 'rental'
    ? <IntelDetailExtras entityType={loaded.type} entityId={loaded.preview.id} context={context} gateContext={gateContext} actionContext={actionContext ?? null} section="notes" /> : undefined
  if (loaded.type === 'client') return <ClientHoverCard key={entityId} preview={loaded.preview} notesContent={notesContent} canViewFinance={canViewMoneyField(gateContext, 'client-balance')} defaultTab={defaultTab} onOpenRental={(no) => onFollow(`/rentals/${encodeURIComponent(no)}`)} />
  if (loaded.type === 'equipment') return <EquipmentHoverCard key={entityId} preview={loaded.preview} notesContent={notesContent} canViewFinance={canViewMoneyField(gateContext, 'asset-finance')} defaultTab={defaultTab} onOpenRental={(no) => onFollow(`/rentals/${encodeURIComponent(no)}`)} />
  if (loaded.type === 'invoice') return <DocumentHoverCard key={entityId} preview={loaded.preview} canViewFinance={canViewMoneyField(gateContext, 'booking')} />
  if (loaded.type === 'document') return <RegistryDocumentHoverCard key={entityId} preview={loaded.preview} onFollow={onFollow} />
  if (loaded.type === 'payment') return <PaymentHoverCard key={entityId} preview={loaded.preview} onFollow={onFollow} />
  return <RentalHoverCard key={entityId} preview={loaded.preview} notesContent={notesContent} canViewFinance={canViewMoneyField(gateContext, 'booking')} defaultTab={defaultTab} onOpenBooking={() => navigate(`/rentals/${encodeURIComponent(loaded.preview.rentalNo)}`)} onOpenClient={() => onFollow(`/clients/${encodeURIComponent(loaded.preview.clientId)}`)} />
}
