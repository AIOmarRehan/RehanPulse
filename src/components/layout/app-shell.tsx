'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEventSource } from '@/hooks/use-event-source';
import {
  DashboardContent,
  GitHubContent,
  DeploymentsContent,
  FirebaseContent,
  AlertsContent,
} from '@/components/pages';
import { CommandPalette, type SpotlightAction } from '@/components/spotlight/command-palette';

const NAV_ITEMS = [
  { icon: '📊', label: 'Dashboard', id: 'dashboard' },
  { icon: '🐙', label: 'GitHub Activity', id: 'github' },
  { icon: '🚀', label: 'Deployments', id: 'deploys' },
  { icon: '🔥', label: 'Firebase', id: 'firebase' },
  { icon: '🔔', label: 'Alerts', id: 'alerts' },
] as const;

type NavId = (typeof NAV_ITEMS)[number]['id'];

export function AppShell() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const hasMounted = useRef(false);

  // Start SSE connection for real-time webhook events
  useEventSource();

  useEffect(() => {
    setMounted(true);
    // Set after first paint so subsequent renders use animations
    requestAnimationFrame(() => { hasMounted.current = true; });
  }, []);

  const handleCmdOpen = useCallback((v: boolean) => setCmdOpen(v), []);

  const spotlightActions = useMemo<SpotlightAction[]>(() => [
    // Navigation
    ...NAV_ITEMS.map((item) => ({
      id: `nav-${item.id}`,
      label: item.label,
      icon: item.icon,
      group: 'Navigation',
      keywords: item.label.toLowerCase(),
      onSelect: () => setActiveNav(item.id),
    })),
    // Actions
    {
      id: 'toggle-theme',
      label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: theme === 'dark' ? '☀️' : '🌙',
      group: 'Actions',
      keywords: 'theme dark light mode toggle',
      onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'toggle-sidebar',
      label: sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar',
      icon: '📐',
      group: 'Actions',
      keywords: 'sidebar panel toggle',
      onSelect: () => setSidebarOpen((o) => !o),
    },
    {
      id: 'sign-out',
      label: 'Sign Out',
      icon: '🚪',
      group: 'Account',
      keywords: 'logout sign out exit',
      onSelect: signOut,
    },
  ], [theme, setTheme, sidebarOpen, signOut]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0a0a1a]">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={hasMounted.current ? { width: 0, opacity: 0 } : false}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col border-r border-gray-200 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.02] backdrop-blur-xl"
          >
            {/* App logo */}
            <div className="flex items-center gap-2 px-5 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Rehan<span className="text-indigo-400">Pulse</span>
                </span>
              </div>
            </div>

            {/* Nav items */}
            <nav className="mt-2 flex-1 space-y-0.5 px-3">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                    activeNav === item.id
                      ? 'bg-gray-200 dark:bg-white/[0.08] text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.04] hover:text-gray-700 dark:hover:text-white/70'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                  {activeNav === item.id && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400"
                    />
                  )}
                </button>
              ))}
            </nav>

            {/* User section at bottom */}
            {user && (
              <div className="border-t border-gray-200 dark:border-white/[0.06] p-3">
                <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                  {user.photoURL && (
                    <Image
                      src={user.photoURL}
                      alt={user.displayName ?? 'User'}
                      width={32}
                      height={32}
                      className="rounded-full ring-2 ring-gray-300 dark:ring-white/10"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-700 dark:text-white/80">
                      {user.displayName}
                    </p>
                    <p className="truncate text-[10px] text-gray-400 dark:text-white/30">
                      {user.email}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top menubar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.02] px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white/60"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            {/* macOS traffic lights */}
            <div className="hidden items-center gap-1.5 md:flex">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]/60" />
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-white/30">
              {NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}
            </span>

            {/* Spotlight trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="ml-2 flex h-7 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 text-xs text-gray-400 transition-colors hover:bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/25 dark:hover:bg-white/[0.06]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden rounded border border-gray-200 bg-white px-1 py-0.5 font-mono text-[10px] dark:border-white/[0.08] dark:bg-white/[0.04] sm:inline-block">
                {mounted && typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white/60"
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

            {/* Sign out */}
            <button
              onClick={signOut}
              className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-500 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white/60"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            key={activeNav}
            initial={hasMounted.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25  }}
          >
            {activeNav === 'dashboard' && (
              <DashboardContent userName={user?.displayName?.split(' ')[0]} />
            )}
            {activeNav === 'github' && <GitHubContent />}
            {activeNav === 'deploys' && <DeploymentsContent />}
            {activeNav === 'firebase' && <FirebaseContent />}
            {activeNav === 'alerts' && <AlertsContent />}
          </motion.div>
        </main>
      </div>

      {/* Spotlight Command Palette */}
      <CommandPalette actions={spotlightActions} open={cmdOpen} onOpenChange={handleCmdOpen} />
    </div>
  );
}
