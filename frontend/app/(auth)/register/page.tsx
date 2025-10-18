'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    workspaceName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      setStep(2);
    } else {
      setIsLoading(true);
      try {
        await authService.register(formData);
        router.push('/dashboard');
      } catch (err: any) {
        console.error('Registration error:', err);
        const errorMessage = err.response?.data?.message || 'Registration failed. Please try again.';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {step === 1 ? 'Create your company' : 'Set up your account'}
        </h2>
        <p className="text-gray-600">
          {step === 1 ? 'Start managing your team effectively' : 'Complete your profile to get started'}
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
            {/* Workspace Name */}
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