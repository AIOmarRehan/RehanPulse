'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { WidgetGrid, type WidgetConfig } from '@/components/widgets/widget-grid';
import { useGitHubData } from '@/hooks/use-github-data';
import { useVercelData } from '@/hooks/use-vercel-data';
import { useEventStore } from '@/lib/stores/event-store';
import type { GitHubCommit, GitHubPR, RateLimitInfo } from '@/lib/github';
import type { VercelDeployment, VercelProject, VercelUsage } from '@/lib/vercel';

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

/* ─── Widget definitions for Dashboard ─── */
const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: 'commits', title: 'Recent Commits', icon: '🐙', colSpan: 1 },
  { id: 'deploys', title: 'Deployments & Live Projects', icon: '🚀', colSpan: 2 },
  { id: 'prs', title: 'Pull Requests', icon: '📋', colSpan: 1 },
  { id: 'rate-limit', title: 'API Rate Limit', icon: '⚡', colSpan: 1 },
  { id: 'vercel-overview', title: 'Vercel Overview', icon: '▲', colSpan: 1 },
  { id: 'vercel-usage', title: 'Vercel Usage', icon: '📊', colSpan: 2 },
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

function DeploymentsWidget({ deployments, projects, isLoading, error }: { deployments: VercelDeployment[]; projects: VercelProject[]; isLoading: boolean; error: Error | null }) {
  if (isLoading) return <WidgetSkeleton />;
  if (error) {
    const isNoToken = error.message.includes('No Vercel token') || error.message.includes('Vercel API failed');
    return (
      <p className="text-xs text-gray-400 dark:text-white/30">
        {isNoToken ? 'Add your Vercel token in Settings to see deployments.' : error.message}
      </p>
    );
  }

  const stateColors: Record<string, string> = {
    READY: 'bg-emerald-400',
    BUILDING: 'bg-yellow-400 animate-pulse',
    INITIALIZING: 'bg-yellow-400 animate-pulse',
    QUEUED: 'bg-blue-400 animate-pulse',
    ERROR: 'bg-red-400',
    CANCELED: 'bg-gray-400',
  };

  const stateLabels: Record<string, string> = {
    READY: 'Ready',
    BUILDING: 'Building',
    INITIALIZING: 'Initializing',
    QUEUED: 'Queued',
    ERROR: 'Error',
    CANCELED: 'Canceled',
  };

  const ago = (ms: number) => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Left — Recent Deployments */}
      <div className="flex flex-col min-h-0">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Recent Deployments
        </h4>
        <div className="flex-1 overflow-y-auto space-y-1.5 max-h-48 pr-1 scrollbar-thin">
          {deployments.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-white/30">No deployments found</p>
          ) : (
            deployments.slice(0, 8).map((d) => (
              <a
                key={d.uid}
                href={`https://${d.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:bg-white/[0.03] dark:text-white/60 dark:hover:bg-white/[0.06]"
              >
                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateColors[d.state] ?? 'bg-gray-400'}`} />
                <span className="truncate font-medium">{d.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-gray-400 dark:text-white/25">
                  {d.target === 'production' ? '🔵 Prod' : '🟡 Preview'}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400 dark:text-white/25">
                  {stateLabels[d.state] ?? d.state} · {ago(d.createdAt)}
                </span>
              </a>
            ))
          )}
        </div>
      </div>

      {/* Right — Live Projects */}
      <div className="flex flex-col min-h-0">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Live Projects
        </h4>
        <div className="flex-1 overflow-y-auto space-y-1.5 max-h-48 pr-1 scrollbar-thin">
          {projects.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-white/30">No projects found</p>
          ) : (
            projects.map((p) => {
              const prodUrl = p.targets?.production?.url;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-white/60"
                >
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.latestDeploymentState === 'READY' ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    {prodUrl && (
                      <a
                        href={`https://${prodUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[10px] text-indigo-400 hover:underline"
                      >
                        {prodUrl}
                      </a>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400 dark:text-white/25">
                    {p.framework ?? 'Unknown'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function VercelOverviewWidget({ deployments, projects, isLoading, error }: { deployments: VercelDeployment[]; projects: VercelProject[]; isLoading: boolean; error: Error | null }) {
  if (isLoading) return <WidgetSkeleton />;
  if (error) {
    const isNoToken = error.message?.includes('No Vercel token') || error.message?.includes('Vercel API failed');
    return (
      <p className="text-xs text-gray-400 dark:text-white/30">
        {isNoToken ? 'Add your Vercel token in Settings.' : 'Vercel data unavailable'}
      </p>
    );
  }

  const ready = deployments.filter((d) => d.state === 'READY').length;
  const errored = deployments.filter((d) => d.state === 'ERROR' || d.state === 'CANCELED').length;
  const building = deployments.filter((d) => d.state === 'BUILDING' || d.state === 'INITIALIZING' || d.state === 'QUEUED').length;
  const production = deployments.filter((d) => d.target === 'production').length;
  const successRate = deployments.length > 0 ? Math.round((ready / deployments.length) * 100) : 0;

  const frameworks = new Map<string, number>();
  for (const p of projects) {
    const fw = p.framework ?? 'Other';
    frameworks.set(fw, (frameworks.get(fw) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <p className="text-lg font-semibold text-indigo-400">{projects.length}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Projects</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <p className="text-lg font-semibold text-blue-400">{production}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Production</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <p className="text-lg font-semibold text-emerald-400">{ready}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Successful</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <p className={`text-lg font-semibold ${errored > 0 ? 'text-red-400' : 'text-gray-400 dark:text-white/30'}`}>{errored}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Failed</p>
        </div>
      </div>

      {building > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-yellow-400">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
          {building} currently building
        </div>
      )}

      {/* Success rate */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-white/40">
          <span>Success rate</span>
          <strong className={successRate >= 90 ? 'text-emerald-400' : successRate >= 70 ? 'text-yellow-400' : 'text-red-400'}>{successRate}%</strong>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${successRate >= 90 ? 'bg-emerald-400' : successRate >= 70 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${Math.max(successRate, 2)}%` }}
          />
        </div>
      </div>

      {/* Frameworks */}
      {frameworks.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(frameworks.entries()).map(([fw, count]) => (
            <span key={fw} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-white/40">
              {fw} ({count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function VercelUsageWidget({ usage, isLoading, error }: { usage: VercelUsage | null; isLoading: boolean; error: Error | null }) {
  if (isLoading) return <WidgetSkeleton />;
  if (error) {
    const isNoToken = error.message?.includes('No Vercel token') || error.message?.includes('Vercel API failed');
    return (
      <p className="text-xs text-gray-400 dark:text-white/30">
        {isNoToken ? 'Add your Vercel token in Settings.' : 'Usage data unavailable'}
      </p>
    );
  }
  if (!usage) return <p className="text-xs text-gray-400 dark:text-white/30">No usage data</p>;

  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
  const fmtBytes = (b: number) => b >= 1_073_741_824 ? `${(b / 1_073_741_824).toFixed(2)} GB` : b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;

  const planColors: Record<string, string> = {
    hobby: 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-white/50',
    pro: 'bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-400',
    enterprise: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
  };
  const planLabel = usage.subscription.charAt(0).toUpperCase() + usage.subscription.slice(1);
  const planColor = planColors[usage.subscription] ?? planColors['hobby'];

  const metrics = [
    { label: 'Requests', value: fmt(usage.requests), color: 'text-blue-400' },
    { label: 'Bandwidth', value: fmtBytes(usage.bandwidth), color: 'text-indigo-400' },
    { label: 'Build Minutes', value: String(usage.buildMinutes), color: 'text-amber-400' },
    { label: 'Function GB-hrs', value: usage.functionGBHours.toFixed(3), color: 'text-emerald-400' },
    { label: 'Cache Reads', value: fmtBytes(usage.dataCacheReads), color: 'text-cyan-400' },
    { label: 'Cache Writes', value: fmtBytes(usage.dataCacheWrites), color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-400 dark:text-white/25">Current billing period</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${planColor}`}>{planLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
            <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-gray-400 dark:text-white/25">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTimeline({ commits }: { commits: GitHubCommit[] }) {
  // Aggregate commits by day of week (Mon=0 ... Sun=6)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const c of commits) {
    const d = new Date(c.date);
    // JS getDay: 0=Sun, 1=Mon ... 6=Sat -> remap to Mon=0 ... Sun=6
    const idx = (d.getDay() + 6) % 7;
    counts[idx]!++;
  }

  const max = Math.max(...counts, 1); // avoid div by 0

  return (
    <div>
      <div className="flex h-28 items-end justify-between gap-2">
        {counts.map((count, i) => {
          const pct = Math.max((count / max) * 100, 4); // min 4% so bars are visible
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${pct}%` }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex-1 rounded-t-md bg-gradient-to-t from-indigo-500/40 to-indigo-400/20"
            >
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-white/40">
                {count}
              </span>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-gray-300 dark:text-white/20">
        {days.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-white/25">
        {commits.length} commits this cycle
      </p>
    </div>
  );
}

function LiveEventsWidget() {
  const events = useEventStore((s) => s.events);
  const connectionStatus = useEventStore((s) => s.connectionStatus);

  const statusDot = connectionStatus === 'connected'
    ? 'bg-emerald-400 animate-pulse'
    : connectionStatus === 'connecting'
      ? 'bg-yellow-400 animate-pulse'
      : 'bg-gray-400';

  const statusLabel = connectionStatus === 'connected'
    ? 'Connected'
    : connectionStatus === 'connecting'
      ? 'Connecting...'
      : 'Disconnected';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px]">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
        <span className="text-gray-400 dark:text-white/30">{statusLabel}</span>
      </div>
      {events.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 dark:text-white/30">
            No webhook events received yet.
          </p>
          <p className="text-[10px] text-gray-400/70 dark:text-white/20">
            Go to <strong className="text-gray-500 dark:text-white/35">Settings</strong> and click{' '}
            <strong className="text-gray-500 dark:text-white/35">Register Webhooks</strong> to start
            receiving real-time events from your GitHub repos. Your app must be publicly accessible
            (not localhost) for GitHub to deliver webhooks.
          </p>
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
          {events.map((ev) => (
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
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Dashboard ─── */
export function DashboardContent({ userName }: { userName?: string }) {
  const { data, isLoading } = useGitHubData();
  const { data: vercelData, isLoading: vercelLoading, error: vercelError } = useVercelData();

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
      return <DeploymentsWidget deployments={vercelData?.deployments ?? []} projects={vercelData?.projects ?? []} isLoading={vercelLoading} error={vercelError as Error | null} />;
    }
    if (widget.id === 'vercel-overview') {
      return <VercelOverviewWidget deployments={vercelData?.deployments ?? []} projects={vercelData?.projects ?? []} isLoading={vercelLoading} error={vercelError as Error | null} />;
    }
    if (widget.id === 'vercel-usage') {
      return <VercelUsageWidget usage={vercelData?.usage ?? null} isLoading={vercelLoading} error={vercelError as Error | null} />;
    }
    if (widget.id === 'activity') {
      if (isLoading) return <WidgetSkeleton />;
      return <ActivityTimeline commits={data?.commits ?? []} />;
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 max-h-[32rem] overflow-y-auto pr-1 scrollbar-thin">
            {(data?.repos ?? []).map((repo) => (
              <a
                key={repo.id}
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-white">
                    {repo.name}
                    {repo.private && <span className="ml-1.5 text-[9px] text-gray-400 dark:text-white/25">🔒</span>}
                  </span>
                  <span className="shrink-0 flex items-center gap-1 text-xs text-yellow-500 dark:text-yellow-400">
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
  const { data: vercelData, isLoading, error } = useVercelData(50);
  const deployments = vercelData?.deployments ?? [];

  const statusColors: Record<string, string> = {
    READY: 'bg-emerald-400',
    BUILDING: 'bg-yellow-400 animate-pulse',
    INITIALIZING: 'bg-yellow-400 animate-pulse',
    QUEUED: 'bg-blue-400 animate-pulse',
    ERROR: 'bg-red-400',
    CANCELED: 'bg-gray-400',
  };

  const statusLabels: Record<string, string> = {
    READY: 'Ready',
    BUILDING: 'Building',
    INITIALIZING: 'Initializing',
    QUEUED: 'Queued',
    ERROR: 'Error',
    CANCELED: 'Canceled',
  };

  const ago = (ms: number) => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const duration = (d: VercelDeployment) => {
    if (d.buildingAt && d.ready) {
      const secs = Math.round((d.ready - d.buildingAt) / 1000);
      return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
    }
    return '—';
  };

  // Computed stats
  const ready = deployments.filter((d) => d.state === 'READY').length;
  const failed = deployments.filter((d) => d.state === 'ERROR' || d.state === 'CANCELED').length;
  const successRate = deployments.length > 0 ? ((ready / deployments.length) * 100).toFixed(1) : '0';
  const avgDuration = (() => {
    const durations = deployments
      .filter((d) => d.buildingAt && d.ready)
      .map((d) => (d.ready! - d.buildingAt!) / 1000);
    if (durations.length === 0) return '—';
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    return avg >= 60 ? `${Math.floor(avg / 60)}m ${avg % 60}s` : `${avg}s`;
  })();

  const stats = [
    { label: 'Total Deploys', value: String(deployments.length), sub: 'Loaded' },
    { label: 'Success Rate', value: `${successRate}%`, sub: `${failed} failure${failed !== 1 ? 's' : ''}` },
    { label: 'Avg Duration', value: avgDuration, sub: 'Build time' },
  ];

  if (error) {
    const isNoToken = (error as Error).message?.includes('No Vercel token') || (error as Error).message?.includes('Vercel API failed');
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-400">
        {isNoToken ? 'Add your Vercel token in Settings to see deployments.' : (error as Error).message}
      </div>
    );
  }

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
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            {...fadeIn}
            transition={{ delay: 0.05 + i * 0.05 }}
            className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4"
          >
            <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
            {isLoading ? (
              <div className="mt-1 h-8 w-16 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{s.value}</p>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-white/25">{s.sub}</p>
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* Deploy list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30">No deployments found.</p>
      ) : (
        <div className="space-y-2">
          {deployments.map((d, i) => (
            <motion.a
              key={d.uid}
              href={`https://${d.url}`}
              target="_blank"
              rel="noopener noreferrer"
              {...fadeIn}
              transition={{ delay: 0.1 + i * 0.03 }}
              className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.04]"
            >
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusColors[d.state] ?? 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {d.meta?.githubCommitMessage ?? d.name}
                  </span>
                  {d.meta?.githubCommitRef && (
                    <span className="shrink-0 rounded bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-white/40">
                      {d.meta.githubCommitRef}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                  <span className="truncate">{d.name}</span>
                  <span>·</span>
                  <span>{d.target === 'production' ? '🔵 Production' : '🟡 Preview'}</span>
                  <span>·</span>
                  <span>{statusLabels[d.state] ?? d.state}</span>
                  <span>·</span>
                  <span>{duration(d)}</span>
                  <span>·</span>
                  <span>{ago(d.createdAt)}</span>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      )}
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

/* ─── Settings ─── */
interface UserSettings {
  hasVercelToken: boolean;
  hasGitHubToken: boolean;
  webhooksRegistered: boolean;
}

export function SettingsContent() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [vercelToken, setVercelToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [registeringWebhooks, setRegisteringWebhooks] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        setSettings(await res.json() as UserSettings);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const saveVercelToken = async () => {
    if (!vercelToken.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercelToken: vercelToken.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save' });
      } else {
        setMessage({ type: 'success', text: 'Vercel token saved and verified!' });
        setVercelToken('');
        loadSettings();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const removeVercelToken = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeVercelToken: true }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Vercel token removed' });
        loadSettings();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterWebhooks = async () => {
    setRegisteringWebhooks(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerWebhooks: true }),
      });
      const data = await res.json() as { error?: string; registered?: number; skipped?: number; errors?: number; errorDetails?: string[]; isLocalhost?: boolean };
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to register webhooks' });
      } else if (data.isLocalhost) {
        setMessage({
          type: 'error',
          text: data.errorDetails?.[0] ?? 'Cannot register webhooks on localhost. Deploy your app first.',
        });
      } else if (data.errors && data.errors > 0 && data.registered === 0 && data.skipped === 0) {
        const detail = data.errorDetails?.length ? `\n${data.errorDetails.join('\n')}` : '';
        setMessage({
          type: 'error',
          text: `All ${data.errors} repos failed webhook registration.${detail}`,
        });
      } else {
        const stats = { registered: data.registered ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? 0 };
        setMessage({
          type: 'success',
          text: `Webhooks registered on ${stats.registered} repos (${stats.skipped} already had webhooks${stats.errors > 0 ? `, ${stats.errors} errors` : ''})`,
        });
        loadSettings();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setRegisteringWebhooks(false);
    }
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
          Manage your integrations and API tokens.
        </p>
      </motion.div>

      {message && (
        <motion.div
          {...fadeIn}
          className={`mb-6 rounded-xl border p-4 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
              : 'border-red-500/20 bg-red-500/[0.06] text-red-400'
          }`}
        >
          {message.text}
        </motion.div>
      )}

      {/* Integration Status */}
      <motion.div {...fadeIn} transition={{ delay: 0.1 }} className="mb-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Integration Status
        </h3>
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl border border-gray-200 bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.03]" />
              ))}
            </div>
          ) : (
            <>
              <IntegrationRow
                icon="🐙"
                name="GitHub"
                description="OAuth connected — repos, commits, and PRs are synced automatically"
                connected={!!settings?.hasGitHubToken}
              />
              <IntegrationRow
                icon="📡"
                name="GitHub Webhooks"
                description={settings?.webhooksRegistered
                  ? 'Webhooks active — receiving real-time events from your repos'
                  : 'Not registered yet — click the button to register on all your repos'}
                connected={!!settings?.webhooksRegistered}
              >
                <button
                  onClick={handleRegisterWebhooks}
                  disabled={registeringWebhooks || !settings?.hasGitHubToken}
                  className="shrink-0 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/20 disabled:opacity-50"
                >
                  {registeringWebhooks ? 'Registering...' : settings?.webhooksRegistered ? 'Re-register' : 'Register Webhooks'}
                </button>
              </IntegrationRow>
              <IntegrationRow
                icon="▲"
                name="Vercel"
                description={settings?.hasVercelToken ? 'Connected — deployments are synced' : 'Not configured — add your token below'}
                connected={!!settings?.hasVercelToken}
              />
            </>
          )}
        </div>
      </motion.div>

      {/* Vercel Token */}
      <motion.div
        {...fadeIn}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">▲</span>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Vercel API Token</h3>
        </div>
        <p className="mb-4 text-xs text-gray-400 dark:text-white/30">
          Your Vercel token is encrypted and stored securely. Generate one at{' '}
          <a
            href="https://vercel.com/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline"
          >
            vercel.com/account/tokens
          </a>
          .
        </p>

        {settings?.hasVercelToken ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-500 dark:bg-white/[0.04] dark:text-white/40">
              •••••••••••••••• <span className="text-emerald-400 text-xs ml-2">Connected</span>
            </div>
            <button
              onClick={removeVercelToken}
              disabled={saving}
              className="shrink-0 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="password"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="Enter your Vercel API token"
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20"
            />
            <button
              onClick={saveVercelToken}
              disabled={saving || !vercelToken.trim()}
              className="shrink-0 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              {saving ? 'Verifying...' : 'Save'}
            </button>
          </div>
        )}
      </motion.div>

      {/* Info */}
      <motion.div {...fadeIn} transition={{ delay: 0.3 }} className="mt-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          How It Works
        </h3>
        <div className="space-y-3 text-xs text-gray-400 dark:text-white/30">
          <p>
            <strong className="text-gray-600 dark:text-white/50">GitHub:</strong>{' '}
            Automatically connected via OAuth when you sign in. Your access token is encrypted (AES-256-GCM)
            and stored in Firestore. Webhooks are auto-registered on all your repos.
          </p>
          <p>
            <strong className="text-gray-600 dark:text-white/50">Vercel:</strong>{' '}
            Enter your personal API token above. It&apos;s validated, encrypted, and stored per-user.
            Your deployments will appear on the Dashboard and Deployments page automatically.
          </p>
          <p>
            <strong className="text-gray-600 dark:text-white/50">Live Events:</strong>{' '}
            GitHub webhooks stream to your dashboard in real-time via SSE. Events appear as they happen
            on any of your connected repos.
          </p>
        </div>
      </motion.div>
    </>
  );
}

function IntegrationRow({
  icon,
  name,
  description,
  connected,
  children,
}: {
  icon: string;
  name: string;
  description: string;
  connected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4">
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-white/15'}`}
          />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-white/30">{description}</p>
      </div>
      {children}
      <span className={`text-xs font-medium ${connected ? 'text-emerald-400' : 'text-gray-400 dark:text-white/25'}`}>
        {connected ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
}
