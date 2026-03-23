import { notFound, redirect } from 'next/navigation';

interface ShortcutFormPageProps {
  params: {
    slug: string;
  };
}

const reservedSlugs = new Set(['public']);

export default function ShortcutFormPage({ params }: ShortcutFormPageProps) {
  const slug = decodeURIComponent(params.slug || '').trim();

  if (!slug || reservedSlugs.has(slug.toLowerCase())) {
    notFound();
  }

  redirect(`/forms/public/${encodeURIComponent(slug)}`);
}
