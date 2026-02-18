import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | EasyTeam CRM',
  description: 'The terms that govern your use of EasyTeam CRM.',
};

const sections = [
  {
    title: 'Acceptance of Terms',
    body: [
      'By creating an account or using EasyTeam CRM, you agree to these Terms.',
      'If you use EasyTeam CRM on behalf of an organization, you confirm you have authority to bind that organization.',
    ],
  },
  {
    title: 'Accounts & Workspace Ownership',
    body: [
      'Workspace owners control membership, roles, billing, and data within their workspace.',
      'You are responsible for keeping credentials secure and for activity occurring under your account.',
    ],
  },
  {
    title: 'Subscriptions & Billing',
    body: [
      'Paid plans renew automatically based on your selected term unless cancelled.',
      'Fees are non-refundable except where required by law; changes in seat count or plan adjust future invoices.',
      'We may suspend service for unpaid or disputed invoices after notice.',
    ],
  },
  {
    title: 'Acceptable Use',
    body: [
      'Do not misuse the service: no unlawful, infringing, or abusive behavior; no attempting to breach or overload systems.',
      'Respect data privacy: only store or transmit data you have rights to handle.',
    ],
  },
  {
    title: 'Data & Confidentiality',
    body: [
      'You retain ownership of Customer Data; we process it to provide the service under your instructions.',
      'We implement administrative, technical, and physical safeguards to protect Customer Data.',
    ],
  },
  {
    title: 'Warranties & Disclaimers',
    body: [
      'The service is provided “as is” and “as available”. To the fullest extent permitted by law, we disclaim implied warranties of merchantability, fitness, and non-infringement.',
      'We do not guarantee uninterrupted or error-free operation, though we aim for high availability.',
    ],
  },
  {
    title: 'Termination',
    body: [
      'You may cancel at any time via account settings; access continues through the current paid term.',
      'We may suspend or terminate for material breach, unlawful use, or risk to the service or other users.',
    ],
  },
  {
    title: 'Governing Law',
    body: [
      'These Terms are governed by the laws applicable in your primary contracting entity’s jurisdiction, without regard to conflict of law principles.',
    ],
  },
];

export default function Terms() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-16 lg:py-20">
        <div className="mb-10 space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Terms that protect your data and business
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
          <p className="text-sm text-slate-600">Last updated: June 2026</p>
          <p className="text-slate-600 sm:text-lg">
            Thanks for using EasyTeam CRM. Please review these terms to understand your rights, responsibilities, and how we
            deliver the service.
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
              Questions about these Terms? Email us at{' '}
              <a className="font-semibold text-indigo-600 hover:text-indigo-700" href="mailto:contact@primafisoft.com">
                contact@primafisoft.com
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                View Privacy Policy
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
