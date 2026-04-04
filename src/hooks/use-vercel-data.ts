'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import type { VercelDeployment, VercelProject, VercelUsage } from '@/lib/vercel';

interface VercelData {
  deployments: VercelDeployment[];
  projects: VercelProject[];
  usage: VercelUsage | null;
}

// Module-level flag: when set, the next queryFn call will bypass the server cache.
// Used by useEventSource to ensure deployment events get fresh data.
let _bustServerCache = false;

/** Call before invalidating vercel-data queries to bypass the 30s server cache. */
export function bustVercelCache() {
  _bustServerCache = true;
}

async function fetchVercelData(limit?: number, force = false): Promise<VercelData> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (force) params.set('force', '1');
  const qs = params.toString();
  const url = qs ? `/api/vercel?${qs}` : '/api/vercel';
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Vercel API failed: ${res.status}`);
  }
  return res.json() as Promise<VercelData>;
}

/**
 * React Query hook for fetching Vercel deployment data.
 * Stale time: 30s. Refetches every 2 minutes.
 */
export function useVercelData(limit?: number) {
  const queryClient = useQueryClient();
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: ['vercel-data', limit ?? 10],
    queryFn: async () => {
      const force = forceRef.current || _bustServerCache;
      forceRef.current = false;
      _bustServerCache = false;
      return fetchVercelData(limit, force);
    },
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    forceRef.current = true;
    await queryClient.invalidateQueries({ queryKey: ['vercel-data'] });
  }, [queryClient]);

  return { ...query, refresh };
}
