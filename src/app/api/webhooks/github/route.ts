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

    // Extract deployment state directly from payload for reliable detection
    const deploymentState =
      eventType === 'deployment_status' && typeof payload === 'object' && payload !== null
        ? ((payload as Record<string, unknown>).deployment_status as Record<string, unknown> | undefined)?.state as string ?? null
        : null;

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
      deploymentState,
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
    console.log(`[Webhook] ${eventType}/${action ?? '-'} → type=${event.type} from ${event.repo ?? 'unknown'} by ${event.sender ?? 'unknown'} uid=${eventUid ?? 'none'}`);
    await evaluateAlertRules(db, event, eventUid);

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
    case 'deployment': {
      const dep = p.deployment as Record<string, unknown> | undefined;
      const sha = dep?.sha as string | undefined;
      return sha ? `${repo}:${sha.slice(0, 12)}` : null;
    }
    case 'deployment_status': {
      const dep = p.deployment as Record<string, unknown> | undefined;
      const sha = dep?.sha as string | undefined;
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
    case 'deployment': {
      const dep = p.deployment as Record<string, unknown> | undefined;
      const sha = dep?.sha as string | undefined;
      return sha ? `${repoShort} — deploy ${sha.slice(0, 7)}` : `${repoShort}`;
    }
    case 'deployment_status': {
      const dep = p.deployment as Record<string, unknown> | undefined;
      const sha = dep?.sha as string | undefined;
      return sha ? `${repoShort} — deploy ${sha.slice(0, 7)}` : `${repoShort}`;
    }
    default:
      return null;
  }
}

