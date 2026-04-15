'use client';

import Link from 'next/link';
import { Space_Grotesk, Manrope } from 'next/font/google';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const features = [
  {
    title: 'Pipeline Vizual',
    description: 'Muti lead-uri instant intre etape, cu context complet: mesaje, task-uri si documente.',
  },
  {
    title: 'Automatizari Reale',
    description: 'Reguli IF/THEN pe semnare contract, plata esuata sau plata confirmata, direct din CRM.',
  },
  {
    title: 'Documents + Payments',
    description: 'Trimiti contract, urmaresti statusul semnarii si vezi tranzactiile in acelasi flow.',
  },
  {
    title: 'WhatsApp Integrat',
    description: 'Inbox unificat, template-uri, campanii si rutare pe mai multe numere, pe workspace.',
  },
];

const plans = [
  {
    name: 'Starter',
    price: '99 EUR',
    subtitle: 'pentru echipe la inceput',
    bullets: ['Pipeline + Contacts', 'Documents + Payments', '1 numar WhatsApp', 'Support standard'],
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    name: 'Growth',
    price: '249 EUR',
    subtitle: 'pentru scaling rapid',
    bullets: ['Tot din Starter', 'Automatizari avansate', '3 numere WhatsApp', 'Rapoarte extinse'],
    accent: 'from-cyan-500 to-sky-500',
    featured: true,
  },
  {
    name: 'Scale',
    price: 'Custom',
    subtitle: 'pentru volume mari',
    bullets: ['Tot din Growth', 'Integrari enterprise', 'Mai multe numere WhatsApp', 'Onboarding dedicat'],
    accent: 'from-orange-500 to-amber-500',
  },
];

export default function Home() {
  return (
    <main className={`${bodyFont.className} min-h-screen bg-[#f7faf8] text-slate-900`}>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(16,185,129,0.16),transparent_40%),radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.14),transparent_42%),radial-gradient(circle_at_50%_95%,rgba(249,115,22,0.14),transparent_40%)]" />
        <div className="absolute -left-24 top-24 h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl hero-glow" />
        <div className="absolute -right-24 top-40 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl hero-glow" />

        <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-10 md:pb-28 md:pt-16">
          <nav className="mb-12 flex items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-5 py-3 backdrop-blur">
            <div className={`${displayFont.className} text-lg font-bold tracking-tight text-slate-900`}>
              EasyTeam CRM
            </div>
            <div className="flex items-center gap-2">
              <Link href="/help" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Help
              </Link>
              <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Login
              </Link>
              <Link href="/register" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
                Incepe Acum
              </Link>
            </div>
          </nav>

          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="reveal">
              <p className="mb-3 inline-flex rounded-full border border-emerald-300/70 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
                CRM care vinde, nu doar organizeaza
              </p>
              <h1 className={`${displayFont.className} text-4xl font-bold leading-tight md:text-6xl`}>
                Mai multe contracte semnate.
                <span className="block text-emerald-600">Mai multe plati confirmate.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
                Platforma all-in-one pentru echipe de vanzari: lead management, automatizari, documente, plati si WhatsApp,
                intr-un flux simplu si clar.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                  Creeaza cont
                </Link>
                <Link href="/help" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">
                  Vezi ghidul
                </Link>
              </div>
            </div>

            <div className="reveal md:pl-6" style={{ animationDelay: '120ms' }}>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_60px_rgba(2,6,23,0.08)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Live Snapshot</p>
                    <p className="text-sm font-semibold text-slate-800">Q2 Sales Workspace</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">+18% conv</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Pipeline Health</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">74 lead-uri active</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-100 bg-cyan-50 p-3">
                      <p className="text-xs text-cyan-700">Contracts Signed</p>
                      <p className="mt-1 text-lg font-bold text-cyan-900">26</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-amber-50 p-3">
                      <p className="text-xs text-amber-700">Payments Today</p>
                      <p className="mt-1 text-lg font-bold text-amber-900">8.430 EUR</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Automation Trigger</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-900">IF contract signed AND payment failed THEN move to Retry + notify owner</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h2 className={`${displayFont.className} text-3xl font-bold text-slate-900`}>Functii care conteaza</h2>
            <p className="mt-2 text-sm text-slate-600">Tot ce ai nevoie pentru lead-uri, semnare, plata si follow-up.</p>
          </div>
          <Link href="/help" className="text-sm font-bold text-emerald-700 hover:text-emerald-800">
            Explicatii complete
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((feature, index) => (
            <article
              key={feature.title}
              className="reveal rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <h3 className={`${displayFont.className} text-xl font-bold text-slate-900`}>{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-7">
          <h2 className={`${displayFont.className} text-3xl font-bold text-slate-900`}>Pachete SaaS</h2>
          <p className="mt-2 text-sm text-slate-600">
            Configurate pentru crestere, cu onboarding simplu si upgrade fara frictiune.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`reveal rounded-3xl border bg-white p-5 shadow-sm ${plan.featured ? 'border-emerald-300 ring-2 ring-emerald-200/70' : 'border-slate-200'}`}
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <div className={`mb-4 h-1.5 w-16 rounded-full bg-gradient-to-r ${plan.accent}`} />
              <p className={`${displayFont.className} text-xl font-bold text-slate-900`}>{plan.name}</p>
              <p className="mt-1 text-sm text-slate-500">{plan.subtitle}</p>
              <p className="mt-4 text-3xl font-extrabold text-slate-900">{plan.price}</p>
              <div className="mt-4 space-y-2">
                {plan.bullets.map((item) => (
                  <p key={item} className="text-sm text-slate-700">- {item}</p>
                ))}
              </div>
              <Link
                href="/register"
                className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold ${
                  plan.featured ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-300 text-slate-800 hover:bg-slate-50'
                }`}
              >
                Alege {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={`${displayFont.className} text-2xl font-bold text-slate-900`}>Vrei demo live pentru echipa ta?</p>
              <p className="mt-1 text-sm text-slate-600">
                {'Iti aratam exact fluxul: lead -> contract -> plata -> follow-up.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/help" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
                Help Center
              </Link>
              <Link href="/register" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-black">
                Cere acces
              </Link>
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .hero-glow {
          animation: heroFloat 8s ease-in-out infinite;
        }
        .reveal {
          animation: revealUp 700ms ease both;
        }
        @keyframes heroFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
