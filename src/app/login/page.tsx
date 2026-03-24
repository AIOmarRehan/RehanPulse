'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { AnimatedBackground } from '@/components/ui/animated-background';

function MacOSSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0a0a1a]">
      <div className="relative h-8 w-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-0 h-full w-full"
            style={{
              transform: `rotate(${i * 30}deg)`,
              animation: `macos-fade 1.2s ${(i * 0.1).toFixed(1)}s infinite linear`,
              opacity: 0,
            }}
          >
            <div className="mx-auto h-[26%] w-[8%] rounded-full bg-gray-400 dark:bg-white/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginContent() {
  const { user, loading, signInWithGitHub } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [signingIn, setSigningIn] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const redirectingRef = useRef(false);

  const redirect = searchParams.get('redirect') ?? '/';

  useEffect(() => setMounted(true), []);

  // If user already has Firebase auth state, ensure session cookie exists then redirect
  useEffect(() => {
    if (!loading && user && !redirectingRef.current) {
      redirectingRef.current = true;
      setRedirecting(true);
      user
        .getIdToken(true)
        .then((idToken) =>
          fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          }),
        )
        .then((res) => {
          if (res.ok) {
            router.push(redirect);
          } else {
            redirectingRef.current = false;
            setRedirecting(false);
          }
        })
        .catch(() => {
          redirectingRef.current = false;
          setRedirecting(false);
        });
    }
  }, [user, loading, redirect, router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    const success = await signInWithGitHub();
    if (success) {
      setRedirecting(true);
      router.push(redirect);
      return;
    } else {
      setError('Sign-in failed. Please try again.');
      setSigningIn(false);
    }
  };

  // Show macOS loading spinner while Firebase auth state is loading or navigating away
  if (loading || redirecting) {
    return <MacOSSpinner />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 dark:bg-[#0a0a1a]">
      {mounted && theme === 'dark' && <AnimatedBackground />}

      {/* Theme toggle */}
      {mounted && (
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="absolute right-6 top-6 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-gray-500 dark:text-white/50 backdrop-blur-md transition-all hover:bg-gray-100 dark:hover:bg-white/[0.1] hover:text-gray-700 dark:hover:text-white/80"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      )}

      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/10 dark:bg-indigo-600/20 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-teal-500/10 dark:bg-teal-500/15 blur-[100px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/5 dark:bg-violet-500/10 blur-[80px]" />

      {/* Login card */}
      <motion.div
        initial={mounted ? { opacity: 0, y: 20, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* macOS window chrome */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white/90 dark:bg-white/[0.04] shadow-xl shadow-gray-200/50 dark:shadow-black/40 backdrop-blur-xl">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-white/[0.06] px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-xs font-medium text-gray-400 dark:text-white/30">
              RehanPulse — Sign In
            </span>
          </div>

          {/* Content */}
          <div className="flex flex-col items-center gap-8 px-8 py-10">
            {/* Logo */}
            <motion.div
              initial={mounted ? { opacity: 0, scale: 0.8 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
                <svg
                  viewBox="0 0 24 24"
                  className="h-8 w-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  Rehan<span className="text-indigo-400">Pulse</span>
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
                  Developer Activity Command Center
                </p>
              </div>
            </motion.div>

            {/* Divider */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-300 dark:via-white/10 to-transparent" />

            {/* Sign in button */}
            <motion.div
              initial={mounted ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex w-full flex-col items-center gap-4"
            >
              <p className="text-center text-sm text-gray-500 dark:text-white/50">
                Sign in with your GitHub account to monitor your repositories,
                deployments, and metrics.
              </p>

              <button
                onClick={handleSignIn}
                disabled={signingIn || redirecting}
                className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-6 py-3.5 text-sm font-medium text-gray-900 dark:text-white transition-all hover:border-gray-300 dark:hover:border-white/[0.15] hover:bg-gray-50 dark:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {signingIn ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 dark:border-white/20 border-t-gray-900 dark:border-t-white" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 transition-transform group-hover:scale-110"
                    fill="currentColor"
                  >
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                )}
                {signingIn ? 'Signing in...' : 'Continue with GitHub'}
              </button>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-red-400"
                >
                  {error}
                </motion.p>
              )}
            </motion.div>

            {/* Features preview */}
            <div className="grid w-full grid-cols-3 gap-3">
              {[
                { icon: '📊', label: 'GitHub Activity' },
                { icon: '🚀', label: 'Deployments' },
                { icon: '🔥', label: 'Firebase Metrics' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-2 py-3 text-center"
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[10px] font-medium text-gray-500 dark:text-white/40">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-white/[0.06] px-8 py-4">
            <p className="text-center text-[10px] text-gray-400 dark:text-white/25">
              Built with Next.js, Firebase & Tailwind CSS
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<MacOSSpinner />}
    >
      <LoginContent />
    </Suspense>
  );
}
