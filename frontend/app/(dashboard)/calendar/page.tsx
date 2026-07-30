'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Users, Video, Phone, Mail, Calendar as CalendarIcon, Filter, Search, X, Edit, Trash2, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface Event {
  id: string;
  title: string;
  description?: string;
  type: 'meeting' | 'call' | 'task' | 'deadline' | 'appointment';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  location?: string;
  meetingPlatform?: 'zoom' | 'google_meet' | 'microsoft_teams' | 'phone' | 'in_person';
  meetingLink?: string;
  color?: string;
  organizer?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  attendees?: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  contactId?: string;
  customFields?: Record<string, any>;
}

interface EventFormData {
  title: string;
  description: string;
  type: 'meeting' | 'call' | 'task' | 'deadline' | 'appointment';
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingPlatform?: 'zoom' | 'google_meet' | 'microsoft_teams' | 'phone' | 'in_person';
  contactId?: string;
  autoGenerateMeetingLink?: boolean;
  whatsappReminderEnabled: boolean;
  whatsappReminderFlowId?: string;
  whatsappReminderMode: 'hours_before' | 'fixed_time';
  whatsappReminderHoursBefore?: number;
  whatsappReminderFixedTime?: string;
  organizerId?: string;
}

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

interface CloserOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface WhatsAppFlowOption {
  id: string;
  name?: string;
  trigger: string;
  enabled: boolean;
  reminderHoursBefore?: number;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState('');
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<ContactOption[]>([]);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [whatsappFlows, setWhatsappFlows] = useState<WhatsAppFlowOption[]>([]);
  const [closers, setClosers] = useState<CloserOption[]>([]);

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    type: 'meeting',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    contactId: '',
    autoGenerateMeetingLink: false,
    whatsappReminderEnabled: true,
    whatsappReminderMode: 'hours_before',
    organizerId: '',
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  useEffect(() => {
    api.get('/integrations/whatsapp/flows')
      .then((res: any) => {
        const flows: WhatsAppFlowOption[] = Array.isArray(res.data) ? res.data : [];
        setWhatsappFlows(flows.filter(f => f.trigger === 'before_meeting'));
      })
      .catch(() => setWhatsappFlows([]));
    api.get('/users', { params: { role: 'closer' } })
      .then((res: any) => setClosers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setClosers([]));
  }, []);

  const enabledReminderFlows = whatsappFlows.filter(f => f.enabled);

