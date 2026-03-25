'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ─── Constants ─── */
const NODE_COUNT = 24000;
const TRAIL_COUNT = 6000;
const STAR_COUNT = 3000;
const TRANSFORM_SPEED = 0.018;

const THEMES = {
  dark: {
    bgColor: 0x050608,
    fogColor: 0x050608,
    fogDensity: 0.0008,
    exposure: 1.05,
    starOpacity: 0.6,
    bloom: [0.28, 0.55],
  },
  light: {
    bgColor: 0xf5f5f7,
    fogColor: 0xf5f5f7,
    fogDensity: 0.0004,
    exposure: 1.0,
    starOpacity: 0.0,
    bloom: [0, 0],
  },
};

const PALETTES = [
  // Auroral Flow (dark mode)
  [
    new THREE.Color(0x5bd4f0), new THREE.Color(0x8be8ff),
    new THREE.Color(0x4fb8d0), new THREE.Color(0x7ec8e3),
    new THREE.Color(0x2da8c4), new THREE.Color(0xa8f5e8),
    new THREE.Color(0x6dd4c8), new THREE.Color(0xcef5ff),
  ],
  // Plasma Dipole (light mode — black particles)
  [
    new THREE.Color(0x000000), new THREE.Color(0x000000),
    new THREE.Color(0x000000), new THREE.Color(0x000000),
    new THREE.Color(0x000000), new THREE.Color(0x000000),
    new THREE.Color(0x000000), new THREE.Color(0x000000),
  ],
];

/* ─── Helpers ─── */
function _hash(n: number) {
  return (Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453)) % 1;
}

function genAuroralFlow(i: number, count: number) {
  const t = i / count;
  const bands = 12;
  const band = Math.floor(t * bands);
  const bt = (t * bands) % 1;
  const spread = 130;
  const x = (band / bands - 0.5) * spread;
  const z = Math.sin(band * 0.9) * 24;
  const y = (bt - 0.5) * 110;
  const wave1 = Math.sin(bt * Math.PI * 3 + band * 0.7) * (7 + band * 0.8);
  const wave2 = Math.cos(bt * Math.PI * 2 + band * 1.1) * 4;
  return new THREE.Vector3(x + wave2, y, z + wave1);
}

function genPlasmaDipole(i: number, count: number) {
  const FIELD_FRAC = 0.45, DISK_FRAC = 0.38;
  const fieldEnd = Math.floor(count * FIELD_FRAC);
  const diskEnd = fieldEnd + Math.floor(count * DISK_FRAC);

  if (i < fieldEnd) {
    const LINES = 28;
    const lineIdx = Math.floor(i / (fieldEnd / LINES));
    const lt = (i % Math.ceil(fieldEnd / LINES)) / Math.ceil(fieldEnd / LINES);
    const R0 = 14 + lineIdx * 3.8;
    const phi = (lineIdx / LINES) * Math.PI * 2 + lineIdx * 0.22;
    const lambda = (lt - 0.5) * Math.PI * 0.94;
    const cosL = Math.cos(lambda);
    const r = R0 * cosL * cosL;
    const scatter = (_hash(i * 3.1) - 0.5) * 1.2;
    const sAngle = _hash(i * 7.7) * Math.PI * 2;
    return new THREE.Vector3(
      r * cosL * Math.cos(phi) + Math.cos(sAngle) * scatter * 0.5,
      r * Math.sin(lambda),
      r * cosL * Math.sin(phi) + Math.sin(sAngle) * scatter * 0.5,
    );
  } else if (i < diskEnd) {
    const di = i - fieldEnd;
    const dt = di / (diskEnd - fieldEnd);
    const innerR = 10, outerR = 68;
    const r = innerR * Math.pow(outerR / innerR, dt);
    const angle = dt * Math.PI * 14 + _hash(i * 2.3) * 0.6;
    const halfH = 3.5 * (1 - dt * 0.72) + _hash(i * 5.9) * 1.2;
    const y = (_hash(i * 8.1) * 2 - 1) * halfH;
    return new THREE.Vector3(r * Math.cos(angle), y, r * Math.sin(angle));
  } else {
    const ji = i - diskEnd;
    const half = Math.floor((count - diskEnd) / 2);
    const sign = ji < half ? 1 : -1;
    const jt = (ji % half) / half;
    const height = sign * jt * 78;
    const spreadVal = jt * jt * 7.5;
    const twist = jt * Math.PI * 4;
    const angle = _hash(i * 4.3) * Math.PI * 2 + twist;
    const r = _hash(i * 9.1) * spreadVal;
    const knotPull = Math.sin(jt * Math.PI * 6) * 0.4;
    return new THREE.Vector3(
      r * Math.cos(angle) * (1 + knotPull),
      height,
      r * Math.sin(angle) * (1 + knotPull),
    );
  }
}

