import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

async function tryFetch(url: string, token: string): Promise<{ url: string; status: number; body: unknown }> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { url, status: res.status, body };
  } catch (err) {
    return { url, status: 0, body: String(err) };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized — please sign in first' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);

    const db = getAdminDb();
    const doc = await db.collection('users').doc(decoded.uid).get();
    const data = doc.data();
    if (!data?.vercelTokenEncrypted) {
      return NextResponse.json({ error: 'No Vercel token configured' }, { status: 400 });
    }
    const token = decrypt(data.vercelTokenEncrypted as string);

    const API = 'https://api.vercel.com';
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = monthStart.toISOString();
    const to = now.toISOString();

    // /v2/usage requires a `type` parameter — probe all likely types
    const usageTypes = [
      'requests',
      'monitoring',
      'builds',
      'edge',
      'edge_group_by_project',
      'artifacts',
      'edge_config',
      'log_drains',
      'storage_postgres',
      'storage_redis',
      'storage_blob',
      'cron_jobs',
      'data_cache',
    ];

    const results = await Promise.all(
      usageTypes.map(async (type) => {
        const url = `${API}/v2/usage?type=${type}&from=${from}&to=${to}`;
        const r = await tryFetch(url, token);
        return {
          type,
          status: r.status,
          hasData: r.status === 200,
          bodyPreview: typeof r.body === 'object' ? JSON.stringify(r.body).slice(0, 1000) : String(r.body).slice(0, 1000),
        };
      }),
    );

    // Separate into working vs failing
    const working = results.filter((r) => r.hasData);
    const failing = results.filter((r) => !r.hasData);

    return NextResponse.json({
      summary: `${working.length} working, ${failing.length} failing out of ${results.length} types tested`,
      working,
      failingSample: failing.slice(0, 3),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
