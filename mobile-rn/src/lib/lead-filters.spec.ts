import { describe, expect, it } from 'vitest';
import { SOURCE_OPTIONS, buildContactQuery, monthRange } from './lead-filters';

describe('monthRange', () => {
  it('covers the whole month, first instant to last', () => {
    const { createdFrom, createdTo } = monthRange(2026, 9); // October, 0-indexed

    expect(createdFrom).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString());
    expect(createdTo).toBe(new Date(2026, 9, 31, 23, 59, 59, 999).toISOString());
  });

  it('gets February right in a leap year', () => {
    const { createdTo } = monthRange(2028, 1);

    expect(new Date(createdTo).getDate()).toBe(29);
  });

  it('gets February right in a common year', () => {
    const { createdTo } = monthRange(2026, 1);

    expect(new Date(createdTo).getDate()).toBe(28);
  });

  it('covers a 30-day month without spilling into the next', () => {
    const { createdTo } = monthRange(2026, 3); // April

    expect(new Date(createdTo).getMonth()).toBe(3);
    expect(new Date(createdTo).getDate()).toBe(30);
  });
});

describe('buildContactQuery', () => {
  it('asks for no date filter when no month is chosen', () => {
    const q = buildContactQuery({ month: null, year: 2026 });

    expect('createdFrom' in q).toBe(false);
    expect('createdTo' in q).toBe(false);
  });

  it('sends the month as a range', () => {
    const q = buildContactQuery({ month: 9, year: 2026 });

    expect(q.createdFrom).toBe(monthRange(2026, 9).createdFrom);
    expect(q.createdTo).toBe(monthRange(2026, 9).createdTo);
  });

  it('sends the source when one is chosen', () => {
    expect(buildContactQuery({ source: 'typeform' }).source).toBe('typeform');
  });

  it('omits the source for the "all sources" choice', () => {
    expect('source' in buildContactQuery({ source: '' })).toBe(false);
    expect('source' in buildContactQuery({ source: 'all' })).toBe(false);
  });

  it('trims the search and omits it when blank', () => {
    expect(buildContactQuery({ search: '  ionela  ' }).search).toBe('ionela');
    expect('search' in buildContactQuery({ search: '   ' })).toBe(false);
  });

  // This is the whole point of dropping the board: a closer sees every lead in
  // the workspace, not the slice belonging to one of several duplicate
  // default pipelines.
  it('never scopes to a pipeline', () => {
    const q = buildContactQuery({ month: 9, year: 2026, source: 'typeform', search: 'x' });

    expect('pipelineId' in q).toBe(false);
    expect('pipelineStageId' in q).toBe(false);
  });

  it('paginates with sensible defaults', () => {
    expect(buildContactQuery({})).toMatchObject({ page: 1, limit: 50 });
    expect(buildContactQuery({ page: 3, limit: 25 })).toMatchObject({ page: 3, limit: 25 });
  });

  it('sorts newest first, so a fresh lead is at the top of the list', () => {
    const q = buildContactQuery({});

    expect(q.sortBy).toBe('createdAt');
    expect(q.sortOrder).toBe('DESC');
  });
});

describe('SOURCE_OPTIONS', () => {
  it('starts with the "all sources" choice', () => {
    expect(SOURCE_OPTIONS[0].value).toBe('');
  });

  it('offers the sources these leads actually arrive from', () => {
    const values = SOURCE_OPTIONS.map((o) => o.value);

    for (const expected of ['typeform', 'facebook', 'instagram', 'whatsapp', 'woocommerce', 'manual']) {
      expect(values).toContain(expected);
    }
  });

  it('labels every option, so no raw enum value reaches the screen', () => {
    for (const o of SOURCE_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.label).not.toBe(o.value);
    }
  });
});

describe('Payflow in the leads list', () => {
  it('always asks the server to leave Payflow customers out', () => {
    expect(buildContactQuery({}).excludeSource).toBe('payflow');
    expect(buildContactQuery({ source: 'typeform', search: 'ana' }).excludeSource).toBe('payflow');
  });

  it('does not offer Payflow as a source filter', () => {
    expect(SOURCE_OPTIONS.map((o) => o.value)).not.toContain('payflow');
  });
});
