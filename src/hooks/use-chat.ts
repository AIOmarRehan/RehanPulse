'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEventStore } from '@/lib/stores/event-store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  // Load conversation list on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/chat/history');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.conversations)) {
            setConversations(data.conversations);
            // Auto-load the most recent conversation
            if (data.conversations.length > 0) {
              const latest = data.conversations[0];
              const convRes = await fetch(`/api/chat/history?id=${latest.id}`);
              if (convRes.ok) {
                const convData = await convRes.json();
                if (!cancelled && Array.isArray(convData.messages)) {
                  setMessages(convData.messages);
                  setConversationId(latest.id);
                }
              }
            }
          }
        }
      } catch {
        // Silently ignore
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save current conversation when messages change (debounced)
  useEffect(() => {
    if (!historyLoaded || isStreaming) return;
    const toSave = messages.filter((m) => m.content);
    if (toSave.length === 0) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: conversationId, messages: toSave }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.id && !conversationId) {
            setConversationId(data.id);
          }
          // Refresh conversation list
          refreshConversations();
        }
      } catch {}
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, historyLoaded, isStreaming]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/history');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.conversations)) {
          setConversations(data.conversations);
        }
      }
    } catch {}
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/history?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
          setConversationId(id);
        }
      }
    } catch {}
  }, []);

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/chat/history?id=${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
      }
    } catch {}
  }, [conversationId]);

  const gatherContext = useCallback(() => {
    const parts: string[] = [];

    // GitHub data — send EVERYTHING, no slicing
    const github = queryClient.getQueryData<Record<string, unknown>>(['github-data']);
    if (github) {
      const repos = github.repos as Array<Record<string, unknown>> | undefined;
      if (repos) {
        const totalCommitsAllRepos = repos.reduce((sum, r) => sum + ((r.commit_count as number) ?? 0), 0);
        const totalStars = repos.reduce((sum, r) => sum + ((r.stargazers_count as number) ?? 0), 0);
        const publicCount = repos.filter((r) => !r.private).length;
        const privateCount = repos.filter((r) => r.private).length;
        const langMap: Record<string, number> = {};
        repos.forEach((r) => {
          const lang = (r.language as string) || 'Unknown';
          langMap[lang] = (langMap[lang] || 0) + 1;
        });
        const topLangs = Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, c]) => `${l}(${c})`).join(', ');

        parts.push(`GitHub Repositories (${repos.length} total, ${publicCount} public, ${privateCount} private, ${totalStars} total stars, ${totalCommitsAllRepos.toLocaleString()} total commits):`);
        parts.push(`  Top languages: ${topLangs}`);
        repos.forEach((r) => {
          const desc = (r.description as string) ? ` — "${(r.description as string).slice(0, 120)}"` : '';
          const updated = r.updated_at ? `, updated ${new Date(r.updated_at as string).toISOString().slice(0, 10)}` : '';
          const url = r.html_url ? `, url: ${r.html_url}` : '';
          parts.push(
            `  - ${r.full_name}: ${r.stargazers_count ?? 0}★, ${r.language || 'N/A'}, ${r.private ? 'private' : 'public'}, ${r.open_issues_count ?? 0} open issues, ${((r.commit_count as number) ?? 0).toLocaleString()} commits, forks: ${r.forks_count ?? 0}${desc}${updated}${url}`,
          );
        });
      }

      const commits = github.commits as Array<Record<string, unknown>> | undefined;
      if (commits) {
        parts.push(`\nRecent Commits This Week (${commits.length} total):`);
        commits.forEach((c) => {
          const msg = (c.message as string) ?? 'No message';
          const fullMsg = msg.split('\n')[0];
          const body = msg.split('\n').slice(1).join(' ').trim();
          parts.push(
            `  - ${fullMsg} (repo: ${c.repo || ''}) by ${c.author || 'unknown'} at ${c.date || ''} [SHA: ${(c.sha as string)?.slice(0, 7) || ''}]${body ? ` body: "${body.slice(0, 200)}"` : ''}`,
          );
        });
      }

      const prs = github.pullRequests as Array<Record<string, unknown>> | undefined;
      if (prs) {
        parts.push(`\nOpen Pull Requests (${prs.length} total):`);
        prs.forEach((pr) => {
          const labels = pr.labels as string[] | undefined;
          const labelStr = labels?.length ? ` labels: [${labels.join(', ')}]` : '';
          parts.push(`  - #${pr.number} "${pr.title}" in ${pr.repo || ''} by ${pr.author || 'unknown'} (${pr.draft ? 'draft' : 'ready'}, created ${pr.created_at || ''}, updated ${pr.updated_at || ''})${labelStr}`);
        });
      }

      // Contribution data — full stats
      const contributions = github.contributions as Array<{ date: string; contributionCount: number }> | undefined;
      if (contributions && contributions.length > 0) {
        const totalContributions = contributions.reduce((sum, d) => sum + d.contributionCount, 0);
        const last30 = contributions.slice(-30);
        const last30Total = last30.reduce((sum, d) => sum + d.contributionCount, 0);
        const last7 = contributions.slice(-7);
        const last7Total = last7.reduce((sum, d) => sum + d.contributionCount, 0);
        const today = contributions[contributions.length - 1];

        // Streak calculation
        const reversed = [...contributions].reverse();
        const streakDays = reversed.findIndex((d) => d.contributionCount === 0);

        // Best day
        const bestDay = contributions.reduce<{ date: string; contributionCount: number } | undefined>((best, d) => !best || d.contributionCount > best.contributionCount ? d : best, undefined);

        // Average
        const activeDays = contributions.filter((d) => d.contributionCount > 0).length;
        const avgPerActiveDay = activeDays > 0 ? (totalContributions / activeDays).toFixed(1) : '0';

        parts.push(`\nContributions (past year):`);
        parts.push(`  - Total: ${totalContributions} contributions in the past year`);
        parts.push(`  - Active days: ${activeDays} out of ${contributions.length} days`);
        parts.push(`  - Average per active day: ${avgPerActiveDay}`);
        parts.push(`  - Last 30 days: ${last30Total} contributions`);
        parts.push(`  - Last 7 days: ${last7Total} contributions`);
        parts.push(`  - Today: ${today?.contributionCount ?? 0} contributions`);
        if (streakDays > 0) {
          parts.push(`  - Current streak: ${streakDays} consecutive days`);
        }
        if (bestDay) {
          parts.push(`  - Best day: ${bestDay.date} with ${bestDay.contributionCount} contributions`);
        }

        // Last 14 days daily breakdown
        const last14 = contributions.slice(-14);
        parts.push(`  - Last 14 days: ${last14.map((d) => `${d.date.slice(5)}:${d.contributionCount}`).join(', ')}`);
      }

      // Rate limit
      const rateLimit = github.rateLimit as { limit?: number; remaining?: number; used?: number } | undefined;
      if (rateLimit) {
        const pct = rateLimit.limit ? Math.round(((rateLimit.used ?? 0) / rateLimit.limit) * 100) : 0;
        parts.push(`\nGitHub API Rate Limit: ${rateLimit.remaining ?? '?'}/${rateLimit.limit ?? '?'} remaining (${rateLimit.used ?? '?'} used, ${pct}% consumed)`);
      }
    }

    // Vercel data — send ALL deployments, all usage fields
    const vercelQueries = queryClient.getQueriesData<Record<string, unknown>>({
      queryKey: ['vercel-data'],
    });
    const vercel = vercelQueries[0]?.[1];
    if (vercel) {
      const deployments = vercel.deployments as Array<Record<string, unknown>> | undefined;
      if (deployments) {
        const readyCount = deployments.filter((d) => d.state === 'READY').length;
        const errorCount = deployments.filter((d) => d.state === 'ERROR').length;
        const canceledCount = deployments.filter((d) => d.state === 'CANCELED').length;
        const buildingCount = deployments.filter((d) => d.state === 'BUILDING').length;
        const successRate = deployments.length > 0 ? Math.round((readyCount / deployments.length) * 100) : 0;

        parts.push(`\nVercel Deployments (${deployments.length} total, ${readyCount} ready, ${errorCount} errors, ${canceledCount} canceled, ${buildingCount} building, ${successRate}% success rate):`);
        deployments.forEach((d) => {
          const created = d.createdAt ? new Date(d.createdAt as number).toISOString() : '';
          const meta = d.meta as Record<string, unknown> | undefined;
          const commitMsg = meta?.githubCommitMessage || '';
          const branch = meta?.githubCommitRef || '';
          const buildStart = d.buildingAt as number | undefined;
          const readyAt = d.ready as number | undefined;
          const duration = buildStart && readyAt ? `${Math.round((readyAt - buildStart) / 1000)}s` : '';
          parts.push(
            `  - ${d.name}: ${d.state} (${d.target || 'preview'}) url=${d.url || 'none'}${branch ? ` branch=${branch}` : ''} ${commitMsg ? `commit="${(commitMsg as string).slice(0, 100)}"` : ''} ${duration ? `build=${duration}` : ''} ${created}`,
          );
        });
      }

      const projects = vercel.projects as Array<Record<string, unknown>> | undefined;
      if (projects) {
        parts.push(`\nVercel Projects (${projects.length}):`);
        projects.forEach((p) => {
          const domains = p.domains as string[] | undefined;
          const updated = p.updatedAt ? `, updated ${new Date(p.updatedAt as number).toISOString().slice(0, 10)}` : '';
          parts.push(
            `  - ${p.name}: framework=${p.framework || 'N/A'}, latestState=${p.latestDeploymentState || 'N/A'}${domains?.length ? `, domains=[${domains.join(', ')}]` : ''}${updated}`,
          );
        });
      }

      const usage = vercel.usage as Record<string, unknown> | undefined;
      if (usage) {
        parts.push(`\nVercel Usage (current billing period):`);
        parts.push(`  - Plan: ${usage.subscription || 'unknown'}`);
        if (usage.requests != null) parts.push(`  - Requests: ${(usage.requests as number).toLocaleString()}`);
        if (usage.bandwidth != null) parts.push(`  - Bandwidth: ${((usage.bandwidth as number) / (1024 * 1024 * 1024)).toFixed(3)} GB`);
        if (usage.buildMinutes != null) parts.push(`  - Build minutes: ${usage.buildMinutes}`);
        if (usage.functionGBHours != null) parts.push(`  - Function GB-hours: ${usage.functionGBHours}`);
        if (usage.dataCacheReads != null) parts.push(`  - Data cache reads: ${((usage.dataCacheReads as number) / (1024 * 1024)).toFixed(2)} MB`);
        if (usage.dataCacheWrites != null) parts.push(`  - Data cache writes: ${((usage.dataCacheWrites as number) / (1024 * 1024)).toFixed(2)} MB`);
      }
    }

    // Firebase data
    const firebaseConn = queryClient.getQueryData<Record<string, unknown>>([
      'firebase-connection',
    ]);
    if (firebaseConn) {
      parts.push(
        `\nFirebase: ${firebaseConn.connected ? 'Connected' : 'Disconnected'} - Project: ${firebaseConn.projectId || 'N/A'}`,
      );
      const collections = firebaseConn.collections as Array<{ name: string; documentCount: number }> | undefined;
      if (collections && collections.length > 0) {
        parts.push(`  Collections (${collections.length}):`);
        collections.forEach((c) => {
          parts.push(`    - ${c.name}: ${c.documentCount} documents`);
        });
      }
    }

    const firebaseProjects = queryClient.getQueryData<Record<string, unknown>[]>(['firebase-projects']);
    if (firebaseProjects && Array.isArray(firebaseProjects)) {
      parts.push(`Firebase Projects: ${firebaseProjects.map((p) => p.displayName || p.projectId).join(', ')}`);
    }

    // Alerts — all rules
    const alerts = queryClient.getQueryData<Record<string, unknown>>(['alert-rules']);
    if (alerts) {
      const rules = alerts.rules as Array<Record<string, unknown>> | undefined;
      if (rules) {
        const activeCount = rules.filter((r) => r.enabled).length;
        parts.push(`\nAlert Rules (${rules.length} total, ${activeCount} active):`);
        rules.forEach((a) => {
          parts.push(
            `  - "${a.name}": ${a.enabled ? 'Active' : 'Disabled'} (type: ${a.eventType || a.type})`,
          );
        });
      }
    }

    // Notifications — ALL of them
    const notifs = queryClient.getQueryData<Record<string, unknown>>(['notifications']);
    if (notifs) {
      const list = notifs.notifications as Array<Record<string, unknown>> | undefined;
      if (list && list.length > 0) {
        const unread = list.filter((n) => !n.read).length;
        parts.push(`\nNotifications (${list.length} total, ${unread} unread):`);
        list.forEach((n) => {
          const time = n.createdAt ? new Date(n.createdAt as number).toISOString() : '';
          parts.push(`  - [${n.severity}] ${n.message} (${n.read ? 'read' : 'unread'}, type=${n.eventType || ''}, ${time})`);
        });
      }
    }

    // SSE live events from event store
    const events = useEventStore.getState()?.events;
    if (events && events.length > 0) {
      parts.push(`\nLive Webhook Events (${events.length} recent):`);
      events.slice(0, 20).forEach((e) => {
        parts.push(`  - [${e.eventType}] ${e.summary || e.action || ''} repo=${e.repo || ''} by ${e.sender || ''} at ${e.createdAt || ''}`);
      });
    }

    return parts.length > 0 ? parts.join('\n') : undefined;
  }, [queryClient]);

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      // Build the API payload before updating state
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const context = gatherContext();

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages, context }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Request failed' }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: err.error || 'Something went wrong.' }
                : m,
            ),
          );
          setIsStreaming(false);
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + delta }
                      : m,
                  ),
                );
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id && !m.content
                ? { ...m, content: 'Connection lost. Try again.' }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, gatherContext],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    if (conversationId) {
      fetch(`/api/chat/history?id=${conversationId}`, { method: 'DELETE' }).catch(() => {});
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    }
    setMessages([]);
    setConversationId(null);
  }, [conversationId]);

  return {
    messages,
    isStreaming,
    send,
    stop,
    clear,
    conversations,
    conversationId,
    loadConversation,
    newConversation,
    deleteConversation,
  };
}
