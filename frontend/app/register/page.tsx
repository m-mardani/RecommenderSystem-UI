'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { translations } from '@/lib/utils/translations';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { AuthAnimatedBackground } from '@/components/common/AuthAnimatedBackground';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [cellphone, setCellphone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(translations.errors.passwordMismatch);
      return;
    }

    setLoading(true);

    try {
      await register({ username, email, cellphone, password });
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.auth.registerError);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="در حال ثبت‌نام..." />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" dir="rtl">
      <AuthAnimatedBackground />

      <div className="w-full max-w-md relative z-10 backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl rounded-2xl p-8">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-white">سیستم توصیه‌گر</h1>
          <p className="text-white/80">ایجاد حساب کاربری جدید</p>
        </div>

        {error && (
          <div className="bg-red-500/15 border border-red-300/40 text-red-100 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-white mb-2">
              {translations.auth.username}
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-white/30 rounded-lg bg-white/20 text-white placeholder:text-white/50 focus:bg-white/30 focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
              {translations.auth.email}
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-white/30 rounded-lg bg-white/20 text-white placeholder:text-white/50 focus:bg-white/30 focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="cellphone" className="block text-sm font-medium text-white mb-2">
              {translations.auth.cellphone}
            </label>
            <input
              type="tel"
              id="cellphone"
              value={cellphone}
              onChange={(e) => setCellphone(e.target.value)}
              className="w-full px-4 py-2 border border-white/30 rounded-lg bg-white/20 text-white placeholder:text-white/50 focus:bg-white/30 focus:outline-none"
              required
              inputMode="tel"
              autoComplete="tel"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
              {translations.auth.password}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 pl-16 border border-white/30 rounded-lg bg-white/20 text-white placeholder:text-white/50 focus:bg-white/30 focus:outline-none"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/85 hover:text-white"
              >
                {showPassword ? 'مخفی' : 'نمایش'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-white mb-2">
              {translations.auth.confirmPassword}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 pl-16 border border-white/30 rounded-lg bg-white/20 text-white placeholder:text-white/50 focus:bg-white/30 focus:outline-none"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((previous) => !previous)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/85 hover:text-white"
              >
                {showConfirmPassword ? 'مخفی' : 'نمایش'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-3/4 mx-auto block py-3 rounded-lg font-medium text-white border border-white/30 bg-white/20 hover:bg-blue-500 hover:border-blue-400 transition-colors disabled:opacity-60"
          >
            {translations.auth.register}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/80">
            {translations.auth.alreadyHaveAccount}{' '}
            <Link href="/login" className="text-blue-200 hover:text-blue-100 hover:underline font-medium">
              {translations.auth.loginHere}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
