import { normalizeTagFilter, tagsOverlapCondition } from './simple-array-tags.util';

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
