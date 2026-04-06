import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
import {
  getOctokitForUser,
  fetchUserRepos,
  fetchRecentCommits,
  fetchOpenPRs,
  fetchRateLimit,
  fetchContributionGraph,
  registerWebhookForRepo,
} from '@/lib/github';

/* Simple in-memory cache */
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

/* Track in-flight auto-registration to avoid duplicate work */
const pendingAutoReg = new Set<string>();

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;

    const forceRefresh = request.nextUrl.searchParams.get('force') === '1';

    const cached = cache.get(uid);
    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
      });
    }

    const octokit = await getOctokitForUser(uid);

    const [repos, rateLimit, contributions] = await Promise.all([
      fetchUserRepos(octokit),
      fetchRateLimit(octokit),
      fetchContributionGraph(octokit),
    ]);

    const [commits, pullRequests] = await Promise.all([
      fetchRecentCommits(octokit, repos),
      fetchOpenPRs(octokit, repos),
    ]);

    const payload = { repos, commits, pullRequests, rateLimit, contributions };
    cache.set(uid, { data: payload, ts: Date.now() });

    // Fire-and-forget: auto-register webhooks on any new repos
    void autoRegisterNewRepos(uid, repos.map((r) => r.full_name), request);

    return NextResponse.json(
      payload,
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('GitHub API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Compare the current repo list against Firestore's stored list.
 * Register webhooks on any new repos, then update the stored list.
 * Runs fire-and-forget so it never delays the API response.
 */
async function autoRegisterNewRepos(uid: string, currentRepos: string[], request: NextRequest) {
  // Skip if already running for this user
  if (pendingAutoReg.has(uid)) return;

  try {
    pendingAutoReg.add(uid);
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    // Skip if user hasn't registered webhooks yet (they need to opt in first)
    if (!userData?.webhooksRegistered) return;

    const storedRepos = (userData.webhookRepos as string[] | undefined) ?? [];
    const storedSet = new Set(storedRepos);
    const newRepos = currentRepos.filter((r) => !storedSet.has(r));

    if (newRepos.length === 0) return;

    // Need the GitHub token and webhook URL
    const githubTokenEnc = userData.githubTokenEncrypted as string | undefined;
    if (!githubTokenEnc) return;
    const githubToken = decrypt(githubTokenEnc);
    const appUrl = request.headers.get('origin') ?? request.nextUrl.origin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(appUrl)) return;
    const webhookUrl = `${appUrl}/api/webhooks/github`;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? '';

    console.log(`[Auto Webhook] Found ${newRepos.length} new repo(s) for uid=${uid}: ${newRepos.join(', ')}`);

    for (const repo of newRepos) {
      try {
        const created = await registerWebhookForRepo(githubToken, repo, webhookUrl, webhookSecret);
        console.log(`[Auto Webhook] ${repo}: ${created ? 'registered' : 'already exists'}`);
      } catch (err) {
        console.error(`[Auto Webhook] Failed for ${repo}:`, err instanceof Error ? err.message : err);
      }
    }

    // Update the stored list with all current repos
    await db.collection('users').doc(uid).set(
      { webhookRepos: currentRepos, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (err) {
    console.error('[Auto Webhook] Error:', err instanceof Error ? err.message : err);
  } finally {
    pendingAutoReg.delete(uid);
  }
}
