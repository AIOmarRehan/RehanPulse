'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEventSource } from '@/hooks/use-event-source';
import { useNotifications } from '@/hooks/use-alerts-data';
import type { Notification } from '@/hooks/use-alerts-data';
import {
  DashboardContent,
  GitHubContent,
  DeploymentsContent,
  FirebaseContent,
  AlertsContent,
  SettingsContent,
} from '@/components/pages';
import { CommandPalette, type SpotlightAction } from '@/components/spotlight/command-palette';

const NAV_ITEMS = [
  { icon: '📊', label: 'Dashboard', id: 'dashboard' },
  { icon: '🐙', label: 'GitHub Activity', id: 'github' },
  { icon: '🚀', label: 'Deployments', id: 'deploys' },
  { icon: '🔥', label: 'Firebase', id: 'firebase' },
  { icon: '🔔', label: 'Alerts', id: 'alerts' },
  { icon: '⚙️', label: 'Settings', id: 'settings' },
] as const;

type NavId = (typeof NAV_ITEMS)[number]['id'];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);

  // Start SSE connection for real-time webhook events
  useEventSource();

  // Notifications data
  const { data: notifsData, unreadCount, markRead, markAllRead } = useNotifications();
  const notifications = notifsData?.notifications ?? [];

  // Close notification dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

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
    <div className="relative flex h-screen overflow-hidden bg-[#f0f4ff] dark:bg-[#050608]">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={hasMounted.current ? { width: 0, opacity: 0 } : false}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex flex-col border-r border-white/[0.18] dark:border-white/[0.08] bg-white/55 dark:bg-white/[0.04] backdrop-blur-[28px] backdrop-saturate-[180%]"
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
            <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Main navigation">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                    activeNav === item.id
                      ? 'bg-white/60 dark:bg-white/[0.10] text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-white/40 hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white/70'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                  {item.id === 'alerts' && unreadCount > 0 && (
                    <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  {activeNav === item.id && item.id !== 'alerts' && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400"
                    />
                  )}
                  {activeNav === item.id && item.id === 'alerts' && unreadCount === 0 && (
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
              <div className="border-t border-white/[0.18] dark:border-white/[0.08] p-3">
                <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                  {user.photoURL && (
                    <Image
                      src={user.photoURL}
                      alt={user.displayName ?? 'User'}
                      width={32}
                      height={32}
                      className="rounded-full ring-2 ring-white/60 dark:ring-white/10"
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
                <div className="mt-1 flex gap-3 px-3 text-[10px] text-gray-400 dark:text-white/25">
                  <a href="/policy" className="transition-colors hover:text-gray-600 dark:hover:text-white/50">Privacy</a>
                  <a href="/terms" className="transition-colors hover:text-gray-600 dark:hover:text-white/50">Terms</a>
                  <a href="/home" className="transition-colors hover:text-gray-600 dark:hover:text-white/50">Homepage</a>
                </div>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top menubar */}
        <header className="relative z-40 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.18] dark:border-white/[0.08] bg-white/55 dark:bg-white/[0.04] px-4 backdrop-blur-[28px] backdrop-saturate-[180%]">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 dark:text-white/40 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white/60"
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
              aria-label="Open command palette"
              className="ml-2 flex h-7 items-center gap-2 rounded-lg border border-white/[0.18] bg-white/40 px-2.5 text-xs text-gray-400 transition-colors hover:bg-white/60 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/25 dark:hover:bg-white/[0.08]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden rounded border border-white/[0.18] bg-white/60 px-1 py-0.5 font-mono text-[10px] dark:border-white/[0.08] dark:bg-white/[0.04] sm:inline-block">
                {mounted && typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 dark:text-white/40 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white/60"
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

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                className="relative flex h-7 w-7 items-center justify-center rounded-md text-gray-500 dark:text-white/40 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white/60"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-9 z-[60] w-80 overflow-hidden rounded-xl border border-white/[0.18] bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-white/[0.10] dark:bg-[#0c0c1d] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
                  >
                    <div className="flex items-center justify-between border-b border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-white/[0.03] px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllRead.mutate()}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-white/10">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-gray-400 dark:text-white/30">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((n: Notification) => {
                          const dotColor = n.severity === 'error' ? 'bg-red-400' :
                            n.severity === 'warning' ? 'bg-yellow-400' :
                            n.severity === 'success' ? 'bg-emerald-400' : 'bg-blue-400';
                          return (
                            <button
                              key={n.id}
                              onClick={() => { if (!n.read) markRead.mutate(n.id); }}
                              className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-white/50 dark:hover:bg-white/[0.06] ${n.read ? 'opacity-50' : ''}`}
                            >
                              <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-xs text-gray-900 dark:text-white">{n.message}</p>
                                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-white/25">
                                  {n.eventType} · {timeAgo(n.createdAt)}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="border-t border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-white/[0.03] px-4 py-2">
                        <button
                          onClick={() => { setNotifOpen(false); setActiveNav('alerts'); }}
                          className="w-full text-center text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          View all in Alerts
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sign out */}
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-500 dark:text-white/40 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white/60"
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
        <main className="relative z-10 flex-1 overflow-y-auto p-6" role="main">
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
            {activeNav === 'settings' && <SettingsContent />}
          </motion.div>
        </main>
      </div>

      {/* Spotlight Command Palette */}
      <CommandPalette actions={spotlightActions} open={cmdOpen} onOpenChange={handleCmdOpen} />
    </div>
  );
}
