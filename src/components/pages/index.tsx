'use client';

import { motion } from 'framer-motion';
import { WidgetGrid, type WidgetConfig } from '@/components/widgets/widget-grid';
import { useGitHubData } from '@/hooks/use-github-data';
import { useEventStore } from '@/lib/stores/event-store';
import type { GitHubCommit, GitHubPR, RateLimitInfo } from '@/lib/github';

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

/* ─── Widget definitions for Dashboard ─── */
const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: 'commits', title: 'Recent Commits', icon: '🐙', colSpan: 1 },
  { id: 'deploys', title: 'Active Deployments', icon: '🚀', colSpan: 1 },
  { id: 'prs', title: 'Pull Requests', icon: '📋', colSpan: 1 },
  { id: 'rate-limit', title: 'API Rate Limit', icon: '⚡', colSpan: 1 },
  { id: 'activity', title: 'Activity Timeline', icon: '📈', colSpan: 2 },
  { id: 'live-events', title: 'Live Events (SSE)', icon: '📡', colSpan: 2 },
];

function CommitsList({ commits }: { commits: GitHubCommit[] }) {
  if (commits.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-white/30">No recent commits</p>;
  }
  return (
    <div className="space-y-2">
      {commits.slice(0, 5).map((c) => (
        <a
          key={c.sha}
          href={c.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:bg-white/[0.03] dark:text-white/60 dark:hover:bg-white/[0.06]"
        >
          <span className="shrink-0 font-mono text-[10px] text-indigo-400">{c.sha}</span>
          <span className="truncate">{c.message}</span>
        </a>
      ))}
    </div>
  );
}

function PRsList({ prs }: { prs: GitHubPR[] }) {
  if (prs.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-white/30">No open PRs</p>;
  }
  return (
    <div className="space-y-2">
      {prs.slice(0, 5).map((pr) => (
        <a
          key={pr.id}
          href={pr.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:bg-white/[0.03] dark:text-white/60 dark:hover:bg-white/[0.06]"
        >
          <span className="shrink-0 text-emerald-400">#{pr.number}</span>
          <span className="truncate">{pr.title}</span>
          {pr.draft && <span className="shrink-0 rounded bg-gray-200 px-1 text-[9px] dark:bg-white/10">Draft</span>}
        </a>
      ))}
    </div>
  );
}

function RateLimitWidget({ rateLimit }: { rateLimit: RateLimitInfo | undefined }) {
  if (!rateLimit) {
    return <p className="text-xs text-gray-400 dark:text-white/30">Loading...</p>;
  }
  const pct = Math.round((rateLimit.used / rateLimit.limit) * 100);
  const isWarning = pct >= 80;
  const resetDate = new Date(rateLimit.reset * 1000);
  const resetIn = Math.max(0, Math.round((resetDate.getTime() - Date.now()) / 60000));

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{rateLimit.remaining}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/30">of {rateLimit.limit} remaining</p>
        </div>
        <span className={`text-xs font-medium ${isWarning ? 'text-red-400' : 'text-emerald-400'}`}>
          {pct}% used
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all ${isWarning ? 'bg-red-400' : 'bg-indigo-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isWarning && (
        <p className="text-[10px] text-red-400">
          Rate limit high! Resets in {resetIn}m
        </p>
      )}
      {!isWarning && (
        <p className="text-[10px] text-gray-400 dark:text-white/25">
          Resets in {resetIn}m
        </p>
      )}
    </div>
  );
}

