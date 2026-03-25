'use client';

import { useQuery } from '@tanstack/react-query';
import type { VercelDeployment, VercelProject, VercelUsage } from '@/lib/vercel';

interface VercelData {
  deployments: VercelDeployment[];
  projects: VercelProject[];
  usage: VercelUsage | null;
}

async function fetchVercelData(limit?: number): Promise<VercelData> {
  const url = limit ? `/api/vercel?limit=${limit}` : '/api/vercel';
  const res = await fetch(url);
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
  return useQuery({
    queryKey: ['vercel-data', limit ?? 10],
    queryFn: () => fetchVercelData(limit),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}
