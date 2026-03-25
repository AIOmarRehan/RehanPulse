import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/** GET /api/firebase/projects — list user's Firebase projects */
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

    const token = decrypt(data.googleTokenEncrypted as string);

    // Fetch Firebase projects using the user's Google token
    const res = await fetch('https://firebase.googleapis.com/v1beta1/projects?pageSize=50', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: 'Google token expired. Please reconnect your Google account.' },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch projects (${status})` },
        { status: 502 },
      );
    }

    const body = (await res.json()) as {
      results?: Array<{
        projectId: string;
        displayName: string;
        projectNumber: string;
        state: string;
        resources?: { realtimeDatabaseInstance?: string };
      }>;
    };

    const projects = (body.results ?? [])
      .filter((p) => p.state === 'ACTIVE')
      .map((p) => ({
        projectId: p.projectId,
        displayName: p.displayName,
      }));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Firebase projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
