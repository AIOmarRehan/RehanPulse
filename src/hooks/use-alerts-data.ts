'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AlertRule {
  id: string;
  uid: string;
  name: string;
  eventType: string;
  enabled: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  uid: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  message: string;
  eventType: string;
  read: boolean;
  createdAt: string;
}

async function fetchAlerts(): Promise<{ rules: AlertRule[] }> {
  const res = await fetch('/api/alerts');
  if (!res.ok) throw new Error(`Alerts API failed: ${res.status}`);
  return res.json() as Promise<{ rules: AlertRule[] }>;
}

async function fetchNotifications(): Promise<{ notifications: Notification[] }> {
  const res = await fetch('/api/notifications');
  if (!res.ok) throw new Error(`Notifications API failed: ${res.status}`);
  return res.json() as Promise<{ notifications: Notification[] }>;
}

export function useAlertRules() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['alert-rules'],
    queryFn: fetchAlerts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const toggleRule = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to toggle rule');
      return res.json();
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['alert-rules'] });
      const previous = queryClient.getQueryData<{ rules: AlertRule[] }>(['alert-rules']);
      queryClient.setQueryData<{ rules: AlertRule[] }>(['alert-rules'], (old) => {
        if (!old) return old;
        return {
          rules: old.rules.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r),
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['alert-rules'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const createRule = useMutation({
    mutationFn: async (rule: { name: string; eventType: string }) => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.status === 409) {
        const data = await res.json() as { error: string };
        throw new Error(data.error ?? 'Duplicate rule');
      }
      if (!res.ok) throw new Error('Failed to create rule');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const renameRule = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) throw new Error('Failed to rename rule');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete rule');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  return { ...query, toggleRule, createRule, renameRule, deleteRule };
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear notifications');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = (query.data?.notifications ?? []).filter((n) => !n.read).length;

  return { ...query, markRead, markAllRead, clearAll, unreadCount };
}
