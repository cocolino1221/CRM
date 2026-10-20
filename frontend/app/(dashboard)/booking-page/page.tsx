'use client';

/**
 * The public booking page as a whole — its link, how it looks and what it
 * asks before the calendar. Disponibilitate stays about each person's hours.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, Check, ChevronRight, Copy, ExternalLink, Link2, Loader2, Palette } from 'lucide-react';
import api from '@/lib/api';
import BookingPagesCard from '@/components/bookings/BookingPagesCard';

export default function BookingPageSettings() {
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Any public meeting type in the workspace opens the same team page, so
    // the viewer's own is enough to build the link.
    api
      .get('/scheduling/meeting-types')
      .then((res) => {
        const types = Array.isArray(res.data) ? res.data : [];
        setSlug(types[0]?.slug ?? null);
      })
      .catch(() => setSlug(null))
      .finally(() => setLoading(false));
  }, []);

  const link = slug ? `${window.location.origin}/book/${slug}` : '';

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <CalendarCheck className="h-6 w-6 text-indigo-600" /> Pagina de programare
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Pagina pe care leadul își alege ora: linkul ei, cum arată și ce întrebi înainte de calendar.
        </p>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Link2 className="h-4 w-4 text-indigo-600" /> Linkul paginii
        </h2>
        {loading ? (
          <Loader2 className="mt-3 h-4 w-4 animate-spin text-gray-400" />
        ) : link ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                {link}
              </code>
              <button
                onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiat' : 'Copiază'}
              </button>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Deschide
              </a>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Leadul vede orele libere ale întregii echipe. Linkul îl pui în Typeform, în WooCommerce sau după un formular.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            Pagina apare după ce cineva își salvează programul în{' '}
            <Link href="/booking-settings" className="text-indigo-600 hover:underline">
              Disponibilitate
            </Link>
            .
          </p>
        )}
      </section>

      <Link
        href="/booking-settings/aspect"
        className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800"
      >
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <Palette className="h-4 w-4 text-indigo-600" /> Aspectul paginii
          </span>
          <span className="mt-1 block text-xs text-gray-500">Logo, fundal, culori și textul de bun venit.</span>
        </span>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </Link>

      <BookingPagesCard baseLink={link} />
    </div>
  );
}
