import { WorkQueuesService } from './work-queues.service';
import { BookingStatus } from '../database/entities/booking.entity';

/**
 * A lead who books a call and then cancels used to disappear from both
 * queues: Programați excludes cancelled bookings, and De sunat excluded
 * anyone with a booking row at all. Nobody ever called them again.
 */
function build() {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  return { service: new WorkQueuesService(repo as any, repo as any, repo as any), qb };
}

describe('findUnbookedLeads', () => {
  it('ignores a cancelled or missed booking when deciding who still needs calling', async () => {
    const { service, qb } = build();

    await service.findUnbookedLeads('ws-1');

    const join = qb.leftJoin.mock.calls[0];
    expect(String(join[2])).toMatch(/status NOT IN/i);
    expect(join[3].ignored).toEqual([BookingStatus.CANCELLED, BookingStatus.NO_SHOW]);
  });

  it('still only looks inside the workspace', async () => {
    const { service, qb } = build();

    await service.findUnbookedLeads('ws-1');

    const scoped = qb.where.mock.calls.concat(qb.andWhere.mock.calls).some(
      (c: any[]) => c[1] && c[1].workspaceId === 'ws-1',
    );
    expect(scoped).toBe(true);
  });
});
