import { useCallback, useEffect, useState } from 'react'
import { listClientRecords } from './clients'
import type { ClientRecord } from '../../data/clients'

/**
 * The clients directory, from the database.
 *
 * Deliberately exposes `loading` and `error` as first-class state rather than
 * collapsing a failure into an empty array. An empty list and a failed query
 * look identical on screen otherwise, and "no clients" is a very different
 * statement from "we could not reach the database" — Foundation's five page
 * states exist precisely so those two are never conflated.
 *
 * `refresh` lets a surface re-read after it writes, so a newly created client
 * appears without a page reload.
 */
export function useClients(): {
  clients: ClientRecord[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    listClientRecords({ limit: 500 })
      .then((rows) => {
        if (cancelled) return
        setClients(rows)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tick])

  return { clients, loading, error, refresh }
}
