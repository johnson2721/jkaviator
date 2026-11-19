"use client";

import { useEffect, useRef, type RefObject } from "react";
import { liveMultiplier, type GameRef } from "./useGameStream";

type Star = { x: number; y: number; r: number; tw: number };
type Cloud = { x: number; y: number; s: number; v: number; a: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };

export default function FlightCanvas({ gameRef }: { gameRef: RefObject<GameRef> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const crashTRef = useRef(0);
  const lastPhaseRef = useRef<string>("waiting");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(320, rect.width);
      H = Math.max(220, rect.height);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starsRef.current = Array.from({ length: Math.floor((W * H) / 9000) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.92,
        r: Math.random() * 1.4 + 0.3,
        tw: Math.random() * Math.PI * 2,
      }));
      cloudsRef.current = Array.from({ length: 7 }, (_, i) => ({
        x: Math.random() * W,
        y: H * (0.15 + Math.random() * 0.6),
        s: 0.6 + Math.random() * 1.5,
        v: 6 + Math.random() * 16,
        a: 0.05 + Math.random() * 0.09,
      }));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const drawPlane = (x: number, y: number, angle: number, scale: number, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      // glow
      ctx.shadowColor = "rgba(255,60,90,0.85)";
      ctx.shadowBlur = 18;

      const body = ctx.createLinearGradient(-2, -1, 2, 1);
      body.addColorStop(0, "#ff5c78");
      body.addColorStop(0.5, "#e50539");
      body.addColorStop(1, "#8d0022");

      // main wing (back sweep)
      ctx.fillStyle = "#b3002a";
      ctx.beginPath();
      ctx.moveTo(0.35, -0.05);
      ctx.lineTo(-0.85, -1.55);
      ctx.lineTo(-1.35, -1.45);
      ctx.lineTo(-0.55, 0.02);
      ctx.closePath();
      ctx.fill();

      // tail fin
      ctx.fillStyle = "#ff3d63";
      ctx.beginPath();
      ctx.moveTo(-1.15, -0.08);
      ctx.lineTo(-1.85, -0.95);
      ctx.lineTo(-2.15, -0.85);
      ctx.lineTo(-1.6, 0.05);
      ctx.closePath();
      ctx.fill();

      // fuselage
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(2.05, 0);
      ctx.quadraticCurveTo(1.1, -0.42, -0.9, -0.34);
      ctx.lineTo(-1.95, -0.12);
      ctx.lineTo(-1.95, 0.14);
      ctx.quadraticCurveTo(0.7, 0.46, 2.05, 0);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;

      // lower wing
      ctx.fillStyle = "#7d0020";
      ctx.beginPath();
      ctx.moveTo(0.15, 0.1);
      ctx.lineTo(-0.55, 0.95);
      ctx.lineTo(-0.95, 0.85);
      ctx.lineTo(-0.55, 0.08);
      ctx.closePath();
      ctx.fill();

      // cockpit
      ctx.fillStyle = "rgba(190,230,255,0.95)";
      ctx.beginPath();
      ctx.ellipse(0.75, -0.14, 0.42, 0.2, -0.12, 0, Math.PI * 2);
      ctx.fill();

      // nose light
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(2.0, 0, 0.09, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = gameRef.current;
      const phase = r?.phase ?? "waiting";

      if (phase !== lastPhaseRef.current) {
        if (phase === "crashed") crashTRef.current = 0;
        if (phase === "waiting") {
          particlesRef.current = [];
          crashTRef.current = 0;
        }
        lastPhaseRef.current = phase;
      }

      // ---------- background ----------
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#080d1a");
      sky.addColorStop(0.55, "#0b1120");
      sky.addColorStop(1, "#131a2c");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // stars
      for (const s of starsRef.current) {
        s.tw += dt * 1.6;
        const a = 0.25 + Math.abs(Math.sin(s.tw)) * 0.55;
        ctx.fillStyle = `rgba(190,215,255,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // clouds
      for (const c of cloudsRef.current) {
        c.x -= c.v * dt * (phase === "flying" ? 3.2 : 1);
        if (c.x < -220 * c.s) c.x = W + 200 * c.s;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 110 * c.s);
        g.addColorStop(0, `rgba(120,155,220,${c.a})`);
        g.addColorStop(1, "rgba(120,155,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 130 * c.s, 42 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ground glow + runway
      const ground = ctx.createLinearGradient(0, H * 0.82, 0, H);
      ground.addColorStop(0, "rgba(229,5,57,0)");
      ground.addColorStop(1, "rgba(229,5,57,0.16)");
      ctx.fillStyle = ground;
      ctx.fillRect(0, H * 0.82, W, H * 0.18);

      const originX = W * 0.055;
      const originY = H * 0.9;

      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(W * 0.98, originY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX, H * 0.06);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---------- flight geometry ----------
      const m = phase === "flying" ? liveMultiplier(r!) : phase === "crashed" ? r?.multiplier ?? 1 : 1;
      const p = Math.max(0, Math.min(1, 1 - Math.pow(Math.max(1, m), -0.45)));
      const pathW = p * (W * 0.9);
      const pathH = p * (H * 0.72);
      const ex = originX + pathW;
      const ey = originY - pathH;
      const cx = originX + pathW * 0.62;
      const cy = originY - pathH * 0.05;

      if (phase !== "waiting") {
        // filled area under the curve
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.lineTo(ex, originY);
        ctx.closePath();
        const fill = ctx.createLinearGradient(originX, originY, ex, ey);
        fill.addColorStop(0, "rgba(229,5,57,0.05)");
        fill.addColorStop(1, "rgba(229,5,57,0.42)");
        ctx.fillStyle = fill;
        ctx.fill();

        // glowing stroke
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.strokeStyle = phase === "crashed" ? "rgba(255,60,90,0.55)" : "#ff2d55";
        ctx.lineWidth = phase === "crashed" ? 2.5 : 3.5;
        ctx.shadowColor = "rgba(229,5,57,0.8)";
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ---------- plane ----------
      let planeX = ex;
      let planeY = ey;
      let alpha = 1;
      let scale = Math.max(9, Math.min(20, W / 62));
      let angle = -0.42;

      if (phase === "waiting") {
        const bob = Math.sin(now / 380) * 5;
        planeX = originX + 26;
        planeY = originY - 14 + bob;
        angle = -0.08 + Math.sin(now / 620) * 0.03;
        scale *= 0.92;
      } else {
        // tangent of the quadratic bezier at t = 1
        const tx = 2 * (ex - cx);
        const ty = 2 * (ey - cy);
        angle = Math.atan2(ty, tx);
      }

      if (phase === "crashed") {
        crashTRef.current += dt;
        const t = crashTRef.current;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const dist = 220 * t * t + 90 * t;
        planeX = ex + dirX * dist;
        planeY = ey + dirY * dist - 30 * t;
        angle -= dt * 1.5;
        alpha = Math.max(0, 1 - t * 0.85);
        scale *= 1 - Math.min(0.45, t * 0.3);
      }

      // exhaust particles
      if (phase === "flying" && Math.random() < 0.7) {
        particlesRef.current.push({
          x: planeX - Math.cos(angle) * scale * 1.6,
          y: planeY - Math.sin(angle) * scale * 1.6,
          vx: -Math.cos(angle) * (30 + Math.random() * 40),
          vy: -Math.sin(angle) * 30 + (Math.random() * 24 - 12),
          life: 0,
          max: 0.5 + Math.random() * 0.5,
          r: 1 + Math.random() * 2.6,
        });
      }
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.life += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        const a = Math.max(0, 1 - pt.life / pt.max);
        if (a <= 0) return false;
        ctx.fillStyle = `rgba(255,${Math.floor(120 + a * 90)},${Math.floor(60 + a * 60)},${(a * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * a + 0.4, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      if (particlesRef.current.length > 260) particlesRef.current.splice(0, 60);

      if (alpha > 0.02) drawPlane(planeX, planeY, angle, scale, alpha);

      // crash vignette
      if (phase === "crashed") {
        const t = Math.min(1, crashTRef.current * 2.2);
        const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
        v.addColorStop(0, "rgba(229,5,57,0)");
        v.addColorStop(1, `rgba(229,5,57,${(0.34 * (1 - t * 0.6)).toFixed(3)})`);
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [gameRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
