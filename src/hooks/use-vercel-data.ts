'use client';

import { useQuery } from '@tanstack/react-query';
import type { VercelDeployment, VercelProject } from '@/lib/vercel';

interface VercelData {
  deployments: VercelDeployment[];
  projects: VercelProject[];
}

async function fetchVercelData(): Promise<VercelData> {
  const res = await fetch('/api/vercel');
  if (!res.ok) {
    throw new Error(`Vercel API failed: ${res.status}`);
  }
  return res.json() as Promise<VercelData>;
}

/**
 * React Query hook for fetching Vercel deployment data.
 * Stale time: 30s. Refetches every 60s.
 */
export function useVercelData() {
  return useQuery({
    queryKey: ['vercel-data'],
    queryFn: fetchVercelData,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