/** Build a human-readable summary of the event. */
function buildSummary(eventType: string, action: string | undefined, payload: unknown): string {
  const p = payload as Record<string, unknown>;
  const repoName = ((p.repository as Record<string, unknown> | undefined)?.full_name as string | undefined)?.split('/')[1] ?? '';

  switch (eventType) {
    case 'push': {
      const commits = Array.isArray(p.commits) ? p.commits as Array<Record<string, unknown>> : [];
      const ref = typeof p.ref === 'string' ? p.ref.replace('refs/heads/', '') : 'unknown';
      const headCommit = p.head_commit as Record<string, unknown> | undefined;
      const msg = (headCommit?.message as string | undefined)?.split('\n')[0] ?? '';
      const author = (headCommit?.author as Record<string, unknown> | undefined)?.username as string | undefined
        ?? (headCommit?.author as Record<string, unknown> | undefined)?.name as string | undefined
        ?? '';
      const commitInfo = msg ? `: "${msg}"` : '';
      const authorInfo = author ? ` by ${author}` : '';
      return `Pushed ${commits.length} commit(s) to ${repoName}/${ref}${commitInfo}${authorInfo}`;
    }
    case 'pull_request': {
      const pr = p.pull_request as Record<string, unknown> | undefined;
      const title = pr?.title as string | undefined;
      const num = pr?.number as number | undefined;
      const merged = pr?.merged as boolean | undefined;
      const prAction = action === 'closed' && merged ? 'merged' : (action ?? 'updated');
      return `PR #${num ?? '?'} ${prAction} in ${repoName}: ${title ?? 'Unknown'}`;
    }
    case 'deployment_status': {
      const ds = p.deployment_status as Record<string, unknown> | undefined;
      const state = ds?.state as string | undefined;
      const desc = ds?.description as string | undefined;
      const dep = p.deployment as Record<string, unknown> | undefined;
      const env = dep?.environment as string | undefined;
      const creator = (ds?.creator as Record<string, unknown> | undefined)?.login as string | undefined;
      const parts = [`Vercel: ${state ?? 'updated'}`];
      if (env) parts.push(`(${env})`);
      parts.push(`in ${repoName}`);
      if (desc) parts.push(`— ${desc}`);
      if (creator) parts.push(`by ${creator}`);
      return parts.join(' ');
    }
    case 'check_run': {
      const cr = p.check_run as Record<string, unknown> | undefined;
      const name = cr?.name as string | undefined;
      const conclusion = cr?.conclusion as string | undefined;
      const status = cr?.status as string | undefined;
      const label = conclusion ?? (status === 'in_progress' ? 'in progress' : (action ?? 'running'));
      const startedAt = cr?.started_at as string | undefined;
      const completedAt = cr?.completed_at as string | undefined;
      let duration = '';
      if (startedAt && completedAt) {
        const secs = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
        duration = secs >= 60 ? ` (${Math.floor(secs / 60)}m ${secs % 60}s)` : ` (${secs}s)`;
      }
      return `GitHub CI: ${name ?? 'check'} — ${label}${duration} in ${repoName}`;
    }
    case 'star': {
      const sender = (p.sender as Record<string, unknown> | undefined)?.login as string | undefined;
      const fullRepo = (p.repository as Record<string, unknown> | undefined)?.full_name as string | undefined;
      return action === 'created'
        ? `${sender ?? 'Someone'} starred ${fullRepo ?? repoName}`
        : `${sender ?? 'Someone'} unstarred ${fullRepo ?? repoName}`;
    }
    case 'issues': {
      const issue = p.issue as Record<string, unknown> | undefined;
      const title = issue?.title as string | undefined;
      const num = issue?.number as number | undefined;
      return `Issue #${num ?? '?'} ${action ?? 'updated'} in ${repoName}: ${title ?? 'Unknown'}`;
    }
    case 'deployment': {
      const dep = p.deployment as Record<string, unknown> | undefined;
      const ref = dep?.ref as string | undefined;
      const env = dep?.environment as string | undefined;
      return `Vercel: deployment ${action ?? 'created'} in ${repoName}${ref ? ` on ${ref}` : ''}${env ? ` (${env})` : ''}`;
    }
    case 'workflow_run': {
      const wr = p.workflow_run as Record<string, unknown> | undefined;
      const name = wr?.name as string | undefined;
      const conclusion = wr?.conclusion as string | undefined;
      const status = wr?.status as string | undefined;
      const branch = wr?.head_branch as string | undefined;
      const runStarted = wr?.run_started_at as string | undefined;
      const updatedAt = wr?.updated_at as string | undefined;
      let duration = '';
      if (runStarted && updatedAt && conclusion) {
        const secs = Math.round((new Date(updatedAt).getTime() - new Date(runStarted).getTime()) / 1000);
        duration = secs >= 60 ? ` (${Math.floor(secs / 60)}m ${secs % 60}s)` : ` (${secs}s)`;
      }
      if (action === 'completed' && conclusion) {
        return `GitHub CI: ${name ?? 'workflow'} — ${conclusion}${duration} in ${repoName}${branch ? `/${branch}` : ''}`;
      }
      const label = status === 'in_progress' ? 'in progress' : (action ?? 'running');
      return `GitHub CI: ${name ?? 'workflow'} — ${label} in ${repoName}${branch ? `/${branch}` : ''}`;
    }
    default:
      return `${eventType}${action ? `: ${action}` : ''}${repoName ? ` in ${repoName}` : ''}`;
  }
}

