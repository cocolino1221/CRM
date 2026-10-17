import { describe, expect, it } from 'vitest';
import {
  addSection,
  addSectionItem,
  moveSection,
  removeSection,
  removeSectionItem,
  updateSection,
  updateSectionItem,
} from './section-edit';
import type { LandingSection } from './landing-sections';

const faq = (): LandingSection => ({
  type: 'faq',
  title: 'Întrebări',
  items: [
    { question: 'Q1', answer: 'A1' },
    { question: 'Q2', answer: 'A2' },
  ],
});
const guarantee = (): LandingSection => ({ type: 'guarantee', title: 'G', text: 'T' });

describe('addSection', () => {
  it('appends the blank for a type', () => {
    const out = addSection([guarantee()], 'faq');

    expect(out.map((s) => s.type)).toEqual(['guarantee', 'faq']);
  });

  it('leaves the original list untouched', () => {
    const before = [guarantee()];
    addSection(before, 'faq');

    expect(before).toHaveLength(1);
  });

  it('ignores a type it does not know', () => {
    const before = [guarantee()];
    expect(addSection(before, 'hologram' as any)).toEqual(before);
  });

  // Two sections of the same type must not share one object, or editing the
  // second rewrites the first.
  it('gives each added section its own object', () => {
    const out = addSection(addSection([], 'faq'), 'faq');
    (out[0] as any).title = 'changed';

    expect((out[1] as any).title).not.toBe('changed');
  });
});

describe('removeSection', () => {
  it('removes the one at that position', () => {
    const out = removeSection([guarantee(), faq()], 0);

    expect(out.map((s) => s.type)).toEqual(['faq']);
  });

  it('ignores an index that is not there', () => {
    const before = [guarantee()];
    expect(removeSection(before, 5)).toEqual(before);
    expect(removeSection(before, -1)).toEqual(before);
  });
});

describe('moveSection', () => {
  it('moves a section down', () => {
    const out = moveSection([guarantee(), faq()], 0, 1);

    expect(out.map((s) => s.type)).toEqual(['faq', 'guarantee']);
  });

  it('moves a section up', () => {
    const out = moveSection([guarantee(), faq()], 1, 0);

    expect(out.map((s) => s.type)).toEqual(['faq', 'guarantee']);
  });

  // The buttons at the ends of the list stay pressable; they must do nothing
  // rather than drop a section off the edge.
  it('does nothing at the ends', () => {
    const before = [guarantee(), faq()];

    expect(moveSection(before, 0, -1).map((s) => s.type)).toEqual(['guarantee', 'faq']);
    expect(moveSection(before, 1, 2).map((s) => s.type)).toEqual(['guarantee', 'faq']);
  });

  it('never loses a section', () => {
    const before = [guarantee(), faq(), guarantee()];

    for (const [from, to] of [[0, 2], [2, 0], [1, 0], [0, 1]]) {
      expect(moveSection(before, from, to)).toHaveLength(3);
    }
  });
});

describe('updateSection', () => {
  it('patches only the section at that index', () => {
    const out = updateSection([guarantee(), faq()], 1, { title: 'Nou' });

    expect((out[1] as any).title).toBe('Nou');
    expect((out[0] as any).title).toBe('G');
  });

  it('keeps the fields it was not given', () => {
    const out = updateSection([faq()], 0, { title: 'Nou' });

    expect((out[0] as any).items).toHaveLength(2);
  });
});

describe('items within a section', () => {
  it('updates one item without touching its neighbour', () => {
    const out = updateSectionItem([faq()], 0, 1, { answer: 'schimbat' });

    expect((out[0] as any).items[1].answer).toBe('schimbat');
    expect((out[0] as any).items[0].answer).toBe('A1');
  });

  it('keeps the other fields of the item it edits', () => {
    const out = updateSectionItem([faq()], 0, 0, { answer: 'x' });

    expect((out[0] as any).items[0].question).toBe('Q1');
  });

  it('appends an empty item', () => {
    const out = addSectionItem([faq()], 0);

    expect((out[0] as any).items).toHaveLength(3);
  });

  it('gives each appended item its own object', () => {
    const out = addSectionItem(addSectionItem([faq()], 0), 0);
    const items = (out[0] as any).items;
    items[2].question = 'mine';

    expect(items[3].question).not.toBe('mine');
  });

  it('removes one item', () => {
    const out = removeSectionItem([faq()], 0, 0);

    expect((out[0] as any).items.map((i: any) => i.question)).toEqual(['Q2']);
  });

  it('does nothing on a section that holds no items', () => {
    const before = [guarantee()];

    expect(addSectionItem(before, 0)).toEqual(before);
    expect(removeSectionItem(before, 0, 0)).toEqual(before);
    expect(updateSectionItem(before, 0, 0, { x: 1 } as any)).toEqual(before);
  });
});
