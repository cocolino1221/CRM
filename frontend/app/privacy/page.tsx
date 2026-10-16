import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | EasyTeam CRM',
  description: 'Learn how EasyTeam CRM collects, uses, and protects your data.',
};

const sections = [
  {
    title: 'Who We Are',
    body: [
      'EasyTeam CRM (web app at etcrm.primafisoft.com and the EasyTeam CRM mobile apps) is operated by Primafisoft.',
      'Companies ("workspaces") use EasyTeam CRM to manage their leads, customers and conversations. For the customer data a company stores in its workspace, that company is the data controller and we process the data on its behalf.',
    ],
  },
  {
    title: 'Information We Collect',
    body: [
      'Account information: your name, email address, phone number (optional), role and workspace, used to create and secure your account.',
      'Customer data you or your team add or receive: contacts, leads, companies, deals, notes, tasks, documents and pipeline information.',
      'Messages: WhatsApp, Facebook Messenger, Instagram and email conversations sent or received through integrations your workspace connects, including text, photos, videos, documents and voice messages.',
      'Calls: when WhatsApp calling or call recording is enabled by your workspace, call details (time, duration, participants) and recordings.',
      'Photos, videos and audio you choose to send: the mobile app accesses your camera, photo library or microphone only when you attach media, record a voice message or make a call.',
      'Device information: a push notification token and basic device type, used only to deliver notifications you have enabled.',
      'Technical logs: server logs (such as IP address, request time and errors) kept for security and troubleshooting.',
    ],
  },
  {
    title: 'What We Do Not Collect',
    body: [
      'We do not collect your precise or approximate location.',
      'We do not read your phone\'s address book or contacts.',
      'We do not use advertising identifiers, show ads, track you across other companies\' apps or websites, or sell personal data.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'To provide the CRM features you and your workspace use: inbox, leads, pipeline, calendar, documents, payments and automations.',
      'To send and receive messages through the channels your workspace has connected (for example the official WhatsApp Business Platform).',
      'To send notifications about new leads, messages, calls and tasks, according to your notification settings.',
      'To keep the service secure, prevent abuse, fix problems and meet legal obligations.',
    ],
  },
  {
    title: 'Sharing & Third Parties',
    body: [
      'Service providers that host and run the platform for us (cloud hosting, database, email delivery and push notification services such as Apple Push Notification service and Firebase Cloud Messaging), under contract and only to provide the service.',
      'Integrations your workspace connects, such as Meta (WhatsApp, Messenger, Instagram), Google, Typeform, WooCommerce or payment providers. Data is exchanged with them only as configured by your workspace.',
      'Authorities, when required by law or to protect rights and safety.',
      'We never sell personal data and never share it for advertising.',
    ],
  },
  {
    title: 'Security & Retention',
    body: [
      'Data is encrypted in transit (HTTPS), integration credentials are encrypted at rest, and access is limited by user roles.',
      'Workspace data is kept while the workspace is active. When an account or workspace is deleted, its data is removed within 30 days, except where we must keep it longer by law. Backups are overwritten on a rolling basis.',
    ],
  },
  {
    title: 'Your Rights',
    body: [
      'You can access, correct, export or delete your personal data, and object to or restrict its processing, under applicable law (including the GDPR).',
      'To delete your account, ask your workspace administrator or email us — see the Data Deletion page. If your data is held by a company using EasyTeam CRM, we will forward your request to that company.',
      'You can turn off push notifications at any time in the app settings or your phone settings.',
      'You may also lodge a complaint with your local data protection authority.',
    ],
  },
  {
    title: 'Children',
    body: ['EasyTeam CRM is a business tool and is not intended for children under 16.'],
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
          <p className="text-sm text-slate-600">Last updated: October 2026</p>
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
              <Link href="/data-deletion" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                Data deletion
              </Link>
              <Link href="/support" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                Support
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
