'use client';

import { ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { translations } from '@/lib/utils/translations';
import { cn } from '@/lib/utils/cn';

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  accent: string;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: translations.nav.dashboard, accent: 'from-sky-500 to-cyan-400' },
  { href: '/datasets', label: translations.nav.datasets, adminOnly: true, accent: 'from-cyan-500 to-blue-500' },
  { href: '/training', label: translations.nav.training, adminOnly: true, accent: 'from-emerald-500 to-teal-400' },
  { href: '/jobs', label: translations.nav.jobs, adminOnly: true, accent: 'from-amber-500 to-orange-400' },
  { href: '/models', label: translations.nav.models, accent: 'from-violet-500 to-indigo-500' },
  { href: '/recommendations', label: translations.nav.recommendations, accent: 'from-fuchsia-500 to-pink-500' },
  { href: '/system-logs', label: translations.nav.systemLogs, adminOnly: true, accent: 'from-slate-600 to-slate-400' },
];

interface AppShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, description, actions, children }: AppShellProps) {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = useMemo(
    () => navItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar hidden lg:flex">
        <ShellBrand />
        <nav className="flex-1 space-y-1 px-3 py-5">
          {visibleItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('app-nav-item', active && 'app-nav-item-active')}
              >
                <span className={cn('app-nav-icon', `bg-gradient-to-br ${item.accent}`)}>
                  {item.label.slice(0, 1)}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="app-topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="app-icon-button lg:hidden"
              aria-label="Toggle navigation"
            >
              <span className="block h-0.5 w-4 rounded-full bg-slate-700" />
              <span className="block h-0.5 w-4 rounded-full bg-slate-700" />
              <span className="block h-0.5 w-4 rounded-full bg-slate-700" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/80">
                AI Recommendation System
              </p>
              <h1 className="app-page-title">{title}</h1>
              {description && <p className="app-page-description">{description}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {actions && <div className="hidden flex-wrap items-center gap-3 md:flex">{actions}</div>}
            <div className="hidden items-center gap-3 sm:flex">
              <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-2 text-sm text-slate-600 shadow-sm">
                <span className="font-semibold text-slate-900">{user?.username || '-'}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span>{isAdmin ? translations.auth.admin : translations.auth.user}</span>
              </div>
              <button onClick={() => void logout()} className="app-btn app-btn-danger">
                {translations.nav.logout}
              </button>
            </div>
          </div>
        </header>

        {mobileOpen && (
          <div className="lg:hidden">
            <button
              type="button"
              className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            />
            <div className="fixed inset-y-0 right-0 z-40 w-72 border-l border-white/70 bg-[var(--sidebar)] p-4 shadow-2xl">
              <ShellBrand />
              <nav className="mt-4 space-y-1">
                {visibleItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn('app-nav-item', active && 'app-nav-item-active')}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={cn('app-nav-icon', `bg-gradient-to-br ${item.accent}`)}>
                        {item.label.slice(0, 1)}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <button onClick={() => void logout()} className="app-btn app-btn-danger mt-6 w-full">
                {translations.nav.logout}
              </button>
            </div>
          </div>
        )}

        <main className="app-page">
          {actions && <div className="mb-5 flex flex-wrap items-center gap-3 md:hidden">{actions}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}

function ShellBrand() {
  return (
    <div className="border-b border-white/70 px-4 py-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-400 to-violet-500 text-lg font-black text-white shadow-lg shadow-sky-500/20">
          AI
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">سیستم توصیه‌گر</p>
          <p className="text-xs text-slate-500">داشبورد هوشمند عملیات</p>
        </div>
      </div>
    </div>
  );
}
