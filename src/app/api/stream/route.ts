import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let uid: string;
  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    uid = decoded.uid;
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = getAdminDb();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat every 30s to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Listen for new webhook events filtered to this user
      const unsubWebhooks = db
        .collection('webhook_events')
        .where('uid', '==', uid)
        .limit(50)
        .onSnapshot(
          (snapshot) => {
            for (const change of snapshot.docChanges()) {
              if (change.type === 'added') {
                const data = change.doc.data();
                const event = {
                  id: change.doc.id,
                  ...data,
                };
                try {
                  controller.enqueue(
                    encoder.encode(`event: webhook\ndata: ${JSON.stringify(event)}\n\n`),
                  );
                } catch {
                  // Stream closed
                  clearInterval(heartbeat);
                  unsubWebhooks();
                  unsubNotifs();
                }
              }
            }
          },
          (error) => {
            console.error('Firestore webhook snapshot error:', error);
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch {
              // Already closed
            }
          },
        );

      // Listen for new notifications — eliminates race condition between
      // webhook_event write and notification creation
      const unsubNotifs = db
        .collection('notifications')
        .where('uid', '==', uid)
        .limit(20)
        .onSnapshot(
          (snapshot) => {
            for (const change of snapshot.docChanges()) {
              if (change.type === 'added' || change.type === 'modified') {
                try {
                  controller.enqueue(
                    encoder.encode(`event: notification\ndata: ${JSON.stringify({ id: change.doc.id, type: change.type })}\n\n`),
                  );
                } catch {
                  clearInterval(heartbeat);
                  unsubWebhooks();
                  unsubNotifs();
                }
              }
            }
          },
          (error) => {
            console.error('Firestore notification snapshot error:', error);
          },
        );

      unsubscribe = () => {
        unsubWebhooks();
        unsubNotifs();
      };

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
