// Quick script to test Vercel usage API endpoints
// Run: node scripts/test-vercel-usage.mjs <VERCEL_TOKEN>

const token = process.argv[2];
if (!token) {
  console.log('Usage: node scripts/test-vercel-usage.mjs <your-vercel-token>');
  process.exit(1);
}

const API = 'https://api.vercel.com';
const headers = { Authorization: `Bearer ${token}` };

const endpoints = [
  '/v1/usage',
  '/v2/usage',
  '/v1/usage/records',
  '/v2/usage/records',
  '/v6/usage',
  '/v9/usage',
  '/v1/integrations/usage',
  '/v2/user',
  '/v1/edge-config',
  '/v13/usage',
  '/web/usage',
  '/v1/web/usage',
  '/v1/billing/usage',
  '/v2/billing/usage',
  '/v1/billing',
  '/v2/billing',
  '/v1/resource-usage',
  '/v2/resource-usage',
];

// Also get projects to test project-specific usage endpoints
const projectsRes = await fetch(`${API}/v9/projects?limit=5`, { headers });
const projectsJson = await projectsRes.json();
const projectIds = (projectsJson.projects || []).map(p => ({ id: p.id, name: p.name }));

console.log(`\nFound ${projectIds.length} projects: ${projectIds.map(p => p.name).join(', ')}\n`);

for (const p of projectIds.slice(0, 2)) {
  endpoints.push(`/v9/projects/${p.id}`);
  endpoints.push(`/v6/deployments?projectId=${p.id}&limit=1`);
  endpoints.push(`/v1/projects/${p.id}/usage`);
  endpoints.push(`/v2/projects/${p.id}/usage`);
  endpoints.push(`/v9/projects/${p.id}/usage`);
  endpoints.push(`/v13/projects/${p.id}/usage`);
}

console.log('\n=== Testing Vercel API Usage Endpoints ===\n');

for (const ep of endpoints) {
  try {
    const res = await fetch(`${API}${ep}`, { headers });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    
    const summary = res.status === 200 
      ? JSON.stringify(body).slice(0, 300)
      : `${res.status}`;
    console.log(`${res.status === 200 ? '✓' : '✗'} ${ep} → ${summary}`);
    
    if (res.status === 200) {
      console.log(`  Full response keys: ${typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
    }
  } catch (err) {
    console.log(`✗ ${ep} → ERROR: ${err.message}`);
  }
}