function LiveEventsWidget() {
  const events = useEventStore((s) => s.events);
  const connected = useEventStore((s) => s.connected);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px]">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`} />
        <span className="text-gray-400 dark:text-white/30">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-white/30">
          Waiting for webhook events...
        </p>
      ) : (
        events.slice(0, 6).map((ev) => (
          <div
            key={ev.id}
            className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/[0.03]"
          >
            <span className="mt-0.5 text-base">
              {ev.type === 'push' ? '📤' : ev.type.startsWith('pr') ? '🔀' : ev.type === 'ci' ? '⚙️' : ev.type === 'deployment' ? '🚀' : '📌'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-gray-700 dark:text-white/60">{ev.summary}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-white/25">
                {ev.repo && <span>{ev.repo}</span>}
                {ev.sender && <><span>·</span><span>{ev.sender}</span></>}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── Dashboard ─── */
export function DashboardContent({ userName }: { userName?: string }) {
  const { data, isLoading } = useGitHubData();

  const renderWidget = (widget: WidgetConfig) => {
    if (widget.id === 'commits') {
      if (isLoading) return <WidgetSkeleton />;
      return <CommitsList commits={data?.commits ?? []} />;
    }
    if (widget.id === 'prs') {
      if (isLoading) return <WidgetSkeleton />;
      return <PRsList prs={data?.pullRequests ?? []} />;
    }
    if (widget.id === 'rate-limit') {
      if (isLoading) return <WidgetSkeleton />;
      return <RateLimitWidget rateLimit={data?.rateLimit} />;
    }
    if (widget.id === 'deploys') {
      return (
        <div className="space-y-2">
          {['Production — Ready', 'Preview (pr-12) — Building', 'Preview (pr-11) — Ready'].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-white/60"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-400/60" />
              {item}
            </div>
          ))}
        </div>
      );
    }
    if (widget.id === 'activity') {
      return (
        <div>
          <div className="flex h-28 items-end justify-between gap-2">
            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ delay: 0.2 + i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-500/40 to-indigo-400/20"
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-gray-300 dark:text-white/20">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
      );
    }
    if (widget.id === 'live-events') {
      return <LiveEventsWidget />;
    }
    return null;
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Welcome back{userName ? `, ${userName}` : ''}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
          Here&apos;s your developer activity overview. Drag widgets to rearrange.
        </p>
      </motion.div>

      <WidgetGrid widgets={DASHBOARD_WIDGETS} renderWidget={renderWidget} />
    </>
  );
}

function WidgetSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-8 rounded-lg bg-gray-100 dark:bg-white/[0.04]" />
      ))}
    </div>
  );
}

