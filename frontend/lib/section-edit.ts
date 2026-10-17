/**
 * Editing the list of sections on a landing page.
 *
 * Every function returns a new list and never mutates the one it was given,
 * because React state that is edited in place does not re-render — the screen
 * then shows the old text while the draft holds the new, which looks like the
 * editor losing work.
 *
 * The same applies one level down: two sections of the same type must not
 * share an object, or editing the second rewrites the first.
 */

import { SECTION_LIBRARY, type LandingSection, type SectionType } from './landing-sections';

/** Which section types hold a list the editor can add rows to. */
const ITEM_SECTIONS: Record<string, string> = {
  socialProof: 'stats',
  testimonials: 'items',
  beforeAfter: 'items',
  whatYouGet: 'items',
  steps: 'items',
  faq: 'items',
};

export function itemsKeyFor(section: LandingSection): string | null {
  return ITEM_SECTIONS[section?.type] ?? null;
}

export function addSection(sections: LandingSection[], type: SectionType): LandingSection[] {
  const definition = SECTION_LIBRARY.find((s) => s.type === type);
  if (!definition) return sections;
  // blank() builds a fresh object each call, so two of a type never alias.
  return [...sections, definition.blank()];
}

export function removeSection(sections: LandingSection[], index: number): LandingSection[] {
  if (index < 0 || index >= sections.length) return sections;
  return sections.filter((_, i) => i !== index);
}

export function moveSection(
  sections: LandingSection[],
  from: number,
  to: number,
): LandingSection[] {
  // The buttons at the ends of the list stay pressable, so out-of-range is
  // the normal case rather than a bug to shout about.
  if (from < 0 || from >= sections.length) return sections;
  if (to < 0 || to >= sections.length) return sections;
  if (from === to) return sections;

  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function updateSection(
  sections: LandingSection[],
  index: number,
  patch: Record<string, unknown>,
): LandingSection[] {
  if (index < 0 || index >= sections.length) return sections;
  return sections.map((s, i) => (i === index ? ({ ...s, ...patch } as LandingSection) : s));
}

export function updateSectionItem(
  sections: LandingSection[],
  index: number,
  itemIndex: number,
  patch: Record<string, unknown>,
): LandingSection[] {
  const section = sections[index];
  const key = section ? itemsKeyFor(section) : null;
  if (!key) return sections;

  const items = ((section as any)[key] ?? []) as any[];
  if (itemIndex < 0 || itemIndex >= items.length) return sections;

  const nextItems = items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item));
  return updateSection(sections, index, { [key]: nextItems });
}

export function addSectionItem(sections: LandingSection[], index: number): LandingSection[] {
  const section = sections[index];
  const key = section ? itemsKeyFor(section) : null;
  if (!key) return sections;

  const items = ((section as any)[key] ?? []) as any[];
  // A fresh object every time: a shared one would make every new row echo
  // whatever was typed into the last.
  return updateSection(sections, index, { [key]: [...items, {}] });
}

export function removeSectionItem(
  sections: LandingSection[],
  index: number,
  itemIndex: number,
): LandingSection[] {
  const section = sections[index];
  const key = section ? itemsKeyFor(section) : null;
  if (!key) return sections;

  const items = ((section as any)[key] ?? []) as any[];
  if (itemIndex < 0 || itemIndex >= items.length) return sections;

  return updateSection(sections, index, { [key]: items.filter((_, i) => i !== itemIndex) });
}
