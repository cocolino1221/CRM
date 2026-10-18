import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, Clock3, AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type CalendarTask = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  priority: string;
  type: string;
  assignee: { id: string; name: string } | null;
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function CalendarPage() {
  const [monthDate, setMonthDate] = useState(new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMonth = async (refDate: Date) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await api.get('/tasks/calendar', {
        params: {
          startDate: startOfMonth(refDate).toISOString(),
          endDate: endOfMonth(refDate).toISOString(),
        },
      });
      setTasks(res.data?.tasks || []);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load calendar tasks';
      setError(msg);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMonth(monthDate);
  }, [monthDate]);

  const groupedTasks = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks.forEach(task => {
      const key = new Date(task.dueDate).toDateString();
      const prev = map.get(key) || [];
      prev.push(task);
      map.set(key, prev);
    });
    return Array.from(map.entries())
      .map(([dayKey, dayTasks]) => ({ day: new Date(dayKey), items: dayTasks }))
      .sort((a, b) => a.day.getTime() - b.day.getTime());
  }, [tasks]);

  const pendingCount = tasks.filter(t => t.status !== 'completed').length;

  return (
    <div className="h-full flex flex-col page-enter">
      <div className="safe-top px-4 pt-3 pb-4 bg-gradient-to-br from-[#312e81] via-[#4f46e5] to-[#0891b2] text-white shadow-[0_8px_30px_rgba(49,46,129,0.28)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-indigo-100">Schedule</p>
        <h1 className="text-[24px] font-extrabold">Calendar</h1>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            className="p-2 rounded-xl bg-white/15 border border-white/20"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">
            {monthDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </p>
          <button
            onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            className="p-2 rounded-xl bg-white/15 border border-white/20"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 text-[11px]">
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {tasks.length} tasks this month
          </span>
          <span className="ml-2 rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {pendingCount} pending
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-36">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="glass-panel rounded-2xl p-4 text-rose-700 text-sm">{error}</div>
        ) : groupedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="h-14 w-14 rounded-2xl bg-white/90 border border-slate-200 flex items-center justify-center">
              <Calendar className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm mt-3 font-medium">No tasks planned</p>
            <p className="text-xs text-slate-400 mt-1">Tasks with due dates appear here.</p>
          </div>
        ) : (
          groupedTasks.map(group => (
            <div key={group.day.toISOString()} className="mb-3">
              <div className="mb-2 px-1 text-xs font-semibold text-slate-500">{formatDayLabel(group.day)}</div>
              {group.items.map(task => (
                <div key={task.id} className="glass-panel rounded-2xl p-3 mb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      task.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : task.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {task.priority === 'urgent' || task.priority === 'high'
                        ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {task.priority}
                    </span>
                    {task.assignee?.name && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {task.assignee.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
