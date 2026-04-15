import Link from 'next/link';
import { Manrope, Space_Grotesk } from 'next/font/google';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const modules = [
  {
    title: 'Leads & Pipeline',
    summary: 'Organizezi lead-urile pe etape, vezi urmatorul pas si prioritizezi oportunitatile.',
    tips: ['Mutare lead intre etape', 'Task-uri automate pe etapa', 'Filtre rapide pe status'],
  },
  {
    title: 'Documents',
    summary: 'Trimiti documente la semnat direct din CRM si urmaresti statusul in timp real.',
    tips: ['Template-uri reutilizabile', 'Semnare + remindere', 'Istoric complet pe document'],
  },
  {
    title: 'Payments',
    summary: 'Vezi tranzactii, subscriptions si link-uri intr-un tab centralizat.',
    tips: ['Status paid/failed/pending', 'Corelare pe email cu documente', 'Notificari pe plata'],
  },
  {
    title: 'WhatsApp',
    summary: 'Inbox unificat, template-uri si campanii, cu rutare pe mai multe numere.',
    tips: ['Mesaje 1:1 si bulk', 'Template approvals', 'Asignare conversatii pe user'],
  },
];

const quickStart = [
  'Creeaza workspace si invita echipa.',
  'Importa lead-uri sau conecteaza formular/integrari.',
  'Configureaza pipeline-ul de vanzare.',
  'Seteaza template-uri de document si reguli de plata.',
  'Porneste automatizarile si notificari pe evenimente.',
];

const faq = [
  {
    q: 'Cum nu afectam clientii existenti cand lansam pachete noi?',
    a: 'Workspaces existente raman pe mod grandfathered, iar limitele noi se aplica doar conturilor noi.',
  },
  {
    q: 'Pot avea mai multe numere WhatsApp pe acelasi workspace?',
    a: 'Da. Numarul de senders poate fi controlat pe pachet, cu rutare pe campanii sau echipa.',
  },
  {
    q: 'Cum conectez Stripe pentru abonamente?',
    a: 'Se configureaza client + subscription in Stripe si webhook-urile actualizeaza statusul in CRM.',
  },
  {
    q: 'Cine primeste notificarile de plata si contract?',
    a: 'By default, userul care trimite contractul. Se poate extinde pe reguli per workspace.',
  },
];

export default function HelpPage() {
  return (
    <main className={`${bodyFont.className} min-h-screen bg-[#f8fafc] text-slate-900`}>
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(16,185,129,0.1),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.12),transparent_35%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Help Center
              </p>
              <h1 className={`${displayFont.className} text-4xl font-bold`}>Tot ce ai nevoie pentru a folosi CRM-ul eficient</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                Ghiduri rapide pentru echipa ta: setup, flux de vanzare, documente, plati si automatizari.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                Promo
              </Link>
              <Link href="/register" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
                Start
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className={`${displayFont.className} text-3xl font-bold`}>Quick Start</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {quickStart.map((step, index) => (
            <article key={step} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pas {index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-10">
        <h2 className={`${displayFont.className} text-3xl font-bold`}>Explicatii pe Module</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {modules.map((module) => (
            <article key={module.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className={`${displayFont.className} text-2xl font-bold text-slate-900`}>{module.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{module.summary}</p>
              <div className="mt-4 space-y-1.5">
                {module.tips.map((tip) => (
                  <p key={tip} className="text-sm text-slate-700">- {tip}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className={`${displayFont.className} text-3xl font-bold`}>FAQ</h2>
        <div className="mt-5 space-y-3">
          {faq.map((item) => (
            <article key={item.q} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-slate-900">{item.q}</p>
              <p className="mt-2 text-sm text-slate-600">{item.a}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
