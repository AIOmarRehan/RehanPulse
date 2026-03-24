'use client';

import { useQuery } from '@tanstack/react-query';
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

/**
 * React Query hook for fetching GitHub data.
 * Stale time: 60s. Refetches every 2 minutes.
 */
export function useGitHubData() {
  return useQuery({
    queryKey: ['github-data'],
    queryFn: fetchGitHubData,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
