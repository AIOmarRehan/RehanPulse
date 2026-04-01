import { NextRequest, NextResponse } from 'next/server';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/** Verify Vercel webhook x-vercel-signature HMAC SHA1. */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha1', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Deterministic notification doc ID — enables UPSERT (same group+source overwrites). */
function notificationDocId(uid: string, groupKey: string, source: string): string {
  return createHash('sha256').update(`${uid}:${groupKey}:${source}`).digest('hex').slice(0, 24);
}

/** Map Vercel event type to severity. */
function getSeverity(type: string): 'error' | 'warning' | 'info' | 'success' {
  switch (type) {
    case 'deployment.ready':
    case 'deployment.succeeded':
      return 'success';
    case 'deployment.error':
      return 'error';
    case 'deployment.canceled':
      return 'warning';
    case 'deployment.created':
      return 'warning'; // building / in-progress
    default:
      return 'info';
  }
}

/** Build a human-readable summary for the Vercel event. */
function buildSummary(
  type: string,
  projectName: string,
  meta?: { githubCommitMessage?: string; githubCommitRef?: string },
): string {
  const stateMap: Record<string, string> = {
    'deployment.created': 'building',
    'deployment.ready': 'success',
    'deployment.succeeded': 'success',
    'deployment.error': 'error',
    'deployment.canceled': 'canceled',
  };
  const state = stateMap[type] ?? type.replace('deployment.', '');
  const parts = [`Vercel: ${state} in ${projectName}`];
  if (meta?.githubCommitRef) parts.push(`on ${meta.githubCommitRef}`);
  if (meta?.githubCommitMessage) parts.push(`— "${meta.githubCommitMessage.split('\n')[0]}"`);
  return parts.join(' ');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Identify which user this webhook belongs to
    const uid = request.nextUrl.searchParams.get('uid');
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid parameter' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify signature using the per-user stored webhook secret
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const webhookSecret = userData.vercelWebhookSecret as string | undefined;
    if (webhookSecret) {
      const signature = request.headers.get('x-vercel-signature');
      if (!verifySignature(body, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payload = JSON.parse(body);
    const p = payload as {
      type?: string;
      createdAt?: number;
      payload?: {
        deployment?: {
          id?: string;
          name?: string;
          url?: string;
          meta?: {
            githubCommitSha?: string;
            githubCommitMessage?: string;
            githubCommitRef?: string;
            githubOrg?: string;
            githubRepo?: string;
          };
        };
        project?: {
          id?: string;
          name?: string;
        };
      };
    };

    const eventType = p.type ?? 'unknown';
    const deployment = p.payload?.deployment;
    const project = p.payload?.project;
    const projectName = project?.name ?? deployment?.name ?? 'unknown';
    const meta = deployment?.meta;
    const repoFullName = meta?.githubOrg && meta?.githubRepo
      ? `${meta.githubOrg}/${meta.githubRepo}`
      : null;

    // Build group key from commit SHA (ties to GitHub webhook group) or deployment ID
    const groupKey = meta?.githubCommitSha
      ? `${repoFullName ?? projectName}:${meta.githubCommitSha.slice(0, 12)}`
      : deployment?.id
        ? `vercel:${deployment.id}`
        : null;

    const groupTitle = meta?.githubCommitMessage
      ? `${projectName} — ${meta.githubCommitMessage.split('\n')[0]}`
      : `${projectName} — deployment`;

    const severity = getSeverity(eventType);
    const summary = buildSummary(eventType, projectName, meta);

    console.log(`[Vercel Webhook] ${eventType} for ${projectName} uid=${uid}`);

    // Write to webhook_events for SSE stream
    await db.collection('webhook_events').add({
      deliveryId: deployment?.id ?? `vercel-${Date.now()}`,
      eventType: `vercel:${eventType.replace('deployment.', '')}`,
      action: eventType.replace('deployment.', ''),
      type: 'deployment',
      repo: repoFullName,
      sender: null,
      createdAt: new Date().toISOString(),
      summary,
      groupKey,
      groupTitle,
      uid,
    });

    // ── Determine if this is a push-triggered deploy or a redeploy ──
    // For push-triggered deploys, the client-side track endpoint creates Vercel
    // notifications grouped with the commit/CI notifications. Skip here.
    // For redeploys (no recent push for this SHA), create standalone notifications.
    let notifGroupKey = groupKey;
    let notifGroupTitle = groupTitle;

    if (meta?.githubCommitSha) {
      const shaPrefix = meta.githubCommitSha.slice(0, 12);

      // Direct doc lookup — 1 read instead of 100
      const commitGroupKey = `${repoFullName ?? projectName}:${shaPrefix}`;
      const commitDocId = notificationDocId(uid, commitGroupKey, 'commit:final');
      const commitDoc = await db.collection('notifications').doc(commitDocId).get();
      const TEN_MINUTES = 10 * 60 * 1000;
      const hasRecentPush = commitDoc.exists && (() => {
        const d = commitDoc.data() as { createdAt?: string };
        const age = Date.now() - new Date(d.createdAt ?? '').getTime();
        return age < TEN_MINUTES;
      })();

      if (hasRecentPush) {
        // Push-triggered deploy — track endpoint will handle Vercel notifications
        console.log(`[Vercel Webhook] Push-triggered deploy — skipping notification for ${projectName}`);
        return NextResponse.json({ received: true, event: eventType });
      }

      // Redeploy: use deployment ID for unique grouping (not SHA)
      if (deployment?.id) {
        notifGroupKey = `vercel:${deployment.id}`;
      }
      notifGroupTitle = meta.githubCommitMessage
        ? `${projectName} — Redeploy: ${meta.githubCommitMessage.split('\n')[0]}`
        : `${projectName} — Redeploy`;
      console.log(`[Vercel Webhook] Redeploy detected — groupKey=${notifGroupKey}`);
    }

    // Create notification for redeploy / standalone deploy.
    const rulesSnap = await db
      .collection('alert_rules')
      .where('uid', '==', uid)
      .get();

    const matchingRules = rulesSnap.docs.filter((doc) => {
      const d = doc.data() as { enabled?: boolean; eventType?: string };
      return d.enabled === true && d.eventType === 'deployment';
    });

    const ruleName = matchingRules.length > 0
      ? (matchingRules[0]!.data() as { name: string }).name
      : 'Vercel Deployment';

    const notifData = {
      uid,
      severity,
      source: 'vercel' as const,
      message: `[${ruleName}] ${summary}`,
      eventType: 'deployment',
      read: false,
      createdAt: new Date().toISOString(),
      ...(deployment?.id ? { vercelDeploymentUid: deployment.id } : {}),
      ...(notifGroupKey ? { groupKey: notifGroupKey } : {}),
      ...(notifGroupTitle ? { groupTitle: notifGroupTitle } : {}),
      ...(repoFullName ? { repo: repoFullName } : {}),
    };

    // UPSERT: deterministic doc ID with lifecycle phase
    // deployment.created (progress) and deployment.ready (final) are SEPARATE notifications
    const phase = eventType === 'deployment.created' ? 'progress' : 'final';
    if (notifGroupKey) {
      const docId = notificationDocId(uid, notifGroupKey, `vercel:${phase}`);
      await db.collection('notifications').doc(docId).set(notifData, { merge: true });
    } else {
      await db.collection('notifications').add(notifData);
    }
    console.log(`[Vercel Webhook] Upserted notification for ${eventType} (phase=${phase})`);

    // Bump notification counter so SSE stream fires
    await db.collection('notification_counters').doc(uid).set({
      count: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
      lastSource: 'vercel',
      lastEventType: 'deployment',
    }, { merge: true });

    return NextResponse.json({ received: true, event: eventType });
  } catch (error) {
    console.error('Vercel webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
