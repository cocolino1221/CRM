'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { LandingPage } from '@/types/landing-page';
import LandingPageEditor from '../../_components/LandingPageEditor';

export default function EditLandingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get<LandingPage>(`/landing-pages/${id}`)
      .then((r) => setPage(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!page) return <div className="p-6 text-gray-500">Landing page not found.</div>;

  return (
    <div className="h-[calc(100vh-4rem)]">
      <LandingPageEditor initial={page} />
    </div>
  );
}
