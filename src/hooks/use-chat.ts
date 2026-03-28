'use client';

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const gatherContext = useCallback(() => {
    const parts: string[] = [];

    // GitHub data
    const github = queryClient.getQueryData<Record<string, unknown>>(['github-data']);
    if (github) {
      const repos = github.repos as Array<Record<string, unknown>> | undefined;
      if (repos) {
        parts.push(`GitHub Repositories (${repos.length}):`);
        repos.slice(0, 10).forEach((r) => {
          parts.push(
            `  - ${r.full_name}: ${r.stargazers_count ?? 0} stars, ${r.language || 'N/A'}, ${r.visibility}`,
          );
        });
      }

      const commits = github.commits as Array<Record<string, unknown>> | undefined;
      if (commits) {
        parts.push(`\nRecent Commits (${commits.length}):`);
        commits.slice(0, 5).forEach((c) => {
          const msg = (c.commit as Record<string, unknown>)?.message as string | undefined;
          parts.push(
            `  - ${msg?.split('\n')[0] || 'No message'} (${c.repository || ''})`,
          );
        });
      }

      const prs = github.pullRequests as Array<Record<string, unknown>> | undefined;
      if (prs) {
        parts.push(`\nOpen Pull Requests (${prs.length}):`);
        prs.slice(0, 5).forEach((pr) => {
          parts.push(`  - #${pr.number} ${pr.title} in ${pr.repository}`);
        });
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
        deployments.slice(0, 5).forEach((d) => {
          parts.push(
            `  - ${d.name}: ${d.state} (${d.target || 'preview'}) - ${d.url || 'no URL'}`,
          );
        });
      }

      const projects = vercel.projects as Array<Record<string, unknown>> | undefined;
      if (projects) {
        parts.push(`\nVercel Projects (${projects.length}):`);
        projects.forEach((p) => {
          parts.push(`  - ${p.name}: ${p.framework || 'N/A'}`);
        });
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

    // Alerts
    const alerts = queryClient.getQueryData<Record<string, unknown>>(['alert-rules']);
    if (alerts) {
      const rules = alerts.rules as Array<Record<string, unknown>> | undefined;
      if (rules) {
        parts.push(`\nAlert Rules (${rules.length}):`);
        rules.slice(0, 5).forEach((a) => {
          parts.push(
            `  - ${a.name}: ${a.enabled ? 'Active' : 'Disabled'} (${a.type})`,
          );
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
    setMessages([]);
  }, []);

  return { messages, isStreaming, send, stop, clear };
}
