import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'increase' | 'decrease';
  icon: LucideIcon;
  gradientFrom?: string;
  gradientTo?: string;
}

export default function StatCard({
  title,
  value,
  change,
  changeType = 'increase',
  icon: Icon,
  gradientFrom = 'from-blue-500',
  gradientTo = 'to-cyan-500',
}: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl glass-effect p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl animate-scale-in">
      {/* Gradient Background */}
      <div className={cn(
        'absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-all duration-500 group-hover:opacity-20 group-hover:scale-125',
        gradientFrom,
        gradientTo
      )}></div>

      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
            <p className="mt-3 text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{value}</p>
            {change && (
              <div className="mt-3 flex items-center gap-2">
                <div className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  changeType === 'increase'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {changeType === 'increase' ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{change}</span>
                </div>
                <span className="text-xs text-gray-500">vs last month</span>
              </div>
            )}
          </div>
          <div className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6',
            gradientFrom,
            gradientTo
          )}>
            <Icon className="h-7 w-7 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}