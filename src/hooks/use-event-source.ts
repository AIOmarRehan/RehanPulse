'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEventStore, type WebhookEvent } from '@/lib/stores/event-store';

const MAX_RETRIES = 10;
const BASE_DELAY = 1000; // 1s

/**
 * Custom hook that connects to the SSE endpoint at /api/stream.
 * Auto-reconnects with exponential backoff on disconnect.
 * Pushes events into the Zustand store.
 */
export function useEventSource() {
  const addEvent = useEventStore((s) => s.addEvent);
  const setConnected = useEventStore((s) => s.setConnected);
  const setConnectionStatus = useEventStore((s) => s.setConnectionStatus);
  const retriesRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setConnectionStatus('connecting');
    const es = new EventSource('/api/stream');
    esRef.current = es;

    es.onopen = () => {
      retriesRef.current = 0;
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WebhookEvent;
        addEvent(data);
      } catch {
        // Ignore malformed messages
      }
    };

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
  }, [addEvent, setConnected, setConnectionStatus]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      setConnected(false);
    };
  }, [connect, setConnected]);
}
