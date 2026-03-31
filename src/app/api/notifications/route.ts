import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

/** GET /api/notifications — fetch user's notifications */
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const db = getAdminDb();

    const snap = await db
      .collection('notifications')
      .where('uid', '==', user.uid)
      .limit(100)
      .get();

    const notifications = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = typeof (a as Record<string, unknown>).createdAt === 'string' ? new Date((a as Record<string, unknown>).createdAt as string).getTime() : 0;
        const bTime = typeof (b as Record<string, unknown>).createdAt === 'string' ? new Date((b as Record<string, unknown>).createdAt as string).getTime() : 0;
        return bTime - aTime;
      });

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

/** PATCH /api/notifications — mark notification as read */
export async function PATCH(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const body = (await request.json()) as Record<string, unknown>;

    const id = typeof body.id === 'string' ? body.id : '';
    const markAll = body.markAll === true;

    const db = getAdminDb();

    if (markAll) {
      const unreadSnap = await db
        .collection('notifications')
        .where('uid', '==', user.uid)
        .where('read', '==', false)
        .get();

      const batch = db.batch();
      for (const doc of unreadSnap.docs) {
        batch.update(doc.ref, { read: true });
      }
      await batch.commit();
      return NextResponse.json({ marked: unreadSnap.size });
    }

    if (!id) {
      return NextResponse.json({ error: 'id or markAll is required' }, { status: 400 });
    }

    const docRef = db.collection('notifications').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists || (docSnap.data() as Record<string, unknown>).uid !== user.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await docRef.update({ read: true });
    return NextResponse.json({ id, read: true });
  } catch (error) {
    console.error('Notifications PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

/** DELETE /api/notifications — clear all notifications for the user */
export async function DELETE(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const db = getAdminDb();

    const snap = await db
      .collection('notifications')
      .where('uid', '==', user.uid)
      .get();

    if (snap.empty) {
      return NextResponse.json({ deleted: 0 });
    }

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    return NextResponse.json({ deleted: snap.size });
  } catch (error) {
    console.error('Notifications DELETE error:', error);
    return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
  }
}
