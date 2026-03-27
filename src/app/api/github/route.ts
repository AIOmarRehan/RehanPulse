import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
import {
  getOctokitForUser,
  fetchUserRepos,
  fetchRecentCommits,
  fetchOpenPRs,
  fetchRateLimit,
  fetchContributionGraph,
} from '@/lib/github';

/* Simple in-memory cache */
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

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
