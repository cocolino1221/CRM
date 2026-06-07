import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data Deletion | EasyTeam CRM',
  description: 'How to request deletion of your personal data from EasyTeam CRM.',
};

const steps = [
  {
    title: 'Request by email',
    body: [
      'Send an email to contact@primafisoft.com with the subject "Data Deletion".',
      'Include the name, email, or Facebook / Instagram account connected to EasyTeam CRM so we can identify your data.',
    ],
  },
  {
    title: 'Remove the app from Facebook / Instagram',
    body: [
      'Open Facebook Settings → Settings & Privacy → Settings → Business Integrations.',
      'Find "EasyTeam CRM", click Remove, and confirm. This revokes our access to your account.',
    ],
  },
  {
    title: 'What gets deleted',
    body: [
      'All data associated with your account: profile details, connected page/Instagram identifiers, and stored conversation messages.',
      'Deletion is completed within 30 days of the request. We send a confirmation once finished.',
    ],
  },
];

export default function DataDeletion() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-16 lg:py-20">
        <div className="mb-10 space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Your data, your control
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Data Deletion</h1>
          <p className="text-sm text-slate-600">Last updated: June 2026</p>
          <p className="text-slate-600 sm:text-lg">
            You can request deletion of the personal data EasyTeam CRM holds about you at any time. Follow either of the
            options below.
          </p>
        </div>

        <div className="grid gap-6 rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          {steps.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
              <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
                {section.body.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
            <p className="text-slate-700 leading-relaxed">
              Questions about your data or this process? Reach us at{' '}
              <a className="font-semibold text-indigo-600 hover:text-indigo-700" href="mailto:contact@primafisoft.com">
                contact@primafisoft.com
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                View Privacy Policy
              </Link>
              <Link href="/terms" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                View Terms of Service
              </Link>
              <Link href="/login" className="text-slate-600 hover:text-slate-800">
                Back to login
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
