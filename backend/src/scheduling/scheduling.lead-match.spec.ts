import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingService } from './scheduling.service';
import { Availability } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking } from '../database/entities/booking.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactsService } from '../contacts/contacts.service';

/**
 * A public booking must land on the lead Typeform or WooCommerce already
 * created. A miss books a stranger and leaves the real lead in De sunat.
 */
let hostRow: any = null;

describe('SchedulingService — which lead a booking belongs to', () => {
  let service: SchedulingService;
  let results: Array<Contact | null>;
  let calls: Array<{ sql: string[]; params: Record<string, any> }>;

  beforeEach(async () => {
    results = [];
    calls = [];
    const createQueryBuilder = jest.fn(() => {
      const call = { sql: [] as string[], params: {} as Record<string, any> };
      calls.push(call);
      const qb: any = {
        where: (sql: string, p?: any) => (call.sql.push(sql), Object.assign(call.params, p), qb),
        andWhere: (sql: string, p?: any) => (call.sql.push(sql), Object.assign(call.params, p), qb),
        orderBy: () => qb,
        getOne: async () => results.shift() ?? null,
      };
      return qb;
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Availability), useValue: {} },
        { provide: getRepositoryToken(MeetingType), useValue: {} },
        { provide: getRepositoryToken(Booking), useValue: {} },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => hostRow) } },
        { provide: getRepositoryToken(Contact), useValue: { createQueryBuilder } },
        { provide: NotificationsService, useValue: {} },
        { provide: ContactsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
  });

  it('matches the email whatever its case', async () => {
    results = [{ id: 'c1' } as Contact];
    const found = await service.findLeadForBooking('ws-1', '  TocosOana@Gmail.com ', '');
    expect(found?.id).toBe('c1');
    expect(calls[0].params.email).toBe('tocosoana@gmail.com');
  });

  it('falls back to the phone, however it was typed', async () => {
    results = [null, { id: 'c2' } as Contact];
    const found = await service.findLeadForBooking('ws-1', 'other@x.ro', '0749 767 923');
    expect(found?.id).toBe('c2');
    expect(calls[1].params.tail).toBe('%749767923');
  });

  // Too few digits would match half the database.
  it('does not guess from a short number', async () => {
    results = [null];
    expect(await service.findLeadForBooking('ws-1', 'other@x.ro', '1234')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('always stays inside the workspace', async () => {
    results = [null, null];
    await service.findLeadForBooking('ws-9', 'a@b.ro', '+40749767923');
    for (const call of calls) expect(call.params.workspaceId).toBe('ws-9');
  });
});
