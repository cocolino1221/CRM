'use client';

/**
 * What a closer needs about one booking, opened from the calendar: who, when,
 * how to reach them, and the button that joins the meeting.
 */

import { useEffect, useState } from 'react';
import { Calendar, Check, Copy, Mail, MessageCircle, Phone, StickyNote, User, Video, X } from 'lucide-react';
import type { CalendarBooking } from '@/lib/calendar-bookings';
import { whatsappDigits } from '@/lib/queue-rows';

function when(booking: CalendarBooking, timeZone: string): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ro-RO', { timeZone, ...opts }).format(new Date(iso));
  const day = fmt(booking.startTime, { weekday: 'long', day: 'numeric', month: 'long' });
  const start = fmt(booking.startTime, { hour: '2-digit', minute: '2-digit' });
  const end = booking.endTime ? ` – ${fmt(booking.endTime, { hour: '2-digit', minute: '2-digit' })}` : '';
  return `${day}, ${start}${end}`;
}

export default function BookingDetailsModal({
  booking,
  timeZone = 'Europe/Bucharest',
  onClose,
}: {
  booking: CalendarBooking;
  timeZone?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const wa = whatsappDigits(booking.phone);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    if (!booking.link) return;
    try {
      await navigator.clipboard.writeText(booking.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the link is still on screen to select.
    }
  };

  const row = 'flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200';
  const icon = 'mt-0.5 h-4 w-4 shrink-0 text-gray-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Programare cu ${booking.leadName}`}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
              {booking.meetingName || 'Programare'}
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">{booking.leadName}</h2>
          </div>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className={row}>
            <Calendar className={icon} />
            <span className="capitalize">{when(booking, timeZone)}</span>
          </div>
          {booking.hostName && (
            <div className={row}>
              <User className={icon} />
              <span>Closer: <strong>{booking.hostName}</strong></span>
            </div>
          )}
          {booking.phone && (
            <div className={row}>
              <Phone className={icon} />
              <span className="flex flex-wrap items-center gap-2">
                <a href={`tel:${booking.phone}`} className="font-medium text-blue-600 hover:underline">
                  {booking.phone}
                </a>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                )}
              </span>
            </div>
          )}
          {booking.email && (
            <div className={row}>
              <Mail className={icon} />
              <a href={`mailto:${booking.email}`} className="break-all text-blue-600 hover:underline">
                {booking.email}
              </a>
            </div>
          )}
          {booking.notes && (
            <div className={row}>
              <StickyNote className={icon} />
              <span className="whitespace-pre-wrap">{booking.notes}</span>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2">
          {booking.link ? (
            <>
              <a
                href={booking.link}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                <Video className="h-4 w-4" /> Intră pe {booking.platform || 'întâlnire'}
              </a>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">{booking.link}</span>
                <button
                  onClick={() => void copy()}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiat' : 'Copiază'}
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Programarea nu are link de întâlnire. Sună lead-ul la ora stabilită.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
