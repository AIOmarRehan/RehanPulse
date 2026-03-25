import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { fetchDeployments, fetchProjects, fetchUsage } from '@/lib/vercel';

export const dynamic = 'force-dynamic';

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

    const [deployments, projects, usage] = await Promise.all([
      fetchDeployments(decoded.uid, limit),
      fetchProjects(decoded.uid),
      fetchUsage(decoded.uid).catch(() => null),
    ]);

    return NextResponse.json(
      { deployments, projects, usage },
      {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch (error) {
    console.error('Vercel API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
