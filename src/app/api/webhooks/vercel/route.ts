import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';

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

    // Create notification if user has a 'deployment' alert rule enabled
    // Only filter by uid in Firestore to avoid needing composite indexes,
    // then filter enabled + eventType in JavaScript
    const rulesSnap = await db
      .collection('alert_rules')
      .where('uid', '==', uid)
      .get();

    const matchingRules = rulesSnap.docs.filter((doc) => {
      const d = doc.data() as { enabled?: boolean; eventType?: string };
      return d.enabled === true && d.eventType === 'deployment';
    });

    if (matchingRules.length > 0) {
      const batch = db.batch();
      for (const ruleDoc of matchingRules) {
        const rule = ruleDoc.data() as { name: string };
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          uid,
          severity,
          source: 'vercel' as const,
          message: `[${rule.name}] ${summary}`,
          eventType: 'deployment',
          read: false,
          createdAt: new Date().toISOString(),
          ...(groupKey ? { groupKey } : {}),
          ...(groupTitle ? { groupTitle } : {}),
          ...(repoFullName ? { repo: repoFullName } : {}),
        });
      }
      await batch.commit();
      console.log(`[Vercel Webhook] Created ${matchingRules.length} notification(s)`);
    }

    return NextResponse.json({ received: true, event: eventType });
  } catch (error) {
    console.error('Vercel webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
