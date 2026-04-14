import { useState } from 'react';
import { MessageCircle, Eye, EyeOff, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, isLoading, error } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-7 page-enter overflow-hidden">
      <div className="absolute -top-20 -right-8 h-52 w-52 rounded-full bg-sky-300/40 blur-3xl" />
      <div className="absolute -bottom-16 -left-6 h-48 w-48 rounded-full bg-teal-300/35 blur-3xl" />

      <div className="w-full max-w-sm glass-panel rounded-[30px] p-5">
        <div className="mb-7">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-700 to-teal-500 text-white shadow-lg">
            <MessageCircle className="h-7 w-7" />
          </div>
          <div className="mt-4">
            <h1 className="text-[28px] font-extrabold text-slate-900">easyTeamCRM</h1>
            <p className="text-sm text-slate-600 mt-1">Sign in and pick up conversations instantly.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 px-2.5 py-1 text-[11px] font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" /> Secure access
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 px-2.5 py-1 text-[11px] font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> Fast onboarding
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="bg-rose-50 text-rose-700 text-sm px-4 py-3 rounded-xl border border-rose-100">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 mb-1.5 uppercase">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 mb-1.5 uppercase">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition pr-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-gradient-to-r from-sky-700 via-sky-600 to-teal-500 text-white font-semibold rounded-2xl transition hover:brightness-105 active:brightness-95 flex items-center justify-center gap-2 disabled:opacity-55 shadow-[0_12px_30px_rgba(19,92,150,0.35)]"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
          </button>

          <div className="relative flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <a
            href={`${API_BASE_URL}/auth/google?source=mobile`}
            className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-semibold rounded-2xl transition hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center gap-2.5 shadow-sm"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>
        </form>
      </div>
    </div>
  );
}
