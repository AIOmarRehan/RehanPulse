'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitInfo, ContributionDay } from '@/lib/github';

interface GitHubData {
  repos: GitHubRepo[];
  commits: GitHubCommit[];
  pullRequests: GitHubPR[];
  rateLimit: RateLimitInfo;
  contributions: ContributionDay[];
}

async function fetchGitHubData(force = false): Promise<GitHubData> {
  const url = force ? '/api/github?force=1' : '/api/github';
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`GitHub API failed: ${res.status}`);
  }
  return res.json() as Promise<GitHubData>;
}

/**
 * React Query hook for fetching GitHub data.
 * Stale time: 30s. Refetches every 2 minutes.
 */
export function useGitHubData() {
  const queryClient = useQueryClient();
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: ['github-data'],
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      return fetchGitHubData(force);
    },
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    forceRef.current = true;
    await queryClient.invalidateQueries({ queryKey: ['github-data'] });
  }, [queryClient]);

  return { ...query, refresh };
}
