import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const revalidate = 60;

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    await adminAuth.verifySessionCookie(session, true);

    const db = getAdminDb();

    // List top-level collections and count documents in each
    const collectionsRef = await db.listCollections();
    const collections = await Promise.all(
      collectionsRef.map(async (col) => {
        const snapshot = await col.count().get();
        return { name: col.id, docs: snapshot.data().count };
      }),
    );

    // Get recent webhook events to compute daily activity
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const eventsSnap = await db
      .collection('webhook_events')
      .where('createdAt', '>=', sevenDaysAgo.toISOString())
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    // Bucket events by day-of-week for 7-day chart
    const dailyActivity: { date: string; events: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyActivity.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        events: 0,
      });
    }

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const eventDate = new Date(data.createdAt as string);
      const daysAgo = Math.floor((now.getTime() - eventDate.getTime()) / (24 * 60 * 60 * 1000));
      const idx = 6 - daysAgo;
      if (idx >= 0 && idx < 7) {
        dailyActivity[idx]!.events++;
      }
    }

    // Get user count
    const usersCount = collections.find((c) => c.name === 'users')?.docs ?? 0;

    // Auth - list recent users (limited)
    const usersResult = await adminAuth.listUsers(10);
    const recentAuthEvents = usersResult.users.length;

    // Compute totals
    const totalDocs = collections.reduce((sum, c) => sum + c.docs, 0);
    const totalWebhookEvents = eventsSnap.size;

    return NextResponse.json({
      collections,
      dailyActivity,
      stats: {
        totalDocs,
        totalWebhookEvents,
        usersCount,
        recentAuthEvents,
      },
    });
  } catch (error) {
    console.error('Firebase API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
