/**
 * Ready-made landing pages a user starts from.
 *
 * Each template is plain page content — hero, sections, theme — in exactly the
 * shape the editor and the public renderer already use, so choosing one is
 * just "start the draft with this content". Nothing here needs the backend.
 *
 * Before/after slots carry drawn placeholders rather than photos: a template
 * must never ship a real person's body as stock imagery. The placeholders
 * render (so the section is visible in the preview and on a fresh draft) and
 * say plainly that the owner's own photo goes there.
 */

import { FITNESS_CONSULT_PRESET, type LandingSection } from './landing-sections';

export type TemplateCategory =
  | 'consultation'
  | 'transformation'
  | 'challenge'
  | 'leadmagnet'
  | 'webinar'
  | 'sales'
  | 'testimonial'
  | 'about'
  | 'guide'
  | 'event'
  | 'business';

export const TEMPLATE_CATEGORIES: Array<{ key: TemplateCategory | 'all'; label: string }> = [
  { key: 'all', label: 'Toate' },
  { key: 'consultation', label: 'Consultație' },
  { key: 'transformation', label: 'Transformare' },
  { key: 'challenge', label: 'Challenge' },
  { key: 'leadmagnet', label: 'Lead magnet' },
  { key: 'guide', label: 'Ghid' },
  { key: 'webinar', label: 'Webinar' },
  { key: 'sales', label: 'Vânzare' },
  { key: 'testimonial', label: 'Testimoniale' },
  { key: 'about', label: 'Despre mine' },
  { key: 'event', label: 'Eveniment' },
  { key: 'business', label: 'Business' },
];

export interface TemplateTheme {
  accentColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  fontFamily?: string;
}

export interface LandingTemplate {
  key: string;
  name: string;
  category: TemplateCategory;
  /** One line for the gallery card. */
  description: string;
  /** Suggested page name for the new draft. */
  pageName: string;
  content: {
    hero: Record<string, any>;
    stickyCta?: { enabled?: boolean; label?: string };
    submitButtonText?: string;
    theme: TemplateTheme;
    sections: LandingSection[];
  };
}

const FONT = 'Inter, system-ui, sans-serif';

const THEMES = {
  emberDark: { accentColor: '#f97316', backgroundColor: '#0d0d14', cardColor: '#ffffff', textColor: '#f5f5f4', fontFamily: FONT },
  midnight: { accentColor: '#22d3ee', backgroundColor: '#0f172a', cardColor: '#ffffff', textColor: '#f1f5f9', fontFamily: FONT },
  cleanLight: { accentColor: '#2563eb', backgroundColor: '#ffffff', cardColor: '#f8fafc', textColor: '#0f172a', fontFamily: FONT },
  violet: { accentColor: '#7c3aed', backgroundColor: '#faf5ff', cardColor: '#ffffff', textColor: '#1e1b4b', fontFamily: FONT },
  forest: { accentColor: '#16a34a', backgroundColor: '#f0fdf4', cardColor: '#ffffff', textColor: '#052e16', fontFamily: FONT },
  rose: { accentColor: '#e11d48', backgroundColor: '#fff1f2', cardColor: '#ffffff', textColor: '#4c0519', fontFamily: FONT },
  sand: { accentColor: '#b45309', backgroundColor: '#fffbeb', cardColor: '#ffffff', textColor: '#292524', fontFamily: 'Georgia, "Times New Roman", serif' },
  graphite: { accentColor: '#facc15', backgroundColor: '#18181b', cardColor: '#ffffff', textColor: '#fafafa', fontFamily: FONT },
  ocean: { accentColor: '#0ea5e9', backgroundColor: '#f0f9ff', cardColor: '#ffffff', textColor: '#0c4a6e', fontFamily: FONT },
} satisfies Record<string, TemplateTheme>;

/**
 * A drawn stand-in for a before/after photo — never a real person. The
 * renderer already badges each photo "Înainte"/"După", so the label only
 * goes in the image's accessible description, not drawn a second time.
 */
