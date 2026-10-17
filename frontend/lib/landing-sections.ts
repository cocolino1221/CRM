/**
 * The sections a landing page is built from.
 *
 * The module shipped with a hero and a bullet list of benefits, which is the
 * weakest possible shape for a fitness page: it asks for a phone number
 * before it has proved anything. These sections exist so a page can prove
 * first — results, faces, before and after — and ask last.
 *
 * Two rules hold this file together. A page built before sections existed is
 * live and earning, so its `benefits` list must keep rendering. And a landing
 * page is the one screen where a crash costs money directly, so anything
 * malformed disappears quietly instead of taking the page down.
 */

export interface StatItem {
  value?: string;
  label?: string;
}

export interface Testimonial {
  name?: string;
  text?: string;
  /** "−12 kg în 4 luni" — the number is what persuades. */
  result?: string;
  photo?: string;
}

export interface BeforeAfterItem {
  beforeImage?: string;
  afterImage?: string;
  label?: string;
  caption?: string;
}

export interface TitledItem {
  title?: string;
  description?: string;
}

export interface FaqItem {
  question?: string;
  answer?: string;
}

export type LandingSection =
  | { type: 'socialProof'; title?: string; stats: StatItem[] }
  | { type: 'testimonials'; title?: string; items: Testimonial[] }
  | { type: 'beforeAfter'; title?: string; items: BeforeAfterItem[] }
  | { type: 'video'; title?: string; url?: string; caption?: string }
  | { type: 'whatYouGet'; title?: string; items: TitledItem[] }
  | { type: 'steps'; title?: string; items: TitledItem[] }
  | { type: 'coach'; name?: string; photo?: string; bio?: string; credentials?: string[] }
  | { type: 'faq'; title?: string; items: FaqItem[] }
  | { type: 'guarantee'; title?: string; text?: string }
  | { type: 'text'; title?: string; body?: string };

export type SectionType = LandingSection['type'];

const KNOWN_TYPES: SectionType[] = [
  'socialProof',
  'testimonials',
  'beforeAfter',
  'video',
  'whatYouGet',
  'steps',
  'coach',
  'faq',
  'guarantee',
  'text',
];

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAnyContent(items: unknown, keys: string[]): boolean {
  if (!Array.isArray(items) || !items.length) return false;
  return items.some(
    (item) => item && typeof item === 'object' && keys.some((k) => nonEmpty((item as any)[k])),
  );
}

/** Would this section put anything on screen? An empty one is noise. */
export function sectionIsRenderable(section: LandingSection): boolean {
  if (!section || typeof section !== 'object') return false;

  switch (section.type) {
    case 'socialProof':
      return hasAnyContent(section.stats, ['value', 'label']);
    case 'testimonials':
      return hasAnyContent(section.items, ['text', 'name', 'result']);
    case 'beforeAfter':
      return hasAnyContent(section.items, ['beforeImage', 'afterImage']);
    case 'video':
      return nonEmpty(section.url);
    case 'whatYouGet':
    case 'steps':
      return hasAnyContent(section.items, ['title', 'description']);
    case 'coach':
      return nonEmpty(section.name) || nonEmpty(section.bio);
    case 'faq':
      return hasAnyContent(section.items, ['question', 'answer']);
    case 'guarantee':
      return nonEmpty(section.title) || nonEmpty(section.text);
    case 'text':
      return nonEmpty(section.title) || nonEmpty(section.body);
    default:
      return false;
  }
}

export interface LandingContentWithSections {
  hero?: { title?: string; ctaLabel?: string; [k: string]: any };
  benefits?: string[];
  sections?: unknown;
  stickyCta?: { enabled?: boolean; label?: string };
  [k: string]: any;
}

/**
 * The sections to render, in order.
 *
 * Explicit sections win. A page that has none but carries the old `benefits`
 * list gets that list rendered as a "what you get" block, so nothing that was
 * live goes blank.
 */
