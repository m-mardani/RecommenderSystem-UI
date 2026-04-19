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
    { href: '/models', label: translations.nav.models, adminOnly: false },
    { href: '/recommendations', label: translations.nav.recommendations, adminOnly: false },
    { href: '/prediction', label: translations.nav.prediction, adminOnly: false },
    { href: '/scenarios', label: translations.nav.scenarios, adminOnly: false },
    { href: '/system-logs', label: translations.nav.systemLogs, adminOnly: true },
  ];

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-200/60 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-reverse space-x-8">
            <Link href="/dashboard" className="text-xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              سیستم توصیه‌گر
            </Link>
            <div className="hidden md:flex space-x-reverse space-x-4">
              {navLinks
                .filter((link) => !link.adminOnly || isAdmin)
                .map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      pathname === link.href
                        ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-200'
                        : 'text-gray-700 hover:bg-gray-100'
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
                <span className="text-sm text-gray-700 bg-linear-to-br from-blue-50 to-purple-50 px-3 py-1.5 rounded-lg border border-blue-100">
                  {user.username} ({isAdmin ? translations.auth.admin : translations.auth.user})
                </span>
                <button
                  onClick={logout}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
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
