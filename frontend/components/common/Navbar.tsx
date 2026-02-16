'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { translations } from '@/lib/utils/translations';

export const Navbar = () => {
  const pathname = usePathname();
  const { user, logout, isAdmin } = useAuth();

  const navLinks = [
    { href: '/dashboard', label: translations.nav.dashboard, adminOnly: false },
    { href: '/datasets', label: translations.nav.datasets, adminOnly: false },
    { href: '/training', label: translations.nav.training, adminOnly: false },
    { href: '/jobs', label: translations.nav.jobs, adminOnly: false },
    { href: '/models', label: translations.nav.models, adminOnly: false },
    { href: '/recommendations', label: translations.nav.recommendations, adminOnly: false },
    { href: '/system-logs', label: translations.nav.systemLogs, adminOnly: true },
  ];

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-reverse space-x-8">
            <Link href="/dashboard" className="text-xl font-bold">
              سیستم توصیه‌گر
            </Link>
            <div className="hidden md:flex space-x-reverse space-x-4">
              {navLinks
                .filter((link) => !link.adminOnly || isAdmin)
                .map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === link.href
                        ? 'bg-blue-700'
                        : 'hover:bg-blue-500'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
            </div>
          </div>
          <div className="flex items-center space-x-reverse space-x-4">
            {user && (
              <>
                <span className="text-sm">
                  {user.username} ({isAdmin ? translations.auth.admin : translations.auth.user})
                </span>
                <button
                  onClick={logout}
                  className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {translations.nav.logout}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
