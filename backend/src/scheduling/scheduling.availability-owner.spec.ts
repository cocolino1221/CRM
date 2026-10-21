import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { Availability } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking } from '../database/entities/booking.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactsService } from '../contacts/contacts.service';

/**
 * Whose hours a closer may change.
 *
 * Every member of a workspace may edit their own availability, which is what
 * makes the mobile screen possible. Scoping those writes by workspace alone
 * would let any of them move or delete a colleague's week — a lead would then
 * be offered an hour that colleague never agreed to, and nobody would see why.
 */
let hostRow: any = null;

describe('SchedulingService — availability belongs to one person', () => {
  let service: SchedulingService;
  let rows: any[];
  let saved: any[];
  let softDeleted: any[];
  let meetingTypes: any[];
  let savedMeetingTypes: any[];

  beforeEach(async () => {
    rows = [
      { id: 'mine', workspaceId: 'ws-1', userId: 'closer-1', dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00' },
      { id: 'theirs', workspaceId: 'ws-1', userId: 'closer-2', dayOfWeek: 'monday', startTime: '14:00', endTime: '15:00' },
    ];
    saved = [];
    softDeleted = [];
    meetingTypes = [
      { id: 'mt-mine', workspaceId: 'ws-1', userId: 'closer-1', name: 'Consultație', duration: 30 },
      { id: 'mt-theirs', workspaceId: 'ws-1', userId: 'closer-2', name: 'Audit', duration: 45 },
    ];
    savedMeetingTypes = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: getRepositoryToken(Availability),
          useValue: {
            findOne: jest.fn(async ({ where }: any) =>
              rows.find(
                (r) =>
                  r.id === where.id &&
                  r.workspaceId === where.workspaceId &&
                  (where.userId === undefined || r.userId === where.userId),
              ) ?? null,
            ),
            save: jest.fn(async (row: any) => {
              saved.push(row);
              return row;
            }),
            softDelete: jest.fn(async (criteria: any) => {
              const hit = rows.filter(
                (r) =>
                  r.id === criteria.id &&
                  r.workspaceId === criteria.workspaceId &&
                  (criteria.userId === undefined || r.userId === criteria.userId),
              );
              softDeleted.push(...hit);
              return { affected: hit.length };
            }),
          },
        },
        {
          provide: getRepositoryToken(MeetingType),
          useValue: {
            findOne: jest.fn(async ({ where }: any) =>
              meetingTypes.find(
                (r) =>
                  r.id === where.id &&
                  r.workspaceId === where.workspaceId &&
                  (where.userId === undefined || r.userId === where.userId),
              ) ?? null,
            ),
            save: jest.fn(async (row: any) => {
              savedMeetingTypes.push(row);
              return row;
            }),
            softDelete: jest.fn(async (criteria: any) => {
              const hit = meetingTypes.filter(
                (r) =>
                  r.id === criteria.id &&
                  r.workspaceId === criteria.workspaceId &&
                  (criteria.userId === undefined || r.userId === criteria.userId),
              );
              return { affected: hit.length };
            }),
          },
        },
        { provide: getRepositoryToken(Booking), useValue: {} },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => hostRow) } },
        { provide: getRepositoryToken(Contact), useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ContactsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
  });

  it('updates a window of my own', async () => {
    await service.updateAvailability('ws-1', 'closer-1', 'mine', { startTime: '11:00' });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'mine', startTime: '11:00' });
  });

  it('refuses to update a colleague window and leaves it untouched', async () => {
    await expect(
      service.updateAvailability('ws-1', 'closer-1', 'theirs', { startTime: '06:00' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(saved).toHaveLength(0);
    expect(rows.find((r) => r.id === 'theirs')).toMatchObject({ startTime: '14:00' });
  });

  it('deletes a window of my own', async () => {
    await service.deleteAvailability('ws-1', 'closer-1', 'mine');

    expect(softDeleted.map((r) => r.id)).toEqual(['mine']);
  });

  it('refuses to delete a colleague window', async () => {
    await expect(service.deleteAvailability('ws-1', 'closer-1', 'theirs')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(softDeleted).toHaveLength(0);
  });

  it('refuses a window of another workspace, even with the right owner', async () => {
    await expect(service.deleteAvailability('ws-2', 'closer-1', 'mine')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(softDeleted).toHaveLength(0);
  });

  /**
   * The same rule for the meeting type, which carries the duration and the
   * step the hours are offered in: the mobile screen saves one on every write,
   * so an unscoped update would let a closer re-time a colleague's calls.
   */
  it('updates a meeting type of my own', async () => {
    await service.updateMeetingType('ws-1', 'closer-1', 'mt-mine', { duration: 45 });

    expect(savedMeetingTypes).toHaveLength(1);
    expect(savedMeetingTypes[0]).toMatchObject({ id: 'mt-mine', duration: 45 });
  });

  it('refuses to re-time a colleague meeting type', async () => {
    await expect(
      service.updateMeetingType('ws-1', 'closer-1', 'mt-theirs', { duration: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(savedMeetingTypes).toHaveLength(0);
    expect(meetingTypes.find((r) => r.id === 'mt-theirs')).toMatchObject({ duration: 45 });
  });

  it('refuses to delete a colleague meeting type', async () => {
    await expect(service.deleteMeetingType('ws-1', 'closer-1', 'mt-theirs')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes a meeting type of my own', async () => {
    await expect(service.deleteMeetingType('ws-1', 'closer-1', 'mt-mine')).resolves.toBeUndefined();
  });
});