export function normalizeSections(
  content: LandingContentWithSections | null | undefined,
): LandingSection[] {
  if (!content || typeof content !== 'object') return [];

  const declared = content.sections;
  if (Array.isArray(declared)) {
    return declared
      .filter(
        (s): s is LandingSection =>
          Boolean(s) &&
          typeof s === 'object' &&
          KNOWN_TYPES.includes((s as any).type) &&
          sectionIsRenderable(s as LandingSection),
      )
      .map((s) => s as LandingSection);
  }

  const benefits = content.benefits;
  if (Array.isArray(benefits)) {
    const items = benefits.filter(nonEmpty).map((b) => ({ title: b }));
    if (items.length) return [{ type: 'whatYouGet', items }];
  }

  return [];
}

export interface SectionDefinition {
  type: SectionType;
  /** Romanian: this is editor copy. */
  label: string;
  hint: string;
  /** A starting shape the renderer already accepts, so a new section is never blank. */
  blank: () => LandingSection;
}

export const SECTION_LIBRARY: SectionDefinition[] = [
  {
    type: 'socialProof',
    label: 'Cifre care conving',
    hint: 'Câți clienți, câte kilograme, câți ani — numerele se citesc înaintea textului.',
    blank: () => ({
      type: 'socialProof',
      stats: [
        { value: '500+', label: 'clienți transformați' },
        { value: '12 kg', label: 'slăbite în medie' },
        { value: '8 ani', label: 'de experiență' },
      ],
    }),
  },
  {
    type: 'testimonials',
    label: 'Testimoniale',
    hint: 'Cu rezultatul scris lângă nume. „−12 kg în 4 luni" convinge, „foarte mulțumit" nu.',
    blank: () => ({
      type: 'testimonials',
      title: 'Ce spun cei care au început deja',
      items: [{ name: 'Andreea M.', result: '−12 kg în 4 luni', text: 'Prima dată când am ținut un plan până la capăt.' }],
    }),
  },
  {
    type: 'beforeAfter',
    label: 'Înainte / După',
    hint: 'Cea mai puternică secțiune într-o pagină de fitness. Pune-le perechi, cu durata.',
    blank: () => ({
      type: 'beforeAfter',
      title: 'Rezultate reale, oameni reali',
      items: [{ beforeImage: '', afterImage: '', label: '4 luni', caption: '' }],
    }),
  },
  {
    type: 'video',
    label: 'Video',
    hint: 'Un minut în care se vede fața cuiva valorează mai mult decât o pagină de text.',
    blank: () => ({ type: 'video', url: '', caption: '' }),
  },
  {
    type: 'whatYouGet',
    label: 'Ce primești',
    hint: 'Ce include consultația gratuită, concret. Scade frica de „ce urmează".',
    blank: () => ({
      type: 'whatYouGet',
      title: 'Ce primești la consultația gratuită',
      items: [
        { title: 'Evaluare completă', description: 'Compoziție corporală și obiective.' },
        { title: 'Plan de start', description: 'Primii pași, adaptați programului tău.' },
      ],
    }),
  },
  {
    type: 'steps',
    label: 'Cum funcționează',
    hint: 'Trei pași. Vizitatorul trebuie să vadă că nu se angajează la nimic.',
    blank: () => ({
      type: 'steps',
      title: 'Cum funcționează',
      items: [
        { title: 'Lași numărul', description: 'Durează 20 de secunde.' },
        { title: 'Te sunăm', description: 'În maxim 24 de ore, la ora care îți convine.' },
        { title: 'Primești planul', description: 'Fără obligația de a continua.' },
      ],
    }),
  },
  {
    type: 'coach',
    label: 'Antrenorul',
    hint: 'Cine te va suna. O față și o calificare taie neîncrederea.',
    blank: () => ({ type: 'coach', name: '', bio: '', credentials: [] }),
  },
  {
    type: 'faq',
    label: 'Întrebări frecvente',
    hint: 'Aici se demontează obiecțiile: cât costă, cât durează, ce dacă n-am timp.',
    blank: () => ({
      type: 'faq',
      title: 'Întrebări frecvente',
      items: [
        { question: 'Consultația costă ceva?', answer: 'Nu. Este gratuită și fără obligații.' },
        { question: 'Cât durează?', answer: 'Aproximativ 30 de minute, la telefon.' },
      ],
    }),
  },
  {
    type: 'guarantee',
    label: 'Garanție',
    hint: 'Ce rămâne dacă nu continuă. Scade riscul perceput al apelului.',
    blank: () => ({
      type: 'guarantee',
      title: 'Fără obligații',
      text: 'Dacă după discuție nu ți se potrivește, pleci cu planul de start și nu te mai sunăm.',
    }),
  },
  {
    type: 'text',
    label: 'Text liber',
    hint: 'Pentru orice nu intră în celelalte.',
    blank: () => ({ type: 'text', title: '', body: '' }),
  },
];

