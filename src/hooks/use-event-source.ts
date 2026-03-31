'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEventStore, type WebhookEvent } from '@/lib/stores/event-store';

const MAX_RETRIES = 10;
const BASE_DELAY = 1000; // 1s

/**
 * Custom hook that connects to the SSE endpoint at /api/stream.
 * Auto-reconnects with exponential backoff on disconnect.
 * Pushes events into the Zustand store.
 * Listens for named events: 'webhook' (event store) and 'notification' (query invalidation).
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
  const pendingInvalidation = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };

    // Named event: webhook events → add to event store
    es.addEventListener('webhook', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WebhookEvent;
        addEvent(data);
      } catch {
        // Ignore malformed messages
      }
    });

    // Named event: notification changes → debounced query invalidation
    // This fires AFTER the notification document exists in Firestore,
    // eliminating the race condition with evaluateAlertRules
    es.addEventListener('notification', () => {
      if (initialLoadRef.current) return;
      // Debounce: batch rapid notification events (e.g., CI + Vercel from same push)
      if (pendingInvalidation.current) clearTimeout(pendingInvalidation.current);
      pendingInvalidation.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        pendingInvalidation.current = null;
      }, 300);
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
  }, [addEvent, setConnected, setConnectionStatus, queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      setConnected(false);
      if (pendingInvalidation.current) clearTimeout(pendingInvalidation.current);
    };
  }, [connect, setConnected]);
}
