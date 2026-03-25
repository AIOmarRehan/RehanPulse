import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

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
    case 'workflow_run':
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
      groupKey: extractGroupKey(eventType, repoName ?? '', payload),
      groupTitle: extractGroupTitle(eventType, repoName ?? '', payload),
    };

    // Write to Firestore via Admin SDK (bypasses security rules)
    const db = getAdminDb();

    // Look up which user owns this repo to associate the event with them
    let eventUid: string | null = null;
    if (event.repo) {
      const repoOwner = event.repo.split('/')[0];
      if (repoOwner) {
        const usersSnap = await db
          .collection('users')
          .where('githubLogin', '==', repoOwner)
          .limit(1)
          .get();
        if (!usersSnap.empty) {
          eventUid = usersSnap.docs[0]!.id;
        }
      }
    }

    await db.collection('webhook_events').add({
      ...event,
      ...(eventUid ? { uid: eventUid } : {}),
    });

    // ── Alert evaluation: check rules and create notifications ──
    await evaluateAlertRules(db, event);

    return NextResponse.json({ received: true, event: event.type });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

/** Extract a group key to tie related notifications (same commit) together. */
function extractGroupKey(eventType: string, repo: string, payload: unknown): string | null {
  const p = payload as Record<string, unknown>;
  switch (eventType) {
    case 'push': {
      const headCommit = p.head_commit as Record<string, unknown> | undefined;
      const sha = headCommit?.id as string | undefined;
      return sha ? `${repo}:${sha.slice(0, 12)}` : null;
    }
    case 'workflow_run': {
      const wr = p.workflow_run as Record<string, unknown> | undefined;
      const sha = wr?.head_sha as string | undefined;
      return sha ? `${repo}:${sha.slice(0, 12)}` : null;
    }
    case 'check_run': {
      const cr = p.check_run as Record<string, unknown> | undefined;
      const sha = cr?.head_sha as string | undefined;
      return sha ? `${repo}:${sha.slice(0, 12)}` : null;
    }
    default:
      return null;
  }
}

/** Extract a human-readable group title (repo + commit message). */
function extractGroupTitle(eventType: string, repo: string, payload: unknown): string | null {
  const p = payload as Record<string, unknown>;
  const repoShort = repo.split('/')[1] ?? repo;
  switch (eventType) {
    case 'push': {
      const headCommit = p.head_commit as Record<string, unknown> | undefined;
      const msg = (headCommit?.message as string | undefined)?.split('\n')[0] ?? '';
      return `${repoShort} — ${msg}`;
    }
    case 'workflow_run': {
      const wr = p.workflow_run as Record<string, unknown> | undefined;
      const msg = wr?.head_commit
        ? ((wr.head_commit as Record<string, unknown>).message as string | undefined)?.split('\n')[0] ?? ''
        : '';
      return msg ? `${repoShort} — ${msg}` : `${repoShort}`;
    }
    case 'check_run': {
      const cr = p.check_run as Record<string, unknown> | undefined;
      const checkSuite = cr?.check_suite as Record<string, unknown> | undefined;
      const headCommit = checkSuite?.head_commit as Record<string, unknown> | undefined;
      const msg = (headCommit?.message as string | undefined)?.split('\n')[0] ?? '';
      return msg ? `${repoShort} — ${msg}` : `${repoShort}`;
    }
    default:
      return null;
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
    case 'workflow_run': {
      const wr = p.workflow_run as Record<string, unknown> | undefined;
      const name = wr?.name as string | undefined;
      const conclusion = wr?.conclusion as string | undefined;
      if (action === 'completed' && conclusion) {
        return `CI: ${name ?? 'workflow'} — ${conclusion}`;
      }
      return `CI: ${name ?? 'workflow'} — ${action ?? 'running'}`;
    }
    default:
      return `${eventType}${action ? `: ${action}` : ''}`;
  }
}

/** Evaluate alert rules against a new event and create notifications for matching rules. */
async function evaluateAlertRules(
  db: Firestore,
  event: { type: string; summary: string; createdAt: string; repo: string | null; groupKey: string | null; groupTitle: string | null },
) {
  try {
    // Find all enabled rules that match this event type
    const rulesSnap = await db
      .collection('alert_rules')
      .where('enabled', '==', true)
      .where('eventType', '==', event.type)
      .get();

    if (rulesSnap.empty) return;

    const batch = db.batch();

    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data() as { uid: string; name: string; eventType: string };

      // Determine severity based on event type
      const ciSeverity = event.summary.includes('— failure') || event.summary.includes('— timed_out') || event.summary.includes('— cancelled')
        ? 'error'
        : event.summary.includes('— success')
          ? 'success'
          : 'info';
      const severity = event.type === 'deployment' ? 'warning' :
        event.type === 'ci' ? ciSeverity :
        event.type === 'push' ? 'info' :
        event.type === 'pr_opened' ? 'info' :
        event.type === 'pr_closed' ? 'success' : 'info';

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        uid: rule.uid,
        severity,
        message: `[${rule.name}] ${event.summary}`,
        eventType: event.type,
        read: false,
        createdAt: event.createdAt,
        ...(event.groupKey ? { groupKey: event.groupKey } : {}),
        ...(event.groupTitle ? { groupTitle: event.groupTitle } : {}),
        ...(event.repo ? { repo: event.repo } : {}),
      });
    }

    await batch.commit();
  } catch (error) {
    // Don't fail the webhook response if alert evaluation fails
    console.error('Alert evaluation error:', error);
  }
}
