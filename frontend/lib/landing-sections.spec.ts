import { describe, expect, it } from 'vitest';
import {
  FITNESS_CONSULT_PRESET,
  SECTION_LIBRARY,
  normalizeSections,
  sectionIsRenderable,
} from './landing-sections';

describe('normalizeSections', () => {
  it('returns the sections a page declares, in order', () => {
    const out = normalizeSections({
      sections: [
        { type: 'faq', items: [{ question: 'Cât durează?', answer: '30 de minute.' }] },
        { type: 'guarantee', title: 'Garanție', text: 'Fără obligații.' },
      ],
    } as any);

    expect(out.map((s) => s.type)).toEqual(['faq', 'guarantee']);
  });

  // Pages built before sections existed are live and earning. They carry
  // hero + benefits and nothing else; they must keep rendering.
  it('turns a legacy benefits list into a renderable section', () => {
    const out = normalizeSections({
      hero: { title: 'Slăbește sănătos' },
      benefits: ['Plan personalizat', 'Antrenor dedicat'],
    } as any);

    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('whatYouGet');
    expect((out[0] as any).items.map((i: any) => i.title)).toEqual([
      'Plan personalizat',
      'Antrenor dedicat',
    ]);
  });

  it('prefers explicit sections over a legacy benefits list', () => {
    const out = normalizeSections({
      benefits: ['vechi'],
      sections: [{ type: 'video', url: 'https://example.com/v.mp4' }],
    } as any);

    expect(out.map((s) => s.type)).toEqual(['video']);
  });

  it('returns nothing for a page with neither', () => {
    expect(normalizeSections({} as any)).toEqual([]);
    expect(normalizeSections(undefined)).toEqual([]);
    expect(normalizeSections(null as any)).toEqual([]);
  });

  // A landing page is the one screen where a crash costs money directly. An
  // unknown or malformed section must disappear, not take the page with it.
  it('drops a section type it cannot render', () => {
    const out = normalizeSections({
      sections: [{ type: 'hologram' }, { type: 'guarantee', title: 'G', text: 'T' }],
    } as any);

    expect(out.map((s) => s.type)).toEqual(['guarantee']);
  });

  it('drops a section that is not even an object', () => {
    const out = normalizeSections({
      sections: ['faq', null, 42, { type: 'video', url: 'https://x/v.mp4' }],
    } as any);

    expect(out.map((s) => s.type)).toEqual(['video']);
  });

  it('survives sections being the wrong shape entirely', () => {
    expect(normalizeSections({ sections: 'faq' } as any)).toEqual([]);
    expect(normalizeSections({ sections: {} } as any)).toEqual([]);
  });
});

describe('sectionIsRenderable', () => {
  it('rejects a section with nothing to show', () => {
    expect(sectionIsRenderable({ type: 'faq', items: [] } as any)).toBe(false);
    expect(sectionIsRenderable({ type: 'testimonials', items: [] } as any)).toBe(false);
    expect(sectionIsRenderable({ type: 'video' } as any)).toBe(false);
    expect(sectionIsRenderable({ type: 'guarantee', title: '', text: '' } as any)).toBe(false);
  });

  it('accepts a section with content', () => {
    expect(
      sectionIsRenderable({ type: 'faq', items: [{ question: 'Q', answer: 'A' }] } as any),
    ).toBe(true);
    expect(sectionIsRenderable({ type: 'video', url: 'https://x/v.mp4' } as any)).toBe(true);
  });

  // An empty heading with real items still renders; a missing heading is a
  // cosmetic gap, not a reason to hide the content.
  it('does not require a heading', () => {
    expect(
      sectionIsRenderable({ type: 'whatYouGet', items: [{ title: 'Plan' }] } as any),
    ).toBe(true);
  });
});

