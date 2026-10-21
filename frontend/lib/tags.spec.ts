import { describe, expect, it } from 'vitest';
import { addTags, normalizeTag, removeTag, splitDraft } from './tags';

/**
 * Tags existed everywhere except where someone could type one: the API
 * accepted them, the lead list and analytics showed them, and the form
 * submitted an array nothing ever filled. Reported from the field on
 * 21.10.2026 as "nu se pun tag-urile".
 *
 * The rules live here rather than in the component because *.dom.spec.tsx
 * cannot run in this monorepo yet (see vitest.config.ts).
 */
describe('normalizeTag', () => {
  it('trims and collapses inner whitespace, as the API does', () => {
    expect(normalizeTag('  de   sunat  luni ')).toBe('de sunat luni');
  });

  it('gives an empty string for something that is not a tag', () => {
    expect(normalizeTag('   ')).toBe('');
  });
});

describe('addTags', () => {
  it('adds a typed tag to the lead', () => {
    expect(addTags([], ['vip'])).toEqual(['vip']);
  });

  it('keeps the tags the lead already had', () => {
    expect(addTags(['typeform'], ['vip'])).toEqual(['typeform', 'vip']);
  });

  it('ignores one the lead already has, whatever the casing', () => {
    expect(addTags(['VIP'], ['vip'])).toEqual(['VIP']);
  });

  it('ignores an empty tag', () => {
    expect(addTags(['vip'], ['  '])).toEqual(['vip']);
  });

  it('adds a pasted list as separate tags', () => {
    expect(addTags([], ['vip', 'de sunat'])).toEqual(['vip', 'de sunat']);
  });

  it('does not let the same tag in twice from one paste', () => {
    expect(addTags([], ['vip', 'VIP'])).toEqual(['vip']);
  });

  // The caller compares lengths to decide whether to report a change, so
  // nothing-added has to come back the same length.
  it('returns a list of the same length when nothing was added', () => {
    expect(addTags(['vip'], ['vip'])).toHaveLength(1);
  });
});

describe('removeTag', () => {
  it('takes the tag off the lead and leaves the rest', () => {
    expect(removeTag(['typeform', 'preluat'], 'preluat')).toEqual(['typeform']);
  });

  it('leaves the list alone when the tag is not on it', () => {
    expect(removeTag(['typeform'], 'vip')).toEqual(['typeform']);
  });
});

describe('splitDraft', () => {
  // Tags are stored comma-joined, so a comma can never live inside one.
  it('treats a comma as the end of a tag', () => {
    expect(splitDraft('vip,')).toEqual({ tags: ['vip'], draft: '' });
  });

  it('keeps what follows the last comma as what is still being typed', () => {
    expect(splitDraft('vip,de su')).toEqual({ tags: ['vip'], draft: 'de su' });
  });

  it('splits a whole pasted list at once', () => {
    expect(splitDraft('vip,de sunat,preluat')).toEqual({
      tags: ['vip', 'de sunat'],
      draft: 'preluat',
    });
  });

  it('leaves text with no comma as still being typed', () => {
    expect(splitDraft('de su')).toEqual({ tags: [], draft: 'de su' });
  });
});
