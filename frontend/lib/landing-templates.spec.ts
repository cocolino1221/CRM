import { describe, expect, it } from 'vitest';
import { normalizeSections } from './landing-sections';
import {
  LANDING_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplate,
  photoPlaceholder,
  templateToContent,
  templatesFor,
} from './landing-templates';

describe('landing templates', () => {
  it('has unique keys', () => {
    const keys = LANDING_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every category in the tabs at least one template', () => {
    for (const c of TEMPLATE_CATEGORIES) {
      expect(templatesFor(c.key).length, c.key).toBeGreaterThan(0);
    }
    expect(templatesFor('all')).toHaveLength(LANDING_TEMPLATES.length);
  });

  it.each(LANDING_TEMPLATES.map((t) => [t.key, t] as const))('%s renders a hero and real sections', (_key, t) => {
    expect(t.content.hero.title).toBeTruthy();
    expect(t.pageName).toBeTruthy();
    const rendered = normalizeSections(t.content);
    // Video slots start empty on purpose (the owner adds theirs); everything
    // else in a template must actually show up on the page.
    const expected = t.content.sections.filter((s) => !(s.type === 'video' && !s.url)).length;
    expect(rendered).toHaveLength(expected);
    expect(rendered.length).toBeGreaterThan(1);
  });

  it('never ships real photos in before/after slots', () => {
    for (const t of LANDING_TEMPLATES) {
      for (const s of t.content.sections) {
        if (s.type !== 'beforeAfter') continue;
        for (const item of s.items) {
          expect(item.beforeImage?.startsWith('data:image/svg+xml')).toBe(true);
          expect(item.afterImage?.startsWith('data:image/svg+xml')).toBe(true);
        }
      }
    }
  });

  it('draws placeholders as valid SVG data URIs', () => {
    const url = photoPlaceholder('ÎNAINTE', '#f97316');
    const svg = decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('ÎNAINTE');
  });

  it('copies template content so editing a draft cannot change the template', () => {
    const t = getTemplate('challenge-21-days')!;
    const content = templateToContent(t);
    content.hero.title = 'changed';
    content.sections[0].stats[0].value = 'changed';
    expect(t.content.hero.title).not.toBe('changed');
    expect((t.content.sections[0] as any).stats[0].value).not.toBe('changed');
    expect(content.hero.accentColor).toBe(t.content.theme.accentColor);
  });

  it('returns undefined for an unknown key', () => {
    expect(getTemplate('nope')).toBeUndefined();
  });
});

describe('4-step templates', () => {
  it.each(['transformation-protocol', 'apply-4-steps-light'])('%s runs video → objections → form → before/after', (key) => {
    const t = getTemplate(key)!;
    expect(t.content.sections.map((s) => s.type)).toEqual(['video', 'steps', 'form', 'beforeAfter']);
    expect(t.content.sections.map((s) => s.eyebrow?.slice(0, 7))).toEqual(['Pasul 1', 'Pasul 2', 'Pasul 3', 'Pasul 4']);
    const objections = t.content.sections[1] as any;
    expect(objections.items).toHaveLength(4);
  });

  it('never puts two forms on a page', () => {
    for (const t of LANDING_TEMPLATES) {
      expect(t.content.sections.filter((s) => s.type === 'form').length, t.key).toBeLessThanOrEqual(1);
    }
  });
});
