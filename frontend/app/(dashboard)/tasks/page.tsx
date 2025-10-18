'use client';

import { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, CheckCircle2, Circle, Loader2, X, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  type: string;
}

interface TaskFormData {
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status?: 'pending' | 'in_progress' | 'completed';
  type?: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium',
    status: 'pending',
    type: 'general',
  });

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      const params: any = {};
      if (selectedFilter !== 'all') {
        params.status = selectedFilter;
      }

      const response = await api.get<{ data: Task[] }>('/tasks', { params });
      setTasks(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [selectedFilter]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      await api.post('/tasks', formData);
      setShowAddModal(false);
      resetForm();
      fetchTasks();
    } catch (err: any) {
      console.error('Failed to create task:', err);
      setModalError(err.response?.data?.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTask = async (task: Task) => {
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      dueDate: '',
      priority: 'medium',
      status: 'pending',
      type: 'general',
    });
    setModalError('');
  };

  const priorityColors = {
    low: 'bg-blue-100 text-blue-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  };

  const filters = [
    { id: 'all', name: 'All Tasks' },
    { id: 'pending', name: 'Pending' },
    { id: 'in_progress', name: 'In Progress' },
    { id: 'completed', name: 'Completed' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your tasks and to-dos ({tasks.length} total)
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setSelectedFilter(filter.id as any)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              selectedFilter === filter.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            {filter.name}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">No tasks found. Add your first task to get started!</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md"
            >
              {/* Checkbox */}
              <button
                onClick={() => handleToggleTask(task)}
                className="mt-1 flex-shrink-0"
              >
                {task.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-400 hover:text-blue-500 transition-colors" />
                )}
              </button>

              {/* Task Details */}
              <div className="flex-1">
                <h3 className={`font-semibold text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                  {task.title}
                </h3>
                {task.description && (
                  <p className="mt-1 text-sm text-gray-600">{task.description}</p>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityColors[task.priority]}`}>
                    {task.priority}
                  </span>
                  {task.dueDate && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(task.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            <button
              onClick={() => { setShowAddModal(false); resetForm(); }}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Task</h2>

            {modalError && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleAddTask} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  placeholder="Task title"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none"
                  placeholder="Task description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
