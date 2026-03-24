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
}

/* ─── Fetchers ─── */

const VERCEL_API = 'https://api.vercel.com';

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
    meta: d.meta as VercelDeployment['meta'],
  }));
}

/** Fetch all projects for a user. */
export async function fetchProjects(uid: string): Promise<VercelProject[]> {
  const token = await getVercelTokenForUser(uid);

  const res = await fetch(`${VERCEL_API}/v9/projects?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Vercel API error: ${res.status}`);
  }

  const json = (await res.json()) as { projects: Array<Record<string, unknown>> };

  return json.projects.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    framework: (p.framework as string | null) ?? null,
    updatedAt: p.updatedAt as number,
    latestDeploymentState: ((p.latestDeployments as Array<Record<string, unknown>> | undefined)?.[0]?.readyState as string | null) ?? null,
    targets: p.targets as VercelProject['targets'],
  }));
}
