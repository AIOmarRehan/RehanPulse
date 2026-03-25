import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/firebase — fetch Firestore data from the user's selected Firebase project.
 * Uses their stored Google OAuth token + the Firestore REST API.
 */
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const doc = await getAdminDb().collection('users').doc(decoded.uid).get();
    const data = doc.data();

    if (!data?.googleTokenEncrypted) {
      return NextResponse.json({ error: 'Google account not connected' }, { status: 400 });
    }

    const projectId =
      (new URL(request.url).searchParams.get('project')) ||
      (data.firebaseSelectedProject as string | undefined);

    if (!projectId) {
      return NextResponse.json({ error: 'No project selected' }, { status: 400 });
    }

    const token = decrypt(data.googleTokenEncrypted as string);
    const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

    // 1. List collection IDs
    const colRes = await fetch(`${base}:listCollectionIds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!colRes.ok) {
      const status = colRes.status;
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: 'Token expired or access denied. Please reconnect Google.' },
          { status: 401 },
        );
      }
      if (status === 404) {
        return NextResponse.json(
          { error: 'Firestore not enabled on this project.' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: `Failed to list collections (${status})` },
        { status: 502 },
      );
    }

    const colBody = (await colRes.json()) as { collectionIds?: string[] };
    const collectionIds = colBody.collectionIds ?? [];

    // 2. Count documents in each collection (parallel, max 10)
    const collections = await Promise.all(
      collectionIds.slice(0, 20).map(async (colId) => {
        try {
          const countRes = await fetch(`${base}:runAggregationQuery`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              structuredAggregationQuery: {
                structuredQuery: {
                  from: [{ collectionId: colId }],
                },
                aggregations: [{ alias: 'count', count: {} }],
              },
            }),
          });

          if (countRes.ok) {
            const countBody = (await countRes.json()) as Array<{
              result?: { aggregateFields?: { count?: { integerValue?: string } } };
            }>;
            const count = parseInt(
              countBody[0]?.result?.aggregateFields?.count?.integerValue ?? '0',
              10,
            );
            return { name: colId, docs: count };
          }
          return { name: colId, docs: 0 };
        } catch {
          return { name: colId, docs: 0 };
        }
      }),
    );

    const totalDocs = collections.reduce((sum, c) => sum + c.docs, 0);

    return NextResponse.json({
      projectId,
      collections,
      stats: {
        totalCollections: collections.length,
        totalDocs,
      },
    });
  } catch (error) {
    console.error('Firebase API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