export function photoPlaceholder(label: 'ÎNAINTE' | 'DUPĂ', tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480"><title>${label}</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity="0.35"/><stop offset="1" stop-color="${tint}" stop-opacity="0.08"/></linearGradient></defs>
<rect width="360" height="480" fill="#1f2937"/><rect width="360" height="480" fill="url(#g)"/>
<circle cx="180" cy="150" r="46" fill="#ffffff" fill-opacity="0.18"/>
<path d="M95 360c0-60 38-110 85-110s85 50 85 110v40H95z" fill="#ffffff" fill-opacity="0.18"/>
<text x="180" y="448" font-family="Arial, sans-serif" font-size="15" fill="#ffffff" fill-opacity="0.7" text-anchor="middle">Pune aici poza clientului</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function beforeAfter(
  tint: string,
  pairs: Array<{ label: string; caption: string }>,
  title: string,
  eyebrow?: string,
): LandingSection {
  return {
    type: 'beforeAfter',
    ...(eyebrow ? { eyebrow } : {}),
    title,
    items: pairs.map((p) => ({
      beforeImage: photoPlaceholder('ÎNAINTE', tint),
      afterImage: photoPlaceholder('DUPĂ', tint),
      label: p.label,
      caption: p.caption,
    })),
  };
}

export const LANDING_TEMPLATES: LandingTemplate[] = [
  // ── Consultation ──────────────────────────────────────────────────────
  {
    key: 'consult-free-call',
    name: 'Consultație gratuită',
    category: 'consultation',
    description: 'Pagina clasică ce vinde apelul: dovezi, ce primești, obiecții.',
    pageName: 'Consultație gratuită',
    content: {
      hero: { ...(FITNESS_CONSULT_PRESET.hero as any) },
      stickyCta: FITNESS_CONSULT_PRESET.stickyCta,
      submitButtonText: 'Vreau consultația',
      theme: THEMES.cleanLight,
      sections: (FITNESS_CONSULT_PRESET.sections as LandingSection[]).map((s) =>
        s.type === 'beforeAfter'
          ? beforeAfter('#2563eb', [
              { label: '4 luni', caption: 'Andreea, 34 de ani' },
              { label: '6 luni', caption: 'Mihai, 41 de ani' },
            ], s.title || 'Rezultate reale, oameni reali')
          : s,
      ),
    },
  },
  {
    key: 'consult-nutrition',
    name: 'Evaluare nutrițională',
    category: 'consultation',
    description: 'Pentru nutriționiști: evaluare gratuită, plan alimentar, fără diete.',
    pageName: 'Evaluare nutrițională gratuită',
    content: {
      hero: {
        eyebrow: 'Evaluare gratuită · 20 min',
        title: 'Mănânci „sănătos" și tot nu slăbești? Află de ce în 20 de minute.',
        subtitle: 'Analizăm ce mănânci acum și pleci cu 3 schimbări concrete. Fără diete, fără cântărit fiecare gram.',
        ctaLabel: 'Programează evaluarea',
        trustLine: 'Datele tale rămân confidențiale.',
      },
      stickyCta: { enabled: true, label: 'Programează evaluarea' },
      submitButtonText: 'Vreau evaluarea',
      theme: THEMES.forest,
      sections: [
        { type: 'socialProof', stats: [{ value: '1.200+', label: 'planuri create' }, { value: '−7 kg', label: 'media în 3 luni' }, { value: '4.9★', label: 'recenzii' }] },
        {
          type: 'whatYouGet',
          title: 'Ce afli în evaluare',
          items: [
            { title: 'Unde se ascund caloriile', description: 'Gustările și băuturile pe care nu le numeri.' },
            { title: 'Cât ar trebui să mănânci', description: 'Necesarul tău, nu o cifră de pe internet.' },
            { title: '3 schimbări de mâine', description: 'Mici, ușor de ținut, cu efect mare.' },
          ],
        },
        {
          type: 'testimonials',
          title: 'Ce spun clienții',
          items: [
            { name: 'Ioana P.', result: '−9 kg în 3 luni', text: 'N-am renunțat la pâine și totuși am slăbit. Asta m-a convins.' },
            { name: 'Radu T.', result: 'Glicemie normală', text: 'Analizele mi s-au îmbunătățit după prima lună.' },
          ],
        },
        { type: 'faq', title: 'Întrebări frecvente', items: [{ question: 'Trebuie să țin dietă strictă?', answer: 'Nu. Pornim de la ce mănânci deja și ajustăm.' }, { question: 'E online?', answer: 'Da, la telefon sau video, cum preferi.' }] },
        { type: 'guarantee', title: 'Fără obligații', text: 'Evaluarea e gratuită. Decizi după dacă vrei să continuăm.' },
      ],
    },
  },

  // ── Transformation ────────────────────────────────────────────────────
  {
    key: 'transformation-protocol',
    name: 'Protocol de transformare',
    category: 'transformation',
    description: 'Pasul 1 video, pasul 2 cele 4 obiecții, pasul 3 formular, pasul 4 înainte/după.',
    pageName: 'Protocolul de transformare',
    content: {
      hero: {
        eyebrow: 'Ghid în 4 pași',
        title: 'Cum au slăbit clienții mei 15–20 kg urmând 4 pași simpli',
        subtitle: 'Parcurge pașii de mai jos în ordine. Durează sub 10 minute și îți arată exact cum te pot ajuta.',
        ctaLabel: 'Vreau să aplic',
        trustLine: 'Durează doar 1 minut.',
      },
      stickyCta: { enabled: true, label: 'Vreau să aplic' },
      submitButtonText: 'Aplică acum',
      theme: THEMES.emberDark,
      sections: [
        { type: 'video', eyebrow: 'Pasul 1 · Începe aici', title: 'Urmărește video-ul de introducere', url: '', caption: 'Află cum funcționează programul și dacă ți se potrivește.' },
        {
          type: 'steps',
          eyebrow: 'Pasul 2 · Obstacolele',
          title: 'Cele 4 obiecții care te țin pe loc — și cum le depășim',
          items: [
            { title: '„Nu am timp"', description: 'Antrenamente de 30 de minute, de 3 ori pe săptămână, acasă sau la sală.' },
            { title: '„Mi-e foame tot timpul"', description: 'Mese care țin de foame. Nu porții mici, ci alegeri mai bune.' },
            { title: '„Mă las după 2 săptămâni"', description: 'Check-in săptămânal cu mine. Nu mai ești singur(ă) pe drum.' },
            { title: '„Am încercat tot și nu merge"', description: 'Plan făcut pentru corpul și programul tău, nu copiat de pe internet.' },
          ],
        },
        { type: 'form', eyebrow: 'Pasul 3 · Aplică', title: 'Aplică pentru un loc în program', subtitle: 'Completează formularul. Te sunăm în 24 de ore să vedem dacă ți se potrivește.' },
        beforeAfter('#f97316', [
          { label: '16 săptămâni', caption: '„Nu aveam timp" — mamă a doi copii' },
          { label: '12 săptămâni', caption: '„Mă lăsam mereu" — 38 de ani' },
          { label: '20 de săptămâni', caption: '„Am încercat tot" — 45 de ani' },
        ], 'Rezultatele celor care au trecut deja prin cei 4 pași', 'Pasul 4 · Rezultate'),
      ],
    },
  },
  {
    key: 'apply-4-steps-light',
    name: 'Aplicare în 4 pași (light)',
    category: 'consultation',
    description: 'Același flux în 4 pași, pe fundal deschis: video, obiecții, formular, rezultate.',
    pageName: 'Aplică în 4 pași',
    content: {
      hero: {
        eyebrow: 'Ghid în 4 pași',
        title: 'Află în 4 pași dacă programul meu e potrivit pentru tine',
        subtitle: 'Un video scurt, răspunsuri la cele mai frecvente îndoieli, apoi aplici. Simplu.',
        ctaLabel: 'Aplică acum',
      },
      stickyCta: { enabled: true, label: 'Aplică acum' },
      submitButtonText: 'Trimite aplicația',
      theme: THEMES.cleanLight,
      sections: [
        { type: 'video', eyebrow: 'Pasul 1 · Introducere', title: 'Cine sunt și cum lucrez', url: '', caption: '3 minute.' },
        {
          type: 'steps',
          eyebrow: 'Pasul 2 · Obiecții',
          title: 'Ce te-ar putea opri — și de ce nu e o problemă',
          items: [
            { title: '„E prea scump"', description: 'Discutăm variante. Prima discuție e gratuită.' },
            { title: '„Nu am experiență"', description: 'Planul pornește exact de unde ești acum.' },
            { title: '„Am program haotic"', description: 'Adaptăm antrenamentele la săptămâna ta reală.' },
            { title: '„Nu știu dacă funcționează pentru mine"', description: 'Asta aflăm împreună la apel, fără obligații.' },
          ],
        },
        { type: 'form', eyebrow: 'Pasul 3 · Aplică', title: 'Lasă-mi datele tale', subtitle: 'Te sun eu, la ora care îți convine.' },
        beforeAfter('#2563eb', [
          { label: '4 luni', caption: 'Andreea, 34 de ani' },
          { label: '6 luni', caption: 'Mihai, 41 de ani' },
        ], 'Ce au obținut alții', 'Pasul 4 · Rezultate'),
      ],
    },
  },
  {
    key: 'transformation-before-after',
    name: 'Galerie înainte / după',
    category: 'transformation',
    description: 'Rezultatele în față. Pentru antrenori cu multe transformări.',
    pageName: 'Transformări',
    content: {
      hero: {
        eyebrow: 'Rezultate dovedite',
        title: 'Peste 300 de oameni și-au schimbat corpul. Tu ești următorul?',
        subtitle: 'Uită-te la rezultate, apoi lasă-ne numărul. Îți spunem sincer dacă te putem ajuta.',
        ctaLabel: 'Vreau rezultatul meu',
      },
      stickyCta: { enabled: true, label: 'Vreau rezultatul meu' },
      submitButtonText: 'Trimite',
      theme: THEMES.graphite,
      sections: [
        beforeAfter('#facc15', [
          { label: '3 luni', caption: 'Elena, −11 kg' },
          { label: '5 luni', caption: 'Bogdan, −19 kg' },
          { label: '4 luni', caption: 'Cristina, −13 kg' },
          { label: '6 luni', caption: 'Alex, +6 kg masă musculară' },
        ], 'Transformările clienților'),
        { type: 'testimonials', title: 'În cuvintele lor', items: [{ name: 'Elena', result: '−11 kg', text: 'Mi-am recăpătat încrederea. Port din nou ce-mi place.' }, { name: 'Bogdan', result: '−19 kg', text: 'Nu credeam că pot. Planul a fost simplu de urmat.' }] },
        { type: 'steps', title: 'Cum începi', items: [{ title: 'Completezi formularul', description: '1 minut.' }, { title: 'Discutăm 15 minute', description: 'Vedem unde ești și unde vrei să ajungi.' }, { title: 'Primești planul', description: 'Și începem.' }] },
      ],
    },
  },

  // ── Challenge ─────────────────────────────────────────────────────────
  {
    key: 'challenge-21-days',
    name: 'Challenge 21 de zile',
    category: 'challenge',
    description: 'Înscriere la un challenge gratuit cu grup și antrenamente zilnice.',
    pageName: 'Challenge 21 de zile',
    content: {
      hero: {
        eyebrow: 'Gratuit · începe luni',
        title: 'Challenge-ul de 21 de zile: 15 minute pe zi, rezultate vizibile',
        subtitle: 'Antrenament zilnic ghidat, grup privat și plan de mese. Tot ce trebuie e să apari.',
        ctaLabel: 'Mă înscriu gratuit',
        trustLine: 'Locurile sunt limitate la 100 de participanți.',
      },
      stickyCta: { enabled: true, label: 'Mă înscriu gratuit' },
      submitButtonText: 'Mă înscriu',
      theme: THEMES.rose,
      sections: [
        { type: 'socialProof', stats: [{ value: '21', label: 'zile' }, { value: '15 min', label: 'pe zi' }, { value: '2.000+', label: 'participanți' }] },
        { type: 'whatYouGet', title: 'Ce primești', items: [{ title: 'Antrenament zilnic', description: 'Video de 15 minute, fără echipament.' }, { title: 'Grup privat', description: 'Motivație și răspunsuri în fiecare zi.' }, { title: 'Plan de mese', description: 'Rețete simple, cu ce găsești la orice magazin.' }, { title: 'Premii', description: 'Pentru cei care termină toate cele 21 de zile.' }] },
        { type: 'steps', title: 'Cum funcționează', items: [{ title: 'Te înscrii', description: 'Primești linkul de grup pe WhatsApp.' }, { title: 'Ziua 1 începe luni', description: 'Primul antrenament la 7:00.' }, { title: 'Bifezi zilnic', description: 'Și urmărești progresul.' }] },
        { type: 'faq', title: 'Întrebări', items: [{ question: 'E chiar gratuit?', answer: 'Da, complet gratuit.' }, { question: 'Am nevoie de sală?', answer: 'Nu, totul se face acasă.' }] },
      ],
    },
  },
  {
    key: 'challenge-step',
    name: 'Challenge 10.000 de pași',
    category: 'challenge',
    description: 'Challenge simplu de mișcare, bun pentru începători.',
    pageName: 'Challenge 10.000 de pași',
    content: {
      hero: {
        eyebrow: '30 de zile · gratuit',
        title: '10.000 de pași pe zi, 30 de zile. Vezi ce se schimbă.',
        subtitle: 'Cel mai simplu obicei cu cel mai mare efect. Te ținem motivat zi de zi.',
        ctaLabel: 'Intru în challenge',
      },
      stickyCta: { enabled: true, label: 'Intru în challenge' },
      submitButtonText: 'Intru',
      theme: THEMES.ocean,
      sections: [
        { type: 'whatYouGet', title: 'Ce primești', items: [{ title: 'Mesaj zilnic', description: 'Un sfat scurt pe WhatsApp.' }, { title: 'Clasament', description: 'Te compari cu ceilalți, dacă vrei.' }, { title: 'Plan de după', description: 'Ce faci după ziua 30.' }] },
        { type: 'testimonials', title: 'Participanți', items: [{ name: 'Maria', result: '−4 kg', text: 'Am slăbit doar din mers. Nu-mi venea să cred.' }] },
        { type: 'guarantee', title: 'Fără costuri', text: 'Nu plătești nimic și te poți retrage oricând.' },
      ],
    },
  },

  // ── Lead magnet / Guide ───────────────────────────────────────────────
  {
    key: 'leadmagnet-ebook',
    name: 'Ghid gratuit (e-book)',
    category: 'leadmagnet',
    description: 'Dai un ghid PDF în schimbul numărului. Cel mai ieftin lead.',
    pageName: 'Ghid gratuit',
    content: {
      hero: {
        eyebrow: 'Ghid gratuit · PDF',
        title: '7 greșeli care te împiedică să slăbești (și cum le repari)',
        subtitle: 'Ghidul pe care îl dau fiecărui client nou. Îl primești gratuit pe email și WhatsApp.',
        ctaLabel: 'Trimite-mi ghidul',
        trustLine: 'Fără spam. Te poți dezabona oricând.',
      },
      stickyCta: { enabled: true, label: 'Vreau ghidul gratuit' },
      submitButtonText: 'Trimite-mi ghidul',
      theme: THEMES.violet,
      sections: [
        { type: 'whatYouGet', title: 'Ce găsești în ghid', items: [{ title: 'Greșeala #1', description: 'De ce „mănânc puțin" nu funcționează.' }, { title: 'Cardio vs forță', description: 'Ce contează mai mult pentru slăbit.' }, { title: 'Somnul', description: 'Factorul pe care toți îl ignoră.' }, { title: 'Plan de 7 zile', description: 'Gata de aplicat de mâine.' }] },
        { type: 'socialProof', stats: [{ value: '5.000+', label: 'descărcări' }, { value: '28', label: 'de pagini' }, { value: '0 lei', label: 'cost' }] },
        { type: 'coach', name: 'Numele tău', bio: 'Antrenor personal certificat, cu peste 8 ani de experiență și sute de clienți ajutați să slăbească sănătos.', credentials: ['Antrenor certificat', 'Nutriție sportivă'] },
      ],
    },
  },
  {
    key: 'guide-meal-plan',
    name: 'Plan de mese gratuit',
    category: 'guide',
    description: 'Plan alimentar de 7 zile + listă de cumpărături.',
    pageName: 'Plan de mese 7 zile',
    content: {
      hero: {
        eyebrow: 'Descarcă gratuit',
        title: 'Planul de mese de 7 zile care m-a ajutat pe mine și pe 1.000 de clienți',
        subtitle: 'Cu listă de cumpărături, porții și rețete gata în 15 minute.',
        ctaLabel: 'Vreau planul',
      },
      stickyCta: { enabled: true, label: 'Vreau planul gratuit' },
      submitButtonText: 'Trimite-mi planul',
      theme: THEMES.sand,
      sections: [
        { type: 'whatYouGet', title: 'Ce primești', items: [{ title: '21 de rețete', description: 'Mic dejun, prânz, cină.' }, { title: 'Listă de cumpărături', description: 'O singură drumeție la magazin.' }, { title: 'Porții calculate', description: 'Pentru slăbire sau menținere.' }] },
        { type: 'steps', title: 'Cum îl primești', items: [{ title: 'Lași datele', description: '20 de secunde.' }, { title: 'Îl primești pe WhatsApp', description: 'În câteva minute.' }, { title: 'Începi luni', description: 'Și ne spui cum a mers.' }] },
        { type: 'guarantee', title: 'Gratuit, fără condiții', text: 'Nu e un abonament și nu cerem card.' },
      ],
    },
  },
  {
    key: 'guide-workout',
    name: 'Program de antrenament acasă',
    category: 'guide',
    description: 'Program PDF de 4 săptămâni fără echipament.',
    pageName: 'Program antrenament acasă',
    content: {
      hero: {
        eyebrow: '4 săptămâni · fără echipament',
        title: 'Programul de antrenament acasă pentru oameni ocupați',
        subtitle: '3 antrenamente pe săptămână, 25 de minute fiecare. Progresezi fără sală.',
        ctaLabel: 'Trimite-mi programul',
      },
      submitButtonText: 'Trimite-mi programul',
      theme: THEMES.midnight,
      sections: [
        { type: 'socialProof', stats: [{ value: '12', label: 'antrenamente' }, { value: '25 min', label: 'fiecare' }, { value: '0', label: 'echipament' }] },
        { type: 'whatYouGet', title: 'Include', items: [{ title: 'Video pentru fiecare exercițiu', description: 'Ca să faci corect.' }, { title: 'Progresie săptămânală', description: 'Devine mai greu cât devii mai puternic.' }, { title: 'Variante ușoare', description: 'Pentru începători sau genunchi sensibili.' }] },
      ],
    },
  },

  // ── Webinar / Event ───────────────────────────────────────────────────
  {
    key: 'webinar-live',
    name: 'Webinar live',
    category: 'webinar',
    description: 'Înscriere la un webinar gratuit cu dată și program.',
    pageName: 'Webinar gratuit',
    content: {
      hero: {
        eyebrow: 'Webinar gratuit · joi, ora 20:00',
        title: 'Cum să slăbești după 35 de ani fără să-ți strici metabolismul',
        subtitle: '60 de minute live, cu sesiune de întrebări la final. Primești și înregistrarea.',
        ctaLabel: 'Rezervă-ți locul',
        trustLine: 'Primești linkul pe email și WhatsApp.',
      },
      stickyCta: { enabled: true, label: 'Rezervă-ți locul' },
      submitButtonText: 'Rezervă locul',
      theme: THEMES.midnight,
      sections: [
        { type: 'steps', title: 'Ce înveți', items: [{ title: 'De ce se schimbă metabolismul', description: 'Și ce poți face concret.' }, { title: 'Antrenamentul potrivit', description: 'Ce funcționează după 35 de ani.' }, { title: 'Planul de 30 de zile', description: 'Îl primești la final.' }] },
        { type: 'coach', name: 'Numele tău', bio: 'Am ajutat peste 500 de oameni să slăbească sustenabil. În webinar îți arăt exact metoda.', credentials: ['Antrenor certificat', '8 ani experiență'] },
        { type: 'faq', title: 'Întrebări', items: [{ question: 'Se înregistrează?', answer: 'Da, primești înregistrarea dacă nu poți ajunge live.' }, { question: 'Costă ceva?', answer: 'Nu, este gratuit.' }] },
      ],
    },
  },
  {
    key: 'event-bootcamp',
    name: 'Bootcamp în parc',
    category: 'event',
    description: 'Eveniment fizic cu locuri limitate, dată și locație.',
    pageName: 'Bootcamp în aer liber',
    content: {
      hero: {
        eyebrow: 'Sâmbătă · 09:00 · Parcul Herăstrău',
        title: 'Bootcamp în aer liber: o oră de energie, cu tot grupul',
        subtitle: 'Antrenament pentru toate nivelurile. Vino cu apă și chef de mișcare.',
        ctaLabel: 'Îmi rezerv locul',
        trustLine: 'Doar 30 de locuri.',
      },
      stickyCta: { enabled: true, label: 'Îmi rezerv locul' },
      submitButtonText: 'Rezervă',
      theme: THEMES.forest,
      sections: [
        { type: 'socialProof', stats: [{ value: '60 min', label: 'antrenament' }, { value: '30', label: 'locuri' }, { value: '0 lei', label: 'prima dată' }] },
        { type: 'whatYouGet', title: 'Ce te așteaptă', items: [{ title: 'Încălzire și circuit', description: 'Adaptat fiecărui nivel.' }, { title: 'Comunitate', description: 'Oameni care se mișcă împreună.' }, { title: 'Smoothie la final', description: 'Din partea casei.' }] },
        { type: 'faq', title: 'Întrebări', items: [{ question: 'Dacă plouă?', answer: 'Te anunțăm cu o zi înainte pe WhatsApp.' }] },
      ],
    },
  },

  // ── Sales / Testimonial / About ───────────────────────────────────────
  {
    key: 'sales-program',
    name: 'Program online de 12 săptămâni',
    category: 'sales',
    description: 'Pagină de vânzare pentru programul tău, cu garanție.',
    pageName: 'Program 12 săptămâni',
    content: {
      hero: {
        eyebrow: 'Înscrieri deschise',
        title: 'Programul de 12 săptămâni: antrenament, nutriție și coaching 1:1',
        subtitle: 'Tot ce ai nevoie ca să ajungi la forma dorită — și pe cineva care să te țină pe drum.',
        ctaLabel: 'Aplică pentru un loc',
        trustLine: 'Te sunăm să vedem dacă ți se potrivește.',
      },
      stickyCta: { enabled: true, label: 'Aplică acum' },
      submitButtonText: 'Aplică',
      theme: THEMES.emberDark,
      sections: [
        { type: 'whatYouGet', title: 'Ce include', items: [{ title: 'Plan de antrenament personalizat', description: 'Acasă sau la sală.' }, { title: 'Plan alimentar', description: 'Ajustat săptămânal.' }, { title: 'Check-in săptămânal', description: 'Video sau mesaj.' }, { title: 'Acces la comunitate', description: 'Grup privat cu ceilalți clienți.' }] },
        beforeAfter('#f97316', [{ label: '12 săptămâni', caption: 'Client program' }, { label: '12 săptămâni', caption: 'Client program' }], 'Rezultatele clienților'),
        { type: 'testimonials', title: 'Ce spun clienții', items: [{ name: 'Andrei', result: '−14 kg', text: 'Cea mai bună investiție pe care am făcut-o în mine.' }, { name: 'Laura', result: '−9 kg', text: 'Check-in-urile săptămânale au făcut diferența.' }] },
        { type: 'guarantee', title: 'Garanție de 30 de zile', text: 'Dacă în primele 30 de zile nu vezi progres și ai urmat planul, îți returnăm banii.' },
        { type: 'faq', title: 'Întrebări', items: [{ question: 'Cât costă?', answer: 'Prețul îl discutăm la apel, în funcție de varianta potrivită.' }, { question: 'Pot plăti în rate?', answer: 'Da.' }] },
      ],
    },
  },
  {
    key: 'testimonial-wall',
    name: 'Zid de testimoniale',
    category: 'testimonial',
    description: 'Lasă clienții să vândă pentru tine.',
    pageName: 'Ce spun clienții',
    content: {
      hero: {
        eyebrow: '4.9 din 5 · 200+ recenzii',
        title: 'Nu mă crede pe cuvânt. Ascultă ce spun clienții mei.',
        subtitle: 'Oameni obișnuiți, cu programe încărcate, care au reușit.',
        ctaLabel: 'Vreau să fiu următorul',
      },
      stickyCta: { enabled: true, label: 'Vreau să încep' },
      submitButtonText: 'Trimite',
      theme: THEMES.cleanLight,
      sections: [
        { type: 'testimonials', title: 'Recenzii', items: [
          { name: 'Simona R.', result: '−10 kg în 3 luni', text: 'Am încercat de nenumărate ori singură. Cu plan și suport a fost altfel.' },
          { name: 'George V.', result: 'Primul semimaraton', text: 'Am trecut de la canapea la 21 km într-un an.' },
          { name: 'Ana-Maria L.', result: 'Fără dureri de spate', text: 'Exercițiile de mobilitate mi-au schimbat ziua de lucru.' },
          { name: 'Victor C.', result: '−16 kg', text: 'Nu m-am simțit niciodată la dietă.' },
        ] },
        { type: 'video', title: 'Povestea unui client', url: '', caption: '2 minute care spun tot.' },
        { type: 'socialProof', stats: [{ value: '200+', label: 'recenzii' }, { value: '4.9★', label: 'medie' }, { value: '93%', label: 'și-au atins ținta' }] },
      ],
    },
  },
  {
    key: 'about-coach',
    name: 'Despre mine',
    category: 'about',
    description: 'Povestea ta, calificările și de ce să lucreze cu tine.',
    pageName: 'Despre mine',
    content: {
      hero: {
        eyebrow: 'Antrenor personal',
        title: 'Salut! Te ajut să-ți construiești forma pe care o vrei — fără extreme.',
        subtitle: 'Am trecut și eu prin asta. Acum ajut oameni ocupați să devină mai puternici și mai sănătoși.',
        ctaLabel: 'Hai să vorbim',
      },
      submitButtonText: 'Trimite',
      theme: THEMES.sand,
      sections: [
        { type: 'coach', name: 'Numele tău', bio: 'Am început antrenamentele după ce am slăbit eu însumi 20 kg. De 8 ani lucrez cu clienți de toate vârstele și am învățat că rezultatele vin din consecvență, nu din perfecțiune.', credentials: ['Antrenor certificat', 'Nutriționist', 'Specialist recuperare'] },
        { type: 'text', title: 'Cum lucrez', body: 'Fiecare plan pornește de la viața ta reală: program, gusturi, accidentări. Nu există două planuri la fel.' },
        { type: 'socialProof', stats: [{ value: '8 ani', label: 'experiență' }, { value: '500+', label: 'clienți' }, { value: '3', label: 'certificări' }] },
        { type: 'testimonials', title: 'Clienți', items: [{ name: 'Diana', result: '−8 kg', text: 'Răbdare și profesionalism. Recomand din tot sufletul.' }] },
      ],
    },
  },

  // ── Business (non-fitness) ────────────────────────────────────────────
  {
    key: 'business-consulting',
    name: 'Consultanță business',
    category: 'business',
    description: 'Apel de strategie gratuit pentru consultanți și agenții.',
    pageName: 'Apel de strategie',
    content: {
      hero: {
        eyebrow: 'Apel de strategie · 30 min',
        title: 'Aducem mai mulți clienți afacerii tale în 90 de zile',
        subtitle: 'Analizăm gratuit cum vinzi acum și îți arătăm unde pierzi bani.',
        ctaLabel: 'Programează apelul',
        trustLine: 'Fără obligații. Fără prezentări de vânzare.',
      },
      stickyCta: { enabled: true, label: 'Programează apelul' },
      submitButtonText: 'Programează',
      theme: THEMES.ocean,
      sections: [
        { type: 'socialProof', stats: [{ value: '120+', label: 'afaceri ajutate' }, { value: '3,2x', label: 'creștere medie' }, { value: '90 zile', label: 'până la rezultate' }] },
        { type: 'steps', title: 'Cum lucrăm', items: [{ title: 'Audit', description: 'Ce funcționează și ce nu.' }, { title: 'Plan', description: 'Prioritățile pe 90 de zile.' }, { title: 'Implementare', description: 'Împreună, cu raport săptămânal.' }] },
        { type: 'testimonials', title: 'Clienți', items: [{ name: 'Cristian, fondator', result: '+140% vânzări', text: 'Am înțeles în sfârșit de unde vin clienții noștri.' }] },
        { type: 'faq', title: 'Întrebări', items: [{ question: 'Pentru cine e?', answer: 'Pentru afaceri cu cel puțin un an de activitate.' }] },
      ],
    },
  },
  {
    key: 'business-clinic',
    name: 'Programare clinică / salon',
    category: 'business',
    description: 'Programări pentru clinici, saloane, cabinete.',
    pageName: 'Programare online',
    content: {
      hero: {
        eyebrow: 'Prima consultație −50%',
        title: 'Programează-te online în mai puțin de un minut',
        subtitle: 'Alegi serviciul, lași numărul și te sunăm să confirmăm ora.',
        ctaLabel: 'Vreau o programare',
      },
      stickyCta: { enabled: true, label: 'Programează-te' },
      submitButtonText: 'Trimite cererea',
      theme: THEMES.violet,
      sections: [
        { type: 'whatYouGet', title: 'Servicii', items: [{ title: 'Consultație inițială', description: '30 de minute.' }, { title: 'Tratament', description: 'Personalizat după evaluare.' }, { title: 'Control', description: 'Gratuit la 2 săptămâni.' }] },
        { type: 'testimonials', title: 'Pacienți mulțumiți', items: [{ name: 'Mihaela', text: 'Echipă caldă și profesionistă. M-am simțit pe mâini bune.' }] },
        { type: 'faq', title: 'Întrebări', items: [{ question: 'Unde vă găsesc?', answer: 'Adresa completă o primești la confirmare.' }, { question: 'Pot anula?', answer: 'Da, cu 24 de ore înainte.' }] },
      ],
    },
  },
];

export function templatesFor(category: TemplateCategory | 'all'): LandingTemplate[] {
  return category === 'all' ? LANDING_TEMPLATES : LANDING_TEMPLATES.filter((t) => t.category === category);
}

export function getTemplate(key: string): LandingTemplate | undefined {
  return LANDING_TEMPLATES.find((t) => t.key === key);
}

/**
 * The content a new draft starts with. A deep copy, so editing the draft can
 * never reach back into the shared template object.
 */
export function templateToContent(template: LandingTemplate): Record<string, any> {
  const copy = JSON.parse(JSON.stringify(template.content));
  return { ...copy, hero: { ...copy.hero, accentColor: copy.theme.accentColor } };
}
