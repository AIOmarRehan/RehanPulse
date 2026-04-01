'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  signInWithPopup,
  linkWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

/* ─── Types ─── */

export interface FirebaseCollection {
  name: string;
  docs: number;
}

export interface FirebaseProjectData {
  projectId: string;
  collections: FirebaseCollection[];
  stats: { totalCollections: number; totalDocs: number };
}

export interface FirebaseProject {
  projectId: string;
  displayName: string;
}

interface ConnectionStatus {
  connected: boolean;
  selectedProject: string | null;
}

/* ─── Fetchers ─── */

async function fetchConnection(): Promise<ConnectionStatus> {
  const res = await fetch('/api/firebase/connect');
  if (!res.ok) throw new Error('Failed to check connection');
  return res.json();
}

async function fetchProjects(): Promise<FirebaseProject[]> {
  const res = await fetch('/api/firebase/projects');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to load projects');
  }
  const data = (await res.json()) as { projects?: FirebaseProject[] };
  return data.projects ?? [];
}

async function fetchProjectData(projectId: string): Promise<FirebaseProjectData> {
  const res = await fetch(`/api/firebase?project=${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to load project data');
  }
  return res.json();
}

/* ─── Hook ─── */

export function useFirebaseData() {
  const qc = useQueryClient();

  // 1. Connection status
  const connection = useQuery({
    queryKey: ['firebase-connection'],
    queryFn: fetchConnection,
    staleTime: 30_000,
  });

  const connected = connection.data?.connected ?? false;
  const selectedProject = connection.data?.selectedProject ?? null;

  // 2. Project list (only when connected)
  const projects = useQuery({
    queryKey: ['firebase-projects'],
    queryFn: fetchProjects,
    enabled: connected,
    staleTime: 60_000,
  });

  // 3. Project data (only when a project is selected)
  const projectData = useQuery({
    queryKey: ['firebase-data', selectedProject],
    queryFn: () => fetchProjectData(selectedProject!),
    enabled: connected && !!selectedProject,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Mutations

  const connectGoogle = useMutation({
    mutationFn: async () => {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');

      // Set login hint for better UX
      if (user.email) {
        googleProvider.setCustomParameters({ login_hint: user.email });
      }

      let result;
      const isLinked = user.providerData.some(
        (p) => p.providerId === 'google.com',
      );

      if (isLinked) {
        result = await signInWithPopup(auth, googleProvider);
      } else {
        try {
          result = await linkWithPopup(user, googleProvider);
        } catch (err: unknown) {
          const code = (err as { code?: string }).code;
          if (
            code === 'auth/provider-already-linked' ||
            code === 'auth/credential-already-in-use'
          ) {
            result = await signInWithPopup(auth, googleProvider);
          } else {
            throw err;
          }
        }
      }

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (!token) throw new Error('Failed to get Google token');

      // Send token to server for encrypted storage
      const res = await fetch('/api/firebase/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleAccessToken: token }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to store connection');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firebase-connection'] });
      qc.invalidateQueries({ queryKey: ['firebase-projects'] });
    },
  });

  const selectProject = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch('/api/firebase/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedProject: projectId }),
      });
      if (!res.ok) throw new Error('Failed to select project');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firebase-connection'] });
      qc.invalidateQueries({ queryKey: ['firebase-data'] });
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/firebase/connect', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firebase-connection'] });
      qc.removeQueries({ queryKey: ['firebase-projects'] });
      qc.removeQueries({ queryKey: ['firebase-data'] });
    },
  });

  return {
    // status
    connected,
    selectedProject,
    connectionLoading: connection.isLoading,

    // projects
    projects: projects.data ?? [],
    projectsLoading: projects.isLoading,

    // data
    data: projectData.data ?? null,
    dataLoading: projectData.isLoading,
    dataError: projectData.error?.message ?? null,

    // mutations
    connectGoogle,
    selectProject,
    disconnect,

    // refresh all firebase data
    refresh: useCallback(async () => {
      await qc.refetchQueries({ queryKey: ['firebase-connection'] });
    }, [qc]),
  };
}
