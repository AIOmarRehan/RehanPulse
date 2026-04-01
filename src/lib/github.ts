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
  commit_count: number;
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

export interface ContributionDay {
  date: string;        // 'YYYY-MM-DD'
  contributionCount: number;
  contributionLevel: 'NONE' | 'FIRST_QUARTILE' | 'SECOND_QUARTILE' | 'THIRD_QUARTILE' | 'FOURTH_QUARTILE';
}

/* ─── Data Fetchers ─── */

/** Fetch total commit counts for repos using GraphQL (batched, single request). */
async function fetchRepoCommitCounts(
  octokit: Octokit,
  repos: { full_name: string }[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (repos.length === 0) return counts;

  // Build a single GraphQL query with aliased fields for each repo
  const fragments = repos.map((r, i) => {
    const [owner, name] = r.full_name.split('/');
    return `repo${i}: repository(owner: "${owner}", name: "${name}") {
      defaultBranchRef {
        target {
          ... on Commit {
            history {
              totalCount
            }
          }
        }
      }
    }`;
  });

  const query = `query { ${fragments.join('\n')} }`;

  const result = await octokit.graphql<Record<string, {
    defaultBranchRef: { target: { history: { totalCount: number } } } | null;
  } | null>>(query);

  repos.forEach((r, i) => {
    const repoData = result[`repo${i}`];
    const total = repoData?.defaultBranchRef?.target?.history?.totalCount ?? 0;
    counts.set(r.full_name, total);
  });

  return counts;
}

/** Fetch the user's repositories (up to 30, sorted by push date). */
export async function fetchUserRepos(octokit: Octokit): Promise<GitHubRepo[]> {
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'pushed',
    per_page: 30,
    type: 'owner',
  });

  const baseRepos = data.map((r) => ({
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
    commit_count: 0,
  }));

  // Fetch commit counts via GraphQL in a single request
  try {
    const counts = await fetchRepoCommitCounts(octokit, baseRepos);
    for (const repo of baseRepos) {
      repo.commit_count = counts.get(repo.full_name) ?? 0;
    }
  } catch {
    // If GraphQL fails, leave counts as 0
  }

  return baseRepos;
}

/** Fetch recent commits across the user's top repos. */
export async function fetchRecentCommits(
  octokit: Octokit,
  repos: GitHubRepo[],
  limit = 30,
): Promise<GitHubCommit[]> {
  const topRepos = repos.slice(0, 10);

  // Get start of current week (Monday 00:00 UTC) for weekly timeline accuracy
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const since = monday.toISOString();

  // Fetch all repos in parallel
  const results = await Promise.allSettled(
    topRepos.map(async (repo) => {
      const [owner, repoName] = repo.full_name.split('/') as [string, string];
      const { data } = await octokit.rest.repos.listCommits({
        owner,
        repo: repoName,
        since,
        per_page: 10,
      });
      return data.map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0] ?? '',
        author: c.commit.author?.name ?? 'Unknown',
        date: c.commit.author?.date ?? new Date().toISOString(),
        repo: repo.name,
        html_url: c.html_url,
      }));
    }),
  );

  const allCommits: GitHubCommit[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allCommits.push(...r.value);
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

  // Fetch all repos in parallel
  const results = await Promise.allSettled(
    topRepos.map(async (repo) => {
      const [owner, repoName] = repo.full_name.split('/') as [string, string];
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo: repoName,
        state: 'open',
        per_page: 5,
      });
      return data.map((pr) => ({
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
      }));
    }),
  );

  const allPRs: GitHubPR[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allPRs.push(...r.value);
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

/** Fetch the user's contribution graph from GitHub GraphQL API. */
export async function fetchContributionGraph(octokit: Octokit): Promise<ContributionDay[]> {
  try {
    const { viewer } = await octokit.graphql<{
      viewer: {
        contributionsCollection: {
          contributionCalendar: {
            weeks: Array<{
              contributionDays: Array<{
                date: string;
                contributionCount: number;
                contributionLevel: ContributionDay['contributionLevel'];
              }>;
            }>;
          };
        };
      };
    }>(`
      query {
        viewer {
          contributionsCollection {
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                  contributionLevel
                }
              }
            }
          }
        }
      }
    `);

    return viewer.contributionsCollection.contributionCalendar.weeks.flatMap(
      (w) => w.contributionDays,
    );
  } catch {
    return [];
  }
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

  const repos: Array<{ full_name: string }> = [];
  try {
    // Paginate to cover ALL user repos (not just 30)
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'pushed',
        per_page: 100,
        page,
        type: 'owner',
      });
      repos.push(...data.map((r) => ({ full_name: r.full_name })));
      hasMore = data.length === 100;
      page++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to list repos for webhook registration:', msg);
    stats.errorDetails.push(`Failed to list repos: ${msg}`);
    return stats;
  }

  const WEBHOOK_EVENTS = ['push', 'pull_request', 'check_run', 'deployment', 'deployment_status', 'workflow_run', 'issues', 'star'];

  for (const repo of repos) {
    const [owner, repoName] = repo.full_name.split('/') as [string, string];
    try {
      // Check existing hooks
      const { data: hooks } = await octokit.rest.repos.listWebhooks({
        owner,
        repo: repoName,
      });
      const existingHook = hooks.find((h) => h.config.url === webhookUrl);
      if (existingHook) {
        // Update the existing webhook to ensure all events are registered
        const currentEvents = new Set(existingHook.events ?? []);
        const needsUpdate = WEBHOOK_EVENTS.some((e) => !currentEvents.has(e)) || !existingHook.active;
        if (needsUpdate) {
          await octokit.rest.repos.updateWebhook({
            owner,
            repo: repoName,
            hook_id: existingHook.id,
            events: WEBHOOK_EVENTS,
            active: true,
          });
          stats.registered++;
        } else {
          stats.skipped++;
        }
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
        events: WEBHOOK_EVENTS,
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
