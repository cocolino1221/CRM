import { Metadata } from 'next';
import { headers } from 'next/headers';
import LandingPageRender from './LandingPageRender';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

/**
 * The host the visitor actually typed.
 *
 * The backend only ever sees its own hostname, so the one that decides which
 * workspace a request belongs to has to be forwarded. Behind a proxy the
 * original is in x-forwarded-host; `host` is the fallback.
 */
async function visitorHost(): Promise<string> {
  try {
    const h = await headers();
    return h.get('x-forwarded-host') || h.get('host') || '';
  } catch {
    return '';
  }
}

async function fetchView(slug: string) {
  try {
    const host = await visitorHost();
    const qs = new URLSearchParams({ track: 'false' });
    if (host) qs.set('host', host);
    const res = await fetch(`${API_BASE}/landing-pages/public/${slug}?${qs}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await fetchView(slug);
  const page = view?.page;
  if (!page) return { title: 'Landing page' };

  const hero = page.content?.hero || {};
  const benefits = page.content?.benefits || [];
  const seo = page.seo || {};
  const title = seo.title || hero.title || page.name;
  const description = seo.description || hero.subtitle || benefits[0] || undefined;
  const ogImage = seo.ogImage || hero.image || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await fetchView(slug);

  if (!view?.page) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        This page is not available.
      </div>
    );
  }

  return <LandingPageRender slug={slug} initialPage={view.page} initialForm={view.form} />;
}
