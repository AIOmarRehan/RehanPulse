import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
import {
  getOctokitForUser,
  fetchUserRepos,
  fetchRecentCommits,
  fetchOpenPRs,
  fetchRateLimit,
} from '@/lib/github';

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;

    const octokit = await getOctokitForUser(uid);

    const [repos, rateLimit] = await Promise.all([
      fetchUserRepos(octokit),
      fetchRateLimit(octokit),
    ]);

    const [commits, pullRequests] = await Promise.all([
      fetchRecentCommits(octokit, repos),
      fetchOpenPRs(octokit, repos),
    ]);

    return NextResponse.json(
      { repos, commits, pullRequests, rateLimit },
      {
        headers: {
          'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    console.error('GitHub API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
