import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithCode } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    if (!code) {
      setError('Invalid authentication response');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    loginWithCode(code).then(ok => {
      if (ok) {
        navigate('/whatsapp', { replace: true });
      } else {
        setError('Failed to complete sign in. Please try again.');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      }
    });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-rose-500" />
          <p className="text-base font-semibold text-slate-800">Sign in failed</p>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-white">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
        <p className="text-base font-semibold text-slate-800">Completing sign in...</p>
        <p className="text-sm text-slate-500">Please wait a moment</p>
      </div>
    </div>
  );
}
