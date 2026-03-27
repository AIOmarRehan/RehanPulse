'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useAuth } from '@/components/providers/auth-provider';

const AnimatedBackground = dynamic(
  () => import('@/components/ui/animated-background').then((m) => m.AnimatedBackground),
  { ssr: false }
);

/* ─── Animation Presets ─── */
const ease = [0.22, 1, 0.36, 1] as const;
const stagger = { animate: { transition: { staggerChildren: 0.08 } } };

/* ─── Auto-typing Sentences ─── */
const HERO_SENTENCES: [string, string][] = [
  ['Every commit. Every deploy.', ' One command center.'],
  ['Know exactly what your code is doing', ' — in real time.'],
  ['All your developer signals.', ' One real-time dashboard.'],
  ['From GitHub to production', ' — fully visible.'],
  ['Your codebase,', ' live and fully observable.'],
];

function useTypewriter(sentences: [string, string][], typingSpeed = 45, deletingSpeed = 25, pauseTime = 2200) {
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const fullText = sentences[sentenceIndex]![0] + sentences[sentenceIndex]![1];
  const splitPoint = sentences[sentenceIndex]![0].length;

  useEffect(() => {
    if (!isDeleting && charIndex === fullText.length) {
      const timeout = setTimeout(() => setIsDeleting(true), pauseTime);
      return () => clearTimeout(timeout);
    }
    if (isDeleting && charIndex === 0) {
      setIsDeleting(false);
      setSentenceIndex((prev) => (prev + 1) % sentences.length);
      return;
    }
    const speed = isDeleting ? deletingSpeed : typingSpeed;
    const timeout = setTimeout(() => {
      setCharIndex((prev) => prev + (isDeleting ? -1 : 1));
    }, speed);
    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, fullText.length, sentences.length, typingSpeed, deletingSpeed, pauseTime]);

  const displayed = fullText.slice(0, charIndex);
  const firstPart = displayed.slice(0, Math.min(charIndex, splitPoint));
  const secondPart = charIndex > splitPoint ? displayed.slice(splitPoint) : '';

  return { firstPart, secondPart };
}

/* ─── Cursor Glow Hook ─── */
function useCursorGlow(ref: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, [ref]);
  return pos;
}

/* ─── Mocked Dashboard Preview ─── */
const DEMO_TABS = ['Dashboard', 'GitHub', 'Deployments', 'Usage'] as const;

