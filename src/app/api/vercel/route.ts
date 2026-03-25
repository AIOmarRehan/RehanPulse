import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { fetchDeployments, fetchProjects, fetchUsage } from '@/lib/vercel';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/* Simple in-memory cache: avoids re-calling slow Vercel APIs on every request */
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

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 100);
    const forceRefresh = request.nextUrl.searchParams.get('force') === '1';

    const cacheKey = `${decoded.uid}:${limit}`;
    const cached = cache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
      });
    }

    const [deployments, projects, usage] = await Promise.all([
      fetchDeployments(decoded.uid, limit),
      fetchProjects(decoded.uid),
      fetchUsage(decoded.uid).catch(() => null),
    ]);

    const payload = { deployments, projects, usage };
    cache.set(cacheKey, { data: payload, ts: Date.now() });

    return NextResponse.json(
      payload,
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('Vercel API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
