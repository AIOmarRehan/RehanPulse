'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function NotFound() {
  const code404Ref = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  /* random glitch burst */
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    function randomGlitch() {
      const targets = [code404Ref.current, brandRef.current];
      const t = targets[Math.floor(Math.random() * targets.length)];
      if (!t) return;
      const origTransform = t.style.transform;
      const origFilter = t.style.filter;
      t.style.transform = `skewX(${(Math.random() - 0.5) * 6}deg) translateX(${(Math.random() - 0.5) * 8}px)`;
      t.style.filter = 'blur(1px)';
      setTimeout(() => {
        t.style.transform = origTransform;
        t.style.filter = origFilter;
      }, 60 + Math.random() * 80);
    }

    function schedule() {
      timeout = setTimeout(() => {
        randomGlitch();
        schedule();
      }, 1500 + Math.random() * 4000);
    }
    schedule();

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="nf-page">
      {/* scanlines */}
      <div className="nf-scanlines" />
      {/* vignette */}
      <div className="nf-vignette" />
      {/* grain */}
      <div className="nf-grain" />

      <div className="nf-container">
        <div ref={brandRef} className="nf-brand">
          RehanPulse
        </div>

        <div ref={code404Ref} className="nf-code">
          404
        </div>

        {/* pulse heartbeat SVG */}
        <div className="nf-pulse">
          <svg viewBox="0 0 56 45" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline
              points="10,26.46 17.191,26.46 22.392,17.224 27.645,34.506 35.072,10 39.708,26.46 46,26.46"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="nf-pulse-line"
            />
          </svg>
        </div>

        <div className="nf-subtitle">Signal Lost&nbsp;&middot;&nbsp;Page Not Found</div>

        <Link href="/" className="nf-btn">
          ↩ Return to Base
        </Link>
      </div>

      <div className="nf-glitch-slice" />

      <style jsx global>{`
        /* ── 404 page theme-aware variables ── */
        .nf-page {
          --nf-bg: #f0f2f5;
          --nf-neon: #0077cc;
          --nf-neon2: #005fa3;
          --nf-glow-strong: rgba(0, 119, 204, 0.5);
          --nf-glow-soft: rgba(0, 95, 163, 0.3);
          --nf-scan-color: rgba(0, 0, 0, 0.06);
          --nf-vignette-color: rgba(255, 255, 255, 0.55);
          --nf-grain-opacity: 0.25;
        }

        .dark .nf-page {
          --nf-bg: #070a0f;
          --nf-neon: #00ffe7;
          --nf-neon2: #00b8a9;
          --nf-glow-strong: rgba(0, 255, 231, 0.5);
          --nf-glow-soft: rgba(0, 184, 169, 0.3);
          --nf-scan-color: rgba(0, 0, 0, 0.18);
          --nf-vignette-color: rgba(0, 0, 0, 0.75);
          --nf-grain-opacity: 0.5;
        }

        /* ── base ── */
        .nf-page {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          background: var(--nf-bg);
          font-family: 'Share Tech Mono', ui-monospace, monospace;
          overflow: hidden;
          color: var(--nf-neon);
          z-index: 50;
        }

        /* ── scanlines ── */
        .nf-scanlines {
          position: fixed;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 3px,
            var(--nf-scan-color) 3px,
            var(--nf-scan-color) 4px
          );
          pointer-events: none;
          z-index: 100;
        }

        /* ── vignette ── */
        .nf-vignette {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 50%, var(--nf-vignette-color) 100%);
          pointer-events: none;
          z-index: 99;
        }

        /* ── container ── */
        .nf-container {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
        }

        /* ── 404 number ── */
        .nf-code {
          font-family: 'Bebas Neue', 'Arial Black', sans-serif;
          font-size: clamp(120px, 22vw, 260px);
          line-height: 1;
          letter-spacing: 0.06em;
          color: var(--nf-neon);
          text-shadow:
            0 0 6px var(--nf-neon),
            0 0 20px var(--nf-neon),
            0 0 60px var(--nf-neon2),
            0 0 120px var(--nf-neon2);
          animation: nf-flicker-main 4s infinite;
          position: relative;
          user-select: none;
        }

        /* ── brand ── */
        .nf-brand {
          font-family: 'Bebas Neue', 'Arial Black', sans-serif;
          font-size: clamp(18px, 3.5vw, 40px);
          letter-spacing: 0.35em;
          color: var(--nf-neon);
          text-shadow:
            0 0 4px var(--nf-neon),
            0 0 14px var(--nf-neon2);
          animation: nf-flicker-brand 5s infinite;
          margin-bottom: 24px;
          user-select: none;
        }

        /* ── lottie pulse ── */
        .nf-pulse {
          width: clamp(80px, 14vw, 140px);
          height: clamp(80px, 14vw, 140px);
          filter:
            drop-shadow(0 0 6px var(--nf-neon))
            drop-shadow(0 0 18px var(--nf-neon2));
          animation: nf-flicker-pulse 3.5s infinite;
          margin-bottom: 28px;
          color: var(--nf-neon);
        }
        .nf-pulse svg {
          width: 100%;
          height: 100%;
        }
        .nf-pulse-line {
          stroke-dasharray: 120;
          stroke-dashoffset: 120;
          animation: nf-draw-pulse 2s ease-in-out infinite;
        }
        @keyframes nf-draw-pulse {
          0%   { stroke-dashoffset: 120; }
          50%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -120; }
        }

        /* ── subtitle ── */
        .nf-subtitle {
          font-size: clamp(11px, 1.6vw, 15px);
          letter-spacing: 0.22em;
          color: var(--nf-neon2);
          text-shadow: 0 0 8px var(--nf-neon2);
          animation: nf-flicker-sub 6s infinite;
          text-transform: uppercase;
          margin-bottom: 40px;
        }

        /* ── CTA button ── */
        .nf-btn {
          display: inline-block;
          padding: 10px 32px;
          border: 1.5px solid var(--nf-neon);
          color: var(--nf-neon);
          font-family: 'Share Tech Mono', ui-monospace, monospace;
          font-size: 13px;
          letter-spacing: 0.2em;
          text-decoration: none;
          text-transform: uppercase;
          text-shadow: 0 0 8px var(--nf-neon);
          box-shadow: 0 0 14px var(--nf-glow-soft), inset 0 0 10px rgba(0, 255, 231, 0.05);
          background: transparent;
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
          animation: nf-flicker-btn 7s infinite;
        }
        .nf-btn:hover {
          background: rgba(0, 255, 231, 0.07);
          box-shadow: 0 0 28px var(--nf-glow-strong), inset 0 0 18px rgba(0, 255, 231, 0.1);
        }

        /* light mode button hover tweak */
        :not(.dark) .nf-btn:hover {
          background: rgba(0, 119, 204, 0.08);
        }

        /* ── grain ── */
        .nf-grain {
          position: fixed;
          inset: -50%;
          width: 200%;
          height: 200%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.06'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 98;
          opacity: var(--nf-grain-opacity);
          animation: nf-grain-move 0.6s steps(1) infinite;
        }

        /* ── glitch slice ── */
        .nf-glitch-slice {
          position: absolute;
          width: 100%;
          height: 2px;
          background: var(--nf-neon);
          opacity: 0;
          left: 0;
          animation: nf-glitch-line 5s infinite;
        }

        /* ===== FLICKER KEYFRAMES ===== */

        @keyframes nf-flicker-main {
          0%    { opacity: 1; }
          3%    { opacity: 0.4; }
          4%    { opacity: 1; }
          10%   { opacity: 1; }
          10.5% { opacity: 0.1; }
          11%   { opacity: 1; }
          30%   { opacity: 1; }
          30.2% { opacity: 0.6; }
          30.6% { opacity: 1; }
          60%   { opacity: 1; }
          60.2% { opacity: 0; }
          60.3% { opacity: 1; }
          60.4% { opacity: 0.3; }
          60.5% { opacity: 1; }
          75%   { opacity: 1; }
          75.1% { opacity: 0.2; }
          75.3% { opacity: 1; }
          100%  { opacity: 1; }
        }

        @keyframes nf-flicker-brand {
          0%, 100% { opacity: 1; }
          7%       { opacity: 0.7; }
          7.5%     { opacity: 1; }
          20%      { opacity: 1; }
          20.2%    { opacity: 0.2; }
          20.5%    { opacity: 1; }
          55%      { opacity: 1; }
          55.3%    { opacity: 0.5; }
          55.6%    { opacity: 1; }
        }

        @keyframes nf-flicker-pulse {
          0%, 100% { opacity: 1; }
          15%      { opacity: 0.6; }
          15.5%    { opacity: 1; }
          40%      { opacity: 1; }
          40.2%    { opacity: 0.1; }
          40.5%    { opacity: 1; }
          80%      { opacity: 1; }
          80.4%    { opacity: 0.5; }
          80.8%    { opacity: 1; }
        }

        @keyframes nf-flicker-sub {
          0%, 100% { opacity: 0.85; }
          25%      { opacity: 0.4; }
          25.5%    { opacity: 0.85; }
          65%      { opacity: 0.85; }
          65.2%    { opacity: 0.2; }
          65.4%    { opacity: 0.85; }
        }

        @keyframes nf-flicker-btn {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.7; }
          50.3%    { opacity: 1; }
          85%      { opacity: 1; }
          85.1%    { opacity: 0.3; }
          85.3%    { opacity: 1; }
        }

        @keyframes nf-grain-move {
          0%  { transform: translate(0, 0); }
          10% { transform: translate(-3%, -4%); }
          20% { transform: translate(4%, 2%); }
          30% { transform: translate(-2%, 5%); }
          40% { transform: translate(5%, -2%); }
          50% { transform: translate(-4%, 3%); }
          60% { transform: translate(2%, -5%); }
          70% { transform: translate(-5%, 1%); }
          80% { transform: translate(3%, 4%); }
          90% { transform: translate(-1%, -3%); }
        }

        @keyframes nf-glitch-line {
          0%, 100% { opacity: 0; top: 30%; }
          48%      { opacity: 0; top: 30%; }
          49%      { opacity: 0.6; top: 48%; }
          49.2%    { opacity: 0; top: 52%; }
          70%      { opacity: 0; top: 52%; }
          71%      { opacity: 0.4; top: 25%; }
          71.2%    { opacity: 0; }
        }
      `}</style>

      {/* Google Fonts for the neon typography */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Bebas+Neue&display=swap"
      />
    </div>
  );
}
