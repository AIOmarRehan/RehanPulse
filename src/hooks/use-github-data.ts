'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitInfo, ContributionDay } from '@/lib/github';

interface GitHubData {
  repos: GitHubRepo[];
  commits: GitHubCommit[];
  pullRequests: GitHubPR[];
  rateLimit: RateLimitInfo;
  contributions: ContributionDay[];
}

async function fetchGitHubData(): Promise<GitHubData> {
  const res = await fetch('/api/github', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GitHub API failed: ${res.status}`);
  }
  return res.json() as Promise<GitHubData>;
}

async function forceRefreshGitHubData(): Promise<GitHubData> {
  const res = await fetch('/api/github?force=1', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GitHub API failed: ${res.status}`);
  }
  return res.json() as Promise<GitHubData>;
}

/**
 * React Query hook for fetching GitHub data.
 * Stale time: 60s. Refetches every 2 minutes.
 */
export function useGitHubData() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['github-data'],
    queryFn: fetchGitHubData,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    const freshData = await forceRefreshGitHubData();
    queryClient.setQueryData(['github-data'], freshData);
    // Reset the stale timer so React Query treats this as fully fresh
    await queryClient.invalidateQueries({ queryKey: ['github-data'], refetchType: 'none' });
  }, [queryClient]);

  return { ...query, refresh };
}
