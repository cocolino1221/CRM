import { applyLeadBucket } from './lead-bucket';

function sqlFor(bucket: string): string {
  const qb: any = { andWhere: jest.fn() };
  applyLeadBucket(qb, bucket);
  return qb.andWhere.mock.calls.map((c: any[]) => String(c[0])).join(' ');
}

describe('lead tabs', () => {
  it('Pierdut reads only call outcomes, not failed WhatsApp sends', () => {
    const sql = sqlFor('lost');
    expect(sql).toContain(`a.type = 'call'`);
    expect(sql).toContain('isClosedLost');
  });

  it('De sunat (new) is everyone not booked and not sold or lost — contacted or not', () => {
    const sql = sqlFor('new');
    expect(sql).not.toContain('lastContactedAt');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('isClosedLost');
  });

  it('no tab means no filter', () => {
    expect(sqlFor('')).toBe('');
  });
});
