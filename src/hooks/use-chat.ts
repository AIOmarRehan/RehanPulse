'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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

    // GitHub data
    const github = queryClient.getQueryData<Record<string, unknown>>(['github-data']);
    if (github) {
      const repos = github.repos as Array<Record<string, unknown>> | undefined;
      if (repos) {
        parts.push(`GitHub Repositories (${repos.length} total):`);
        repos.slice(0, 15).forEach((r) => {
          parts.push(
            `  - ${r.full_name}: ${r.stargazers_count ?? 0} stars, ${r.language || 'N/A'}, ${r.visibility}, ${r.open_issues_count ?? 0} open issues`,
          );
        });
      }

      const commits = github.commits as Array<Record<string, unknown>> | undefined;
      if (commits) {
        parts.push(`\nRecent Commits This Week (${commits.length}):`);
        commits.slice(0, 10).forEach((c) => {
          const msg = (c.commit as Record<string, unknown>)?.message as string | undefined;
          parts.push(
            `  - ${msg?.split('\n')[0] || 'No message'} (${c.repository || ''}) by ${c.author || 'unknown'} at ${c.date || ''}`,
          );
        });
      }

      const prs = github.pullRequests as Array<Record<string, unknown>> | undefined;
      if (prs) {
        parts.push(`\nOpen Pull Requests (${prs.length}):`);
        prs.slice(0, 10).forEach((pr) => {
          parts.push(`  - #${pr.number} "${pr.title}" in ${pr.repository} by ${pr.author || 'unknown'} (${pr.draft ? 'draft' : 'ready'}, created ${pr.created_at || ''})`);
        });
      }

      // Contribution data
      const contributions = github.contributions as Array<{ date: string; contributionCount: number }> | undefined;
      if (contributions && contributions.length > 0) {
        const totalContributions = contributions.reduce((sum, d) => sum + d.contributionCount, 0);
        const last30 = contributions.slice(-30);
        const last30Total = last30.reduce((sum, d) => sum + d.contributionCount, 0);
        const last7 = contributions.slice(-7);
        const last7Total = last7.reduce((sum, d) => sum + d.contributionCount, 0);
        const today = contributions[contributions.length - 1];
        parts.push(`\nContributions (past year):`);
        parts.push(`  - Total: ${totalContributions} contributions in the past year`);
        parts.push(`  - Last 30 days: ${last30Total} contributions`);
        parts.push(`  - Last 7 days: ${last7Total} contributions`);
        parts.push(`  - Today: ${today?.contributionCount ?? 0} contributions`);
        const streakDays = [...contributions].reverse().findIndex((d) => d.contributionCount === 0);
        if (streakDays > 0) {
          parts.push(`  - Current streak: ${streakDays} consecutive days`);
        }
      }

      // Rate limit
      const rateLimit = github.rateLimit as { limit?: number; remaining?: number; used?: number } | undefined;
      if (rateLimit) {
        parts.push(`\nGitHub API Rate Limit: ${rateLimit.remaining ?? '?'}/${rateLimit.limit ?? '?'} remaining (${rateLimit.used ?? '?'} used)`);
      }
    }

    // Vercel data
    const vercelQueries = queryClient.getQueriesData<Record<string, unknown>>({
      queryKey: ['vercel-data'],
    });
    const vercel = vercelQueries[0]?.[1];
    if (vercel) {
      const deployments = vercel.deployments as Array<Record<string, unknown>> | undefined;
      if (deployments) {
        parts.push(`\nVercel Deployments (${deployments.length}):`);
        deployments.slice(0, 8).forEach((d) => {
          const created = d.createdAt ? new Date(d.createdAt as number).toISOString() : '';
          const meta = d.meta as Record<string, unknown> | undefined;
          const commitMsg = meta?.githubCommitMessage || '';
          parts.push(
            `  - ${d.name}: ${d.state} (${d.target || 'preview'}) - ${d.url || 'no URL'} ${commitMsg ? `[commit: ${commitMsg}]` : ''} ${created}`,
          );
        });
      }

      const projects = vercel.projects as Array<Record<string, unknown>> | undefined;
      if (projects) {
        parts.push(`\nVercel Projects (${projects.length}):`);
        projects.forEach((p) => {
          const domains = p.domains as string[] | undefined;
          parts.push(
            `  - ${p.name}: framework=${p.framework || 'N/A'}, latestState=${p.latestDeploymentState || 'N/A'}${domains?.length ? `, domains=[${domains.join(', ')}]` : ''}`,
          );
        });
      }

      const usage = vercel.usage as Record<string, unknown> | undefined;
      if (usage) {
        parts.push(`\nVercel Usage (current billing period):`);
        parts.push(`  - Plan: ${usage.subscription || 'unknown'}`);
        if (usage.requests != null) parts.push(`  - Requests: ${usage.requests}`);
        if (usage.bandwidth != null) parts.push(`  - Bandwidth: ${((usage.bandwidth as number) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        if (usage.buildMinutes != null) parts.push(`  - Build minutes: ${usage.buildMinutes}`);
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
    }

    const firebaseProjects = queryClient.getQueryData<Record<string, unknown>[]>(['firebase-projects']);
    if (firebaseProjects && Array.isArray(firebaseProjects)) {
      parts.push(`Firebase Projects: ${firebaseProjects.map((p) => p.displayName || p.projectId).join(', ')}`);
    }

    // Alerts
    const alerts = queryClient.getQueryData<Record<string, unknown>>(['alert-rules']);
    if (alerts) {
      const rules = alerts.rules as Array<Record<string, unknown>> | undefined;
      if (rules) {
        parts.push(`\nAlert Rules (${rules.length}):`);
        rules.forEach((a) => {
          parts.push(
            `  - "${a.name}": ${a.enabled ? 'Active' : 'Disabled'} (type: ${a.eventType || a.type})`,
          );
        });
      }
    }

    // Notifications
    const notifs = queryClient.getQueryData<Record<string, unknown>>(['notifications']);
    if (notifs) {
      const list = notifs.notifications as Array<Record<string, unknown>> | undefined;
      if (list && list.length > 0) {
        const unread = list.filter((n) => !n.read).length;
        parts.push(`\nNotifications (${list.length} total, ${unread} unread):`);
        list.slice(0, 8).forEach((n) => {
          parts.push(`  - [${n.severity}] ${n.message} (${n.read ? 'read' : 'unread'}, ${n.eventType || ''})`);
        });
      }
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
