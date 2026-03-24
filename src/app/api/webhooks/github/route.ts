import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';

/** Verify GitHub webhook X-Hub-Signature-256 HMAC. */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Map GitHub event to a simplified type for storage. */
function classifyEvent(eventType: string, action?: string): string {
  switch (eventType) {
    case 'push':
      return 'push';
    case 'pull_request':
      return action === 'opened' ? 'pr_opened' : action === 'closed' ? 'pr_closed' : 'pr_updated';
    case 'check_run':
    case 'check_suite':
      return 'ci';
    case 'deployment':
    case 'deployment_status':
      return 'deployment';
    case 'issues':
      return 'issue';
    case 'star':
      return 'star';
    default:
      return eventType;
  }
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifySignature(body, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const eventType = request.headers.get('x-github-event') ?? 'unknown';
    const deliveryId = request.headers.get('x-github-delivery') ?? 'unknown';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payload = JSON.parse(body);
    const action = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).action as string | undefined : undefined;

    // Extract common fields
    const repoName =
      typeof payload === 'object' && payload !== null
        ? ((payload as Record<string, unknown>).repository as Record<string, unknown> | undefined)?.full_name as string | undefined
        : undefined;

    const senderLogin =
      typeof payload === 'object' && payload !== null
        ? ((payload as Record<string, unknown>).sender as Record<string, unknown> | undefined)?.login as string | undefined
        : undefined;

    const event = {
      deliveryId,
      eventType,
      action: action ?? null,
      type: classifyEvent(eventType, action),
      repo: repoName ?? null,
      sender: senderLogin ?? null,
      createdAt: new Date().toISOString(),
      // Store a summary, not the entire payload
      summary: buildSummary(eventType, action, payload),
    };

    // Write to Firestore via Admin SDK (bypasses security rules)
    const db = getAdminDb();
    await db.collection('webhook_events').add(event);

    return NextResponse.json({ received: true, event: event.type });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

/** Build a human-readable summary of the event. */
function buildSummary(eventType: string, action: string | undefined, payload: unknown): string {
  const p = payload as Record<string, unknown>;

  switch (eventType) {
    case 'push': {
      const commits = Array.isArray(p.commits) ? p.commits.length : 0;
      const ref = typeof p.ref === 'string' ? p.ref.replace('refs/heads/', '') : 'unknown';
      return `Pushed ${commits} commit(s) to ${ref}`;
    }
    case 'pull_request': {
      const pr = p.pull_request as Record<string, unknown> | undefined;
      const title = pr?.title as string | undefined;
      return `PR ${action ?? 'updated'}: ${title ?? 'Unknown'}`;
    }
    case 'deployment_status': {
      const ds = p.deployment_status as Record<string, unknown> | undefined;
      const state = ds?.state as string | undefined;
      return `Deployment ${state ?? 'updated'}`;
    }
    case 'check_run': {
      const cr = p.check_run as Record<string, unknown> | undefined;
      const name = cr?.name as string | undefined;
      const conclusion = cr?.conclusion as string | undefined;
      return `CI: ${name ?? 'check'} — ${conclusion ?? action ?? 'running'}`;
    }
    default:
      return `${eventType}${action ? `: ${action}` : ''}`;
  }
}
