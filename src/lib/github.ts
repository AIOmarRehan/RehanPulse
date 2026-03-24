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

/**
 * Auto-register webhooks on all user-owned repos.
 * Skips repos that already have a webhook pointing at our URL.
 * Fire-and-forget — errors are logged but don't block auth.
 */
export async function registerWebhooksForUser(
  githubAccessToken: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<{ registered: number; skipped: number; errors: number; errorDetails: string[] }> {
  const octokit = new Octokit({ auth: githubAccessToken });
  const stats = { registered: 0, skipped: 0, errors: 0, errorDetails: [] as string[] };

  let repos: Array<{ full_name: string }>;
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'pushed',
      per_page: 30,
      type: 'owner',
    });
    repos = data.map((r) => ({ full_name: r.full_name }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to list repos for webhook registration:', msg);
    stats.errorDetails.push(`Failed to list repos: ${msg}`);
    return stats;
  }

  for (const repo of repos) {
    const [owner, repoName] = repo.full_name.split('/') as [string, string];
    try {
      // Check existing hooks — skip if one already points to our URL
      const { data: hooks } = await octokit.rest.repos.listWebhooks({
        owner,
        repo: repoName,
      });
      const existing = hooks.some((h) => h.config.url === webhookUrl);
      if (existing) {
        stats.skipped++;
        continue;
      }

      // Create webhook
      await octokit.rest.repos.createWebhook({
        owner,
        repo: repoName,
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: webhookSecret,
        },
        events: ['push', 'pull_request', 'deployment', 'workflow_run', 'issues', 'star'],
        active: true,
      });
      stats.registered++;
    } catch (err) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Webhook error for ${repo.full_name}:`, msg);
      if (stats.errorDetails.length < 3) {
        stats.errorDetails.push(`${repo.full_name}: ${msg}`);
      }
    }
  }

  return stats;
}
