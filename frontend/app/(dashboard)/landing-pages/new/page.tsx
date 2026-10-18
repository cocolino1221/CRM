'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LandingPageEditor from '../_components/LandingPageEditor';
import TemplateGallery from '@/components/landing/TemplateGallery';
import type { LandingTemplate } from '@/lib/landing-templates';

/** A new page starts at the template gallery; "De la zero" skips to a blank editor. */
export default function NewLandingPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<LandingTemplate | 'blank' | null>(null);

  if (choice === null) {
    return (
      <TemplateGallery
        onPick={setChoice}
        onBlank={() => setChoice('blank')}
        onClose={() => router.push('/landing-pages')}
      />
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)]">
      <LandingPageEditor template={choice === 'blank' ? undefined : choice} />
    </div>
  );
}
