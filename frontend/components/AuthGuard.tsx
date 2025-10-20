'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/signin', '/register', '/signup'];
  const isPublicRoute = publicRoutes.includes(pathname);

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
        // If already authenticated and trying to access auth pages, redirect to dashboard
        router.replace('/dashboard');
        return;
      }

      setIsAuthenticated(authenticated);
    };

    checkAuth();
  }, [pathname, router, isPublicRoute]);

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

  return <>{children}</>;
}
