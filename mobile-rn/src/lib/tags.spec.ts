import { describe, expect, it } from 'vitest';
import { addTags, normalizeTag, parseTags, removeTag } from './tags';

/**
 * Tags could be read but never written: the list and the lead sheet drew them
 * as badges, and the lead form did not send the field at all. Reported from
 * the field on 21.10.2026 as "nu se pun tag-urile".
 */
describe('parseTags', () => {
  // The API sends a simple-array column, which arrives as a comma-joined
  // string on some routes and as an array on others.
  it('reads an array as it comes', () => {
    expect(parseTags(['typeform', 'preluat'])).toEqual(['typeform', 'preluat']);
  });

  it('splits the comma-joined string the API sometimes sends', () => {
    expect(parseTags('typeform,preluat')).toEqual(['typeform', 'preluat']);
  });

  it('drops the blanks a trailing comma leaves behind', () => {
    expect(parseTags('typeform, ,preluat,')).toEqual(['typeform', 'preluat']);
  });

  it('gives an empty list for a lead with no tags', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });
});

describe('normalizeTag', () => {
  it('trims and collapses inner whitespace, as the API does', () => {
    expect(normalizeTag('  de   sunat  luni ')).toBe('de sunat luni');
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
    expect(addTags(['vip'], ['   '])).toEqual(['vip']);
  });

  // Tags are stored comma-joined, so a comma inside one would split it in two
  // on the way back out.
  it('splits a tag typed with a comma in it', () => {
    expect(addTags([], ['vip,de sunat'])).toEqual(['vip', 'de sunat']);
  });
});

describe('removeTag', () => {
  it('takes the tag off the lead and leaves the rest', () => {
    expect(removeTag(['typeform', 'preluat'], 'preluat')).toEqual(['typeform']);
  });
});
