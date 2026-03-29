'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { WidgetGrid, type WidgetConfig } from '@/components/widgets/widget-grid';
import { useGitHubData } from '@/hooks/use-github-data';
import { useVercelData } from '@/hooks/use-vercel-data';
import { useFirebaseData } from '@/hooks/use-firebase-data';
import { useAlertRules, useNotifications } from '@/hooks/use-alerts-data';
import type { Notification } from '@/hooks/use-alerts-data';
import { useEventStore } from '@/lib/stores/event-store';
import { useAuth } from '@/components/providers/auth-provider';
import type { GitHubCommit, GitHubPR, RateLimitInfo, ContributionDay } from '@/lib/github';
import type { VercelDeployment, VercelProject, VercelUsage } from '@/lib/vercel';

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

/* ─── Theme-aware icon helper ─── */
function ThemeIcon({ dark, light, alt, size = 16 }: { dark: string; light: string; alt: string; size?: number }) {
  return (
    <>
      <img src={dark} alt={alt} width={size} height={size} className="hidden dark:block" style={{ width: size, height: size }} />
      <img src={light} alt={alt} width={size} height={size} className="block dark:hidden" style={{ width: size, height: size }} />
    </>
  );
}

/* ─── Widget definitions for Dashboard ─── */
const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: 'commits', title: 'Recent Commits', icon: <ThemeIcon dark="/macos-icons/github_darkmode.png" light="/macos-icons/github_lightmode.png" alt="Commits" />, colSpan: 1 },
  { id: 'deploys', title: 'Deployments & Live Projects', icon: <ThemeIcon dark="/macos-icons/deploy_darkmode.png" light="/macos-icons/deploy_lightmode.png" alt="Deployments" />, colSpan: 2 },
  { id: 'prs', title: 'Pull Requests', icon: <ThemeIcon dark="/macos-icons/pullrequests-darkmode.png" light="/macos-icons/pullrequests-lightmode.png" alt="PRs" />, colSpan: 1 },
  { id: 'rate-limit', title: 'API Rate Limit', icon: <ThemeIcon dark="/macos-icons/api-rate-limit.png" light="/macos-icons/api-rate-limit.png" alt="Rate Limit" />, colSpan: 1 },
  { id: 'vercel-overview', title: 'Vercel Overview', icon: <ThemeIcon dark="/macos-icons/vercel.png" light="/macos-icons/vercel.png" alt="Vercel" />, colSpan: 1 },
  { id: 'vercel-usage', title: 'Vercel Usage', icon: <svg width="16" height="16" viewBox="0 0 76 65" fill="currentColor" className="text-gray-900 dark:text-white"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" /></svg>, colSpan: 2 },
  { id: 'activity', title: 'Contributions', icon: <ThemeIcon dark="/macos-icons/contributions-darkmode.png" light="/macos-icons/contributions-lightmode.png" alt="Contributions" />, colSpan: 2 },
  { id: 'live-events', title: 'Live Events (SSE)', icon: <ThemeIcon dark="/macos-icons/live-events.png" light="/macos-icons/live-events.png" alt="Live Events" />, colSpan: 2 },
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
          className="flex items-center gap-2 rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 text-xs text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors hover:bg-white/50 dark:border-white/[0.06] dark:bg-white/[0.06] dark:text-white/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.10]"
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
          className="flex items-center gap-2 rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 text-xs text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors hover:bg-white/50 dark:border-white/[0.06] dark:bg-white/[0.06] dark:text-white/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.10]"
        >
          <span className="shrink-0 text-emerald-400">#{pr.number}</span>
          <span className="truncate">{pr.title}</span>
          {pr.draft && <span className="shrink-0 rounded bg-white/60 px-1 text-[9px] dark:bg-white/[0.12]">Draft</span>}
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
      <div className="h-2 overflow-hidden rounded-full bg-white/50 dark:bg-white/[0.08]">
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
                className="flex items-center gap-2 rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 text-xs text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors hover:bg-white/50 dark:border-white/[0.06] dark:bg-white/[0.06] dark:text-white/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.10]"
              >
                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateColors[d.state] ?? 'bg-gray-400'}`} />
                <span className="truncate font-medium">{d.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-gray-400 dark:text-white/25">
                  {d.target === 'production' ? 'Prod' : 'Preview'}
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
              const domains = p.domains ?? [];
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 text-xs text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:text-white/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.latestDeploymentState === 'READY' ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    {prodUrl && (
                      <span className="block truncate text-[10px] text-indigo-400">
                        {prodUrl}
                      </span>
                    )}
                    {domains.map((domain) => (
                      <a
                        key={domain}
                        href={`https://${domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-[10px] text-emerald-400 hover:underline"
                      >
                        <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3.5H3a1 1 0 0 0-1 1V13a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V9.5" /><path d="M9.5 1.5h5v5" /><path d="M14.5 1.5 7 9" /></svg>
                        <span className="truncate">{domain}</span>
                      </a>
                    ))}
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
        <div className="rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-lg font-semibold text-indigo-400">{projects.length}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Projects</p>
        </div>
        <div className="rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-lg font-semibold text-blue-400">{production}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Production</p>
        </div>
        <div className="rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-lg font-semibold text-emerald-400">{ready}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/25">Successful</p>
        </div>
        <div className="rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
        <div className="h-1.5 overflow-hidden rounded-full bg-white/50 dark:bg-white/[0.08]">
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
            <span key={fw} className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.08] dark:text-white/40">
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
    hobby: 'bg-white/50 text-gray-600 dark:bg-white/[0.08] dark:text-white/50',
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
          <div key={m.label} className="rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-gray-400 dark:text-white/25">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTimeline({ contributions }: { contributions: ContributionDay[] }) {
  // Use all contributions (full year ≈ 52–53 weeks, exactly as GitHub shows)
  const days = contributions;

  // Group into weeks (columns) — GitHub starts weeks on Sunday
  const weeks: ContributionDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Color mapping matching GitHub's contribution graph
  const levelColor: Record<ContributionDay['contributionLevel'], string> = {
    NONE: 'bg-gray-100 dark:bg-white/[0.06]',
    FIRST_QUARTILE: 'bg-emerald-200 dark:bg-emerald-800/70',
    SECOND_QUARTILE: 'bg-emerald-400 dark:bg-emerald-600/80',
    THIRD_QUARTILE: 'bg-emerald-500 dark:bg-emerald-500',
    FOURTH_QUARTILE: 'bg-emerald-600 dark:bg-emerald-400',
  };

  // Month labels — positioned at the first week that starts in that month
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDay = weeks[w]?.[0];
    if (firstDay) {
      const m = new Date(firstDay.date).getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ label: new Date(firstDay.date).toLocaleString('en', { month: 'short' }), col: w });
        lastMonth = m;
      }
    }
  }

  // Total contributions in the last year
  const total = days.reduce((sum, d) => sum + d.contributionCount, 0);

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="space-y-1">
        {/* Month labels row */}
        <div className="relative ml-6 h-4 overflow-hidden">
          {monthLabels.map((m, i) => (
            <span
              key={i}
              className="absolute top-0 text-[9px] text-gray-400 dark:text-white/30"
              style={{ left: `${(m.col / weeks.length) * 100}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div className="flex gap-[2px]">
          {/* Day-of-week labels */}
          <div className="flex shrink-0 flex-col justify-between py-[1px] pr-[3px]">
            {dayLabels.map((label, i) => (
              <span key={i} className="flex h-0 flex-1 items-center text-[9px] leading-none text-gray-400 dark:text-white/25">
                {label}
              </span>
            ))}
          </div>

          {/* Contribution grid — auto-sized to fill available width */}
          <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className={`aspect-square w-full rounded-[2px] ${levelColor[day.contributionLevel]}`}
                    title={`${day.contributionCount} contribution${day.contributionCount !== 1 ? 's' : ''} on ${new Date(day.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer: total + legend */}
        <div className="flex items-center justify-between pt-0.5">
          <p className="text-[10px] text-gray-400 dark:text-white/25">
            {total.toLocaleString()} contributions in the last year
          </p>
          <div className="flex items-center gap-[3px] text-[9px] text-gray-400 dark:text-white/25">
            <span>Less</span>
            {(['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'] as const).map((level) => (
              <div key={level} className={`h-[9px] w-[9px] rounded-[2px] ${levelColor[level]}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
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
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2 text-[10px]">
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
        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-start gap-2 rounded-lg border border-white/[0.5] bg-white/30 px-3 py-2 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <span className="mt-0.5 flex shrink-0 items-center">
                {ev.type === 'push'
                  ? <ThemeIcon dark="/macos-icons/commits.png" light="/macos-icons/commits.png" alt="Push" />
                  : ev.type.startsWith('pr')
                    ? <ThemeIcon dark="/macos-icons/pullrequests-darkmode.png" light="/macos-icons/pullrequests-lightmode.png" alt="PR" />
                    : ev.type === 'ci'
                      ? <ThemeIcon dark="/macos-icons/settings-darkmode.png" light="/macos-icons/settings-lightmode.png" alt="CI" />
                      : ev.type === 'deployment'
                        ? <ThemeIcon dark="/macos-icons/deploy_darkmode.png" light="/macos-icons/deploy_lightmode.png" alt="Deploy" />
                        : <ThemeIcon dark="/macos-icons/red-pin.png" light="/macos-icons/red-pin.png" alt="Event" />}
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
  const { data, isLoading, refresh } = useGitHubData();
  const { data: vercelData, isLoading: vercelLoading, error: vercelError, refresh: refreshVercel } = useVercelData();
  const { refresh: refreshFirebase } = useFirebaseData();
  const { refresh: refreshAlerts } = useAlertRules();
  const { refresh: refreshNotifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const clearEvents = useEventStore((s) => s.clearEvents);

  const handleRefresh = async () => {
    setRefreshing(true);
    clearEvents();
    try { await Promise.all([refresh(), refreshVercel(), refreshFirebase(), refreshAlerts(), refreshNotifications()]); } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

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
      return <div className="h-[148px]"><VercelUsageWidget usage={vercelData?.usage ?? null} isLoading={vercelLoading} error={vercelError as Error | null} /></div>;
    }
    if (widget.id === 'activity') {
      if (isLoading) return <WidgetSkeleton />;
      return <div className="h-[148px]"><ActivityTimeline contributions={data?.contributions ?? []} /></div>;
    }
    if (widget.id === 'live-events') {
      return <div className="h-[148px]"><LiveEventsWidget /></div>;
    }
    return null;
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Welcome back{userName ? `, ${userName}` : ''}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
              Here&apos;s your developer activity overview. Drag widgets to rearrange.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Sync latest data from GitHub & Vercel"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-3 py-2 text-xs font-medium text-gray-600 dark:text-white/50 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.08] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </motion.div>

      <WidgetGrid widgets={DASHBOARD_WIDGETS} renderWidget={renderWidget} />
    </>
  );
}

function WidgetSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-2/5 rounded-md bg-white/40 dark:bg-white/[0.06] skeleton-shimmer" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-8 rounded-lg bg-white/40 dark:bg-white/[0.06] skeleton-shimmer" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

/* ─── GitHub Activity ─── */
export function GitHubContent() {
  const { data, isLoading, error, refresh } = useGitHubData();
  const { refresh: refreshVercel } = useVercelData();
  const { refresh: refreshFirebase } = useFirebaseData();
  const { refresh: refreshAlerts } = useAlertRules();
  const { refresh: refreshNotifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const clearEvents = useEventStore((s) => s.clearEvents);

  const handleRefresh = async () => {
    setRefreshing(true);
    clearEvents();
    try { await Promise.all([refresh(), refreshVercel(), refreshFirebase(), refreshAlerts(), refreshNotifications()]); } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">GitHub Activity</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
              Your repositories, commits, and pull request activity.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Sync latest data from GitHub"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-3 py-2 text-xs font-medium text-gray-600 dark:text-white/50 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.08] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
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
              <div key={i} className="h-20 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
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
                className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-white">
                    {repo.name}
                    {repo.private && <span className="ml-1.5 inline-flex text-[9px] text-gray-400 dark:text-white/25"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg></span>}
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
              <div key={i} className="h-12 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
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
                className="flex items-start gap-3 rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08]"
              >
                <span className="mt-0.5 flex shrink-0 items-center"><ThemeIcon dark="/macos-icons/commits.png" light="/macos-icons/commits.png" alt="Commit" /></span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">{c.message}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/35">
                    <span>{c.repo}</span>
                    <span>·</span>
                    <span className="rounded bg-white/50 dark:bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px]">{c.sha}</span>
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
              <div key={i} className="h-12 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
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
                className="flex items-start gap-3 rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08]"
              >
                <span className="mt-0.5 flex shrink-0 items-center"><ThemeIcon dark="/macos-icons/pullrequests-darkmode.png" light="/macos-icons/pullrequests-lightmode.png" alt="PR" /></span>
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
                        <span className="rounded bg-white/60 px-1 text-[9px] dark:bg-white/[0.12]">Draft</span>
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
  const { data: vercelData, isLoading, error, refresh: refreshVercel } = useVercelData(50);
  const { refresh: refreshGitHub } = useGitHubData();
  const { refresh: refreshFirebase } = useFirebaseData();
  const { refresh: refreshAlerts } = useAlertRules();
  const { refresh: refreshNotifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const handleSync = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshGitHub(), refreshVercel(), refreshFirebase(), refreshAlerts(), refreshNotifications()]); } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Deployments</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
              Vercel deployment history and status for all your projects.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={refreshing}
            title="Sync latest data"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-3 py-2 text-xs font-medium text-gray-600 dark:text-white/50 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.08] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            {...fadeIn}
            transition={{ delay: 0.05 + i * 0.05 }}
            className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4"
          >
            <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
            {isLoading ? (
              <div className="mt-1 h-8 w-16 animate-pulse rounded bg-white/40 dark:bg-white/[0.06]" />
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
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
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
              className="flex items-center gap-4 rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08]"
            >
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusColors[d.state] ?? 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {d.meta?.githubCommitMessage ?? d.name}
                  </span>
                  {d.meta?.githubCommitRef && (
                    <span className="shrink-0 rounded bg-white/50 dark:bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-white/40">
                      {d.meta.githubCommitRef}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                  <span className="truncate">{d.name}</span>
                  <span>·</span>
                  <span>{d.target === 'production' ? 'Production' : 'Preview'}</span>
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
  const {
    connected,
    selectedProject,
    connectionLoading,
    projects,
    projectsLoading,
    data,
    dataLoading,
    dataError,
    connectGoogle,
    selectProject,
    disconnect,
    refresh: refreshFirebase,
  } = useFirebaseData();
  const { refresh: refreshGitHub } = useGitHubData();
  const { refresh: refreshVercel } = useVercelData();
  const { refresh: refreshAlerts } = useAlertRules();
  const { refresh: refreshNotifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const handleSync = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshGitHub(), refreshVercel(), refreshFirebase(), refreshAlerts(), refreshNotifications()]); } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  /* ─── State 1: Loading connection status ─── */
  if (connectionLoading) {
    return (
      <>
        <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Firebase</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/40">Loading…</p>
        </motion.div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
          ))}
        </div>
      </>
    );
  }

  /* ─── State 2: Not connected ─── */
  if (!connected) {
    return (
      <>
        <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Firebase</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
            Connect your Google account to monitor your Firebase projects.
          </p>
        </motion.div>

        <motion.div
          {...fadeIn}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center gap-5 rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-10 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <img src="/macos-icons/firebase.png" alt="Firebase" width={32} height={32} className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Connect Google Account
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/40">
              Sign in with your Google account to automatically detect and monitor your Firebase
              projects. We&apos;ll request read-only access to your Firestore data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => connectGoogle.mutate()}
            disabled={connectGoogle.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.15]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {connectGoogle.isPending ? 'Connecting…' : 'Sign in with Google'}
          </button>
          {connectGoogle.isError && (
            <p className="text-sm text-red-400">
              {(connectGoogle.error as Error).message ?? 'Connection failed. Make sure Google sign-in is enabled in your Firebase Console.'}
            </p>
          )}
        </motion.div>
      </>
    );
  }

  /* ─── State 3: Connected, pick a project ─── */
  if (!selectedProject) {
    return (
      <>
        <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Firebase</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
              Google account connected. Select a project to monitor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="text-xs text-gray-400 hover:text-red-400 transition dark:text-white/30 dark:hover:text-red-400"
          >
            Disconnect
          </button>
        </motion.div>

        {projectsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-white/40">
              No Firebase projects found for this Google account.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((proj, i) => (
              <motion.button
                key={proj.projectId}
                type="button"
                {...fadeIn}
                transition={{ delay: 0.05 * i }}
                onClick={() => selectProject.mutate(proj.projectId)}
                disabled={selectProject.isPending}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 text-left transition hover:bg-white/50 dark:hover:bg-white/[0.08]"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {proj.displayName || proj.projectId}
                  </span>
                  <p className="mt-0.5 text-[11px] font-mono text-gray-400 dark:text-white/30">
                    {proj.projectId}
                  </p>
                </div>
                <span className="text-xs text-gray-400 dark:text-white/20">Select →</span>
              </motion.button>
            ))}
          </div>
        )}
      </>
    );
  }

  /* ─── State 4: Project selected — show metrics ─── */
  const statCards = data
    ? [
        { label: 'Collections', value: data.stats.totalCollections.toLocaleString(), sub: 'Top-level collections' },
        { label: 'Total Documents', value: data.stats.totalDocs.toLocaleString(), sub: `Across ${data.stats.totalCollections} collections` },
      ]
    : [];

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Firebase</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
            Monitoring <span className="font-mono text-gray-700 dark:text-white/60">{selectedProject}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={refreshing}
            title="Sync latest data"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-3 py-2 text-xs font-medium text-gray-600 dark:text-white/50 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.08] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            type="button"
            onClick={() => selectProject.mutate('')}
            className="text-xs text-gray-400 hover:text-indigo-400 transition dark:text-white/30 dark:hover:text-indigo-400"
          >
            Switch Project
          </button>
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="text-xs text-gray-400 hover:text-red-400 transition dark:text-white/30 dark:hover:text-red-400"
          >
            Disconnect
          </button>
        </div>
      </motion.div>

      {dataError && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-400">
          {dataError}
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        {dataLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
            ))
          : statCards.map((s, i) => (
              <motion.div
                key={s.label}
                {...fadeIn}
                transition={{ delay: 0.05 + i * 0.05 }}
                className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4"
              >
                <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{s.value}</p>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-white/25">{s.sub}</p>
              </motion.div>
            ))}
      </div>

      {/* Collections */}
      <motion.div {...fadeIn} transition={{ delay: 0.3 }} className="mt-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Collections
        </h3>
        {dataLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
            ))}
          </div>
        ) : (data?.collections ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/30">No collections found in this project&apos;s Firestore.</p>
        ) : (
          <div className="space-y-2">
            {(data?.collections ?? []).map((c) => {
              const maxDocs = Math.max(...(data?.collections ?? []).map((x) => x.docs), 1);
              const pct = Math.round((c.docs / maxDocs) * 100);
              return (
                <div
                  key={c.name}
                  className="relative overflow-hidden rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-500/[0.07] dark:bg-indigo-400/[0.06]"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm text-gray-900 dark:text-white">{c.name}</span>
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-white/30">
                        {c.docs.toLocaleString()} document{c.docs !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </>
  );
}

/* ─── Alerts ─── */
const EVENT_TYPES = [
  { value: 'push', label: 'Push events' },
  { value: 'pr_opened', label: 'Pull request opened' },
  { value: 'pr_closed', label: 'Pull request closed' },
  { value: 'deployment', label: 'Deployment events' },
  { value: 'ci', label: 'CI / check runs' },
  { value: 'issue', label: 'Issue events' },
  { value: 'star', label: 'Star events' },
];

const severityStyle: Record<string, { dot: string; bg: string }> = {
  error: { dot: 'bg-red-400', bg: 'border-red-500/20 dark:border-red-500/10 bg-red-500/[0.06] dark:bg-red-500/[0.03]' },
  warning: { dot: 'bg-yellow-400', bg: 'border-yellow-500/20 dark:border-yellow-500/10 bg-yellow-500/[0.06] dark:bg-yellow-500/[0.03]' },
  info: { dot: 'bg-blue-400', bg: 'border-blue-500/20 dark:border-blue-500/10 bg-blue-500/[0.06] dark:bg-blue-500/[0.03]' },
  success: { dot: 'bg-emerald-400', bg: 'border-emerald-500/20 dark:border-emerald-500/10 bg-emerald-500/[0.06] dark:bg-emerald-500/[0.03]' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AlertsContent() {
  const { data: rulesData, isLoading: rulesLoading, toggleRule, createRule, renameRule, deleteRule, refresh: refreshAlerts } = useAlertRules();
  const { data: notifsData, isLoading: notifsLoading, markRead, markAllRead, clearAll, refresh: refreshNotifications } = useNotifications();
  const { refresh: refreshGitHub } = useGitHubData();
  const { refresh: refreshVercel } = useVercelData();
  const { refresh: refreshFirebase } = useFirebaseData();
  const [refreshing, setRefreshing] = useState(false);

  const handleSync = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshGitHub(), refreshVercel(), refreshFirebase(), refreshAlerts(), refreshNotifications()]); } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleEvent, setNewRuleEvent] = useState('push');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleName, setEditingRuleName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const rules = rulesData?.rules ?? [];
  const notifications = notifsData?.notifications ?? [];
  const unreadCount = notifications.filter((n: Notification) => !n.read).length;

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Group notifications by groupKey — ungrouped items remain standalone
  type NotifGroup = { key: string; title: string; items: Notification[] } | { key: null; item: Notification };
  const groupedNotifications = useMemo(() => {
    const groups: NotifGroup[] = [];
    const keyMap = new Map<string, { title: string; items: Notification[] }>();
    const order: (string | Notification)[] = [];

    for (const n of notifications) {
      if (n.groupKey) {
        let g = keyMap.get(n.groupKey);
        if (!g) {
          g = { title: n.groupTitle ?? n.groupKey, items: [] };
          keyMap.set(n.groupKey, g);
          order.push(n.groupKey);
        }
        g.items.push(n);
      } else {
        order.push(n);
      }
    }

    for (const entry of order) {
      if (typeof entry === 'string') {
        const g = keyMap.get(entry);
        if (g && g.items.length > 0) {
          groups.push({ key: entry, title: g.title, items: g.items });
          keyMap.delete(entry);
        }
      } else {
        groups.push({ key: null, item: entry });
      }
    }
    return groups;
  }, [notifications]);

  const handleAddRule = () => {
    if (!newRuleName.trim()) return;
    // Client-side duplicate check by eventType
    const existingByEvent = rules.find((r) => r.eventType === newRuleEvent);
    if (existingByEvent) {
      setDuplicateWarning(`An alert rule for this event type already exists ("${existingByEvent.name}")`);
      return;
    }
    setDuplicateWarning('');
    createRule.mutate(
      { name: newRuleName.trim(), eventType: newRuleEvent },
      {
        onSuccess: () => {
          setNewRuleName('');
          setShowAddRule(false);
        },
        onError: (err) => {
          if (err.message.includes('already exists')) {
            setDuplicateWarning(err.message);
          }
        },
      }
    );
  };

  const handleRename = (id: string) => {
    if (!editingRuleName.trim()) return;
    renameRule.mutate({ id, name: editingRuleName.trim() });
    setEditingRuleId(null);
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ duration: 0.4 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Alerts & Notifications</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
              Webhook-triggered alerts and notification rules.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={refreshing}
            title="Sync latest data"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-3 py-2 text-xs font-medium text-gray-600 dark:text-white/50 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.08] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </motion.div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Unread', value: String(unreadCount), color: unreadCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Total Notifications', value: String(notifications.length), color: 'text-gray-900 dark:text-white' },
          { label: 'Alert Rules', value: String(rules.length), color: 'text-indigo-400' },
          { label: 'Active Rules', value: String(rules.filter((r) => r.enabled).length), color: 'text-emerald-400' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            {...fadeIn}
            transition={{ delay: 0.05 + i * 0.05 }}
            className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4"
          >
            <p className="text-xs text-gray-400 dark:text-white/30">{s.label}</p>
            {rulesLoading || notifsLoading ? (
              <div className="mt-1 h-8 w-12 animate-pulse rounded bg-white/40 dark:bg-white/[0.06]" />
            ) : (
              <p className={`mt-1 text-2xl font-semibold ${s.color}`}>{s.value}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Notification list */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
            Recent Notifications
          </h3>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              !clearConfirm ? (
                <button
                  onClick={() => setClearConfirm(true)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-400/80">Delete all notifications?</span>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { clearAll.mutate(); setClearConfirm(false); }}
                    className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              )
            )}
          </div>
        </div>
        {notifsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/30">
            No notifications yet. Alerts will appear here when webhook events match your rules.
          </p>
        ) : (
          <div className="space-y-2">
            {groupedNotifications.map((entry, i) => {
              if (entry.key === null) {
                // Standalone notification (no group)
                const n = (entry as { key: null; item: Notification }).item;
                const style = severityStyle[n.severity] ?? severityStyle.info!;
                return (
                  <motion.div
                    key={n.id}
                    {...fadeIn}
                    transition={{ delay: 0.2 + i * 0.03 }}
                    className={`flex items-start gap-3 rounded-xl border p-4 ${style.bg} ${n.read ? 'opacity-50' : ''}`}
                  >
                    <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 dark:text-white">{n.message}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                        <span className="capitalize">{n.severity}</span>
                        <span>&middot;</span>
                        <span>{n.eventType}</span>
                        <span>&middot;</span>
                        <span>{timeAgo(n.createdAt)}</span>
                        {n.read && (
                          <>
                            <span>&middot;</span>
                            <span className="text-emerald-500 dark:text-emerald-400/70">Read</span>
                          </>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-gray-400 hover:bg-white/40 dark:hover:bg-white/[0.08] transition-colors"
                      >
                        Dismiss
                      </button>
                    )}
                  </motion.div>
                );
              }

              // Grouped notification
              const g = entry as { key: string; title: string; items: Notification[] };
              const isExpanded = expandedGroups.has(g.key);
              const worstSeverity = g.items.some((x) => x.severity === 'error') ? 'error'
                : g.items.some((x) => x.severity === 'warning') ? 'warning'
                : g.items.some((x) => x.severity === 'success') ? 'success' : 'info';
              const parentStyle = severityStyle[worstSeverity] ?? severityStyle.info!;
              const allRead = g.items.every((x) => x.read);

              return (
                <motion.div
                  key={g.key}
                  {...fadeIn}
                  transition={{ delay: 0.2 + i * 0.03 }}
                  className={`overflow-hidden rounded-xl border ${parentStyle.bg}`}
                >
                  {/* Parent row */}
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-white/30 dark:hover:bg-white/[0.04] ${allRead ? 'opacity-50' : ''}`}
                  >
                    <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${parentStyle.dot}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{g.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                        <span>{g.items.length} event{g.items.length > 1 ? 's' : ''}</span>
                        <span>&middot;</span>
                        <span>{timeAgo(g.items[0]!.createdAt)}</span>
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      className={`mt-1 h-4 w-4 shrink-0 text-gray-400 dark:text-white/25 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Children with connecting pipe */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="relative ml-6 border-l-2 border-gray-200 dark:border-white/10 pb-1">
                          {g.items.map((n) => {
                            const childStyle = severityStyle[n.severity] ?? severityStyle.info!;
                            return (
                              <div
                                key={n.id}
                                className={`relative flex items-start gap-3 py-3 pl-5 pr-4 transition-colors hover:bg-white/30 dark:hover:bg-white/[0.04] ${n.read ? 'opacity-50' : ''}`}
                              >
                                {/* Horizontal connector from pipe */}
                                <div className="absolute left-0 top-[18px] h-px w-4 bg-gray-200 dark:bg-white/10" />
                                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${childStyle.dot}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700 dark:text-white/80">{n.message}</p>
                                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 dark:text-white/30">
                                    <span className="capitalize">{n.severity}</span>
                                    <span>&middot;</span>
                                    <span>{n.eventType}</span>
                                    <span>&middot;</span>
                                    <span>{timeAgo(n.createdAt)}</span>
                                    {n.read && (
                                      <>
                                        <span>&middot;</span>
                                        <span className="text-emerald-500 dark:text-emerald-400/70">Read</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {!n.read && (
                                  <button
                                    onClick={() => markRead.mutate(n.id)}
                                    className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-gray-400 hover:bg-white/40 dark:hover:bg-white/[0.08] transition-colors"
                                  >
                                    Dismiss
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alert rules */}
      <motion.div {...fadeIn} transition={{ delay: 0.5 }} className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
            Alert Rules
          </h3>
          <button
            onClick={() => setShowAddRule(!showAddRule)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {showAddRule ? 'Cancel' : '+ Add Rule'}
          </button>
        </div>

        {/* Add rule form */}
        <AnimatePresence>
          {showAddRule && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-3 flex flex-col gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
                <div className="flex gap-2">
                <input
                  type="text"
                  value={newRuleName}
                  onChange={(e) => { setNewRuleName(e.target.value); setDuplicateWarning(''); }}
                  placeholder="Rule name..."
                  className="flex-1 rounded-lg border border-white/[0.18] bg-white/40 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-white/30"
                />
                <select
                  value={newRuleEvent}
                  onChange={(e) => { setNewRuleEvent(e.target.value); setDuplicateWarning(''); }}
                  className="rounded-lg border border-white/[0.18] bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-white/[0.08] dark:bg-[#1a1a2e] dark:text-white"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value} className="bg-white text-gray-900 dark:bg-[#1a1a2e] dark:text-white">{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddRule}
                  disabled={!newRuleName.trim() || createRule.isPending}
                  className="rounded-lg bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
                >
                  Add
                </button>
                </div>
                {duplicateWarning && (
                  <p className="text-xs text-yellow-500 dark:text-yellow-400">
                    <svg className="mr-1 inline h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    {duplicateWarning}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {rulesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/30">
            No alert rules configured. Add a rule to get notified about webhook events.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="group/rule flex items-center justify-between rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  {editingRuleId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingRuleName}
                        onChange={(e) => setEditingRuleName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(r.id); if (e.key === 'Escape') setEditingRuleId(null); }}
                        autoFocus
                        className="rounded-lg border border-indigo-500/30 bg-white/40 px-2 py-1 text-sm text-gray-900 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-white"
                      />
                      <button
                        onClick={() => handleRename(r.id)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingRuleId(null)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-white/50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        onClick={() => { setEditingRuleId(r.id); setEditingRuleName(r.name); }}
                        className="text-sm font-medium text-gray-800 dark:text-white/80 cursor-pointer hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1.5"
                        title="Click to rename"
                      >
                        {r.name}
                        <svg className="h-3 w-3 opacity-0 group-hover/rule:opacity-60 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </span>
                      <p className="mt-0.5 text-[10px] text-gray-400 dark:text-white/25">
                        Triggers on: {EVENT_TYPES.find((t) => t.value === r.eventType)?.label ?? r.eventType}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => deleteRule.mutate(r.id)}
                    className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    role="switch"
                    aria-checked={r.enabled}
                    aria-label={r.name}
                    disabled={toggleRule.isPending}
                    onClick={() => toggleRule.mutate(r.id)}
                    className={`relative h-6 w-11 rounded-full border transition-colors ${
                      r.enabled
                        ? 'bg-indigo-500 border-indigo-400/50'
                        : 'bg-gray-200 border-gray-300 dark:bg-white/[0.08] dark:border-white/[0.12]'
                    } ${toggleRule.isPending ? 'opacity-60' : ''}`}
                  >
                    {toggleRule.isPending && toggleRule.variables === r.id ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent text-white/70" />
                      </div>
                    ) : (
                      <div
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-sm transition-transform ${
                          r.enabled
                            ? 'translate-x-5 bg-white'
                            : 'translate-x-0 bg-white dark:bg-white/60'
                        }`}
                      />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { refresh: refreshGitHub } = useGitHubData();
  const { refresh: refreshVercel } = useVercelData();
  const { refresh: refreshFirebase } = useFirebaseData();
  const { refresh: refreshAlerts } = useAlertRules();
  const { refresh: refreshNotifications } = useNotifications();

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshGitHub(), refreshVercel(), refreshFirebase(), refreshAlerts(), refreshNotifications()]);
  }, [refreshGitHub, refreshVercel, refreshFirebase, refreshAlerts, refreshNotifications]);

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
        // Refresh all data so the UI reflects the new webhook state
        await refreshAll().catch(() => {});
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
                <div key={i} className="h-14 rounded-xl border border-white/[0.18] bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <>
              <IntegrationRow
                icon={<ThemeIcon dark="/macos-icons/github_darkmode.png" light="/macos-icons/github_lightmode.png" alt="GitHub" size={20} />}
                name="GitHub"
                description="OAuth connected — repos, commits, and PRs are synced automatically"
                connected={!!settings?.hasGitHubToken}
              >
                <button
                  onClick={async () => {
                    setSyncing(true);
                    setMessage(null);
                    try {
                      await refreshAll();
                      setMessage({ type: 'success', text: 'All data synced — GitHub, Vercel, Firebase, alerts & notifications refreshed.' });
                    } catch { setMessage({ type: 'error', text: 'Failed to sync data.' }); }
                    finally { setSyncing(false); }
                  }}
                  disabled={syncing || !settings?.hasGitHubToken}
                  className="shrink-0 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/20 disabled:opacity-50"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </IntegrationRow>
              <IntegrationRow
                icon={<ThemeIcon dark="/macos-icons/live-events.png" light="/macos-icons/live-events.png" alt="Webhooks" size={20} />}
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
                icon={<img src="/macos-icons/vercel.png" alt="Vercel" width={20} height={20} className="h-5 w-5" />}
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
        className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <img src="/macos-icons/vercel.png" alt="Vercel" width={20} height={20} className="h-5 w-5" />
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
            <div className="flex-1 rounded-lg bg-white/40 px-4 py-2.5 text-sm text-gray-500 dark:bg-white/[0.06] dark:text-white/40">
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
              className="flex-1 rounded-lg border border-white/[0.18] bg-white/40 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/20"
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

      {/* Danger Zone */}
      <DangerZone />
    </>
  );
}

function DangerZone() {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // GitHub username from provider data, fallback to displayName
  const githubUsername =
    user?.providerData?.find((p) => p.providerId === 'github.com')?.displayName ??
    user?.displayName ??
    '';

  const canConfirm = typedName === githubUsername;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/home';
      }
    } catch {
      setDeleting(false);
    }
  };

  return (
    <>
      <motion.div {...fadeIn} transition={{ delay: 0.4 }} className="mt-8">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400/70">
          Danger Zone
        </h3>
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Delete Account</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/40">
                Permanently delete your account and all associated data (notifications, alert rules, tokens).
              </p>
            </div>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
              >
                Delete Account
              </button>
            ) : (
              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="text-[11px] text-red-400/80 max-w-[220px] text-right">
                  You can sign in again with your GitHub account, but your data (notifications, rules, and AI chat history) will be lost.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-white/[0.18] dark:border-white/[0.08] px-3 py-1.5 text-xs text-gray-500 dark:text-white/40 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.06]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setShowModal(true); setTypedName(''); }}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
                  >
                    Yes, Delete Everything
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── macOS-style Confirmation Modal ── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[200] flex items-center justify-center"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
              onClick={() => { if (!deleting) { setShowModal(false); } }}
            />

            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-[340px] rounded-2xl border border-gray-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#2a2a2e]/95 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)] overflow-hidden"
            >
              {/* Top section — icon + message */}
              <div className="px-6 pt-6 pb-4 text-center">
                {/* Warning icon */}
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15">
                  <svg className="h-6 w-6 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>

                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white leading-snug">
                  Delete your account?
                </h3>
                <p className="mt-2 text-[12px] leading-relaxed text-gray-500 dark:text-white/45">
                  This will permanently delete all your data including notifications, alert rules, and stored tokens. This action cannot be undone.
                </p>
              </div>

              {/* Input section */}
              <div className="px-6 pb-4">
                <label className="block text-[11px] font-medium text-gray-500 dark:text-white/40 mb-1.5">
                  Type <span className="font-semibold text-gray-700 dark:text-white/70">{githubUsername}</span> to confirm
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  disabled={deleting}
                  placeholder={githubUsername}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.06] px-3 py-2 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/20 outline-none ring-0 transition-colors focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 disabled:opacity-50"
                />
              </div>

              {/* Button bar — macOS style bottom divider + buttons */}
              <div className="flex border-t border-gray-200/80 dark:border-white/[0.08]">
                <button
                  onClick={() => { setShowModal(false); setTypedName(''); }}
                  disabled={deleting}
                  className="flex-1 px-4 py-3 text-[13px] font-medium text-gray-700 dark:text-white/70 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] border-r border-gray-200/80 dark:border-white/[0.08] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!canConfirm || deleting}
                  className="flex-1 px-4 py-3 text-[13px] font-semibold text-red-500 dark:text-red-400 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth={3} strokeLinecap="round" className="opacity-75" />
                      </svg>
                      Deleting…
                    </span>
                  ) : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
  icon: React.ReactNode;
  name: string;
  description: string;
  connected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] p-4">
      <span className="flex shrink-0 items-center">{icon}</span>
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