function DemoSlide({ tab }: { tab: typeof DEMO_TABS[number] }) {
  if (tab === 'Dashboard') {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Commits Today', value: '14', color: 'text-indigo-400' },
          { label: 'Open PRs', value: '3', color: 'text-emerald-400' },
          { label: 'Deployments', value: '7', color: 'text-blue-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] p-3">
            <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-black dark:text-white/30">{s.label}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-xl bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] p-3">
          <p className="text-[10px] font-semibold text-black dark:text-white/40 mb-2">Activity</p>
          <div className="flex items-end gap-1.5 h-16">
            {[40, 65, 50, 80, 45, 70, 90].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ delay: 0.3 + i * 0.05, duration: 0.5, ease }}
                className="flex-1 rounded-t bg-gradient-to-t from-indigo-500/40 to-indigo-400/20"
              />
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] p-3">
          <p className={`text-xl font-semibold text-amber-400`}>98.2%</p>
          <p className="text-[10px] text-black dark:text-white/30">Success Rate</p>
        </div>
      </div>
    );
  }
  if (tab === 'GitHub') {
    return (
      <div className="space-y-2">
        {[
          { sha: 'a1b2c3d', msg: 'feat: add usage widget', time: '2h ago', repo: 'RehanPulse' },
          { sha: 'e4f5g6h', msg: 'fix: auth redirect loop', time: '5h ago', repo: 'RehanPulse' },
          { sha: 'i7j8k9l', msg: 'chore: update deps', time: '1d ago', repo: 'portfolio' },
          { sha: 'm0n1o2p', msg: 'feat: dark mode support', time: '2d ago', repo: 'RehanPulse' },
        ].map((c) => (
          <div key={c.sha} className="flex items-center gap-3 rounded-lg bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] px-3 py-2">
            <span className="font-mono text-[10px] text-indigo-400">{c.sha}</span>
            <span className="truncate text-xs text-black dark:text-white/60">{c.msg}</span>
            <span className="ml-auto shrink-0 text-[10px] text-black dark:text-white/25">{c.repo} · {c.time}</span>
          </div>
        ))}
      </div>
    );
  }
  if (tab === 'Deployments') {
    return (
      <div className="space-y-2">
        {[
          { name: 'my-app', state: 'Ready', branch: 'main', env: 'Production', time: '10m ago', dot: 'bg-emerald-400' },
          { name: 'my-app', state: 'Building', branch: 'feat/widgets', env: 'Preview', time: 'now', dot: 'bg-yellow-400 animate-pulse' },
          { name: 'portfolio', state: 'Ready', branch: 'main', env: 'Production', time: '3h ago', dot: 'bg-emerald-400' },
        ].map((d, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] px-3 py-2.5">
            <div className={`h-2 w-2 rounded-full ${d.dot}`} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-black dark:text-white/70">{d.name}</span>
              <div className="flex gap-2 text-[10px] text-black dark:text-white/30">
                <span>{d.env}</span><span>·</span><span>{d.branch}</span><span>·</span><span>{d.state}</span><span>·</span><span>{d.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  // Usage
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Requests', value: '24.3K', color: 'text-blue-400' },
        { label: 'Bandwidth', value: '1.2 GB', color: 'text-indigo-400' },
        { label: 'Build Min', value: '47', color: 'text-amber-400' },
        { label: 'Functions', value: '0.018 GB-hr', color: 'text-emerald-400' },
        { label: 'Cache Reads', value: '4.2 MB', color: 'text-cyan-400' },
        { label: 'Plan', value: 'Hobby', color: 'text-purple-400' },
      ].map((m) => (
        <div key={m.label} className="rounded-xl bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] p-3">
          <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
          <p className="text-[10px] text-black dark:text-white/30">{m.label}</p>
        </div>
      ))}
    </div>
  );
}

function DashboardPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouse = useCursorGlow(containerRef);
  const [activeTab, setActiveTab] = useState<typeof DEMO_TABS[number]>('Dashboard');



  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-3xl"
      style={{
        transform: `perspective(1200px) rotateX(${(mouse.y - 200) * 0.008}deg) rotateY(${(mouse.x - 400) * -0.008}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      {/* Glow */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-40 blur-xl"
        style={{
          background: `radial-gradient(600px circle at ${mouse.x}px ${mouse.y}px, rgba(99,102,241,0.15), transparent 40%)`,
        }}
      />

      <div className="overflow-hidden rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 shadow-[0_8px_32px_rgba(100,120,200,0.14),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[28px] backdrop-saturate-[180%]">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-white/[0.18] dark:border-white/[0.06] px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 text-xs font-medium text-black dark:text-white/30">RehanPulse — Dashboard</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/[0.18] dark:border-white/[0.06] px-4 pt-2">
          {DEMO_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab ? 'text-black dark:text-white' : 'text-black dark:text-white/30 hover:text-black dark:hover:text-white/50'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="demo-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-px bg-indigo-400"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 min-h-[220px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease }}
            >
              <DemoSlide tab={activeTab} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ─── Feature Card ─── */
function FeatureCard({ darkIcon, lightIcon, title, desc, index }: { darkIcon: string; lightIcon: string; title: string; desc: string; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouse = useCursorGlow(cardRef);

  return (
    <motion.div
      ref={cardRef}
      variants={{ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.08, ease } } }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] p-6 shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] transition-shadow hover:shadow-lg hover:shadow-indigo-500/5"
    >
      {/* Cursor light */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(400px circle at ${mouse.x}px ${mouse.y}px, rgba(99,102,241,0.08), transparent 40%)`,
        }}
      />
      <div className="relative">
        <img src={darkIcon} alt={title} width={32} height={32} className="hidden h-8 w-8 dark:block" />
        <img src={lightIcon} alt={title} width={32} height={32} className="block h-8 w-8 dark:hidden" />
        <h3 className="mt-3 text-sm font-semibold text-black dark:text-white">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-black dark:text-white/40">{desc}</p>
      </div>
    </motion.div>
  );
}

