'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface ImportProgressProps {
  jobId: string;
  totalQueued: number;
  onComplete?: (result: ImportResult) => void;
  onError?: (error: string) => void;
}

export interface ImportResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
  totalErrors: number;
}

interface JobStatus {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  progress: number;
  result?: ImportResult;
  failedReason?: string;
  createdAt: string;
  finishedAt?: string;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 200; // ~5 minutes

export default function ImportProgress({
  jobId,
  totalQueued,
  onComplete,
  onError,
}: ImportProgressProps) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const response = await api.get(`/integrations/jobs/${jobId}/status`);
        const jobStatus: JobStatus = response.data;
        setStatus(jobStatus);

        if (jobStatus.state === 'completed') {
          clearInterval(intervalRef.current!);
          if (onComplete && jobStatus.result) {
            onComplete(jobStatus.result);
          }
        } else if (jobStatus.state === 'failed') {
          clearInterval(intervalRef.current!);
          const errMsg = jobStatus.failedReason || 'Import job failed';
          setErrorMessage(errMsg);
          if (onError) {
            onError(errMsg);
          }
        }
      } catch (err: any) {
        console.error('Failed to poll job status:', err);
        setPollCount(prev => {
          if (prev >= MAX_POLLS) {
            clearInterval(intervalRef.current!);
            const errMsg = 'Import timed out. Please check your contacts list to verify results.';
            setErrorMessage(errMsg);
            if (onError) onError(errMsg);
          }
          return prev + 1;
        });
      }

      setPollCount(prev => prev + 1);
    };

    // Initial poll
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [jobId]);

  const progress = status?.progress ?? 0;
  const state = status?.state ?? 'waiting';

  const getStateLabel = () => {
    switch (state) {
      case 'waiting': return 'Queued, waiting to start...';
      case 'active':
        if (progress < 20) return 'Checking for duplicates...';
        if (progress < 30) return 'Categorizing contacts...';
        if (progress < 70) return 'Importing new contacts...';
        if (progress < 100) return 'Updating existing contacts...';
        return 'Finalizing...';
      case 'completed': return 'Import complete!';
      case 'failed': return 'Import failed';
      default: return 'Processing...';
    }
  };

  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-10 w-10 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">Import Failed</h3>
        <p className="text-sm text-red-600 text-center max-w-md">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-8">
      {/* Icon */}
      <div className={`flex h-20 w-20 items-center justify-center rounded-full transition-all ${
        state === 'completed' ? 'bg-green-100' : 'bg-indigo-100'
      }`}>
        {state === 'completed' ? (
          <CheckCircle className="h-12 w-12 text-green-600" />
        ) : (
          <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
        )}
      </div>

      {/* Status Text */}
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-900">
          {state === 'completed' ? 'Import Complete!' : 'Importing Contacts...'}
        </h3>
        <p className="text-sm text-gray-600 mt-2">{getStateLabel()}</p>
        <p className="text-xs text-gray-400 mt-1">
          {totalQueued} contacts queued for processing
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm font-semibold text-indigo-600">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              state === 'completed'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                : 'bg-gradient-to-r from-blue-500 to-indigo-600'
            }`}
            style={{ width: `${Math.max(progress, state === 'waiting' ? 5 : 0)}%` }}
          />
        </div>
      </div>

      {/* Live Stats (when available) */}
      {status?.result && (
        <div className="grid grid-cols-3 gap-4 w-full max-w-md">
          <div className="glass-effect rounded-xl p-4 border border-green-200 bg-green-50/50 text-center">
            <p className="text-2xl font-bold text-green-600">{status.result.created}</p>
            <p className="text-xs text-gray-600 mt-1">Created</p>
          </div>
          <div className="glass-effect rounded-xl p-4 border border-blue-200 bg-blue-50/50 text-center">
            <p className="text-2xl font-bold text-blue-600">{status.result.updated}</p>
            <p className="text-xs text-gray-600 mt-1">Updated</p>
          </div>
          <div className="glass-effect rounded-xl p-4 border border-gray-200 bg-gray-50/50 text-center">
            <p className="text-2xl font-bold text-gray-600">{status.result.skipped}</p>
            <p className="text-xs text-gray-600 mt-1">Skipped</p>
          </div>
        </div>
      )}

      {/* Error preview if any */}
      {status?.result?.errors && status.result.errors.length > 0 && (
        <div className="w-full max-w-md glass-effect rounded-xl p-4 border border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">
              {status.result.totalErrors} contact{status.result.totalErrors !== 1 ? 's' : ''} had errors
            </p>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {status.result.errors.slice(0, 5).map((err, idx) => (
              <p key={idx} className="text-xs text-amber-800">
                <span className="font-medium">{err.email}:</span> {err.error}
              </p>
            ))}
            {status.result.totalErrors > 5 && (
              <p className="text-xs text-amber-600">
                ...and {status.result.totalErrors - 5} more errors
              </p>
            )}
          </div>
        </div>
      )}

      {/* Running indicator */}
      {state !== 'completed' && state !== 'failed' && (
        <p className="text-xs text-gray-400 animate-pulse">
          Running in background - you can navigate away safely
        </p>
      )}
    </div>
  );
}
