'use client';

import { useEffect, useRef } from 'react';

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  life: number;
  maxLife: number;
  turbulenceOffset: number;
  growthRate: number;
  hue: number;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const prevMouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<SmokeParticle[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMove = (e: MouseEvent) => {
      prevMouseRef.current = { ...mouseRef.current };
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMove);

    const particles = particlesRef.current;

    function noise(x: number, y: number): number {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return n - Math.floor(n);
    }

    function createSmoke(mx: number, my: number, speed: number): SmokeParticle {
      const spread = Math.min(speed * 0.5, 3);
      const angle = Math.random() * Math.PI * 2;
      const velocity = 0.3 + Math.random() * spread;
      const hues = [240, 250, 260, 270, 200];
      return {
        x: mx + (Math.random() - 0.5) * 16,
        y: my + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * velocity * 0.6,
        vy: Math.sin(angle) * velocity * 0.4 - (0.4 + Math.random() * 0.8),
        radius: 4 + Math.random() * 8,
        opacity: 0.15 + Math.random() * 0.2,
        life: 0,
        maxLife: 90 + Math.random() * 80,
        turbulenceOffset: Math.random() * 1000,
        growthRate: 0.15 + Math.random() * 0.25,
        hue: hues[Math.floor(Math.random() * hues.length)]!,
      };
    }

    function createAmbient(w: number, h: number): SmokeParticle {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.05 - Math.random() * 0.1,
        radius: 30 + Math.random() * 60,
        opacity: 0.015 + Math.random() * 0.025,
        life: 0,
        maxLife: 400 + Math.random() * 300,
        turbulenceOffset: Math.random() * 1000,
        growthRate: 0.05,
        hue: Math.random() > 0.5 ? 250 : 180,
      };
    }

    // Seed ambient fog
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < 20; i++) {
      const p = createAmbient(w, h);
      p.life = Math.random() * p.maxLife * 0.5;
      particles.push(p);
    }

    function animate() {
      if (!canvas || !ctx) return;
      timeRef.current++;
      const t = timeRef.current;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;

      // Semi-transparent clear for trail effect
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(10, 10, 26, 0.12)';
      ctx.fillRect(0, 0, cw, ch);

      const mouse = mouseRef.current;
      const prev = prevMouseRef.current;
      const dx = mouse.x - prev.x;
      const dy = mouse.y - prev.y;
      const speed = Math.sqrt(dx * dx + dy * dy);

      // Emit cursor smoke
      if (mouse.x > 0 && mouse.y > 0) {
        const count = Math.min(Math.floor(speed * 0.3) + 1, 6);
        for (let i = 0; i < count; i++) {
          particles.push(createSmoke(mouse.x, mouse.y, speed));
        }
      }

      // Replenish ambient fog
      if (particles.filter((p) => p.maxLife > 200).length < 15) {
        particles.push(createAmbient(cw, ch));
      }

      ctx.globalCompositeOperation = 'screen';

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life++;

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const progress = p.life / p.maxLife;

        // Turbulence — Perlin-like wobble
        const turb = noise(p.turbulenceOffset + t * 0.008, p.y * 0.005);
        const turbX = (turb - 0.5) * 1.5;
        const turbY = (noise(p.turbulenceOffset + 100 + t * 0.006, p.x * 0.005) - 0.5) * 0.8;

        p.vx += turbX * 0.02;
        p.vy += turbY * 0.02;

        // Dampen
        p.vx *= 0.985;
        p.vy *= 0.988;

        p.x += p.vx;
        p.y += p.vy;
        p.radius += p.growthRate;

        // Opacity: fade in, sustain, fade out
        let alpha: number;
        if (progress < 0.1) {
          alpha = (progress / 0.1) * p.opacity;
        } else if (progress > 0.5) {
          alpha = ((1 - progress) / 0.5) * p.opacity;
        } else {
          alpha = p.opacity;
        }

        // Draw soft smoke puff
        const gradient = ctx.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, p.radius,
        );
        gradient.addColorStop(0, `hsla(${p.hue}, 60%, 65%, ${alpha * 0.6})`);
        gradient.addColorStop(0.4, `hsla(${p.hue}, 50%, 55%, ${alpha * 0.3})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 40%, 45%, 0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Subtle mouse glow
      if (mouse.x > 0 && mouse.y > 0) {
        const glow = ctx.createRadialGradient(
          mouse.x, mouse.y, 0,
          mouse.x, mouse.y, 80,
        );
        glow.addColorStop(0, 'hsla(250, 70%, 65%, 0.06)');
        glow.addColorStop(1, 'hsla(250, 70%, 65%, 0)');
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 80, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMove);
      particlesRef.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
