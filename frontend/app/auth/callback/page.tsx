'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    // Prefer exchanging short-lived auth code to avoid tokens in URL
    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refreshToken');
    const userStr = searchParams.get('user');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setTimeout(() => {
        router.push('/login');
      }, 3000);
      return;
    }

    if (code) {
      const completeWithCode = async () => {
        try {
          const response = await api.post('/auth/oauth/exchange', { code });
          // Tokens are now set as httpOnly cookies by the backend
          const { user } = response.data;

          // Only store user metadata (tokens are in httpOnly cookies)
          localStorage.setItem('user', JSON.stringify(user));

          if (user?.id) {
            localStorage.setItem('userId', user.id);
          }
          if (user?.workspaceId) {
            localStorage.setItem('workspaceId', user.workspaceId);
          }

          router.push('/dashboard');
        } catch (err) {
          console.error('Error exchanging auth code:', err);
          setError('Failed to complete authentication');
          setTimeout(() => {
            router.push('/login');
          }, 3000);
        }
      };

      completeWithCode();
      return;
    }

    if (token && refreshToken && userStr) {
      try {
        // Legacy fallback: tokens were passed in URL params (now only user metadata stored)
        localStorage.setItem('user', decodeURIComponent(userStr));

        // Parse user object and store user ID and workspace ID
        const user = JSON.parse(decodeURIComponent(userStr));
        if (user.id) {
          localStorage.setItem('userId', user.id);
        }
        if (user.workspaceId) {
          localStorage.setItem('workspaceId', user.workspaceId);
        }

        // Redirect to dashboard
        router.push('/dashboard');
      } catch (err) {
        console.error('Error storing auth data:', err);
        setError('Failed to complete authentication');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } else {
      setError('Invalid authentication response');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    }
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8">
          <div className="text-center">
            <div className="mb-4 text-red-600">
              <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Completing Sign In</h2>
          <p className="text-gray-600">Please wait while we redirect you...</p>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Completing Sign In</h2>
          <p className="text-gray-600">Please wait while we redirect you...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
