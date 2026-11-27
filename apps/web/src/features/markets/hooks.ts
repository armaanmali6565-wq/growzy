'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  marketService,
  type MarketQuotesPayload,
  type MarketStatusPayload,
} from '@/services/market.service'
import { QUERY_STALE_TIME } from '@/lib/constants'
import type { QueryHookOptions } from '@/lib/query-client'

const QUOTES_CACHE_KEY = 'growzy_market_quotes_v1'

function readCachedQuotes(): MarketQuotesPayload | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw =
      window.localStorage.getItem(QUOTES_CACHE_KEY) ??
      window.sessionStorage.getItem(QUOTES_CACHE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as MarketQuotesPayload
    return Array.isArray(parsed?.quotes) && parsed.quotes.length > 0 ? parsed : undefined
  } catch {
    return undefined
  }
}

export const marketQueryKeys = {
  all: ['markets'] as const,
  quotes: () => [...marketQueryKeys.all, 'quotes'] as const,
  status: () => [...marketQueryKeys.all, 'status'] as const,
}

/** Shared market quotes — one React Query cache for ticker, cards, dashboard, admin. */
export function useMarketQuotes(options?: QueryHookOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const existing = queryClient.getQueryData<MarketQuotesPayload>(marketQueryKeys.quotes())
    if (!existing) {
      const cached = readCachedQuotes()
      if (cached) {
        queryClient.setQueryData(marketQueryKeys.quotes(), cached)
      }
    }
  }, [queryClient])

  const query = useQuery<MarketQuotesPayload>({
    queryKey: marketQueryKeys.quotes(),
    queryFn: async () => {
      const res = await marketService.quotes()
      if (typeof window !== 'undefined' && res?.quotes?.length > 0) {
        try {
          const serialized = JSON.stringify(res)
          window.localStorage.setItem(QUOTES_CACHE_KEY, serialized)
          window.sessionStorage.setItem(QUOTES_CACHE_KEY, serialized)
        } catch {
          /* ignore storage quota errors */
        }
      }
      return res
    },
    staleTime: QUERY_STALE_TIME.fast,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled,
  })

  return query
}

export function useMarketStatus(options?: QueryHookOptions) {
  return useQuery<MarketStatusPayload>({
    queryKey: marketQueryKeys.status(),
    queryFn: () => marketService.status(),
    staleTime: QUERY_STALE_TIME.fast,
    refetchInterval: 20_000,
    enabled: options?.enabled,
  })
}

/** Display helpers shared by ticker / cards (no double signs). */
export function formatMarketChangePct(raw: string): {
  text: string
  tone: 'up' | 'down' | 'neutral'
} {
  const n = Number.parseFloat(String(raw).replace(/%/g, ''))
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) {
    return { text: '0.00%', tone: 'neutral' }
  }
  if (n > 0) return { text: `+${Math.abs(n).toFixed(2)}%`, tone: 'up' }
  return { text: `-${Math.abs(n).toFixed(2)}%`, tone: 'down' }
}

export function marketStatusBadge(status: MarketQuotesPayload['status'] | undefined): {
  label: string
  live: boolean
} {
  if (status === 'LIVE') return { label: 'Live', live: true }
  if (status === 'DELAYED') return { label: 'Delayed', live: false }
  return { label: 'Offline', live: false }
}
