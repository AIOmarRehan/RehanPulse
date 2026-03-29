import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function getUid(request: NextRequest): Promise<string | null> {
  const session = request.cookies.get('__session')?.value;
  if (!session) return null;
  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

interface StoredConversation {
  id: string;
  title: string;
  messages: Record<string, unknown>[];
  updatedAt: number;
  createdAt: number;
}

/** GET - load all conversations (summary) or a specific one via ?id= */
export async function GET(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const convId = request.nextUrl.searchParams.get('id');

  try {
    const db = getAdminDb();
    const col = db.collection('users').doc(uid).collection('chat_conversations');

    if (convId) {
      // Load a specific conversation
      const doc = await col.doc(convId).get();
      if (!doc.exists) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json(doc.data());
    }

    // List all conversations (most recent first), return summaries only
    const snapshot = await col.orderBy('updatedAt', 'desc').limit(50).get();
    const conversations = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || 'New chat',
        updatedAt: data.updatedAt,
        createdAt: data.createdAt,
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
      };
    });
    return Response.json({ conversations });
  } catch (error) {
    console.error('Chat history GET error:', error);
    return Response.json({ error: 'Failed to load history' }, { status: 500 });
  }
}

/** POST - save a conversation (create or update) */
export async function POST(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; title?: string; messages?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: 'Messages array required' }, { status: 400 });
  }

  // Keep only the last 100 messages to bound storage
  const messages = (body.messages as Record<string, unknown>[]).slice(-100).map((m) => ({
    id: String(m.id ?? ''),
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content ?? '').slice(0, 8000),
    timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
  }));

  // Auto-generate title from first user message
  const firstUserMsg = messages.find((m) => m.role === 'user');
  const autoTitle = firstUserMsg
    ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '')
    : 'New chat';

  const now = Date.now();
  const db = getAdminDb();
  const col = db.collection('users').doc(uid).collection('chat_conversations');

  try {
    if (body.id) {
      // Update existing conversation
      await col.doc(body.id).set(
        {
          messages,
          title: body.title || autoTitle,
          updatedAt: now,
        },
        { merge: true },
      );
      return Response.json({ ok: true, id: body.id });
    } else {
      // Create new conversation
      const doc = col.doc();
      const conv: StoredConversation = {
        id: doc.id,
        title: body.title || autoTitle,
        messages,
        updatedAt: now,
        createdAt: now,
      };
      await doc.set(conv);
      return Response.json({ ok: true, id: doc.id });
    }
  } catch (error) {
    console.error('Chat history POST error:', error);
    return Response.json({ error: 'Failed to save history' }, { status: 500 });
  }
}

/** DELETE - delete a specific conversation or all conversations */
export async function DELETE(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const convId = request.nextUrl.searchParams.get('id');

  try {
    const db = getAdminDb();
    const col = db.collection('users').doc(uid).collection('chat_conversations');

    if (convId) {
      await col.doc(convId).delete();
    } else {
      // Delete all conversations
      const snapshot = await col.limit(100).get();
      const batch = db.batch();
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Chat history DELETE error:', error);
    return Response.json({ error: 'Failed to clear history' }, { status: 500 });
  }
}
