'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/lib/auth';
import { buildOauthReturnUrl } from '@/lib/oauth-return';
import { Loader2, Clock, LogOut } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Public routes that don't require authentication
  const publicRoutes = new Set([
    '/',
    '/login',
    '/signin',
    '/register',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/platform-admin',
    '/privacy',
    '/terms',
    '/help',
    '/forms/public',
    '/auth/callback', // OAuth callback must stay public so tokens can be exchanged
  ]);
  const isPublicRoute =
    publicRoutes.has(pathname) ||
    Array.from(publicRoutes).some(route => route !== '/' && pathname.startsWith(`${route}/`));

  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = authService.isAuthenticated();

      if (!authenticated && !isPublicRoute) {
        // Store the attempted URL to redirect after login
        sessionStorage.setItem('redirectAfterLogin', pathname);
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      if (authenticated && (pathname === '/login' || pathname === '/signin' || pathname === '/register' || pathname === '/signup')) {
        // If already authenticated and trying to access an auth page, normally go
        // to the dashboard — BUT if an OAuth flow (e.g. the MCP authorize endpoint)
        // bounced the user here with a returnTo, continue that flow instead of
        // stranding them on the dashboard. The token is appended as a query param
        // because the backend lives on a different origin and its session cookie
        // isn't reliably sent on the cross-site authorize navigation (Safari/ITP).
        const oauthReturn = buildOauthReturnUrl();
        if (oauthReturn) {
          window.location.href = oauthReturn;
          return;
        }
        router.replace('/dashboard');
        return;
      }

      // Check if user is pending approval
      if (authenticated) {
        const user = authService.getUser();
        if (user?.status === 'pending') {
          setIsPending(true);
        }
      }

      setIsAuthenticated(authenticated);
    };

    checkAuth();
  }, [pathname, router]); // Remove isPublicRoute from deps as it's derived from pathname

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated and not on a public route, don't render children
  if (!isAuthenticated && !isPublicRoute) {
    return null;
  }

  // Show pending approval screen for PENDING users
  if (isPending && !isPublicRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Waiting for Approval</h2>
            <p className="text-gray-600 mb-6">
              Your account has been created but needs to be approved by a workspace administrator before you can access the dashboard.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              You will be notified once your account is approved. Please check back later.
            </p>
            <button
              onClick={async () => {
                await authService.logout();
                router.replace('/login');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
