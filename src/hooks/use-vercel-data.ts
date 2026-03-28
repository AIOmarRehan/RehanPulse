'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { VercelDeployment, VercelProject, VercelUsage } from '@/lib/vercel';

interface VercelData {
  deployments: VercelDeployment[];
  projects: VercelProject[];
  usage: VercelUsage | null;
}

async function fetchVercelData(limit?: number): Promise<VercelData> {
  const url = limit ? `/api/vercel?limit=${limit}` : '/api/vercel';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Vercel API failed: ${res.status}`);
  }
  return res.json() as Promise<VercelData>;
}

async function forceRefreshVercelData(limit?: number): Promise<VercelData> {
  const url = limit ? `/api/vercel?limit=${limit}&force=1` : '/api/vercel?force=1';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Vercel API failed: ${res.status}`);
  }
  return res.json() as Promise<VercelData>;
}

/**
 * React Query hook for fetching Vercel deployment data.
 * Stale time: 30s. Refetches every 60s.
 */
export function useVercelData(limit?: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['vercel-data', limit ?? 10],
    queryFn: () => fetchVercelData(limit),
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    const freshData = await forceRefreshVercelData(limit);
    // Update all vercel-data queries so every component sees fresh data
    queryClient.setQueryData(['vercel-data', limit ?? 10], freshData);
    await queryClient.invalidateQueries({ queryKey: ['vercel-data'] });
  }, [queryClient, limit]);

  return { ...query, refresh };
}