const GENERATORS = [genAuroralFlow, genPlasmaDipole];

function assignProps(i: number, colors: Float32Array, sizes: Float32Array, vizIdx: number) {
  const pal = PALETTES[vizIdx]!;
  let color: THREE.Color, brightness: number;
  if (vizIdx === 0) {
    const band = Math.floor((i / NODE_COUNT) * 12);
    color = pal[band % pal.length]!;
    brightness = 0.6 + Math.random() * 0.7;
    sizes[i] = 0.5 + Math.random() * 2.2;
  } else {
    const shell = Math.floor((i / NODE_COUNT) * 5);
    color = pal[shell % pal.length]!;
    brightness = 0.85 + Math.random() * 0.15;
    sizes[i] = 0.5 + Math.random() * 1.8;
  }
  colors[i * 3] = color.r * brightness;
  colors[i * 3 + 1] = color.g * brightness;
  colors[i * 3 + 2] = color.b * brightness;
}

function makeParticleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(200,230,255,0.35)');
  g.addColorStop(0.75, 'rgba(180,210,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeTrailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/* ─── Component ─── */
export function AnimatedBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);

  useEffect(() => {
    themeRef.current = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* eslint-disable prefer-const */
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let composer: EffectComposer;
    let controls: OrbitControls;
    let bloomPass: UnrealBloomPass;
    /* eslint-enable prefer-const */

    let dataNodes: THREE.Points,
      trailSystem: THREE.Points,
      bgStars: THREE.Points;

    let time = 0;
    let currentViz = themeRef.current === 'light' ? 1 : 0;
    let isTransforming = false;
    let transformProgress = 0;
    let bloomTarget = 0.55;
    let bloomCurrent = 0.55;
    let animId = 0;
    let disposed = false;
    let appliedTheme = themeRef.current;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userData: any = {};

    function buildDataNodes() {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(NODE_COUNT * 3);
      const col = new Float32Array(NODE_COUNT * 3);
      const siz = new Float32Array(NODE_COUNT);
      for (let i = 0; i < NODE_COUNT; i++) {
        const p = GENERATORS[currentViz]!(i, NODE_COUNT);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        assignProps(i, col, siz, currentViz);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));

      const currentColors = new Float32Array(col);

      const mat = new THREE.PointsMaterial({
        size: 3.0,
        map: makeParticleTexture(),
        vertexColors: true,
        transparent: true,
        blending: currentViz === 1 ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      });
      dataNodes = new THREE.Points(geo, mat);
      userData.currentColors = currentColors;
      scene.add(dataNodes);
    }

    function buildTrails() {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(TRAIL_COUNT * 3);
      const col = new Float32Array(TRAIL_COUNT * 3);
      const siz = new Float32Array(TRAIL_COUNT);
      const pal = PALETTES[currentViz]!;
      for (let i = 0; i < TRAIL_COUNT; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 120;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
        const c = pal[Math.floor(Math.random() * pal.length)]!;
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        siz[i] = Math.random() * 1.5 + 0.3;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
      const mat = new THREE.PointsMaterial({
        size: 1.5,
        map: makeTrailTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      trailSystem = new THREE.Points(geo, mat);
      scene.add(trailSystem);
    }

    function buildBgStars() {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(STAR_COUNT * 3);
      const col = new Float32Array(STAR_COUNT * 3);
      for (let i = 0; i < STAR_COUNT; i++) {
        const r = 250 + Math.random() * 350;
        const phi = Math.random() * Math.PI * 2;
        const th = Math.random() * Math.PI;
        pos[i * 3] = r * Math.sin(th) * Math.cos(phi);
        pos[i * 3 + 1] = r * Math.sin(th) * Math.sin(phi);
        pos[i * 3 + 2] = r * Math.cos(th);
        const v = 0.08 + Math.random() * 0.18;
        col[i * 3] = v * 0.7;
        col[i * 3 + 1] = v * 0.85;
        col[i * 3 + 2] = v;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.8,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      bgStars = new THREE.Points(geo, mat);
      scene.add(bgStars);
    }

    function startTransform(nextViz: number) {
      isTransforming = true;
      transformProgress = 0;
      const pos = (dataNodes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const siz = (dataNodes.geometry.attributes.size as THREE.BufferAttribute).array as Float32Array;
      const fromPos = new Float32Array(pos);
      const fromCol = new Float32Array(userData.currentColors);
      const fromSiz = new Float32Array(siz);
      const toPos = new Float32Array(NODE_COUNT * 3);
      const toCol = new Float32Array(NODE_COUNT * 3);
      const toSiz = new Float32Array(NODE_COUNT);
      for (let i = 0; i < NODE_COUNT; i++) {
        const p = GENERATORS[nextViz]!(i, NODE_COUNT);
        toPos[i * 3] = p.x;
        toPos[i * 3 + 1] = p.y;
        toPos[i * 3 + 2] = p.z;
        assignProps(i, toCol, toSiz, nextViz);
      }
      userData = { ...userData, fromPos, toPos, fromCol, toCol, fromSiz, toSiz, targetViz: nextViz, currentColors: userData.currentColors };

      // Update trail colors
      const pal = PALETTES[nextViz]!;
      const tc = (trailSystem.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < TRAIL_COUNT; i++) {
        const c = pal[Math.floor(Math.random() * pal.length)]!;
        tc[i * 3] = c.r;
        tc[i * 3 + 1] = c.g;
        tc[i * 3 + 2] = c.b;
      }
      trailSystem.geometry.attributes.color!.needsUpdate = true;
    }

    function applyThemeSettings(isLight: boolean) {
      const t = isLight ? THEMES.light : THEMES.dark;
      renderer.setClearColor(t.bgColor, 1);
      (scene.fog as THREE.FogExp2).color.setHex(t.fogColor);
      (scene.fog as THREE.FogExp2).density = t.fogDensity;
      renderer.toneMappingExposure = t.exposure;
      if (bgStars) (bgStars.material as THREE.PointsMaterial).opacity = t.starOpacity;

      const targetViz = isLight ? 1 : 0;
      if (!isTransforming && currentViz !== targetViz) {
        (dataNodes.material as THREE.PointsMaterial).blending =
          targetViz === 1 ? THREE.NormalBlending : THREE.AdditiveBlending;
        (dataNodes.material as THREE.PointsMaterial).needsUpdate = true;
        startTransform(targetViz);
      }
    }

    function animateFlow() {
      if (!dataNodes || isTransforming) return;
      const pos = (dataNodes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      if (currentViz === 0) {
        for (let i = 0; i < NODE_COUNT; i++) {
          pos[i * 3 + 1]! += 0.28;
          if (pos[i * 3 + 1]! > 55) pos[i * 3 + 1] = pos[i * 3 + 1]! - 110;
          pos[i * 3] = pos[i * 3]! + Math.sin(time * 1.5 + i * 0.04) * 0.03;
          pos[i * 3 + 2] = pos[i * 3 + 2]! + Math.cos(time * 1.2 + i * 0.04) * 0.03;
        }
      } else {
        for (let i = 0; i < NODE_COUNT; i++) {
          const shell = Math.floor((i / NODE_COUNT) * 5);
          const sp = 0.004 + shell * 0.002;
          const x = pos[i * 3]!, z = pos[i * 3 + 2]!;
          pos[i * 3] = x * Math.cos(sp) - z * Math.sin(sp);
          pos[i * 3 + 2] = x * Math.sin(sp) + z * Math.cos(sp);
        }
      }
      dataNodes.geometry.attributes.position!.needsUpdate = true;
    }

    function animateTrails() {
      if (!trailSystem) return;
      const pos = (trailSystem.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < TRAIL_COUNT; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2;
        if (currentViz === 0) {
          pos[iy] = pos[iy]! + 0.35;
          if (pos[iy]! > 55) pos[iy] = -55;
          pos[ix] = pos[ix]! + Math.sin(time * 2 + i * 0.08) * 0.08;
          pos[iz] = pos[iz]! + Math.cos(time * 1.7 + i * 0.08) * 0.08;
        } else {
          const sp = 0.007 + (i % 4) * 0.003;
          const x = pos[ix]!, z = pos[iz]!;
          pos[ix] = x * Math.cos(sp) - z * Math.sin(sp);
          pos[iz] = x * Math.sin(sp) + z * Math.cos(sp);
        }
      }
      trailSystem.geometry.attributes.position!.needsUpdate = true;
    }

    function animate() {
      if (disposed) return;
      animId = requestAnimationFrame(animate);
      time += 0.01;
      controls.update();

      // Check if theme changed
      if (themeRef.current !== appliedTheme) {
        appliedTheme = themeRef.current;
        applyThemeSettings(appliedTheme === 'light');
      }

      const theme = appliedTheme === 'light' ? THEMES.light : THEMES.dark;
      bloomTarget = theme.bloom[currentViz] ?? theme.bloom[0]!;
      bloomCurrent += (bloomTarget - bloomCurrent) * 0.04;
      if (bloomPass) bloomPass.strength = bloomCurrent;

      if (bgStars) {
        bgStars.rotation.y += 0.0002;
        bgStars.rotation.x += 0.00008;
      }

      if (isTransforming) {
        transformProgress += TRANSFORM_SPEED;
        const pos = (dataNodes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        const col = (dataNodes.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
        const siz = (dataNodes.geometry.attributes.size as THREE.BufferAttribute).array as Float32Array;
        if (transformProgress >= 1) {
          pos.set(userData.toPos);
          col.set(userData.toCol);
          siz.set(userData.toSiz);
          userData.currentColors = new Float32Array(userData.toCol);
          currentViz = userData.targetViz;
          isTransforming = false;
          transformProgress = 0;
          (dataNodes.material as THREE.PointsMaterial).blending =
            currentViz === 1 ? THREE.NormalBlending : THREE.AdditiveBlending;
          (dataNodes.material as THREE.PointsMaterial).needsUpdate = true;
        } else {
          const t = transformProgress;
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          for (let i = 0; i < pos.length; i++) {
            pos[i] = (userData.fromPos[i] as number) * (1 - e) + (userData.toPos[i] as number) * e;
            col[i] = (userData.fromCol[i] as number) * (1 - e) + (userData.toCol[i] as number) * e;
          }
          for (let i = 0; i < siz.length; i++) {
            siz[i] = (userData.fromSiz[i] as number) * (1 - e) + (userData.toSiz[i] as number) * e;
          }
        }
        dataNodes.geometry.attributes.position!.needsUpdate = true;
        dataNodes.geometry.attributes.color!.needsUpdate = true;
        dataNodes.geometry.attributes.size!.needsUpdate = true;
      } else {
        animateFlow();
      }

      animateTrails();
      composer.render();
    }

    /* ── Init ── */
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050608, 0.0008);

    // eslint-disable-next-line prefer-const
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 20, 130);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.5;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55, 0.45, 0.8,
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    buildDataNodes();
    buildTrails();
    buildBgStars();

    // Apply initial theme
    applyThemeSettings(themeRef.current === 'light');

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      composer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
