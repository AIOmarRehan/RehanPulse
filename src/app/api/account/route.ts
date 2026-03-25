import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

/** DELETE /api/account — delete the current user's account */
export async function DELETE(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;
    const db = getAdminDb();

    // Delete user's notifications
    const notifsSnap = await db.collection('notifications').where('uid', '==', uid).get();
    if (!notifsSnap.empty) {
      const batch = db.batch();
      for (const doc of notifsSnap.docs) batch.delete(doc.ref);
      await batch.commit();
    }

    // Delete user's alert rules
    const rulesSnap = await db.collection('alert_rules').where('uid', '==', uid).get();
    if (!rulesSnap.empty) {
      const batch = db.batch();
      for (const doc of rulesSnap.docs) batch.delete(doc.ref);
      await batch.commit();
    }

    // Delete user document
    await db.collection('users').doc(uid).delete();

    // Delete from Firebase Auth
    await adminAuth.deleteUser(uid);

    // Clear session cookie
    const response = NextResponse.json({ deleted: true });
    response.cookies.set('__session', '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    console.error('Account DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
