'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, AlertCircle, Loader2, KeyRound, Clock } from 'lucide-react';
import { authService } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [hasInviteCode, setHasInviteCode] = useState(false);
  const [formData, setFormData] = useState({
    workspaceName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    inviteCode: '',
  });

  // Read invite code from URL params
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setFormData(prev => ({ ...prev, inviteCode: code.toUpperCase() }));
      setHasInviteCode(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      setStep(2);
    } else {
      setIsLoading(true);
      try {
        const payload: any = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
        };
        if (formData.inviteCode) {
          payload.inviteCode = formData.inviteCode;
        } else if (formData.workspaceName) {
          payload.workspaceName = formData.workspaceName;
        }
        const response = await authService.register(payload);
        if (response.pendingApproval) {
          setPendingApproval(true);
        } else {
          router.push('/dashboard');
        }
      } catch (err: any) {
        console.error('Registration error:', err);
        const errorMessage = err.response?.data?.message || 'Registration failed. Please try again.';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Pending approval screen
  if (pendingApproval) {
    return (
      <div className="animate-fade-in text-center py-8">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
        <p className="text-gray-600 mb-6">
          Your account has been created and is waiting for approval by a workspace administrator.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          You will be able to log in once your account is approved.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {step === 1 ? (hasInviteCode ? 'Join a workspace' : 'Create your company') : 'Set up your account'}
        </h2>
        <p className="text-gray-600">
          {step === 1 ? (hasInviteCode ? 'You have an invite code — you\'ll get instant access' : 'Start managing your team effectively') : 'Complete your profile to get started'}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 flex items-center gap-4">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-indigo-600' : 'text-gray-400'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step >= 1 ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-gray-200'}`}>
            {step > 1 ? <Check className="h-5 w-5" /> : '1'}
          </div>
          <span className="text-sm font-semibold">Company</span>
        </div>
        <div className={`flex-1 h-0.5 ${step >= 2 ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gray-200'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-indigo-600' : 'text-gray-400'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step >= 2 ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-gray-200'}`}>
            2
          </div>
          <span className="text-sm font-semibold">Account</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {step === 1 ? (
          <>
            {/* Invite Code Toggle */}
            {!hasInviteCode && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                <KeyRound className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-indigo-900">Have an invite code?</p>
                  <p className="text-xs text-indigo-600">Enter it to join an existing workspace instantly</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHasInviteCode(true)}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Enter Code
                </button>
              </div>
            )}

            {hasInviteCode ? (
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-semibold text-gray-700 mb-2">
                  Invite Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="inviteCode"
                    type="text"
                    value={formData.inviteCode}
                    onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value.toUpperCase() })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none font-mono tracking-widest text-lg uppercase"
                    placeholder="ABCD1234"
                    maxLength={20}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHasInviteCode(false);
                    setFormData(prev => ({ ...prev, inviteCode: '' }));
                  }}
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Create a new workspace instead
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="workspaceName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Workspace Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="workspaceName"
                    type="text"
                    value={formData.workspaceName}
                    onChange={(e) => setFormData({ ...formData, workspaceName: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="Acme Corporation (optional)"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Optional: Create a workspace for your team
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-2">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="John"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  placeholder="john@company.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-12 pr-12 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Must be at least 8 characters with letters and numbers
              </p>
            </div>
          </>
        )}

        {/* Buttons */}
        <div className="flex gap-4">
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl font-semibold border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              <>
                {step === 1 ? 'Continue' : 'Create Account'}
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* OAuth Options - Only show on step 1 */}
      {step === 1 && (
        <>
          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">or sign up with</span>
            </div>
          </div>

          {/* Social Sign Up */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
                window.location.href = `${apiUrl}/auth/google`;
              }}
              className="flex items-center justify-center gap-2 py-3 px-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
                window.location.href = `${apiUrl}/auth/slack`;
              }}
              className="flex items-center justify-center gap-2 py-3 px-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#611f69">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
              Slack
            </button>
          </div>
        </>
      )}

      {/* Terms */}
      {step === 2 && (
        <p className="mt-6 text-xs text-center text-gray-500">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="text-indigo-600 hover:text-indigo-700">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700">
            Privacy Policy
          </Link>
        </p>
      )}

      {/* Sign In Link */}
      <p className="mt-8 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}