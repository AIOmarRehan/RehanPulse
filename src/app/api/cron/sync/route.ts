import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  getOctokitForUser,
  fetchUserRepos,
  fetchRecentCommits,
  fetchOpenPRs,
} from '@/lib/github';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/cron/sync — Background sync for all users.
 * Called by Vercel Cron every 10 minutes.
 * Re-fetches GitHub data for each user to keep caches warm and data fresh.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const usersSnap = await db.collection('users').get();

  const results: { uid: string; status: string }[] = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();

    if (!data.githubTokenEncrypted) {
      results.push({ uid, status: 'skipped_no_token' });
      continue;
    }

    try {
      const octokit = await getOctokitForUser(uid);
      const repos = await fetchUserRepos(octokit);

      // Fire-and-forget data refresh — these calls warm the GitHub API rate limit
      // but more importantly validate that repos/PRs still exist
      await Promise.all([
        fetchRecentCommits(octokit, repos),
        fetchOpenPRs(octokit, repos),
      ]);

      results.push({ uid, status: 'synced' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Cron sync failed for ${uid}:`, msg);
      results.push({ uid, status: `error: ${msg}` });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  const skipped = results.filter((r) => r.status === 'skipped_no_token').length;
  const errors = results.filter((r) => r.status.startsWith('error')).length;

  return NextResponse.json({
    synced,
    skipped,
    errors,
    total: usersSnap.size,
    timestamp: new Date().toISOString(),
  });
}
