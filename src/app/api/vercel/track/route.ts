import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { fetchDeployments } from '@/lib/vercel';

/** Deterministic notification doc ID — same as webhook handlers use. */
function notificationDocId(uid: string, groupKey: string, source: string): string {
  return createHash('sha256').update(`${uid}:${groupKey}:${source}`).digest('hex').slice(0, 24);
}

/**
 * POST /api/vercel/track
 *
 * Polls the Vercel API for recent deployments and creates/updates notifications.
 * Called periodically by the client after receiving push/CI webhook events.
 *
 * Key rules:
 * - Never recreates a notification that already exists (deleted = stay deleted)
 * - Only upgrades progress → final (building → ready/error) if the progress doc still exists
 * - Only tracks deployments from the last 3 minutes
 */
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAdminAuth().verifySessionCookie(session, true);
    const uid = user.uid;

    // Fetch recent deployments from Vercel API
    let deployments;
    try {
      deployments = await fetchDeployments(uid, 5);
    } catch (err) {
      console.error('[Vercel Track] fetchDeployments failed:', err);
      return NextResponse.json({ tracked: 0 });
    }

    if (!deployments || deployments.length === 0) {
      console.log('[Vercel Track] No deployments returned from Vercel API');
      return NextResponse.json({ tracked: 0 });
    }

    console.log(`[Vercel Track] Got ${deployments.length} deployments, checking recency...`);

    const db = getAdminDb();
    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;

    // Check if user recently cleared notifications — skip deployments created before the clear
    let lastClearedAt = 0;
    try {
      const stateDoc = await db.collection('notification_state').doc(uid).get();
      if (stateDoc.exists) {
        const ts = (stateDoc.data() as { lastClearedAt?: string }).lastClearedAt;
        if (ts) lastClearedAt = new Date(ts).getTime();
      }
    } catch { /* ignore */ }

    let tracked = 0;

    for (const dep of deployments) {
      // Only track deployments from the last 10 minutes
      if (now - dep.createdAt > TEN_MINUTES) continue;

      // Skip deployments created before the user last cleared notifications
      if (dep.createdAt < lastClearedAt) continue;

      const sha = dep.meta?.githubCommitSha;

      // Build groupKey matching the GitHub webhook format: "owner/repo:sha12"
      // Construct directly from deployment meta — no notification lookup needed
      let groupKey: string | null = null;
      let groupTitle: string | null = null;
      let repoFullName: string | null = null;

      if (sha) {
        const shaPrefix = sha.slice(0, 12);
        const org = dep.meta?.githubOrg;
        const repo = dep.meta?.githubRepo;

        if (org && repo) {
          repoFullName = `${org}/${repo}`;
          groupKey = `${repoFullName}:${shaPrefix}`;
          const msg = dep.meta?.githubCommitMessage?.split('\n')[0];
          groupTitle = msg ? `${repo} — ${msg}` : `${repo} — deployment`;
        } else {
          // Fallback: no GitHub org/repo in deployment meta
          groupKey = `${dep.name}:${shaPrefix}`;
          const msg = dep.meta?.githubCommitMessage?.split('\n')[0];
          groupTitle = msg ? `${dep.name} — ${msg}` : `${dep.name} — deployment`;
        }
      } else {
        groupKey = `vercel:${dep.uid}`;
        groupTitle = `${dep.name} — deployment`;
      }

      if (!groupKey) continue;

      // ── Redeploy detection ──
      // A "redeploy" is when Vercel builds the SAME commit SHA again (e.g., from
      // the Vercel dashboard). We detect this by checking if a final notification
      // already exists for this SHA AND was created by a DIFFERENT deployment.
      // We store the deployment UID in the notification data to distinguish.
      if (sha) {
        const shaBasedFinalDocId = notificationDocId(uid, groupKey, 'vercel:final');
        const existingFinal = await db.collection('notifications').doc(shaBasedFinalDocId).get();
        if (existingFinal.exists) {
          const existingData = existingFinal.data() as { vercelDeploymentUid?: string };
          if (existingData.vercelDeploymentUid && existingData.vercelDeploymentUid !== dep.uid) {
            // Different deployment for same SHA → redeploy
            groupKey = `vercel:${dep.uid}`;
            const repoShort = dep.meta?.githubRepo ?? dep.name;
            const msg = dep.meta?.githubCommitMessage?.split('\n')[0];
            groupTitle = msg
              ? `${repoShort} — Redeploy: ${msg}`
              : `${repoShort} — Redeploy`;
            console.log(`[Vercel Track] Redeploy detected (different deployment uid) — new groupKey=${groupKey}`);
          }
          // else: same deployment uid → just a re-poll, keep SHA-based groupKey
        }
      }

      console.log(`[Vercel Track] Processing ${dep.name} state=${dep.state} sha=${sha?.slice(0, 8) ?? 'none'} groupKey=${groupKey}`);

      const isFinal = ['READY', 'ERROR', 'CANCELED'].includes(dep.state);
      const stateLabel = dep.state.toLowerCase();

      const severityMap: Record<string, 'error' | 'warning' | 'success' | 'info'> = {
        BUILDING: 'warning',
        QUEUED: 'warning',
        INITIALIZING: 'warning',
        READY: 'success',
        ERROR: 'error',
        CANCELED: 'warning',
      };
      const severity = severityMap[dep.state] ?? 'info';

      const commitMsg = dep.meta?.githubCommitMessage?.split('\n')[0];
      const branchInfo = dep.meta?.githubCommitRef ? ` on ${dep.meta.githubCommitRef}` : '';
      const commitInfo = commitMsg ? ` — "${commitMsg}"` : '';

      /**
       * Write notification — create or update.
       * Ghost prevention is handled by lastClearedAt check above.
       */
      const writeNotification = async (docId: string, data: Record<string, unknown>) => {
        const ref = db.collection('notifications').doc(docId);
        const snap = await ref.get();
        if (snap.exists) {
          // Update without resetting the read flag
          const { read: _read, ...updateData } = data;
          void _read;
          await ref.update(updateData);
          return true;
        }
        await ref.set(data);
        return true;
      };

      // ── Progress notification ──
      const progressDocId = notificationDocId(uid, groupKey, 'vercel:progress');
      if (await writeNotification(progressDocId, {
        uid,
        severity: isFinal ? ('warning' as const) : severity,
        source: 'vercel' as const,
        message: `[Vercel Deployment] Vercel: ${isFinal ? 'was building' : stateLabel} in ${dep.name}${branchInfo}${commitInfo}`,
        eventType: 'deployment',
        read: false,
        createdAt: new Date(dep.createdAt).toISOString(),
        groupKey,
        vercelDeploymentUid: dep.uid,
        ...(groupTitle ? { groupTitle } : {}),
        ...(repoFullName ? { repo: repoFullName } : {}),
      })) {
        tracked++;
      }

      // ── Final notification ──
      if (isFinal) {
        const finalDocId = notificationDocId(uid, groupKey, 'vercel:final');
        if (await writeNotification(finalDocId, {
          uid,
          severity,
          source: 'vercel' as const,
          message: `[Vercel Deployment] Vercel: ${stateLabel} in ${dep.name}${branchInfo}${commitInfo}`,
          eventType: 'deployment',
          read: false,
          createdAt: dep.ready
            ? new Date(dep.ready).toISOString()
            : new Date().toISOString(),
          groupKey,
          vercelDeploymentUid: dep.uid,
          ...(groupTitle ? { groupTitle } : {}),
          ...(repoFullName ? { repo: repoFullName } : {}),
        })) {
          tracked++;
        }
      }
    }

    // Bump notification counter so SSE stream fires
    if (tracked > 0) {
      await db.collection('notification_counters').doc(uid).set({
        count: FieldValue.increment(tracked),
        updatedAt: new Date().toISOString(),
        lastSource: 'vercel',
        lastEventType: 'deployment',
      }, { merge: true });
    }

    console.log(`[Vercel Track] Done — tracked ${tracked} notifications`);
    return NextResponse.json({ tracked });
  } catch (error) {
    console.error('Vercel track error:', error);
    return NextResponse.json({ error: 'Tracking failed' }, { status: 500 });
  }
}
