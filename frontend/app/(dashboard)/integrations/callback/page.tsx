'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing integration...');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const integrationId = searchParams.get('integration');

      if (error) {
        setStatus('error');
        setMessage(`Integration failed: ${error}`);
        setTimeout(() => router.push('/integrations'), 3000);
        return;
      }

      if (!code || !integrationId) {
        setStatus('error');
        setMessage('Missing required parameters');
        setTimeout(() => router.push('/integrations'), 3000);
        return;
      }

      try {
        // TODO: Send code to backend API to complete OAuth flow
        const response = await fetch('/api/integrations/oauth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state, integrationId }),
        });

        if (!response.ok) {
          throw new Error('Failed to complete integration');
        }

        setStatus('success');
        setMessage(`${integrationId} connected successfully!`);
        setTimeout(() => router.push('/integrations'), 2000);
      } catch (err) {
        console.error('Integration callback error:', err);
        setStatus('error');
        setMessage('Failed to complete integration. Please try again.');
        setTimeout(() => router.push('/integrations'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center animate-scale-in">
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connecting Integration</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Check className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting back to integrations...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                <X className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting back to integrations...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function IntegrationCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading...</h2>
            <p className="text-gray-600">Please wait</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}