/* ─── GitHub Activity ─── */
export function GitHubContent() {
  const { data, isLoading, error } = useGitHubData();

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">GitHub Activity</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
          Your repositories, commits, and pull request activity.
        </p>
      </motion.div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-400">
          Failed to load GitHub data. {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      )}

      {/* Repos */}
      <motion.div {...fadeIn} transition={{ delay: 0.1 }} className="mb-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Repositories
        </h3>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.03]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(data?.repos ?? []).slice(0, 6).map((repo) => (
              <a
                key={repo.id}
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {repo.name}
                    {repo.private && <span className="ml-1.5 text-[9px] text-gray-400 dark:text-white/25">🔒</span>}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-yellow-500 dark:text-yellow-400">
                    ★ {repo.stargazers_count}
                  </span>
                </div>
                {repo.description && (
                  <p className="mt-1 truncate text-[11px] text-gray-400 dark:text-white/30">{repo.description}</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400 dark:text-white/40">
                  {repo.language && (
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      {repo.language}
                    </span>
                  )}
                  <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </motion.div>

      {/* Commits */}
      <motion.div {...fadeIn} transition={{ delay: 0.2 }} className="mb-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Recent Commits
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.03]" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.commits ?? []).slice(0, 10).map((c) => (
              <motion.a
                key={c.sha + c.repo}
                href={c.html_url}
                target="_blank"
                rel="noopener noreferrer"
                {...fadeIn}
                className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.04]"
              >
                <span className="mt-0.5 text-base">📤</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">{c.message}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/35">
                    <span>{c.repo}</span>
                    <span>·</span>
                    <span className="rounded bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px]">{c.sha}</span>
                    <span>·</span>
                    <span>{c.author}</span>
                    <span>·</span>
                    <span>{new Date(c.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </motion.div>

      {/* Open PRs */}
      <motion.div {...fadeIn} transition={{ delay: 0.3 }}>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Open Pull Requests
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.03]" />
            ))}
          </div>
        ) : (data?.pullRequests ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/30">No open pull requests</p>
        ) : (
          <div className="space-y-2">
            {(data?.pullRequests ?? []).map((pr) => (
              <motion.a
                key={pr.id}
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                {...fadeIn}
                className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.04]"
              >
                <span className="mt-0.5 text-base">🔀</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">{pr.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/35">
                    <span>{pr.repo}</span>
                    <span>·</span>
                    <span className="text-emerald-400">#{pr.number}</span>
                    <span>·</span>
                    <span>{pr.author}</span>
                    {pr.draft && (
                      <>
                        <span>·</span>
                        <span className="rounded bg-gray-200 px-1 text-[9px] dark:bg-white/10">Draft</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}

/* ─── Deployments ─── */
export function DeploymentsContent() {
  const deploys = [
    { env: 'Production', status: 'ready', branch: 'main', commit: 'feat: macOS UI', duration: '42s', time: '2h ago' },
    { env: 'Preview', status: 'building', branch: 'feature/widgets', commit: 'wip: widget grid', duration: '—', time: '10m ago' },
    { env: 'Preview', status: 'ready', branch: 'fix/auth-loop', commit: 'fix: redirect loop', duration: '38s', time: '8h ago' },
    { env: 'Production', status: 'ready', branch: 'main', commit: 'chore: deploy config', duration: '45s', time: '1d ago' },
    { env: 'Preview', status: 'error', branch: 'experiment/sse', commit: 'test: SSE streaming', duration: '12s', time: '2d ago' },
  ];

  const statusColors: Record<string, string> = {
    ready: 'bg-emerald-400',
    building: 'bg-yellow-400 animate-pulse',
    error: 'bg-red-400',
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Deployments</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
          Vercel deployment history and status for all your projects.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { label: 'Total Deploys', value: '127', sub: 'This month' },
          { label: 'Success Rate', value: '96.8%', sub: '3 failures' },
          { label: 'Avg Duration', value: '41s', sub: '-5s vs last week' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            {...fadeIn}
            transition={{ delay: 0.05 + i * 0.05 }}
            className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4"
          >
            <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{s.value}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-white/25">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Deploy list */}
      <div className="space-y-2">
        {deploys.map((d, i) => (
          <motion.div
            key={i}
            {...fadeIn}
            transition={{ delay: 0.2 + i * 0.05 }}
            className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4"
          >
            <div className={`h-2.5 w-2.5 rounded-full ${statusColors[d.status]}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{d.commit}</span>
                <span className="rounded bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-white/40">
                  {d.branch}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                <span>{d.env}</span>
                <span>·</span>
                <span className="capitalize">{d.status}</span>
                <span>·</span>
                <span>{d.duration}</span>
                <span>·</span>
                <span>{d.time}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}

/* ─── Firebase ─── */
export function FirebaseContent() {
  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Firebase Metrics</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
          Firestore usage, auth events, and storage metrics.
        </p>
      </motion.div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Firestore Reads', value: '12,450', change: 'of 50K daily limit', pct: 25 },
          { label: 'Firestore Writes', value: '890', change: 'of 20K daily limit', pct: 4 },
          { label: 'Auth Events', value: '34', change: 'Today', pct: 0 },
          { label: 'Storage', value: '1.2 MB', change: 'of 1 GB limit', pct: 0 },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            {...fadeIn}
            transition={{ delay: 0.05 + i * 0.05 }}
            className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4"
          >
            <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{s.value}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-white/25">{s.change}</p>
            {s.pct > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-orange-400/60"
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Usage chart */}
      <motion.div
        {...fadeIn}
        transition={{ delay: 0.3 }}
        className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-5"
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">7-Day Usage Trend</h3>
        <div className="flex h-36 items-end justify-between gap-3 px-2">
          {[
            { reads: 60, writes: 20 },
            { reads: 55, writes: 25 },
            { reads: 70, writes: 30 },
            { reads: 45, writes: 15 },
            { reads: 80, writes: 35 },
            { reads: 65, writes: 28 },
            { reads: 90, writes: 40 },
          ].map((d, i) => (
            <div key={i} className="flex flex-1 gap-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${d.reads}%` }}
                transition={{ delay: 0.4 + i * 0.05, duration: 0.5 }}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-orange-500/40 to-orange-400/20"
              />
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${d.writes}%` }}
                transition={{ delay: 0.45 + i * 0.05, duration: 0.5 }}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-amber-500/30 to-amber-400/15"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between px-2 text-[10px] text-gray-300 dark:text-white/20">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-400 dark:text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-orange-400/50" /> Reads
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-400/40" /> Writes
          </span>
        </div>
      </motion.div>

      {/* Collections */}
      <motion.div {...fadeIn} transition={{ delay: 0.5 }} className="mt-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Collections
        </h3>
        <div className="space-y-2">
          {[
            { name: 'users', docs: 1, reads: 340, writes: 12 },
            { name: 'events', docs: 2450, reads: 8900, writes: 780 },
            { name: 'settings', docs: 1, reads: 120, writes: 3 },
          ].map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4"
            >
              <div>
                <span className="font-mono text-sm text-gray-900 dark:text-white">{c.name}</span>
                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-white/30">{c.docs} documents</p>
              </div>
              <div className="flex gap-4 text-[11px] text-gray-400 dark:text-white/35">
                <span>{c.reads} reads</span>
                <span>{c.writes} writes</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}

/* ─── Alerts ─── */
export function AlertsContent() {
  const alerts = [
    { severity: 'error', msg: 'Deploy failed on experiment/sse branch', time: '2d ago', resolved: false },
    { severity: 'warning', msg: 'GitHub API rate limit at 80% (4,000/5,000)', time: '5h ago', resolved: false },
    { severity: 'info', msg: 'New PR #12 opened on RehanPulse', time: '5h ago', resolved: true },
    { severity: 'success', msg: 'Production deploy succeeded — main@abc1234', time: '2h ago', resolved: true },
    { severity: 'warning', msg: 'Firestore reads approaching 50% of daily limit', time: '1h ago', resolved: false },
  ];

  const severityStyle: Record<string, { dot: string; bg: string }> = {
    error: { dot: 'bg-red-400', bg: 'border-red-500/20 dark:border-red-500/10 bg-red-500/[0.06] dark:bg-red-500/[0.03]' },
    warning: { dot: 'bg-yellow-400', bg: 'border-yellow-500/20 dark:border-yellow-500/10 bg-yellow-500/[0.06] dark:bg-yellow-500/[0.03]' },
    info: { dot: 'bg-blue-400', bg: 'border-blue-500/20 dark:border-blue-500/10 bg-blue-500/[0.06] dark:bg-blue-500/[0.03]' },
    success: { dot: 'bg-emerald-400', bg: 'border-emerald-500/20 dark:border-emerald-500/10 bg-emerald-500/[0.06] dark:bg-emerald-500/[0.03]' },
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Alerts & Notifications</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
          Failed deploys, rate-limit warnings, and system events.
        </p>
      </motion.div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Unresolved', value: '3', color: 'text-red-400' },
          { label: 'Resolved (24h)', value: '2', color: 'text-emerald-400' },
          { label: 'Total (7d)', value: '12', color: 'text-gray-900 dark:text-white' },
          { label: 'Alert Rules', value: '4', color: 'text-indigo-400' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            {...fadeIn}
            transition={{ delay: 0.05 + i * 0.05 }}
            className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4"
          >
            <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {alerts.map((a, i) => {
          const style = severityStyle[a.severity] ?? severityStyle.info!;
          return (
            <motion.div
              key={i}
              {...fadeIn}
              transition={{ delay: 0.2 + i * 0.05 }}
              className={`flex items-start gap-3 rounded-xl border p-4 ${style.bg} ${a.resolved ? 'opacity-50' : ''}`}
            >
              <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-white">{a.msg}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                  <span className="capitalize">{a.severity}</span>
                  <span>·</span>
                  <span>{a.time}</span>
                  {a.resolved && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-500 dark:text-emerald-400/70">Resolved</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Alert rules */}
      <motion.div {...fadeIn} transition={{ delay: 0.5 }} className="mt-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Alert Rules
        </h3>
        <div className="space-y-2">
          {[
            { rule: 'Deploy failure on any branch', enabled: true },
            { rule: 'GitHub API rate limit > 80%', enabled: true },
            { rule: 'Firestore reads > 50% daily limit', enabled: true },
            { rule: 'New pull request opened', enabled: false },
          ].map((r) => (
            <div
              key={r.rule}
              className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4"
            >
              <span className="text-sm text-gray-600 dark:text-white/70">{r.rule}</span>
              <div
                className={`h-5 w-9 rounded-full p-0.5 transition-colors ${r.enabled ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-white/10'}`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}
