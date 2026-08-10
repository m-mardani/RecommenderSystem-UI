'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { AnimatedAuthBackground } from '@/components/auth/AnimatedAuthBackground';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ username, password });
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.auth.loginError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950" dir="rtl">
      <AnimatedAuthBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <section className="w-full">
            <div className="mx-auto w-full rounded-[32px] border border-white/16 bg-white/12 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.48)] backdrop-blur-2xl sm:p-8">
              <div className="mb-8 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">AI Recommendation System</p>
                <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Recommender System Platform</h1>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  برای ادامه، با نام کاربری و رمز عبور خود وارد شوید.
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-2xl border border-rose-400/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-200">
                    {translations.auth.username}
                  </label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:bg-white/12 focus:ring-2 focus:ring-cyan-400/30"
                    required
                    autoComplete="username"
                    placeholder="نام کاربری خود را وارد کنید"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
                    {translations.auth.password}
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:bg-white/12 focus:ring-2 focus:ring-cyan-400/30"
                    required
                    autoComplete="current-password"
                    placeholder="رمز عبور"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 via-cyan-400 to-violet-400 px-4 py-3 font-bold text-slate-950 shadow-[0_18px_30px_rgba(56,189,248,0.35)] transition hover:from-sky-400 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'در حال ورود...' : translations.auth.login}
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
                <p className="font-semibold">{translations.auth.registrationDisabled}</p>
                <p className="mt-1 leading-7">{translations.auth.registrationDisabledDescription}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