describe('the section library', () => {
  it('offers the sections a fitness consultation page needs', () => {
    const types = SECTION_LIBRARY.map((s) => s.type);

    for (const expected of [
      'socialProof',
      'testimonials',
      'beforeAfter',
      'video',
      'whatYouGet',
      'steps',
      'coach',
      'faq',
      'guarantee',
    ]) {
      expect(types).toContain(expected);
    }
  });

  it('labels every section in Romanian, so no raw type reaches the editor', () => {
    for (const s of SECTION_LIBRARY) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.label).not.toBe(s.type);
    }
  });

  it('gives every section a blank of its own type', () => {
    for (const s of SECTION_LIBRARY) {
      expect(s.blank().type).toBe(s.type);
    }
  });

  // Some blanks are deliberately empty — you supply the video URL and the
  // before/after photos. An empty one must not render (an empty video frame
  // looks broken), but it must be a shape the renderer accepts once filled.
  it('keeps an unfilled section off the page until it has content', () => {
    const video = SECTION_LIBRARY.find((s) => s.type === 'video')!.blank();

    expect(normalizeSections({ sections: [video] } as any)).toEqual([]);
    expect(
      normalizeSections({ sections: [{ ...video, url: 'https://x/v.mp4' }] } as any),
    ).toHaveLength(1);
  });

  it('ships blanks that already carry copy where copy is the point', () => {
    for (const type of ['socialProof', 'steps', 'faq', 'whatYouGet', 'guarantee']) {
      const blank = SECTION_LIBRARY.find((s) => s.type === type)!.blank();
      expect(sectionIsRenderable(blank)).toBe(true);
    }
  });
});

describe('the fitness consultation preset', () => {
  // The page's only job is to get a phone number. A price gives the visitor
  // something to decline before anyone has spoken to them.
  it('names no price', () => {
    const json = JSON.stringify(FITNESS_CONSULT_PRESET).toLowerCase();

    expect(json).not.toMatch(/\d+\s*(lei|ron|eur|€|\$)/);
    expect(json).not.toMatch(/(lei|ron|eur)\s*\d+/);
    expect(json).not.toMatch(/pre[țt]\s*:/);
  });

  it('leads with proof before it asks for anything', () => {
    const authored = (FITNESS_CONSULT_PRESET.sections as any[]).map((s) => s.type);

    expect(authored.indexOf('socialProof')).toBeLessThan(authored.indexOf('faq'));
    expect(authored).toContain('testimonials');
    expect(authored).toContain('beforeAfter');
  });

  // It ships the before/after frames empty, for the owner's own photos. Until
  // those are uploaded the section stays off the live page rather than
  // rendering two grey boxes.
  it('holds the before/after section back until real photos are added', () => {
    const rendered = normalizeSections(FITNESS_CONSULT_PRESET).map((s) => s.type);

    expect(rendered).not.toContain('beforeAfter');

    const filled = {
      ...FITNESS_CONSULT_PRESET,
      sections: (FITNESS_CONSULT_PRESET.sections as any[]).map((s) =>
        s.type === 'beforeAfter'
          ? { ...s, items: [{ beforeImage: 'a.jpg', afterImage: 'b.jpg' }] }
          : s,
      ),
    };
    expect(normalizeSections(filled as any).map((s) => s.type)).toContain('beforeAfter');
  });

  it('answers objections last, where they belong', () => {
    const types = normalizeSections(FITNESS_CONSULT_PRESET).map((s) => s.type);

    expect(types.indexOf('faq')).toBeGreaterThan(types.indexOf('testimonials'));
  });

  it('every section that reaches the page is renderable', () => {
    const sections = normalizeSections(FITNESS_CONSULT_PRESET);

    expect(sections.length).toBeGreaterThan(4);
    for (const s of sections) expect(sectionIsRenderable(s)).toBe(true);
  });

  it('keeps the phone field, because the whole page exists to get a call', () => {
    expect(FITNESS_CONSULT_PRESET.hero?.ctaLabel).toBeTruthy();
    expect(FITNESS_CONSULT_PRESET.stickyCta?.enabled).toBe(true);
  });
});

describe('an empty sections list', () => {
  // The editor writes `sections` on every save. Once it existed, even empty,
  // the legacy benefits branch became unreachable — so an old live page whose
  // owner added a section and removed it again published with nothing below
  // the hero.
  it('still falls back to the legacy benefits a live page carries', () => {
    const out = normalizeSections({
      hero: { title: 'x' },
      benefits: ['Plan personalizat', 'Antrenor dedicat'],
      sections: [],
    } as any);

    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('whatYouGet');
  });

  it('renders nothing when there is nothing to render', () => {
    expect(normalizeSections({ hero: { title: 'x' }, sections: [] } as any)).toEqual([]);
  });
});
