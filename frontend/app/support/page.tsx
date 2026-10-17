import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support | EasyTeam CRM',
  description: 'Get help with EasyTeam CRM on the web and on iPhone and Android.',
};

const SUPPORT_EMAIL = 'contact@primafisoft.com';

const faqs = [
  {
    q: 'How do I get an account?',
    a: 'Accounts are created by your company administrator. Ask them to add you from Users in the EasyTeam CRM web app, then sign in with the email and password you receive.',
  },
  {
    q: 'I forgot my password.',
    a: 'On the sign-in screen, choose "Forgot password" and follow the link sent to your email. If you do not receive it, check your spam folder or contact your administrator.',
  },
  {
    q: 'I do not see my WhatsApp, Messenger or Instagram conversations.',
    a: 'Messaging channels are connected by your administrator under Integrations in the web app. If a channel is connected but you still see nothing, your administrator may need to give you access to that channel or assign conversations to you.',
  },
  {
    q: 'I am not receiving notifications.',
    a: 'Allow notifications for EasyTeam CRM in your phone settings, then open the app, go to Settings and check that the notification types you want are switched on.',
  },
  {
    q: 'Calls or voice messages do not work.',
    a: 'Allow microphone access for EasyTeam CRM in your phone settings (Settings → EasyTeam CRM → Microphone on iPhone).',
  },
  {
    q: 'How do I delete my account or my data?',
    a: 'Ask your workspace administrator to remove your user, or email us and we will delete your data within 30 days.',
  },
];

export default function Support() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-16 lg:py-20">
        <div className="mb-10 space-y-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">EasyTeam CRM Support</h1>
          <p className="text-slate-600 sm:text-lg">
            Help for the EasyTeam CRM web app and the iPhone and Android apps.
          </p>
        </div>

        <section className="mb-6 rounded-2xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
          <h2 className="text-xl font-semibold text-slate-900">Contact us</h2>
          <p className="mt-2 text-slate-700 leading-relaxed">
            Email{' '}
            <a className="font-semibold text-emerald-700 hover:text-emerald-800" href={`mailto:${SUPPORT_EMAIL}?subject=EasyTeam%20CRM%20support`}>
              {SUPPORT_EMAIL}
            </a>{' '}
            with your name, company and a short description of the problem (screenshots help). We reply within 1–2 business days.
          </p>
          <p className="mt-2 text-sm text-slate-600">Primafisoft · Support in English and Romanian</p>
        </section>

        <div className="grid gap-6 rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Frequently asked questions</h2>
          {faqs.map((item) => (
            <section key={item.q} className="space-y-1">
              <h3 className="font-semibold text-slate-900">{item.q}</h3>
              <p className="text-slate-700 leading-relaxed">{item.a}</p>
            </section>
          ))}

          <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4 text-sm">
            <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700 font-semibold">Privacy Policy</Link>
            <Link href="/terms" className="text-indigo-600 hover:text-indigo-700 font-semibold">Terms of Service</Link>
            <Link href="/data-deletion" className="text-indigo-600 hover:text-indigo-700 font-semibold">Data deletion</Link>
            <Link href="/help" className="text-indigo-600 hover:text-indigo-700 font-semibold">User guide</Link>
            <Link href="/login" className="text-slate-600 hover:text-slate-800">Sign in</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
