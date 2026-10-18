import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LandingPageRender from '../../[slug]/LandingPageRender';
import { getTemplate, templateToContent } from '@/lib/landing-templates';

/**
 * A template drawn by the real public renderer, for the gallery's previews.
 *
 * The gallery shows this page in a scaled iframe so each card is the page a
 * visitor would actually see — phone layout included — not a screenshot that
 * drifts out of date. Preview mode stops view tracking and real submits.
 */

export const metadata: Metadata = {
  title: 'Previzualizare șablon',
  robots: { index: false, follow: false },
};

const SAMPLE_FORM = {
  id: 'preview',
  name: 'Previzualizare',
  fields: [
    { id: 'name', type: 'text', label: 'Nume', placeholder: 'Numele tău', required: true },
    { id: 'phone', type: 'phone', label: 'Telefon', placeholder: '07xx xxx xxx', required: true },
  ],
};

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const template = getTemplate(key);
  if (!template) notFound();

  const content = templateToContent(template);
  // An empty video slot would be dropped by the renderer; mark it so the
  // preview shows where the owner's video goes.
  content.sections = content.sections.map((s: any) =>
    s.type === 'video' && !s.url ? { ...s, url: 'preview:video' } : s,
  );

  const page = { name: template.name, captureType: 'native', content };
  return <LandingPageRender slug={`template-${key}`} initialPage={page} initialForm={SAMPLE_FORM} preview />;
}
