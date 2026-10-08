import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { ClientRecord } from '../../../lib/queries/clients'
import { clientHealth, type ClientHealthVerdict } from './clientHealth'

export interface UseNewRentalClientOptions {
  searchParams: URLSearchParams
  clientPool: ClientRecord[]
  setClientPool: Dispatch<SetStateAction<ClientRecord[]>>
  setGovId: Dispatch<SetStateAction<string>>
  showSuccessToast: (title: string, desc?: string) => void
}

export interface UseNewRentalClientResult {
  selectedClientId: string | null
  setSelectedClientId: Dispatch<SetStateAction<string | null>>
  client: ClientRecord | undefined
  quickViewOpen: boolean
  setQuickViewOpen: Dispatch<SetStateAction<boolean>>
  historyOpen: boolean
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  addClientOpen: boolean
  setAddClientOpen: Dispatch<SetStateAction<boolean>>
  clientFieldRef: RefObject<HTMLDivElement | null>
  clientFieldTouched: boolean
  setClientFieldTouched: Dispatch<SetStateAction<boolean>>
  suppressClientListOnFocus: MutableRefObject<boolean>
  focusClientInput: () => void
  openAddClient: () => void
  closeAddClient: () => void
  selectClient: (c: ClientRecord) => void
  onClientCreated: (created: ClientRecord) => void
  health: ClientHealthVerdict | null
}

/**
 * Encapsulates client pool selection, URL synchronization,
 * health signal computation, focus suppression, and client drawer/modal disclosures.
 */
export function useNewRentalClient({
  searchParams,
  clientPool,
  setClientPool,
  setGovId,
  showSuccessToast,
}: UseNewRentalClientOptions): UseNewRentalClientResult {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    () => searchParams.get('clientId') || searchParams.get('client') || null,
  )

  const client: ClientRecord | undefined = useMemo(
    () => clientPool.find((c) => c.id === selectedClientId || (c.dbId && c.dbId === selectedClientId)),
    [clientPool, selectedClientId],
  )

  /* Connect URL client parameter to selection as soon as client pool loads */
  useEffect(() => {
    const rawParam = searchParams.get('clientId') || searchParams.get('client')
    if (!rawParam) return
    const match = clientPool.find((c) => c.id === rawParam || (c.dbId && c.dbId === rawParam))
    if (match) {
      if (selectedClientId !== match.id) {
        setSelectedClientId(match.id)
      }
      if (match.pan) {
        setGovId(match.pan)
      }
    }
  }, [clientPool, searchParams, selectedClientId, setGovId])

  // Disclosures over the workspace: quick view, history, add client
  const [quickViewOpen, setQuickViewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)

  const clientFieldRef = useRef<HTMLDivElement | null>(null)
  const [clientFieldTouched, setClientFieldTouched] = useState(false)
  const suppressClientListOnFocus = useRef(false)

  const focusClientInput = useCallback(() => {
    suppressClientListOnFocus.current = true
    const input = clientFieldRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]')
    if (input) input.focus()
    else suppressClientListOnFocus.current = false
  }, [])

  const openAddClient = useCallback(() => {
    focusClientInput()
    setAddClientOpen(true)
  }, [focusClientInput])

  const closeAddClient = useCallback(() => {
    suppressClientListOnFocus.current = true
    setAddClientOpen(false)
  }, [])

  const selectClient = useCallback(
    (c: ClientRecord) => {
      setSelectedClientId(c.id)
      setGovId(c.pan ?? '')
    },
    [setGovId],
  )

  const onClientCreated = useCallback(
    (created: ClientRecord) => {
      setClientPool((prev) => (prev.some((c) => c.id === created.id) ? prev : [created, ...prev]))
      setSelectedClientId(created.id)
      setGovId(created.pan ?? '')
      showSuccessToast('Client added', `${created.name} is selected on this booking.`)
    },
    [setClientPool, setGovId, showSuccessToast],
  )

  const health = useMemo(() => (client ? clientHealth(client) : null), [client])

  return {
    selectedClientId,
    setSelectedClientId,
    client,
    quickViewOpen,
    setQuickViewOpen,
    historyOpen,
    setHistoryOpen,
    addClientOpen,
    setAddClientOpen,
    clientFieldRef,
    clientFieldTouched,
    setClientFieldTouched,
    suppressClientListOnFocus,
    focusClientInput,
    openAddClient,
    closeAddClient,
    selectClient,
    onClientCreated,
    health,
  }
}
