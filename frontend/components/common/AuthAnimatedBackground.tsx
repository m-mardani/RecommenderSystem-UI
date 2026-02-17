'use client';

import { useEffect, useRef, useState } from 'react';

interface Bubble {
  id: number;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
}

const BUBBLE_COUNT = 20;
const MAX_DISTANCE = 220;

export function AuthAnimatedBackground() {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    return Array.from({ length: BUBBLE_COUNT }, (_, index) => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;

      return {
        id: index,
        size: Math.random() * 130 + 50,
        x,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        baseX: x,
        baseY: y,
      };
    });
  });
  const mousePos = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePos.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const animate = () => {
      setBubbles((previous) =>
        previous.map((bubble) => {
          const dx = mousePos.current.x - bubble.x;
          const dy = mousePos.current.y - bubble.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          let nextVx = bubble.vx;
          let nextVy = bubble.vy;

          if (distance < MAX_DISTANCE && distance > 0) {
            const force = (MAX_DISTANCE - distance) / MAX_DISTANCE;
            nextVx -= (dx / distance) * force * 2;
            nextVy -= (dy / distance) * force * 2;
          }

          const returnForce = 0.02;
          nextVx += (bubble.baseX - bubble.x) * returnForce;
          nextVy += (bubble.baseY - bubble.y) * returnForce;

          nextVx *= 0.95;
          nextVy *= 0.95;

          let nextX = bubble.x + nextVx;
          let nextY = bubble.y + nextVy;

          if (nextX < 0 || nextX > window.innerWidth) {
            nextVx *= -0.5;
            nextX = Math.max(0, Math.min(window.innerWidth, nextX));
          }

          if (nextY < 0 || nextY > window.innerHeight) {
            nextVy *= -0.5;
            nextY = Math.max(0, Math.min(window.innerHeight, nextY));
          }

          return {
            ...bubble,
            x: nextX,
            y: nextY,
            vx: nextVx,
            vy: nextVy,
          };
        })
      );

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        backgroundImage: "url('/auth-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: bubble.size,
            height: bubble.size,
            left: bubble.x - bubble.size / 2,
            top: bubble.y - bubble.size / 2,
            opacity: 0.28,
            filter: 'blur(40px)',
            background:
              'radial-gradient(circle at 30% 30%, rgba(147, 51, 234, 0.82), rgba(59, 130, 246, 0.62))',
          }}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-purple-600/20" />
      <div className="absolute -top-20 -left-20 h-96 w-96 rounded-full opacity-20 blur-3xl bg-[radial-gradient(circle_at_30%_30%,rgba(147,51,234,0.9),rgba(59,130,246,0.4))] animate-pulse" />
      <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full opacity-20 blur-3xl bg-[radial-gradient(circle_at_70%_70%,rgba(59,130,246,0.9),rgba(147,51,234,0.4))] animate-pulse" />
      <div className="absolute top-1/4 right-1/4 h-80 w-80 rounded-full opacity-20 blur-3xl bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.8),rgba(59,130,246,0.4))] animate-pulse" />
    </div>
  );
}
