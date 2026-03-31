import { getAdminDb } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

/* ─── Types ─── */

export interface VercelDeployment {
  uid: string;
  name: string;        // project name
  url: string;         // deployment URL
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  target: string | null; // 'production' | 'preview' | null
  createdAt: number;   // epoch ms
  buildingAt?: number; // epoch ms — when build started
  ready?: number;      // epoch ms — when deployment became ready
  meta?: {
    githubCommitRef?: string;
    githubCommitMessage?: string;
  };
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  updatedAt: number;
  latestDeploymentState: string | null;
  targets: { production?: { url?: string } } | null;
  domains: string[];
}

/* ─── Fetchers ─── */

const VERCEL_API = 'https://api.vercel.com';
const FETCH_TIMEOUT = 15_000; // 15 seconds max per Vercel API call

/** Get the Vercel API token for a user from Firestore. */
async function getVercelTokenForUser(uid: string): Promise<string> {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).get();
  const data = doc.data();

  if (!data?.vercelTokenEncrypted) {
    throw new Error('No Vercel token configured. Add it in Settings.');
  }

  return decrypt(data.vercelTokenEncrypted as string);
}

/** Fetch recent deployments across all projects for a user. */
export async function fetchDeployments(uid: string, limit = 10): Promise<VercelDeployment[]> {
  const token = await getVercelTokenForUser(uid);

  const res = await fetch(`${VERCEL_API}/v6/deployments?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Vercel API error: ${res.status}`);
  }

  const json = (await res.json()) as { deployments: Array<Record<string, unknown>> };

  return json.deployments.map((d) => ({
    uid: d.uid as string,
    name: d.name as string,
    url: d.url as string,
    state: d.state as VercelDeployment['state'],
    target: (d.target as string | null) ?? null,
    createdAt: d.createdAt as number,
    buildingAt: (d.buildingAt as number | undefined) ?? undefined,
    ready: (d.ready as number | undefined) ?? undefined,
    meta: d.meta as VercelDeployment['meta'],
  }));
}

/* ─── Usage types ─── */

export interface VercelUsage {
  subscription: string;    // e.g. 'hobby', 'pro', 'enterprise'
  requests: number;
  bandwidth: number;       // bytes outgoing
  buildMinutes: number;
  functionGBHours: number;
  dataCacheReads: number;  // bytes sent
  dataCacheWrites: number; // bytes received
}

/** Fetch billing usage for the current period. */
export async function fetchUsage(uid: string): Promise<VercelUsage> {
  const token = await getVercelTokenForUser(uid);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = monthStart.toISOString();
  const to = now.toISOString();

  const types = ['requests', 'builds', 'data_cache'] as const;

  // Fetch user info (for subscription) in parallel with usage data
  const [userRes, ...results] = await Promise.all([
    fetch(`${VERCEL_API}/v2/user`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    }),
    ...types.map(async (type) => {
      const res = await fetch(
        `${VERCEL_API}/v2/usage?type=${type}&from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT) },
      );
      if (!res.ok) return { type, data: [] as Record<string, unknown>[] };
      const json = (await res.json()) as { data: Record<string, unknown>[] };
      return { type, data: json.data ?? [] };
    }),
  ]);

  let subscription = 'hobby';
  if (userRes.ok) {
    const userJson = (await userRes.json()) as { user?: { billing?: { plan?: string } } };
    subscription = userJson.user?.billing?.plan ?? 'hobby';
  }

  const byType = Object.fromEntries(results.map((r) => [r.type, r.data]));

  const sum = (arr: Record<string, unknown>[], key: string) =>
    arr.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);

  const reqData = byType['requests'] ?? [];
  const buildData = byType['builds'] ?? [];
  const cacheData = byType['data_cache'] ?? [];

  return {
    subscription,
    requests: sum(reqData, 'request_hit_count') + sum(reqData, 'request_miss_count'),
    bandwidth: sum(reqData, 'bandwidth_outgoing_bytes'),
    functionGBHours: sum(reqData, 'function_execution_successful_gb_hours'),
    buildMinutes: Math.round(sum(buildData, 'build_build_seconds') / 60),
    dataCacheReads: sum(cacheData, 'data_cache_total_sent_bytes'),
    dataCacheWrites: sum(cacheData, 'data_cache_total_received_bytes'),
  };
}

/** Fetch all projects for a user. */
export async function fetchProjects(uid: string): Promise<VercelProject[]> {
  const token = await getVercelTokenForUser(uid);

  const res = await fetch(`${VERCEL_API}/v9/projects?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Vercel API error: ${res.status}`);
  }

  const json = (await res.json()) as { projects: Array<Record<string, unknown>> };

  const projects = json.projects.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    framework: (p.framework as string | null) ?? null,
    updatedAt: p.updatedAt as number,
    latestDeploymentState: ((p.latestDeployments as Array<Record<string, unknown>> | undefined)?.[0]?.readyState as string | null) ?? null,
    targets: p.targets as VercelProject['targets'],
    domains: [] as string[],
  }));

  // Fetch domains for each project in parallel
  const domainResults = await Promise.allSettled(
    projects.map(async (p) => {
      const domRes = await fetch(`${VERCEL_API}/v9/projects/${p.id}/domains`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!domRes.ok) return [];
      const domJson = (await domRes.json()) as { domains: Array<{ name: string }> };
      return (domJson.domains ?? []).map((d) => d.name);
    })
  );

  for (let i = 0; i < projects.length; i++) {
    const result = domainResults[i];
    if (result && result.status === 'fulfilled') {
      projects[i]!.domains = result.value;
    }
  }

  return projects;
}

/**
 * Auto-register a Vercel webhook for deployment events.
 * Creates or updates a webhook pointing at our /api/webhooks/vercel endpoint.
 * Returns the webhook secret for signature verification.
 */
export async function registerVercelWebhook(
  vercelToken: string,
  webhookUrl: string,
): Promise<{ id: string; secret: string } | null> {
  try {
    // List existing webhooks to check if one already exists for our URL
    const listRes = await fetch(`${VERCEL_API}/v1/webhooks`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (listRes.ok) {
      const listJson = (await listRes.json()) as Array<{ id: string; url: string }>;
      const existing = listJson.find((h) => h.url === webhookUrl);
      if (existing) {
        // Already registered — no secret returned from list, so delete and re-create
        await fetch(`${VERCEL_API}/v1/webhooks/${existing.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${vercelToken}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
      }
    }

    // Create the webhook — Vercel returns a secret for signature verification
    const createRes = await fetch(`${VERCEL_API}/v1/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: [
          'deployment.created',
          'deployment.ready',
          'deployment.error',
          'deployment.canceled',
        ],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('Failed to create Vercel webhook:', createRes.status, errText);
      return null;
    }

    const result = (await createRes.json()) as { id: string; secret: string };
    return { id: result.id, secret: result.secret };
  } catch (err) {
    console.error('Vercel webhook registration error:', err);
    return null;
  }
}
