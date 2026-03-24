import { Octokit } from 'octokit';
import { getAdminDb } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

/**
 * Create an authenticated Octokit instance for a given user.
 * Reads the encrypted GitHub token from Firestore and decrypts it.
 */
export async function getOctokitForUser(uid: string): Promise<Octokit> {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).get();
  const data = doc.data();

  if (!data?.githubTokenEncrypted) {
    throw new Error('No GitHub token stored for user');
  }

  const token = decrypt(data.githubTokenEncrypted as string);
  return new Octokit({ auth: token });
}

/* ─── Types ─── */

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  updated_at: string;
  html_url: string;
  private: boolean;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  repo: string;
  html_url: string;
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: string;
  repo: string;
  author: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  draft: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  used: number;
}

/* ─── Data Fetchers ─── */

/** Fetch the user's repositories (up to 30, sorted by push date). */
export async function fetchUserRepos(octokit: Octokit): Promise<GitHubRepo[]> {
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'pushed',
    per_page: 30,
    type: 'owner',
  });

  return data.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    open_issues_count: r.open_issues_count,
    updated_at: r.updated_at ?? new Date().toISOString(),
    html_url: r.html_url,
    private: r.private,
  }));
}

/** Fetch recent commits across the user's top repos. */
export async function fetchRecentCommits(
  octokit: Octokit,
  repos: GitHubRepo[],
  limit = 15,
): Promise<GitHubCommit[]> {
  const topRepos = repos.slice(0, 5);

  const allCommits: GitHubCommit[] = [];

  for (const repo of topRepos) {
    try {
      const [owner, repoName] = repo.full_name.split('/') as [string, string];
      const { data } = await octokit.rest.repos.listCommits({
        owner,
        repo: repoName,
        per_page: 5,
      });

      for (const c of data) {
        allCommits.push({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0] ?? '',
          author: c.commit.author?.name ?? 'Unknown',
          date: c.commit.author?.date ?? new Date().toISOString(),
          repo: repo.name,
          html_url: c.html_url,
        });
      }
    } catch {
      // Skip repos we can't access
    }
  }

  return allCommits
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/** Fetch open pull requests across the user's repos. */
export async function fetchOpenPRs(
  octokit: Octokit,
  repos: GitHubRepo[],
  limit = 10,
): Promise<GitHubPR[]> {
  const topRepos = repos.slice(0, 10);

  const allPRs: GitHubPR[] = [];

  for (const repo of topRepos) {
    try {
      const [owner, repoName] = repo.full_name.split('/') as [string, string];
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo: repoName,
        state: 'open',
        per_page: 5,
      });

      for (const pr of data) {
        allPRs.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          state: pr.state,
          repo: repo.name,
          author: pr.user?.login ?? 'Unknown',
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          html_url: pr.html_url,
          draft: pr.draft ?? false,
        });
      }
    } catch {
      // Skip repos we can't access
    }
  }

  return allPRs
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
}

/** Get the current rate limit status. */
export async function fetchRateLimit(octokit: Octokit): Promise<RateLimitInfo> {
  const { data } = await octokit.rest.rateLimit.get();
  const core = data.resources.core;
  return {
    limit: core.limit,
    remaining: core.remaining,
    reset: core.reset,
    used: core.used,
  };
}
