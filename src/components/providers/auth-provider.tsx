'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth, githubProvider } from '@/lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGitHub: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    // Safety timeout — if Firebase never responds, stop loading after 3s
    const timeout = setTimeout(() => setLoading(false), 3000);
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signInWithGitHub = useCallback(async (): Promise<boolean> => {
    try {
      const result = await signInWithPopup(auth, githubProvider);

      // Extract the GitHub access token from the OAuth credential
      const { OAuthProvider } = await import('firebase/auth');
      const credential = OAuthProvider.credentialFromResult(result);
      const githubAccessToken = credential?.accessToken;

      // Get the Firebase ID token
      const idToken = await result.user.getIdToken();

      // Send both to our API to create a session cookie + encrypt & store the GitHub token
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, githubAccessToken }),
      });

      return res.ok;
    } catch (error) {
      console.error('GitHub sign-in failed:', error);
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await fbSignOut(auth); } catch { /* continue */ }
    try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { /* continue */ }
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGitHub, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
