import { useEffect, useMemo, useState } from 'react'
import { fetchProductDepositTerms } from '../../../lib/queries/productDeposits'
import type { ProductDepositTerms } from '../../../lib/productDeposit'
import type { Line } from './RentalLineItemsTree'

export interface UseNewRentalProductDepositsResult {
  terms: ReadonlyMap<string, ProductDepositTerms>
  /** Set when the read failed: the recommended deposit is then the flat rule only. */
  error: string | null
}

const EMPTY: ReadonlyMap<string, ProductDepositTerms> = new Map()

/**
 * Loads the deposit terms of the products on the booking (C6). Only the product
 * ids are keyed on, so changing a quantity or a rate does not refetch. The
 * pricing hook stays pure; this is the one place that reads.
 */
export function useNewRentalProductDeposits(lines: readonly Line[]): UseNewRentalProductDepositsResult {
  const key = useMemo(
    () =>
      [...new Set(lines.map((l) => l.productId).filter((id): id is string => Boolean(id)))]
        .sort()
        .join(','),
    [lines],
  )
  const [terms, setTerms] = useState<ReadonlyMap<string, ProductDepositTerms>>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (key === '') {
      setTerms(EMPTY)
      setError(null)
      return
    }
    let active = true
    void fetchProductDepositTerms(key.split(','))
      .then((next) => {
        if (!active) return
        setTerms(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setTerms(EMPTY)
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      active = false
    }
  }, [key])

  return { terms, error }
}
