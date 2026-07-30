'use client';

import Link from 'next/link';
import { translations } from '@/lib/utils/translations';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 px-4">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">سیستم توصیه‌گر</h1>
          <p className="text-gray-600">{translations.auth.registrationDisabled}</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900">
          <p className="font-medium">{translations.auth.registrationDisabledDescription}</p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            {translations.auth.loginHere}
          </Link>
        </div>
      </div>
    </div>
  );
}
