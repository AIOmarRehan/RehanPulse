'use client';

import { useQuery } from '@tanstack/react-query';

export interface FirebaseCollection {
  name: string;
  docs: number;
}

export interface FirebaseStats {
  totalDocs: number;
  totalWebhookEvents: number;
  usersCount: number;
  recentAuthEvents: number;
}

export interface FirebaseDailyActivity {
  date: string;
  events: number;
}

export interface FirebaseData {
  collections: FirebaseCollection[];
  dailyActivity: FirebaseDailyActivity[];
  stats: FirebaseStats;
}

async function fetchFirebaseData(): Promise<FirebaseData> {
  const res = await fetch('/api/firebase');
  if (!res.ok) {
    throw new Error(`Firebase API failed: ${res.status}`);
  }
  return res.json() as Promise<FirebaseData>;
}

export function useFirebaseData() {
  return useQuery({
    queryKey: ['firebase-data'],
    queryFn: fetchFirebaseData,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
