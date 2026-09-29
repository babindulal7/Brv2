import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IntelCard, type IntelGlance, type IntelGroup } from '../ui/IntelCard'
import { clientGlance, clientDetailGroups } from '../../data/clientIntel'
import { getClientRecord } from '../../lib/queries/clients'
import type { GateContext } from '../../lib/fieldGating'
import type { ActionContext } from '../../actions/core'
import type { IntelContext } from '../../lib/intel/context'

export function ClientIntelFromId({ clientId, name, context, gateContext, actionContext, children }: {
  clientId: string
  name: string
  context: IntelContext
  gateContext: GateContext
  actionContext: ActionContext | null
  children: ReactNode
}) {
  const [glance, setGlance] = useState<IntelGlance>({
    avatarLabel: name.slice(0, 2).toUpperCase(),
    title: name,
    statusDot: 'neutral',
    lines: ['Account state loading…'],
    primaryAction: { label: 'Open client', to: `/clients/${clientId}` },
  })
  const [detail, setDetail] = useState<IntelGroup[]>([])
  const loaded = useRef(false)
  const inFlight = useRef(false)
  const currentId = useRef(clientId)
  useEffect(() => {
    currentId.current = clientId
    loaded.current = false
    inFlight.current = false
    setGlance({ avatarLabel: name.slice(0, 2).toUpperCase(), title: name, statusDot: 'neutral', lines: ['Account state loading…'], primaryAction: { label: 'Open client', to: `/clients/${clientId}` } })
    setDetail([])
  }, [clientId, name])
  const load = useCallback(() => {
    if (loaded.current || inFlight.current) return
    inFlight.current = true
    const requestedId = clientId
    void getClientRecord(clientId).then((profile) => {
      if (currentId.current !== requestedId) return
      if (!profile) {
        setGlance((current) => ({ ...current, lines: ['Client record not found'] }))
        return
      }
      const next = clientGlance(profile.record, gateContext)
      setGlance(profile.membershipKnown ? next : { ...next, ...(next.badges ? { badges: next.badges.slice(1) } : {}) })
      setDetail(clientDetailGroups(profile.record, gateContext))
      loaded.current = true
    }).catch((reason: unknown) => {
      if (currentId.current !== requestedId) return
      setGlance((current) => ({ ...current, lines: [`Client details unavailable: ${reason instanceof Error ? reason.message : String(reason)}`] }))
    }).finally(() => { inFlight.current = false })
  }, [clientId, gateContext])

  return <IntelCard
    glance={glance}
    detail={detail}
    detailTitle={name}
    entityType="client"
    entityId={clientId}
    context={context}
    gateContext={gateContext}
    actionContext={actionContext}
    onOpen={load}
  >{children}</IntelCard>
}
