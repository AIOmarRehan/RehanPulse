'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import { ChatPanel } from '@/components/chat/chat-panel';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const NAV_ITEMS = [
  { darkIcon: '/macos-icons/activity-timeline.png', lightIcon: '/macos-icons/activity-timeline.png', label: 'Dashboard', id: 'dashboard' },
  { darkIcon: '/macos-icons/github_darkmode.png', lightIcon: '/macos-icons/github_lightmode.png', label: 'GitHub Activity', id: 'github' },
  { darkIcon: '/macos-icons/deploy_darkmode.png', lightIcon: '/macos-icons/deploy_lightmode.png', label: 'Vercel Deployments', id: 'deploys' },
  { darkIcon: '/macos-icons/firebase.png', lightIcon: '/macos-icons/firebase.png', label: 'Firebase', id: 'firebase' },
  { darkIcon: '/macos-icons/smartalerts_darkmode.png', lightIcon: '/macos-icons/smartalerts_lightmode.png', label: 'Alerts', id: 'alerts' },
  { darkIcon: '/macos-icons/settings-darkmode.png', lightIcon: '/macos-icons/settings-lightmode.png', label: 'Settings', id: 'settings' },
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
  const router = useRouter();
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarLottiePop, setSidebarLottiePop] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);

  // Start SSE connection for real-time webhook events
  useEventSource();

  // Notifications data
  const { data: notifsData, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const notifications = useMemo(() => notifsData?.notifications ?? [], [notifsData]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Group notifications by groupKey — ungrouped items remain standalone
  type NotifGroup = { key: string; title: string; items: Notification[] } | { key: null; item: Notification };
  const groupedNotifications = useMemo(() => {
    const groups: NotifGroup[] = [];
    const keyMap = new Map<string, { title: string; items: Notification[] }>();
    const order: (string | Notification)[] = [];

    for (const n of notifications) {
      if (n.groupKey) {
        let g = keyMap.get(n.groupKey);
        if (!g) {
          g = { title: n.groupTitle ?? n.groupKey, items: [] };
          keyMap.set(n.groupKey, g);
          order.push(n.groupKey);
        }
        g.items.push(n);
      } else {
        order.push(n);
      }
    }

    for (const entry of order) {
      if (typeof entry === 'string') {
        const g = keyMap.get(entry);
        if (g && g.items.length > 0) {
          groups.push({ key: entry, title: g.title, items: g.items });
          keyMap.delete(entry); // prevent duplicates
        }
      } else {
        groups.push({ key: null, item: entry });
      }
    }
    return groups.slice(0, 15);
  }, [notifications]);

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

  // Auto-close sidebar on mobile
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleCmdOpen = useCallback((v: boolean) => setCmdOpen(v), []);

  const handleNavClick = useCallback((id: NavId) => {
    setActiveNav(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const spotlightActions = useMemo<SpotlightAction[]>(() => [
    // Navigation
    ...NAV_ITEMS.map((item) => ({
      id: `nav-${item.id}`,
      label: item.label,
      icon: <img src={item.lightIcon} alt={item.label} width={16} height={16} className="h-4 w-4" />,
      group: 'Navigation',
      keywords: item.label.toLowerCase(),
      onSelect: () => setActiveNav(item.id),
    })),
    // Actions
    {
      id: 'toggle-theme',
      label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      ),
      group: 'Actions',
      keywords: 'theme dark light mode toggle',
      onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'toggle-sidebar',
      label: sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar',
      icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>,
      group: 'Actions',
      keywords: 'sidebar panel toggle',
      onSelect: () => setSidebarOpen((o) => !o),
    },
    {
      id: 'sign-out',
      label: 'Sign Out',
      icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
      group: 'Account',
      keywords: 'logout sign out exit',
      onSelect: signOut,
    },
    {
      id: 'open-chat',
      label: 'Open AI Chat',
      icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
      group: 'Actions',
      keywords: 'ai chat pulse assistant chatbot',
      onSelect: () => setChatOpen(true),
    },
  ], [theme, setTheme, sidebarOpen, signOut]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#050608]">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          />
          <motion.aside
            initial={hasMounted.current ? { x: -240, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 left-0 z-50 md:relative md:z-10 flex w-[240px] flex-col border-r border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
          >
            {/* App logo */}
            <button
              onClick={() => {
                setSidebarLottiePop(true);
                setTimeout(() => {
                  setSidebarLottiePop(false);
                  router.push('/home');
                }, 2000);
              }}
              className="flex items-center gap-2 px-5 py-4 transition-transform hover:scale-[1.05] active:scale-[0.95]"
            >
              {sidebarLottiePop ? (
                <div className="h-8 w-8" style={{ filter: 'brightness(0) saturate(100%) invert(34%) sepia(25%) saturate(1800%) hue-rotate(207deg) brightness(88%) contrast(88%)' }}>
                  <DotLottieReact src="/animated-icons/pulse.lottie" autoplay loop style={{ width: 32, height: 32 }} />
                </div>
              ) : (
                <Image
                  src="/icons/web-app-manifest-512x512.png"
                  alt="RehanPulse"
                  width={32}
                  height={32}
                />
              )}
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Rehan<span className="text-indigo-400">Pulse</span>
                </span>
              </div>
            </button>

            {/* Nav items */}
            <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Main navigation">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                    activeNav === item.id
                      ? 'bg-white/60 dark:bg-white/[0.10] text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-white/40 hover:bg-white/50 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white/70'
                  }`}
                >
                  <img
                    src={item.darkIcon}
                    alt={item.label}
                    width={20}
                    height={20}
                    className="hidden h-5 w-5 dark:block"
                  />
                  <img
                    src={item.lightIcon}
                    alt={item.label}
                    width={20}
                    height={20}
                    className="block h-5 w-5 dark:hidden"
                  />
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
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top menubar */}
        <header className="relative z-40 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 px-4 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]">
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
              className="ml-2 flex h-7 items-center gap-2 rounded-lg border border-white/[0.85] bg-white/40 backdrop-blur-sm px-2.5 text-xs text-black/60 transition-colors hover:bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/[0.08] dark:bg-[#0c0c1d]/60 dark:text-white/25 dark:hover:bg-white/[0.08] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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
                    className="absolute right-0 top-9 z-[60] w-80 overflow-hidden rounded-xl border border-white/[0.85] bg-white/60 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/[0.08] dark:bg-[#0c0c1d]/70 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] [isolation:isolate]"
                  >
                    <div className="flex items-center justify-between border-b border-white/[0.3] dark:border-white/[0.08] bg-white/30 backdrop-blur-xl dark:bg-white/[0.03] px-4 py-2.5">
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
                        groupedNotifications.map((entry) => {
                          if (entry.key === null) {
                            // Standalone notification (no group)
                            const n = (entry as { key: null; item: Notification }).item;
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
                                    {n.severity} &middot; {n.eventType} &middot; {timeAgo(n.createdAt)}
                                  </p>
                                </div>
                              </button>
                            );
                          }

                          // Grouped notification
                          const g = entry as { key: string; title: string; items: Notification[] };
                          const isExpanded = expandedGroups.has(g.key);
                          const worstSeverity = g.items.some((i) => i.severity === 'error') ? 'error'
                            : g.items.some((i) => i.severity === 'warning') ? 'warning'
                            : g.items.some((i) => i.severity === 'success') ? 'success' : 'info';
                          const parentDot = worstSeverity === 'error' ? 'bg-red-400' :
                            worstSeverity === 'warning' ? 'bg-yellow-400' :
                            worstSeverity === 'success' ? 'bg-emerald-400' : 'bg-blue-400';
                          const allRead = g.items.every((i) => i.read);

                          return (
                            <div key={g.key}>
                              {/* Parent row */}
                              <button
                                onClick={() => toggleGroup(g.key)}
                                className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-white/50 dark:hover:bg-white/[0.06] ${allRead ? 'opacity-50' : ''}`}
                              >
                                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${parentDot}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{g.title}</p>
                                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-white/25">
                                    {g.items.length} event{g.items.length > 1 ? 's' : ''} &middot; {timeAgo(g.items[0]!.createdAt)}
                                  </p>
                                </div>
                                <svg
                                  viewBox="0 0 24 24"
                                  className={`mt-1 h-3 w-3 shrink-0 text-gray-400 dark:text-white/25 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>

                              {/* Children with connecting pipe */}
                              {isExpanded && (
                                <div className="relative ml-[22px] border-l-2 border-gray-200 dark:border-white/10">
                                  {g.items.map((n) => {
                                    const dotColor = n.severity === 'error' ? 'bg-red-400' :
                                      n.severity === 'warning' ? 'bg-yellow-400' :
                                      n.severity === 'success' ? 'bg-emerald-400' : 'bg-blue-400';
                                    return (
                                      <button
                                        key={n.id}
                                        onClick={() => { if (!n.read) markRead.mutate(n.id); }}
                                        className={`relative flex w-full items-start gap-2.5 py-2 pl-4 pr-4 text-left transition-colors hover:bg-white/50 dark:hover:bg-white/[0.06] ${n.read ? 'opacity-50' : ''}`}
                                      >
                                        {/* Horizontal connector from pipe */}
                                        <div className="absolute left-0 top-[14px] h-px w-3 bg-gray-200 dark:bg-white/10" />
                                        <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                                        <div className="flex-1 min-w-0">
                                          <p className="truncate text-[11px] text-gray-700 dark:text-white/80">{n.message}</p>
                                          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-white/25">
                                            {n.severity} &middot; {n.eventType} &middot; {timeAgo(n.createdAt)}
                                          </p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="border-t border-white/[0.3] dark:border-white/[0.08] bg-white/30 backdrop-blur-xl dark:bg-white/[0.03] px-4 py-2 flex items-center justify-between">
                        <button
                          onClick={() => { setNotifOpen(false); setActiveNav('alerts'); }}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          View all in Alerts
                        </button>
                        {!clearConfirm ? (
                          <button
                            onClick={() => setClearConfirm(true)}
                            className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                          >
                            Clear all
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setClearConfirm(false)}
                              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-white/50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => { clearAll.mutate(); setClearConfirm(false); setNotifOpen(false); }}
                              className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors"
                            >
                              Confirm
                            </button>
                          </div>
                        )}
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

      {/* AI Chat */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Open AI chat"
          className="fixed bottom-4 right-4 z-[70] flex h-11 w-11 items-center justify-center rounded-full bg-[#7079CD] text-white shadow-lg shadow-[#7079CD]/25 transition-all hover:scale-105 hover:shadow-[#7079CD]/40 active:scale-95 overflow-hidden"
        >
          <div style={{ filter: 'brightness(0) invert(1)' }}>
            <DotLottieReact
              src="/animated-icons/pulse.lottie"
              loop
              autoplay
              style={{ width: 26, height: 26 }}
            />
          </div>
        </button>
      )}
    </div>
  );
}
