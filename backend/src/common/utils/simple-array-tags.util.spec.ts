import {
  mergeTags,
  normalizeTagFilter,
  normalizeTags,
  tagKey,
  tagsOverlapCondition,
} from './simple-array-tags.util';

// A `simple-array` column joins its values with a comma and escapes nothing, so
// a comma inside a tag reads back as two tags. Splitting on write is what makes
// what was stored and what is read agree.
describe('normalizeTags', () => {
  it('splits a tag that contains a comma, because the column cannot hold one', () => {
    expect(normalizeTags(['Oradea, Bihor'])).toEqual(['Oradea', 'Bihor']);
  });

  it('splits a comma-separated string pasted as a single tag', () => {
    expect(normalizeTags('vip,urgent')).toEqual(['vip', 'urgent']);
  });

  it('drops the empty pieces a stray comma leaves behind', () => {
    expect(normalizeTags([',vip,', ',,'])).toEqual(['vip']);
  });

  it('keeps the case the tag was typed in', () => {
    expect(normalizeTags(['VIP', 'Typeform'])).toEqual(['VIP', 'Typeform']);
  });

  it('trims and collapses whitespace, including around a comma', () => {
    expect(normalizeTags([' de   sunat ', 'a ,  b '])).toEqual(['de sunat', 'a', 'b']);
  });

  it('keeps the first spelling when two tags differ only in case', () => {
    expect(normalizeTags(['VIP', 'vip', 'Vip'])).toEqual(['VIP']);
  });

  it('drops blanks and non-strings', () => {
    expect(normalizeTags(['', '   ', null, undefined])).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe('mergeTags', () => {
  it('adds only what is new, case-insensitively', () => {
    expect(mergeTags(['VIP', 'typeform'], ['vip', 'urgent'])).toEqual(['VIP', 'typeform', 'urgent']);
  });

  it('splits commas in what is being added', () => {
    expect(mergeTags(['vip'], ['urgent, nou'])).toEqual(['vip', 'urgent', 'nou']);
  });

  it('cleans up a list that was stored before this was enforced', () => {
    expect(mergeTags(['vip', 'VIP', ''], [])).toEqual(['vip']);
  });

  it('copes with either side missing', () => {
    expect(mergeTags(undefined, ['vip'])).toEqual(['vip']);
    expect(mergeTags(['vip'], undefined)).toEqual(['vip']);
  });
});

describe('tagKey', () => {
  it('is what makes two spellings of one tag compare equal', () => {
    expect(tagKey('  De   Sunat ')).toBe('de sunat');
    expect(tagKey('VIP')).toBe(tagKey('vip'));
  });
});


describe('normalizeTagFilter', () => {
  it('lowercases every tag, because tags are stored in whatever case they were typed', () => {
    expect(normalizeTagFilter(['VIP', 'Typeform'])).toEqual(['vip', 'typeform']);
  });

  it('trims and collapses whitespace the way a tag is normalized on write', () => {
    expect(normalizeTagFilter(['  de   sunat '])).toEqual(['de sunat']);
  });

  it('drops blanks so an empty box never turns into a filter', () => {
    expect(normalizeTagFilter(['', '   ', null, undefined])).toEqual([]);
  });

  it('accepts a single tag that did not arrive as an array', () => {
    expect(normalizeTagFilter('VIP')).toEqual(['vip']);
  });

  it('splits a comma-separated search the same way a write does', () => {
    expect(normalizeTagFilter(['VIP, Urgent'])).toEqual(['vip', 'urgent']);
  });

  it('returns nothing for no input', () => {
    expect(normalizeTagFilter(undefined)).toEqual([]);
    expect(normalizeTagFilter(null)).toEqual([]);
    expect(normalizeTagFilter([])).toEqual([]);
  });

  it('collapses tags that differ only in case into one', () => {
    expect(normalizeTagFilter(['VIP', 'vip', 'Vip'])).toEqual(['vip']);
  });
});

describe('tagsOverlapCondition', () => {
  // The column is `text` (TypeORM simple-array), so no Postgres array operator
  // may touch it directly — doing so fails the statement outright.
  it('splits the comma-joined column instead of using it as an array', () => {
    const sql = tagsOverlapCondition('contact.tags');

    expect(sql).toBe(`string_to_array(lower(contact.tags), ',') && CAST(:tags AS text[])`);
    expect(sql).not.toMatch(/contact\.tags\s*&&/);
  });

  it('lowercases the column so matching is case-insensitive', () => {
    expect(tagsOverlapCondition('deal.tags')).toContain('lower(deal.tags)');
  });

  it('can bind to a differently named parameter', () => {
    expect(tagsOverlapCondition('task.tags', 'tag')).toBe(
      `string_to_array(lower(task.tags), ',') && CAST(:tag AS text[])`,
    );
  });
});

// Every `tags` column in this schema is a TypeORM simple-array, so a Postgres
// array operator applied to one fails the statement and the request 500s. This
// used to be the case in five query builders at once; keep it from coming back.
describe('no query builder treats a tags column as a Postgres array', () => {
  const sourceFiles = (): string[] => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const root = path.join(__dirname, '..', '..');
    return (fs.readdirSync(root, { recursive: true }) as string[])
      .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
      .map(name => path.join(root, name));
  };

  it('uses no array operator on a tags column anywhere in src/', () => {
    const fs = require('fs') as typeof import('fs');
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      for (const [lineNo, line] of source.split('\n').entries()) {
        // Comments may quote the broken SQL; only real code counts.
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        const overlap = /\btags['"]?\s*&&\s*:/.test(line);
        const anyOf = /=\s*ANY\s*\(\s*[\w.]*tags\s*\)/i.test(line);
        if (overlap || anyOf) offenders.push(`${file}:${lineNo + 1}: ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
