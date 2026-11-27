'use client'

/** CMS hooks. Public bootstrap is the single payload the marketing shell hydrates from. */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { cmsApi } from './api'
import { QUERY_STALE_TIME } from '@/lib/constants'
import type { QueryHookOptions } from '@/lib/query-client'
import type { CmsPublicBootstrap } from '@/types/domain'

const CMS_CACHE_KEY = 'growzy_cms_bootstrap_v1'

function readCachedBootstrap(): CmsPublicBootstrap | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(CMS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as CmsPublicBootstrap) : undefined
  } catch {
    return undefined
  }
}

export const cmsQueryKeys = {
  all: ['cms'] as const,
  bootstrap: () => [...cmsQueryKeys.all, 'bootstrap'] as const,
}

/** Landing content + platform copy + FAQs + feature flags — fetched once per session. */
export function useCmsBootstrap(options?: QueryHookOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const existing = queryClient.getQueryData<CmsPublicBootstrap>(cmsQueryKeys.bootstrap())
    if (!existing) {
      const cached = readCachedBootstrap()
      if (cached) {
        queryClient.setQueryData(cmsQueryKeys.bootstrap(), cached)
      }
    }
  }, [queryClient])

  return useQuery<CmsPublicBootstrap>({
    queryKey: cmsQueryKeys.bootstrap(),
    queryFn: async () => {
      const res = await cmsApi.publicBootstrap()
      if (typeof window !== 'undefined' && res) {
        try {
          window.sessionStorage.setItem(CMS_CACHE_KEY, JSON.stringify(res))
        } catch {
          /* ignore storage quota errors */
        }
      }
      return res
    },
    enabled: options?.enabled,
    staleTime: QUERY_STALE_TIME.slow,
  })
}
