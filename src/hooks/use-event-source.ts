'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEventStore, type WebhookEvent } from '@/lib/stores/event-store';

const MAX_RETRIES = 10;
const BASE_DELAY = 1000; // 1s
const VERCEL_POLL_INTERVAL = 15_000; // 15s — poll Vercel for deployment status

/**
 * Custom hook that connects to the SSE endpoint at /api/stream.
 * Auto-reconnects with exponential backoff on disconnect.
 * Pushes events into the Zustand store.
 * Listens for named events: 'webhook' (event store) and 'notification' (query invalidation).
 * Periodically polls Vercel deployment status.
 */
export function useEventSource() {
  const addEvent = useEventStore((s) => s.addEvent);
  const setConnected = useEventStore((s) => s.setConnected);
  const setConnectionStatus = useEventStore((s) => s.setConnectionStatus);
  const queryClient = useQueryClient();
  const retriesRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const initialLoadRef = useRef(true);
  const hasDoneCatchUp = useRef(false);
  const pendingInvalidation = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vercelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vercelTrackingActive = useRef(false);
  const vercelPollCount = useRef(0);

  const stopVercelPolling = useCallback(() => {
    vercelTrackingActive.current = false;
    if (vercelPollRef.current) {
      clearInterval(vercelPollRef.current);
      vercelPollRef.current = null;
    }
  }, []);

  /** Poll Vercel for deployment status updates and refresh notifications. */
  const pollVercel = useCallback(async () => {
    try {
      const res = await fetch('/api/vercel/track', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { tracked: number };
        if (data.tracked > 0) {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      }
    } catch {
      // Silently ignore
    }

    // Stop after 10 polls (~2.5 min) to avoid endless polling
    vercelPollCount.current++;
    if (vercelPollCount.current >= 24) {
      stopVercelPolling();
    }
  }, [queryClient, stopVercelPolling]);

  const startVercelPolling = useCallback(() => {
    // Always reset counter so new commits extend the polling window
    vercelPollCount.current = 0;
    if (vercelTrackingActive.current) return; // interval already running
    vercelTrackingActive.current = true;
    // Immediate first poll
    void pollVercel();
    vercelPollRef.current = setInterval(() => void pollVercel(), VERCEL_POLL_INTERVAL);
  }, [pollVercel]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setConnectionStatus('connecting');
    const es = new EventSource('/api/stream');
    esRef.current = es;

    es.onopen = () => {
      retriesRef.current = 0;
      setConnected(true);
      // Skip notification refetch for the initial snapshot burst
      initialLoadRef.current = true;
      setTimeout(() => { initialLoadRef.current = false; }, 2000);
      // One-time catch-up on first connection only (not on every 60s reconnect)
      if (!hasDoneCatchUp.current) {
        hasDoneCatchUp.current = true;
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          fetch('/api/vercel/track', { method: 'POST' })
            .then(res => res.ok ? res.json() as Promise<{ tracked: number }> : null)
            .then(data => {
              if (data && data.tracked > 0) {
                startVercelPolling();
              }
            })
            .catch(() => { /* ignore */ });
        }, 3000);
      }
    };

    // Named event: webhook events → add to event store
    es.addEventListener('webhook', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WebhookEvent;
        addEvent(data);
        // Start Vercel polling for new push/CI/deployment events (not initial snapshot burst)
        if (!initialLoadRef.current && (data.type === 'push' || data.type === 'ci' || data.type === 'deployment')) {
          startVercelPolling();
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Named event: notification counter changed → debounced query invalidation + Vercel polling
    es.addEventListener('notification', (event: MessageEvent) => {
      if (initialLoadRef.current) return;

      // Parse counter data for source/eventType
      let lastSource: string | null = null;
      let lastEventType: string | null = null;
      try {
        const data = JSON.parse(event.data as string) as { lastSource?: string; lastEventType?: string };
        lastSource = data.lastSource ?? null;
        lastEventType = data.lastEventType ?? null;
      } catch { /* ignore */ }

      // Debounce: batch rapid notification events
      if (pendingInvalidation.current) clearTimeout(pendingInvalidation.current);
      pendingInvalidation.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        pendingInvalidation.current = null;
      }, 300);

      // Start Vercel polling for push/CI events
      if (lastSource === 'commit' || lastEventType === 'push' || lastEventType === 'ci') {
        startVercelPolling();
      }
    });

    es.onerror = () => {
      es.close();
      setConnected(false);

      if (!mountedRef.current) return;

      if (retriesRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY * 2 ** retriesRef.current, 30_000);
        retriesRef.current += 1;
        setTimeout(connect, delay);
      }
    };
  }, [addEvent, setConnected, setConnectionStatus, queryClient, startVercelPolling]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      setConnected(false);
      stopVercelPolling();
      if (pendingInvalidation.current) clearTimeout(pendingInvalidation.current);
    };
  }, [connect, setConnected, stopVercelPolling]);
}