/** Evaluate alert rules against a new event and create notifications for matching rules. */
async function evaluateAlertRules(
  db: Firestore,
  event: {
    eventType: string;
    action: string | null;
    type: string;
    summary: string;
    createdAt: string;
    repo: string | null;
    groupKey: string | null;
    groupTitle: string | null;
    deploymentState: string | null;
  },
  uid: string | null,
) {
  try {
    // Must have a resolved user to create notifications
    if (!uid) {
      console.log('[Alert] No uid resolved for repo — skipping alert evaluation');
      return;
    }

    // ── Skip noisy intermediate events that aren't actionable ──
    // CI: notify on 'completed' and 'in_progress' (skip 'created', 'requested', 'rerequested')
    if (event.type === 'ci') {
      if (event.action !== 'completed' && event.action !== 'in_progress') {
        console.log(`[Alert] Skipping CI event with action=${event.action} (only 'completed'/'in_progress' trigger alerts)`);
        return;
      }
    }
    // Deployment: let deployment_status through (carries actual state), only filter bare deployment events
    if (event.eventType === 'deployment' && event.action && !['created'].includes(event.action)) {
      return;
    }
    // deployment_status: only let FINAL states through (success/failure/error)
    // Skip intermediate states (pending, in_progress, queued, inactive) to avoid noise
    if (event.eventType === 'deployment_status') {
      const state = event.deploymentState ?? '';
      if (!['success', 'failure', 'error'].includes(state)) {
        console.log(`[Alert] Skipping non-final deployment_status: state=${state}`);
        return;
      }
      console.log(`[Alert] Final deployment_status received: state=${state}`);
    }
    // PR: skip non-meaningful actions (synchronize, labeled, etc.)
    if (event.eventType === 'pull_request') {
      if (event.type === 'pr_updated') return; // only opened/closed matter
    }

    // Determine notification source for nesting
    let source: 'commit' | 'github-ci' | 'vercel' = 'commit';
    if (event.type === 'ci') {
      source = 'github-ci';
    } else if (event.type === 'deployment') {
      source = 'vercel';
    }

    // Find enabled rules for THIS user that match the event type
    // Use single-field query to avoid composite index requirement, filter in JS
    const rulesSnap = await db
      .collection('alert_rules')
      .where('uid', '==', uid)
      .get();

    const matchingRules = rulesSnap.docs.filter((doc) => {
      const d = doc.data() as { enabled?: boolean; eventType?: string };
      return d.enabled === true && d.eventType === event.type;
    });

    if (matchingRules.length === 0) {
      console.log(`[Alert] No enabled rules found for eventType=${event.type}`);
      return;
    }

    console.log(`[Alert] Found ${matchingRules.length} matching rule(s) for eventType=${event.type}`);

    const batch = db.batch();

    for (const ruleDoc of matchingRules) {
      const rule = ruleDoc.data() as { uid: string; name: string; eventType: string };

      // Determine severity based on event type and content
      let severity: 'error' | 'warning' | 'info' | 'success' = 'info';

      if (event.type === 'ci') {
        // CI: severity from conclusion or action
        if (event.action === 'in_progress' || event.summary.includes('— in progress')) {
          severity = 'warning';
        } else if (event.summary.includes('— failure') || event.summary.includes('— timed_out') || event.summary.includes('— cancelled') || event.summary.includes('— startup_failure')) {
          severity = 'error';
        } else if (event.summary.includes('— success')) {
          severity = 'success';
        } else if (event.summary.includes('— skipped') || event.summary.includes('— neutral')) {
          severity = 'info';
        } else {
          severity = 'warning';
        }
      } else if (event.type === 'deployment') {
        // Deployment status: severity from raw state (not summary text)
        if (event.deploymentState === 'failure' || event.deploymentState === 'error') {
          severity = 'error';
        } else if (event.deploymentState === 'success') {
          severity = 'success';
        } else {
          severity = 'warning'; // deployment created or pending → treat as in-progress
        }
      } else if (event.type === 'push') {
        severity = 'info';
      } else if (event.type === 'pr_opened') {
        severity = 'info';
      } else if (event.type === 'pr_closed') {
        severity = event.summary.includes('merged') ? 'success' : 'warning';
      } else if (event.type === 'star') {
        severity = event.summary.includes('unstarred') ? 'warning' : 'success';
      } else if (event.type === 'issue') {
        if (event.action === 'opened') severity = 'warning';
        else if (event.action === 'closed') severity = 'success';
        else severity = 'info';
      }

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        uid: rule.uid,
        severity,
        source,
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
