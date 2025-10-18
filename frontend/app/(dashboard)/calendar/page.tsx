'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Users, Video, Phone, Mail, Calendar as CalendarIcon, Filter, Search, X, Edit, Trash2, CheckCircle } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  type: 'meeting' | 'call' | 'task' | 'deadline';
  date: Date;
  startTime: string;
  endTime: string;
  attendees?: string[];
  location?: string;
  description?: string;
  color: string;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [events] = useState<Event[]>([]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getEventsForDate = (date: Date) => {
    return events.filter(event =>
      event.date.getDate() === date.getDate() &&
      event.date.getMonth() === date.getMonth() &&
      event.date.getFullYear() === date.getFullYear()
    );
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'meeting': return Video;
      case 'call': return Phone;
      case 'task': return CheckCircle;
      case 'deadline': return Clock;
      default: return CalendarIcon;
    }
  };

  const renderCalendar = () => {
    const days = daysInMonth(currentDate);
    const firstDay = firstDayOfMonth(currentDate);
    const cells = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      cells.push(
        <div key={`empty-${i}`} className="min-h-[120px] bg-gray-50/50 border border-gray-100"></div>
      );
    }

    // Cells for each day of the month
    for (let day = 1; day <= days; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayEvents = getEventsForDate(date);
      const isCurrentDay = isToday(date);

      cells.push(
        <div
          key={day}
          className={`min-h-[120px] border border-gray-200 p-2 hover:bg-gray-50 transition-all cursor-pointer ${
            isCurrentDay ? 'bg-blue-50 border-blue-300' : 'bg-white'
          }`}
          onClick={() => {
            setSelectedDate(date);
            setShowEventModal(true);
          }}
        >
          <div className={`text-sm font-semibold mb-2 ${isCurrentDay ? 'text-blue-600' : 'text-gray-900'}`}>
            {isCurrentDay && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs">
                {day}
              </span>
            )}
            {!isCurrentDay && day}
          </div>
          <div className="space-y-1">
            {dayEvents.slice(0, 3).map((event) => (
              <div
                key={event.id}
                className={`text-xs px-2 py-1 rounded ${event.color} text-white truncate`}
                onClick={(e) => e.stopPropagation()}
              >
                {event.startTime} - {event.title}
              </div>
            ))}
            {dayEvents.length > 3 && (
              <div className="text-xs text-gray-500 px-2">+{dayEvents.length - 3} more</div>
            )}
          </div>
        </div>
      );
    }

    return cells;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-cyan-900 to-teal-900 bg-clip-text text-transparent">
            Calendar
          </h1>
          <p className="mt-2 text-gray-600">
            Manage your meetings, calls, and deadlines
          </p>
        </div>
        <button
          onClick={() => setShowEventModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
        >
          <Plus className="h-4 w-4" />
          New Event
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-effect rounded-xl p-5 border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
              <Video className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Meetings</p>
              <p className="text-2xl font-bold text-gray-900">{events.filter(e => e.type === 'meeting').length}</p>
            </div>
          </div>
        </div>

        <div className="glass-effect rounded-xl p-5 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
              <Phone className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Calls</p>
              <p className="text-2xl font-bold text-gray-900">{events.filter(e => e.type === 'call').length}</p>
            </div>
          </div>
        </div>

        <div className="glass-effect rounded-xl p-5 border border-orange-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
              <CheckCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Tasks</p>
              <p className="text-2xl font-bold text-gray-900">{events.filter(e => e.type === 'task').length}</p>
            </div>
          </div>
        </div>

        <div className="glass-effect rounded-xl p-5 border border-red-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-600">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Deadlines</p>
              <p className="text-2xl font-bold text-gray-900">{events.filter(e => e.type === 'deadline').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="glass-effect rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={previousMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 min-w-[200px] text-center">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-all"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              onClick={goToToday}
              className="px-4 py-2 text-sm font-semibold text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                view === 'month' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                view === 'week' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                view === 'day' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="glass-effect rounded-xl border border-gray-200 overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-gray-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="p-3 text-center font-semibold text-gray-700 text-sm">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {renderCalendar()}
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="glass-effect rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Events</h3>
        <div className="space-y-3">
          {events.slice(0, 5).map((event) => {
            const Icon = getEventIcon(event.type);
            return (
              <div
                key={event.id}
                className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-cyan-300 hover:shadow-lg transition-all group"
              >
                <div className={`p-2.5 rounded-lg ${event.color}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{event.title}</h4>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      <span>{event.date.toLocaleDateString()} • {event.startTime} - {event.endTime}</span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        <span>{event.location}</span>
                      </div>
                    )}
                    {event.attendees && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        <span>{event.attendees.length} attendees</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button className="p-2 rounded-lg hover:bg-blue-50 transition-all">
                    <Edit className="h-4 w-4 text-blue-600" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-red-50 transition-all">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedDate ? `New Event - ${selectedDate.toLocaleDateString()}` : 'New Event'}
              </h2>
              <button
                onClick={() => {
                  setShowEventModal(false);
                  setSelectedDate(null);
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Event Title</label>
                <input
                  type="text"
                  placeholder="Enter event title..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Event Type</label>
                  <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option>Meeting</option>
                    <option>Call</option>
                    <option>Task</option>
                    <option>Deadline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    defaultValue={selectedDate?.toISOString().split('T')[0]}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Time</label>
                  <input
                    type="time"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">End Time</label>
                  <input
                    type="time"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                <input
                  type="text"
                  placeholder="Add location or meeting link..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  rows={3}
                  placeholder="Add event description..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowEventModal(false);
                    setSelectedDate(null);
                  }}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-teal-600 rounded-xl shadow-lg hover:shadow-xl transition-all"
                >
                  Create Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
