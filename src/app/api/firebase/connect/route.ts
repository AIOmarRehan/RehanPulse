import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encrypt } from '@/lib/crypto';

/** GET /api/firebase/connect — check Google connection status */
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const doc = await getAdminDb().collection('users').doc(decoded.uid).get();
    const data = doc.data();

    return NextResponse.json({
      connected: !!data?.googleTokenEncrypted,
      selectedProject: (data?.firebaseSelectedProject as string) ?? null,
    });
  } catch (error) {
    console.error('Firebase connect GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/firebase/connect — store Google token or select project */
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const body = (await request.json()) as {
      googleAccessToken?: string;
      selectedProject?: string;
    };

    const db = getAdminDb();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (body.googleAccessToken) {
      // Validate the token by making a test call
      const testRes = await fetch('https://firebase.googleapis.com/v1beta1/projects?pageSize=1', {
        headers: { Authorization: `Bearer ${body.googleAccessToken}` },
      });
      if (!testRes.ok) {
        return NextResponse.json(
          { error: 'Invalid Google token — could not access Firebase projects' },
          { status: 400 },
        );
      }
      updates.googleTokenEncrypted = encrypt(body.googleAccessToken);
    }

    if (body.selectedProject) {
      updates.firebaseSelectedProject = body.selectedProject;
    } else if (body.selectedProject === '') {
      // Clear project selection (switch project flow)
      const { FieldValue } = await import('firebase-admin/firestore');
      updates.firebaseSelectedProject = FieldValue.delete();
    }

    await db.collection('users').doc(decoded.uid).set(updates, { merge: true });

    return NextResponse.json({ status: 'saved' });
  } catch (error) {
    console.error('Firebase connect POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/firebase/connect — disconnect Google account */
export async function DELETE(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const { FieldValue } = await import('firebase-admin/firestore');

    await getAdminDb().collection('users').doc(decoded.uid).update({
      googleTokenEncrypted: FieldValue.delete(),
      firebaseSelectedProject: FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ status: 'disconnected' });
  } catch (error) {
    console.error('Firebase connect DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
