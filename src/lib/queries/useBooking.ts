import { useCallback, useEffect, useState } from 'react'
import { fetchCanonicalBooking, type CanonicalBooking } from '../bookingQuery'

export interface UseBookingOptions {
  /** Opt-in deposit fetch (Law 6 role-gated). Defaults to true. */
  withDeposit?: boolean | undefined
}

export interface UseBookingResult {
  booking: CanonicalBooking | null
  loading: boolean
  error: string | null
  isNotFound: boolean
  refetch: () => void
}

/**
 * Single Query Rule (Law 2) hook for booking detail views.
 *
 * Consumes `fetchCanonicalBooking` from `lib/bookingQuery.ts`.
 * Dispatches query with cancellation guard against rapid route/id switching.
 */
export function useBooking(
  bookingIdOrNo: string | undefined,
  options: UseBookingOptions = {},
): UseBookingResult {
  const { withDeposit = true } = options

  const [booking, setBooking] = useState<CanonicalBooking | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(bookingIdOrNo))
  const [error, setError] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState<boolean>(false)
  const [nonce, setNonce] = useState(0)

  const refetch = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!bookingIdOrNo) {
      setBooking(null)
      setLoading(false)
      setError(null)
      setIsNotFound(true)
      return
    }

    let active = true
    setLoading(true)
    setError(null)
    setIsNotFound(false)

    void fetchCanonicalBooking(bookingIdOrNo, { withDeposit, withDiscounts: true })
      .then((res) => {
        if (!active) return
        setBooking(res)
        setIsNotFound(res === null)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setBooking(null)
        setIsNotFound(false)
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [bookingIdOrNo, withDeposit, nonce])

  return {
    booking,
    loading,
    error,
    isNotFound,
    refetch,
  }
}
