import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | EasyTeam CRM',
  description: 'Learn how EasyTeam CRM collects, uses, and protects your data.',
};

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'Account details (name, email, workspace info) to create and secure your account.',
      'CRM data you add (contacts, companies, deals, notes, files) to operate the platform.',
      'Usage and device data (log events, performance metrics, approximate location) to improve reliability and support.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'Provide and maintain the CRM features you request.',
      'Deliver onboarding, product updates, and important service notifications.',
      'Improve performance, security, and user experience through analytics and debugging.',
      'Meet legal, compliance, and security obligations.',
    ],
  },
  {
    title: 'Sharing & Third Parties',
    body: [
      'Infrastructure, analytics, and communications providers who process data under contract.',
      'Integrations you authorize (e.g., email, calendars, storage) — data flows only as configured by you.',
      'Legal disclosures when required to protect rights, safety, or comply with law.',
    ],
  },
  {
    title: 'Security & Retention',
    body: [
      'Encryption in transit, access controls, backups, and monitoring to safeguard data.',
      'Data is retained while your account is active and for limited periods afterwards to meet legal or operational needs.',
    ],
  },
  {
    title: 'Your Rights',
    body: [
      'Access, correct, export, or delete your personal data subject to applicable law.',
      'Control marketing communications and connected integrations from your account settings.',
      'Contact us to exercise data rights or ask privacy questions.',
    ],
  },
];

export default function Privacy() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-16 lg:py-20">
        <div className="mb-10 space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Privacy-first by design
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="text-sm text-slate-600">Last updated: June 2026</p>
          <p className="text-slate-600 sm:text-lg">
            We built EasyTeam CRM to keep your customer data safe and under your control. This page explains what we
            collect, why we collect it, and the choices you have.
          </p>
        </div>

        <div className="grid gap-6 rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          {sections.map((section) => (
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
              Have questions or want to exercise a privacy right? Reach us at{' '}
              <a className="font-semibold text-indigo-600 hover:text-indigo-700" href="mailto:contact@primafisoft.com">
                contact@primafisoft.com
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
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
