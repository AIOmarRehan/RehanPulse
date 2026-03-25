import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

/** GET /api/alerts — fetch user's alert rules */
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const db = getAdminDb();

    const rulesSnap = await db
      .collection('alert_rules')
      .where('uid', '==', user.uid)
      .get();

    const rules = rulesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = (a as Record<string, unknown>).createdAt as string ?? '';
        const bTime = (b as Record<string, unknown>).createdAt as string ?? '';
        return bTime.localeCompare(aTime);
      });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Alerts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch alert rules' }, { status: 500 });
  }
}

/** POST /api/alerts — create a new alert rule */
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const body = (await request.json()) as Record<string, unknown>;

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const eventType = typeof body.eventType === 'string' ? body.eventType : '';
    const enabled = body.enabled !== false;

    if (!name || !eventType) {
      return NextResponse.json({ error: 'name and eventType are required' }, { status: 400 });
    }

    const db = getAdminDb();

    // Check for duplicate rule (same eventType for this user)
    const existing = await db.collection('alert_rules')
      .where('uid', '==', user.uid)
      .where('eventType', '==', eventType)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { error: `An alert rule for this event type already exists` },
        { status: 409 }
      );
    }

    const doc = await db.collection('alert_rules').add({
      uid: user.uid,
      name,
      eventType,
      enabled,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ id: doc.id, name, eventType, enabled });
  } catch (error) {
    console.error('Alerts POST error:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }
}

/** PATCH /api/alerts — toggle an existing alert rule */
export async function PATCH(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const body = (await request.json()) as Record<string, unknown>;

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection('alert_rules').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists || (docSnap.data() as Record<string, unknown>).uid !== user.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const currentEnabled = (docSnap.data() as Record<string, unknown>).enabled as boolean;
    await docRef.update({ enabled: !currentEnabled });

    return NextResponse.json({ id, enabled: !currentEnabled });
  } catch (error) {
    console.error('Alerts PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}

/** PUT /api/alerts — rename an alert rule */
export async function PUT(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const body = (await request.json()) as Record<string, unknown>;

    const id = typeof body.id === 'string' ? body.id : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!id || !name) {
      return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection('alert_rules').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists || (docSnap.data() as Record<string, unknown>).uid !== user.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await docRef.update({ name });
    return NextResponse.json({ id, name });
  } catch (error) {
    console.error('Alerts PUT error:', error);
    return NextResponse.json({ error: 'Failed to rename rule' }, { status: 500 });
  }
}

/** DELETE /api/alerts — remove an alert rule */
export async function DELETE(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') ?? '';

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection('alert_rules').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists || (docSnap.data() as Record<string, unknown>).uid !== user.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Alerts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
