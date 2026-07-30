'use client';

import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
};

const createParticle = (): Particle => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  vx: (Math.random() - 0.5) * 0.6,
  vy: (Math.random() - 0.5) * 0.6,
  size: Math.random() * 1.8 + 0.8,
});

export const AnimatedAuthBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrameId = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const particleCount = Math.min(90, Math.floor((window.innerWidth * window.innerHeight) / 14000));
      particles = Array.from({ length: particleCount }, () => createParticle());
    };

    const drawConnections = () => {
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance >= 130) continue;

          const mouse = mouseRef.current;
          let alpha = 1 - distance / 130;

          if (mouse.x != null && mouse.y != null) {
            const midX = (particles[i].x + particles[j].x) / 2;
            const midY = (particles[i].y + particles[j].y) / 2;
            const mdx = mouse.x - midX;
            const mdy = mouse.y - midY;
            const mouseDistance = Math.sqrt(mdx * mdx + mdy * mdy);

            if (mouseDistance < 180) {
              const boost = (1 - mouseDistance / 180) * 0.6;
              alpha = Math.min(1, alpha + boost);
              context.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
              context.lineWidth = 1.2;
            } else {
              context.strokeStyle = `rgba(59, 130, 246, ${alpha * 0.25})`;
              context.lineWidth = 0.6;
            }
          } else {
            context.strokeStyle = `rgba(59, 130, 246, ${alpha * 0.25})`;
            context.lineWidth = 0.6;
          }

          context.beginPath();
          context.moveTo(particles[i].x, particles[i].y);
          context.lineTo(particles[j].x, particles[j].y);
          context.stroke();
        }
      }
    };

    const animate = () => {
      context.fillStyle = 'rgba(3, 7, 18, 0.22)';
      context.fillRect(0, 0, window.innerWidth, window.innerHeight);

      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0) particle.x = window.innerWidth;
        if (particle.x > window.innerWidth) particle.x = 0;
        if (particle.y < 0) particle.y = window.innerHeight;
        if (particle.y > window.innerHeight) particle.y = 0;

        const mouse = mouseRef.current;
        if (mouse.x != null && mouse.y != null) {
          const dx = particle.x - mouse.x;
          const dy = particle.y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (Number.isFinite(distance) && distance > 0 && distance < 180) {
            const force = (180 - distance) / 180;
            particle.x += (dx / distance) * force * 1.5;
            particle.y += (dy / distance) * force * 1.5;
          }
        }

        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fillStyle = 'rgba(147, 197, 253, 0.98)';
        context.fill();
      }
      drawConnections();

      animationFrameId = window.requestAnimationFrame(animate);
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: null, y: null };
    };

    resize();
    animate();

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-900">
      <canvas ref={canvasRef} className="absolute inset-0 block" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.34),transparent_30%),radial-gradient(circle_at_80%_25%,rgba(103,232,249,0.28),transparent_28%),radial-gradient(circle_at_50%_70%,rgba(96,165,250,0.24),transparent_34%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(30,41,59,0.68),rgba(2,6,23,0.82))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.58)_100%)]" />
    </div>
  );
};
