'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { GitHubRepo, GitHubCommit, GitHubPR, RateLimitInfo } from '@/lib/github';

interface GitHubData {
  repos: GitHubRepo[];
  commits: GitHubCommit[];
  pullRequests: GitHubPR[];
  rateLimit: RateLimitInfo;
}

async function fetchGitHubData(): Promise<GitHubData> {
  const res = await fetch('/api/github');
  if (!res.ok) {
    throw new Error(`GitHub API failed: ${res.status}`);
  }
  return res.json() as Promise<GitHubData>;
}

async function forceRefreshGitHubData(): Promise<GitHubData> {
  const res = await fetch('/api/github?force=1');
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
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    const freshData = await forceRefreshGitHubData();
    queryClient.setQueryData(['github-data'], freshData);
  }, [queryClient]);

  return { ...query, refresh };
}