/**
 * A fitness page that sells the call.
 *
 * Deliberately has no price and no subscription anywhere: the page's only job
 * is to get a phone number, and a price on it gives the visitor something to
 * decline before anyone has spoken to them. Proof comes before the objections,
 * and the objections come last.
 */
export const FITNESS_CONSULT_PRESET: LandingContentWithSections = {
  hero: {
    eyebrow: 'Consultație gratuită',
    title: 'Află exact ce te ține pe loc — într-o discuție de 30 de minute',
    subtitle:
      'Evaluare completă, plan de start și răspunsuri la întrebările tale. Fără obligații, fără abonament.',
    ctaLabel: 'Vreau consultația gratuită',
    trustLine: 'Peste 500 de oameni au început așa.',
  },
  stickyCta: { enabled: true, label: 'Vreau consultația gratuită' },
  sections: [
    {
      type: 'socialProof',
      stats: [
        { value: '500+', label: 'clienți transformați' },
        { value: '12 kg', label: 'slăbite în medie' },
        { value: '24h', label: 'până te sunăm' },
      ],
    },
    {
      type: 'beforeAfter',
      title: 'Rezultate reale, oameni reali',
      items: [
        { beforeImage: '', afterImage: '', label: '4 luni', caption: 'Andreea, 34 de ani' },
        { beforeImage: '', afterImage: '', label: '6 luni', caption: 'Mihai, 41 de ani' },
      ],
    },
    {
      type: 'testimonials',
      title: 'Ce spun cei care au început deja',
      items: [
        {
          name: 'Andreea M.',
          result: '−12 kg în 4 luni',
          text: 'Prima dată când am ținut un plan până la capăt. Diferența a fost că aveam pe cineva care mă întreba cum merge.',
        },
        {
          name: 'Mihai D.',
          result: '−18 kg în 6 luni',
          text: 'Am încercat singur trei ani. În șase luni cu plan am ajuns unde nu ajunsesem deloc.',
        },
      ],
    },
    {
      type: 'whatYouGet',
      title: 'Ce primești la consultația gratuită',
      items: [
        { title: 'Evaluare completă', description: 'Compoziție corporală, obiceiuri, obiective.' },
        { title: 'Plan de start', description: 'Primii pași concreți, adaptați programului tău.' },
        { title: 'Răspunsuri directe', description: 'Ce funcționează în cazul tău și ce nu.' },
      ],
    },
    {
      type: 'steps',
      title: 'Cum funcționează',
      items: [
        { title: 'Lași numărul', description: 'Durează 20 de secunde.' },
        { title: 'Te sunăm', description: 'În maxim 24 de ore, la ora care îți convine.' },
        { title: 'Primești planul', description: 'Fără obligația de a continua.' },
      ],
    },
    {
      type: 'faq',
      title: 'Întrebări frecvente',
      items: [
        { question: 'Consultația costă ceva?', answer: 'Nu. Este gratuită și nu te obligă la nimic.' },
        { question: 'Cât durează?', answer: 'Aproximativ 30 de minute, la telefon.' },
        {
          question: 'Nu am timp pentru sală de 5 ori pe săptămână.',
          answer: 'Nici nu e nevoie. Planul pornește din timpul pe care îl ai, nu din cel ideal.',
        },
        {
          question: 'Am mai încercat și n-a funcționat.',
          answer: 'De obicei nu lipsea voința, lipsea cineva care să urmărească. Despre asta vorbim în apel.',
        },
      ],
    },
    {
      type: 'guarantee',
      title: 'Fără obligații',
      text: 'Dacă după discuție nu ți se potrivește, pleci cu planul de start și nu te mai sunăm.',
    },
  ],
};