/* ─── Section Wrapper ─── */
function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease }}
      className={`relative mx-auto max-w-5xl px-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/* ─── Step (How It Works) ─── */
function Step({ num, title, desc, isLast }: { num: number; title: string; desc: string; isLast: boolean }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -24 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5, ease }}
      className="relative flex gap-5"
    >
      {/* Line + dot */}
      <div className="flex flex-col items-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={inView ? { scale: 1 } : {}}
          transition={{ duration: 0.3, delay: 0.1, ease }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 dark:bg-indigo-500/30 text-sm font-bold text-black dark:text-white ring-2 ring-indigo-500/20 dark:ring-indigo-400/40"
        >
          {num}
        </motion.div>
        {!isLast && (
          <motion.div
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2, ease }}
            className="w-px flex-1 origin-top bg-gradient-to-b from-indigo-500/30 to-transparent"
          />
        )}
      </div>
      <div className="pb-10">
        <div className="rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_4px_20px_rgba(100,120,200,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] px-5 py-4">
          <h3 className="text-sm font-semibold text-black dark:text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-black dark:text-white/40">{desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Why Bullet ─── */
function WhyBullet({ text, index }: { text: string; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.li
      ref={ref}
      initial={{ opacity: 0, x: -16 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.4, delay: index * 0.1, ease }}
      className="flex items-center gap-3 text-sm text-black dark:text-white/50 rounded-xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_4px_20px_rgba(100,120,200,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.15)] px-4 py-3"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 dark:text-emerald-400">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {text}
    </motion.li>
  );
}

/* ═══════════════════════════════════════════════════
   Homepage
   ═══════════════════════════════════════════════════ */
export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const goLogin = useCallback(() => router.push('/login'), [router]);
  const goDashboard = useCallback(() => router.push('/'), [router]);

  const { firstPart, secondPart } = useTypewriter(HERO_SENTENCES);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f5f5f7] dark:bg-[#050608] text-black dark:text-white">
      {/* Three.js particle background (both themes) */}
      {mounted && <AnimatedBackground />}

      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.18] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25)]" aria-label="Main navigation">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/icons/web-app-manifest-512x512.png"
              alt="RehanPulse"
              width={32}
              height={32}
              className="rounded-lg shadow-sm shadow-indigo-500/25"
            />
            <span className="text-sm font-semibold tracking-tight">Rehan<span className="text-indigo-400">Pulse</span></span>
          </div>

          <div className="hidden items-center gap-6 text-xs text-black dark:text-white/40 sm:flex">
            <a href="#features" className="transition-colors hover:text-black dark:hover:text-white/80">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-black dark:hover:text-white/80">How It Works</a>
            <a href="#demo" className="transition-colors hover:text-black dark:hover:text-white/80">Demo</a>
          </div>

          <div className="flex items-center gap-3">
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.85] dark:border-white/[0.12] bg-white/40 dark:bg-[#0c0c1d]/60 text-black dark:text-white/50 backdrop-blur-[28px] transition-all hover:bg-white/80 dark:hover:bg-white/[0.12]"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                )}
              </button>
            )}
            {user ? (
              <button
                onClick={goDashboard}
                className="flex items-center gap-2 rounded-lg border border-white/[0.85] dark:border-white/[0.12] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-3 py-1.5 text-xs font-medium text-black dark:text-white/70 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-white/[0.12] hover:scale-[1.02] active:scale-[0.98]"
              >
                {user.photoURL && (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName ?? 'User'}
                    width={20}
                    height={20}
                    className="rounded-full"
                  />
                )}
                Dashboard
              </button>
            ) : (
              <button
                onClick={goLogin}
                className="rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm shadow-indigo-500/25 transition-all hover:bg-indigo-600 hover:shadow-md hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <div>
        <section className="relative pb-20 pt-36 sm:pt-44">
          {/* Gradient orbs */}
          <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/10 dark:bg-indigo-600/15 blur-[120px]" />
          <div className="pointer-events-none absolute -right-32 top-20 h-80 w-80 rounded-full bg-violet-500/10 dark:bg-violet-500/10 blur-[100px]" />

          <div className="mx-auto max-w-5xl px-6 text-center">
            <div className="mx-auto mb-8 max-w-3xl rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] px-10 py-8">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Your Developer Activity,{' '}
                <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
                  One Command Center
                </span>
              </h1>
            </motion.div>

            {/* Auto-typing sentences */}
            <div className="mt-4 min-h-[2rem] sm:min-h-[2rem] text-center">
              <span className="text-base font-medium text-black dark:text-white/60 sm:text-lg">{firstPart}</span>
              <span className="text-base font-medium sm:text-lg" style={{ color: '#7E5FF4' }}>{secondPart}</span>
              <span className="ml-0.5 inline-block w-[2px] h-5 bg-[#7E5FF4] animate-pulse align-middle" />
            </div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease }}
              className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-black dark:text-white/45 sm:text-base"
            >
              Track GitHub activity, deployments, and backend metrics in real time — all from one clean, unified dashboard.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease }}
              className="mt-8 flex justify-center gap-4"
            >
              <button
                onClick={user ? goDashboard : goLogin}
                className="group relative inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-600 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.03] active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                {user ? 'Go to Dashboard' : 'Get Started'}
                {/* Glow pulse */}
                <span className="absolute inset-0 -z-10 rounded-xl bg-indigo-400/20 blur-xl transition-opacity group-hover:opacity-75 opacity-0 animate-pulse" />
              </button>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.85] dark:border-white/[0.12] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-6 py-3 text-sm font-medium text-black dark:text-white/70 transition-all hover:bg-white/80 dark:hover:bg-white/[0.12] hover:scale-[1.03] active:scale-[0.98]"
              >
                View Demo
              </a>
            </motion.div>
            </div>
          </div>

        </section>
      </div>

      {/* ─── Features ─── */}
      <Section className="py-24" >
        <div id="features" className="scroll-mt-20">
          <div className="text-center mb-12 mx-auto max-w-2xl rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] px-8 py-6">
            <h2 className="text-2xl font-bold sm:text-3xl">Everything you need, <span className="text-indigo-400">in one place</span></h2>
            <p className="mt-3 text-sm text-black dark:text-white/40">Built for developers who ship fast and want to stay informed.</p>
          </div>

          <motion.div
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-80px' }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[
              { darkIcon: '/macos-icons/github_darkmode.png', lightIcon: '/macos-icons/github_lightmode.png', title: 'GitHub Activity', desc: 'Track commits, pull requests, and CI status in one place.' },
              { darkIcon: '/macos-icons/deploy_darkmode.png', lightIcon: '/macos-icons/deploy_lightmode.png', title: 'Deployment Monitoring', desc: 'Stay updated with live deployment states and logs.' },
              { darkIcon: '/macos-icons/firebase.png', lightIcon: '/macos-icons/firebase.png', title: 'Firebase Metrics', desc: 'Monitor reads, writes, and authentication events.' },
              { darkIcon: '/macos-icons/realtimeupdates-darkmode.png', lightIcon: '/macos-icons/realtimeupdates-lightmode.png', title: 'Real-Time Updates', desc: 'Instant updates powered by Server-Sent Events — no polling.' },
              { darkIcon: '/macos-icons/smartalerts_darkmode.png', lightIcon: '/macos-icons/smartalerts_lightmode.png', title: 'Smart Alerts', desc: 'Get notified instantly when deployments fail or errors spike.' },
              { darkIcon: '/macos-icons/vercel.png', lightIcon: '/macos-icons/vercel.png', title: 'Vercel Usage Analytics', desc: 'Track bandwidth, build minutes, and function usage at a glance.' },
            ].map((f, i) => (
              <FeatureCard key={f.title} darkIcon={f.darkIcon} lightIcon={f.lightIcon} title={f.title} desc={f.desc} index={i} />
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ─── How It Works ─── */}
      <Section className="py-24">
        <div id="how-it-works" className="scroll-mt-20">
          <div className="text-center mb-12 mx-auto max-w-2xl rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] px-8 py-6">
            <h2 className="text-2xl font-bold sm:text-3xl">How it works</h2>
            <p className="mt-3 text-sm text-black dark:text-white/40">Three steps to full visibility.</p>
          </div>

          <div className="mx-auto max-w-md">
            {[
              { title: 'Connect your services', desc: 'Link your GitHub, Vercel, and Firebase accounts.' },
              { title: 'RehanPulse listens', desc: 'Events are collected and processed in real time.' },
              { title: 'Stay in control', desc: 'View everything from a single, unified dashboard.' },
            ].map((s, i, arr) => (
              <Step key={s.title} num={i + 1} title={s.title} desc={s.desc} isLast={i === arr.length - 1} />
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Why RehanPulse ─── */}
      <Section className="py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] px-8 py-6">
              <h2 className="text-2xl font-bold sm:text-3xl">Why <span className="text-indigo-400">RehanPulse</span>?</h2>
              <p className="mt-3 text-sm text-black dark:text-white/40">Focus on building. Let us handle the monitoring.</p>
            </div>
            <ul className="mt-8 space-y-4">
              {[
                'Built for developers who value clarity',
                'Reduces context switching between tools',
                'Real-time visibility into your workflow',
                'Lightweight, fast, and efficient',
              ].map((t, i) => (
                <WhyBullet key={t} text={t} index={i} />
              ))}
            </ul>
          </div>

          {/* Tech visual */}
          <div className="flex flex-wrap justify-center gap-3">
            {['Next.js', 'React', 'TypeScript', 'Tailwind', 'Firebase', 'Framer Motion', 'Vercel'].map((t, i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4, ease }}
                className="rounded-full border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-4 py-2 text-xs font-medium text-black dark:text-white/50 transition-all hover:border-indigo-400/40 hover:text-indigo-500 dark:hover:text-indigo-400"
              >
                {t}
              </motion.span>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Demo Section ─── */}
      <Section className="py-24">
        <div id="demo" className="scroll-mt-20">
          <div className="text-center mb-12 mx-auto max-w-2xl rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] px-8 py-6">
            <h2 className="text-2xl font-bold sm:text-3xl">See it in action</h2>
            <p className="mt-3 text-sm text-black dark:text-white/40">See your entire development workflow at a glance.</p>
          </div>
          <DashboardPreview />
        </div>
      </Section>

      {/* ─── Final CTA ─── */}
      <Section className="py-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="relative overflow-hidden rounded-3xl border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)] px-8 py-16 text-center"
        >
          <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-indigo-500/10 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-violet-500/10 blur-[80px]" />

          <h2 className="relative text-2xl font-bold sm:text-3xl">
            Start monitoring your projects <span className="text-indigo-400">like a pro</span>.
          </h2>
          <p className="relative mt-3 text-sm text-black dark:text-white/40">
            Free to get started. No credit card required.
          </p>
          <motion.div className="relative mt-8">
            <button
              onClick={user ? goDashboard : goLogin}
              className="group relative inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-8 py-3.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-600 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.03] active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
              {user ? 'Go to Dashboard' : 'Get Started'}
              <span className="absolute inset-0 -z-10 rounded-xl bg-indigo-400/20 blur-xl opacity-0 group-hover:opacity-60 transition-opacity animate-pulse" />
            </button>
          </motion.div>
        </motion.div>
      </Section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 mt-12 border-t border-white/[0.18] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px]">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-between">
            {/* Brand */}
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Image
                  src="/icons/web-app-manifest-512x512.png"
                  alt="RehanPulse"
                  width={28}
                  height={28}
                  className="rounded-lg"
                />
                <span className="text-sm font-semibold">Rehan<span className="text-indigo-400">Pulse</span></span>
              </div>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-black dark:text-white/30">
                A developer-focused command center for monitoring your entire workflow in real time.
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-8 text-xs text-black dark:text-white/40">
              <div className="space-y-2">
                <p className="font-semibold text-black dark:text-white/60">Product</p>
                <a href="#features" className="block transition-colors hover:text-black dark:hover:text-white/70">Features</a>
                <a href="#how-it-works" className="block transition-colors hover:text-black dark:hover:text-white/70">How It Works</a>
                <a href="#demo" className="block transition-colors hover:text-black dark:hover:text-white/70">Demo</a>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-black dark:text-white/60">Stack</p>
                <span className="block">Next.js</span>
                <span className="block">Firebase</span>
                <span className="block">Vercel</span>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-black dark:text-white/60">Legal</p>
                <a href="/policy" className="block transition-colors hover:text-black dark:hover:text-white/70">Privacy Policy</a>
                <a href="/terms" className="block transition-colors hover:text-black dark:hover:text-white/70">Terms of Service</a>
              </div>
            </div>

            {/* Social */}
            <div>
              <a
                href="https://github.com/AIOmarRehan/RehanPulse"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.85] dark:border-white/[0.08] bg-white/40 dark:bg-[#0c0c1d]/60 backdrop-blur-[28px] px-4 py-2 text-xs text-black dark:text-white/50 transition-all hover:bg-white/80 dark:hover:bg-white/[0.12] hover:text-black dark:hover:text-white/80"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                GitHub
              </a>
            </div>
          </div>
<span className="text-black dark:text-white/20 tracking-wide hover:text-black dark:hover:text-white/40 transition">
  Omar Rehan
</span>

<div className="mt-10 border-t border-white/[0.18] dark:border-white/[0.06] pt-6 text-center text-base font-semibold text-black dark:text-white/20">
  © 2026 Rehan<span className="text-indigo-400">Pulse</span>. All rights reserved. Developed and maintained by{" "}
  <span className="text-black dark:text-white/20 hover:text-black dark:hover:text-white/40 transition-colors duration-300">
    Omar Rehan
  </span>
</div>
        </div>
      </footer>
    </div>
  );
}
