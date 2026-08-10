'use client';

import Link from 'next/link';
import { translations } from '@/lib/utils/translations';

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.2),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.16),transparent_28%)]" />
      <div className="app-card relative w-full max-w-md px-8 py-9">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700/80">Access</p>
          <h1 className="mt-3 text-3xl font-black text-slate-900">سیستم توصیه‌گر</h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">{translations.auth.registrationDisabled}</p>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-amber-900">
          <p className="font-medium">{translations.auth.registrationDisabledDescription}</p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm font-semibold text-sky-700 transition hover:text-sky-600">
            {translations.auth.loginHere}
          </Link>
        </div>
      </div>
    </div>
  );
}