  // Debounced server-side search — the contact list can run into the
  // thousands, so it's never preloaded, only queried as the user types.
  useEffect(() => {
    const query = contactSearchQuery.trim();
    if (!query) {
      setContactSearchResults([]);
      setContactSearchLoading(false);
      return;
    }
    setContactSearchLoading(true);
    const handle = setTimeout(() => {
      api.get('/contacts', { params: { search: query, limit: 20 } })
        .then((res: any) => setContactSearchResults(res.data?.contacts || []))
        .catch(() => setContactSearchResults([]))
        .finally(() => setContactSearchLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [contactSearchQuery]);

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const response = await api.get<Event[]>('/events', {
        params: {
          startDate: startOfMonth.toISOString(),
          endDate: endOfMonth.toISOString(),
        },
      });

      setEvents(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch events:', err);
      setError('Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  // "Fixed time" mode is resolved client-side into an equivalent hoursBefore
  // value (same calendar day as the meeting, same local timezone the user is
  // already entering the meeting's own time in) — the backend only ever
  // knows about hoursBefore, so no server-side timezone handling is needed.
  const computeFixedTimeHoursBefore = (): number | null => {
    if (!formData.whatsappReminderFixedTime) return null;
    const [year, month, day] = formData.date.split('-').map(Number);
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [fixedHour, fixedMinute] = formData.whatsappReminderFixedTime.split(':').map(Number);
    const meetingStart = new Date(year, month - 1, day, startHour, startMinute);
    const fixedMoment = new Date(year, month - 1, day, fixedHour, fixedMinute);
    return (meetingStart.getTime() - fixedMoment.getTime()) / (60 * 60 * 1000);
  };

  // customFields.whatsappReminder is read by the backend's per-event override
  // (see EventsService.scheduleMeetingReminder) — undefined only when there's
  // no linked contact, since a reminder has nowhere to send without one.
  const buildWhatsappReminderCustomFields = (): Record<string, any> | undefined => {
    if (!formData.contactId) return undefined;
    const hoursBefore = formData.whatsappReminderMode === 'fixed_time'
      ? computeFixedTimeHoursBefore()
      : formData.whatsappReminderHoursBefore;
    return {
      whatsappReminder: {
        enabled: formData.whatsappReminderEnabled,
        flowId: formData.whatsappReminderEnabled ? (formData.whatsappReminderFlowId || undefined) : undefined,
        hoursBefore: formData.whatsappReminderEnabled && hoursBefore ? hoursBefore : undefined,
        mode: formData.whatsappReminderMode,
        fixedTime: formData.whatsappReminderMode === 'fixed_time' ? (formData.whatsappReminderFixedTime || undefined) : undefined,
      },
    };
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      // New events can't be scheduled in the past; editing an existing
      // (possibly already-past) event is unaffected — see handleUpdateEvent.
      if (formData.date < formatDateForInput(new Date())) {
        setModalError('Cannot schedule a meeting in the past.');
        setIsSubmitting(false);
        return;
      }

      // Check for time conflicts
      if (checkTimeConflict(formData.date, formData.startTime, formData.endTime)) {
        setModalError('There is already an event scheduled at this time. Please choose a different time.');
        setIsSubmitting(false);
        return;
      }

      if (formData.whatsappReminderEnabled && formData.whatsappReminderMode === 'fixed_time' && formData.whatsappReminderFixedTime) {
        const hoursBefore = computeFixedTimeHoursBefore();
        if (hoursBefore !== null && hoursBefore <= 0) {
          setModalError('The reminder time must be earlier than the meeting start time.');
          setIsSubmitting(false);
          return;
        }
      }

      // Parse date components to avoid timezone issues
      const [year, month, day] = formData.date.split('-').map(Number);
      const [startHour, startMinute] = formData.startTime.split(':').map(Number);
      const [endHour, endMinute] = formData.endTime.split(':').map(Number);

      // Create dates in local timezone, then convert to ISO string
      const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
      const endDateTime = new Date(year, month - 1, day, endHour, endMinute);

      const eventData = {
        title: formData.title,
        description: formData.description || undefined,
        type: formData.type,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        location: formData.location || undefined,
        meetingPlatform: formData.meetingPlatform || undefined,
        contactId: formData.contactId || undefined,
        autoGenerateMeetingLink: formData.autoGenerateMeetingLink || undefined,
        color: getColorForType(formData.type),
        customFields: buildWhatsappReminderCustomFields(),
      };

      const response = formData.organizerId
        ? await api.post<Event>(`/events/schedule-for/${formData.organizerId}`, eventData)
        : await api.post<Event>('/events', eventData);

      setEvents([...events, response.data]);
      setShowEventModal(false);
      resetForm();
    } catch (err: any) {
      console.error('Failed to create event:', err);
      setModalError(err.response?.data?.message || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string): Promise<boolean> => {
    if (!confirm('Are you sure you want to delete this event?')) return false;

    try {
      await api.delete(`/events/${eventId}`);
      setEvents(events.filter(e => e.id !== eventId));
      return true;
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete event');
      return false;
    }
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);

    // Parse the event dates to populate the form
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);

    const reminder = event.customFields?.whatsappReminder as
      | { enabled?: boolean; flowId?: string; hoursBefore?: number; mode?: 'hours_before' | 'fixed_time'; fixedTime?: string }
      | undefined;

    setContactSearchQuery(event.contact ? `${event.contact.firstName} ${event.contact.lastName}` : '');
    setContactSearchResults([]);
    setShowContactDropdown(false);

    setFormData({
      title: event.title,
      description: event.description || '',
      type: event.type,
      date: startDate.toISOString().split('T')[0],
      startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
      location: event.location || '',
      meetingPlatform: event.meetingPlatform,
      contactId: event.contact?.id || event.contactId,
      whatsappReminderEnabled: reminder?.enabled !== false,
      whatsappReminderFlowId: reminder?.flowId,
      whatsappReminderMode: reminder?.mode === 'fixed_time' ? 'fixed_time' : 'hours_before',
      whatsappReminderHoursBefore: reminder?.hoursBefore,
      whatsappReminderFixedTime: reminder?.fixedTime,
    });

    setShowEventModal(true);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    setModalError('');
    setIsSubmitting(true);

    try {
      // Check for time conflicts (excluding the current event being edited)
      if (checkTimeConflict(formData.date, formData.startTime, formData.endTime, editingEvent.id)) {
        setModalError('There is already an event scheduled at this time. Please choose a different time.');
        setIsSubmitting(false);
        return;
      }

      if (formData.whatsappReminderEnabled && formData.whatsappReminderMode === 'fixed_time' && formData.whatsappReminderFixedTime) {
        const hoursBefore = computeFixedTimeHoursBefore();
        if (hoursBefore !== null && hoursBefore <= 0) {
          setModalError('The reminder time must be earlier than the meeting start time.');
          setIsSubmitting(false);
          return;
        }
      }

      // Parse date components to avoid timezone issues
      const [year, month, day] = formData.date.split('-').map(Number);
      const [startHour, startMinute] = formData.startTime.split(':').map(Number);
      const [endHour, endMinute] = formData.endTime.split(':').map(Number);

      // Create dates in local timezone, then convert to ISO string
      const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
      const endDateTime = new Date(year, month - 1, day, endHour, endMinute);

      const eventData = {
        title: formData.title,
        description: formData.description || undefined,
        type: formData.type,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        location: formData.location || undefined,
        meetingPlatform: formData.meetingPlatform || undefined,
        contactId: formData.contactId || undefined,
        color: getColorForType(formData.type),
        customFields: buildWhatsappReminderCustomFields(),
      };

      const response = await api.put<Event>(`/events/${editingEvent.id}`, eventData);

      setEvents(events.map(e => e.id === editingEvent.id ? response.data : e));
      setShowEventModal(false);
      setEditingEvent(null);
      resetForm();
    } catch (err: any) {
      console.error('Failed to update event:', err);
      setModalError(err.response?.data?.message || 'Failed to update event');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to format date without timezone issues
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to check for time conflicts
  const checkTimeConflict = (date: string, startTime: string, endTime: string, excludeEventId?: string): boolean => {
    const [year, month, day] = date.split('-').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const newStart = new Date(year, month - 1, day, startHour, startMinute);
    const newEnd = new Date(year, month - 1, day, endHour, endMinute);

    // Get events for the same day
    const sameDay = new Date(year, month - 1, day);
    const dayEvents = getEventsForDate(sameDay).filter(e => excludeEventId ? e.id !== excludeEventId : true);

    // Check if any event overlaps
    for (const event of dayEvents) {
      const existingStart = new Date(event.startDate);
      const existingEnd = new Date(event.endDate);

      // Check for overlap: new event starts before existing ends AND new event ends after existing starts
      if (newStart < existingEnd && newEnd > existingStart) {
        return true; // Conflict found
      }
    }

    return false; // No conflict
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'meeting',
      date: selectedDate ? formatDateForInput(selectedDate) : formatDateForInput(new Date()),
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      contactId: '',
      autoGenerateMeetingLink: false,
      whatsappReminderEnabled: true,
      whatsappReminderFlowId: undefined,
      whatsappReminderMode: 'hours_before',
      whatsappReminderHoursBefore: undefined,
      whatsappReminderFixedTime: undefined,
      organizerId: '',
    });
    setContactSearchQuery('');
    setContactSearchResults([]);
    setShowContactDropdown(false);
    setModalError('');
    setSelectedDate(null);
    setEditingEvent(null);
  };

  const getColorForType = (type: string): string => {
    switch (type) {
      case 'meeting': return '#3B82F6';
      case 'call': return '#10B981';
      case 'task': return '#F59E0B';
      case 'deadline': return '#EF4444';
      case 'appointment': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getColorClasses = (type: string): string => {
    switch (type) {
      case 'meeting': return 'bg-blue-500';
      case 'call': return 'bg-green-500';
      case 'task': return 'bg-orange-500';
      case 'deadline': return 'bg-red-500';
      case 'appointment': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

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
    return events.filter(event => {
      const eventDate = new Date(event.startDate);
      return eventDate.getDate() === date.getDate() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
            setFormData({ ...formData, date: formatDateForInput(date) });
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
                className={`text-xs px-2 py-1 rounded ${getColorClasses(event.type)} text-white truncate hover:opacity-80`}
                onClick={(e) => { e.stopPropagation(); handleEditEvent(event); }}
              >
                {formatTime(event.startDate)} - {event.title}
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

  const upcomingEvents = events
    .filter(e => new Date(e.startDate) >= new Date())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5);

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

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
          onClick={() => {
            setSelectedDate(new Date());
            setFormData({ ...formData, date: new Date().toISOString().split('T')[0] });
            setShowEventModal(true);
          }}
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

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchEvents} className="ml-auto text-sm text-red-600 hover:text-red-700 font-semibold">
            Retry
          </button>
        </div>
      )}

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
        {upcomingEvents.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No upcoming events</p>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((event) => {
              const Icon = getEventIcon(event.type);
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-cyan-300 hover:shadow-lg transition-all group"
                >
                  <div className={`p-2.5 rounded-lg ${getColorClasses(event.type)}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{event.title}</h4>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>{new Date(event.startDate).toLocaleDateString()} • {formatTime(event.startDate)} - {formatTime(event.endDate)}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          <span>{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditEvent(event);
                      }}
                      className="p-2 rounded-lg hover:bg-blue-50 transition-all"
                    >
                      <Edit className="h-4 w-4 text-blue-600" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEvent(event.id);
                      }}
                      className="p-2 rounded-lg hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingEvent ? 'Edit Event' : (selectedDate ? `New Event - ${selectedDate.toLocaleDateString()}` : 'New Event')}
              </h2>
              <button
                onClick={() => {
                  setShowEventModal(false);
                  resetForm();
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={editingEvent ? handleUpdateEvent : handleCreateEvent} className="p-6 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Event Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter event title..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Event Type *</label>
                  <select
                    required
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="meeting">Meeting</option>
                    <option value="call">Call</option>
                    <option value="task">Task</option>
                    <option value="deadline">Deadline</option>
                    <option value="appointment">Appointment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date *</label>
                  <input
                    type="date"
                    required
                    min={editingEvent ? undefined : formatDateForInput(new Date())}
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {!editingEvent && closers.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Book for</label>
                  <select
                    value={formData.organizerId || ''}
                    onChange={(e) => setFormData({ ...formData, organizerId: e.target.value || undefined })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Myself</option>
                    {closers.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName} (Closer)</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">End Time *</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Meeting Platform</label>
                <select
                  value={formData.meetingPlatform || ''}
                  onChange={(e) => setFormData({ ...formData, meetingPlatform: e.target.value as any || undefined })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">None</option>
                  <option value="zoom">Zoom</option>
                  <option value="google_meet">Google Meet</option>
                  <option value="microsoft_teams">Microsoft Teams</option>
                  <option value="phone">Phone</option>
                  <option value="in_person">In Person</option>
                </select>
              </div>

              {(formData.meetingPlatform === 'zoom' || formData.meetingPlatform === 'google_meet') && (
                <label className="flex items-center gap-2 text-sm text-gray-700 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={!!formData.autoGenerateMeetingLink}
                    onChange={(e) => setFormData({ ...formData, autoGenerateMeetingLink: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 accent-cyan-600"
                  />
                  Auto-generate a real {formData.meetingPlatform === 'zoom' ? 'Zoom' : 'Google Meet'} link for this meeting
                </label>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact (for WhatsApp meeting reminders)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={contactSearchQuery}
                    onChange={(e) => {
                      setContactSearchQuery(e.target.value);
                      setShowContactDropdown(true);
                      if (formData.contactId) setFormData({ ...formData, contactId: undefined });
                    }}
                    onFocus={() => setShowContactDropdown(true)}
                    onBlur={() => setTimeout(() => setShowContactDropdown(false), 150)}
                    placeholder="Search contacts by name, email or phone..."
                    className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  {formData.contactId && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, contactId: undefined });
                        setContactSearchQuery('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100"
                    >
                      <X className="h-4 w-4 text-gray-400" />
                    </button>
                  )}

                  {showContactDropdown && !formData.contactId && contactSearchQuery.trim() && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {contactSearchLoading ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                        </div>
                      ) : contactSearchResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">No contacts found</div>
                      ) : (
                        contactSearchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setFormData({ ...formData, contactId: c.id });
                              setContactSearchQuery(`${c.firstName} ${c.lastName}`);
                              setShowContactDropdown(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-cyan-50 border-b border-gray-100 last:border-0"
                          >
                            {c.firstName} {c.lastName}{c.phone ? ` — ${c.phone}` : ''}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {formData.contactId && enabledReminderFlows.length > 0 && (
                <div className="space-y-3 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.whatsappReminderEnabled}
                      onChange={(e) => setFormData({ ...formData, whatsappReminderEnabled: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 accent-green-600"
                    />
                    Send WhatsApp reminder before this meeting
                  </label>

                  {formData.whatsappReminderEnabled && (
                    <div className="space-y-3">
                      {enabledReminderFlows.length > 1 && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Flow</label>
                          <select
                            value={formData.whatsappReminderFlowId || ''}
                            onChange={(e) => setFormData({ ...formData, whatsappReminderFlowId: e.target.value || undefined })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            <option value="">Default (first enabled)</option>
                            {enabledReminderFlows.map((f) => (
                              <option key={f.id} value={f.id}>{f.name || f.id}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex gap-1">
                        <button type="button" onClick={() => setFormData({ ...formData, whatsappReminderMode: 'hours_before' })}
                          className={`px-2 py-1 text-xs rounded-lg font-medium ${formData.whatsappReminderMode === 'hours_before' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                          Hours before
                        </button>
                        <button type="button" onClick={() => setFormData({ ...formData, whatsappReminderMode: 'fixed_time' })}
                          className={`px-2 py-1 text-xs rounded-lg font-medium ${formData.whatsappReminderMode === 'fixed_time' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                          Fixed time
                        </button>
                      </div>

                      {formData.whatsappReminderMode === 'fixed_time' ? (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Send at this time, on the day of the meeting</label>
                          <input
                            type="time"
                            value={formData.whatsappReminderFixedTime || ''}
                            onChange={(e) => setFormData({ ...formData, whatsappReminderFixedTime: e.target.value || undefined })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <p className="mt-1 text-[11px] text-gray-400">e.g. 07:00 sends the reminder at 7am on the meeting's date, regardless of what time the meeting itself starts.</p>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Hours before</label>
                          <input
                            type="number"
                            min={1}
                            placeholder={String(
                              enabledReminderFlows.find(f => f.id === formData.whatsappReminderFlowId)?.reminderHoursBefore || 3
                            )}
                            value={formData.whatsappReminderHoursBefore ?? ''}
                            onChange={(e) => setFormData({ ...formData, whatsappReminderHoursBefore: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Add location or meeting link..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add event description..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
                {editingEvent ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editingEvent) return;
                      const deleted = await handleDeleteEvent(editingEvent.id);
                      if (deleted) {
                        setShowEventModal(false);
                        resetForm();
                      }
                    }}
                    className="px-6 py-3 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-all flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                ) : <span />}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEventModal(false);
                      resetForm();
                    }}
                    className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-teal-600 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSubmitting ? (editingEvent ? 'Updating...' : 'Creating...') : (editingEvent ? 'Update Event' : 'Create Event')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
