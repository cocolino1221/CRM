import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { EmailService } from '../email/email.service';

/**
 * An admin setting a teammate's meeting platform from Team.
 *
 * It travels on the same `preferences` as Channel Access, so the Team screen
 * sends only the keys it manages — which is only safe because update() merges
 * preferences instead of replacing them. These tests pin that: a regression
 * there would quietly wipe a closer's channel access the moment someone
 * changed their meeting platform.
 */
describe('UsersService.update — a teammate\'s meeting platform', () => {
  let service: UsersService;
  let users: any[];

  const WORKSPACE = 'ws-1';
  const ADMIN = 'admin-1';
  const CLOSER = 'closer-1';

  beforeEach(async () => {
    users = [
      {
        id: ADMIN, workspaceId: WORKSPACE, role: UserRole.ADMIN, status: UserStatus.ACTIVE,
        email: 'admin@x.ro', firstName: 'Ana', lastName: 'Admin', preferences: {},
      },
      {
        id: CLOSER, workspaceId: WORKSPACE, role: UserRole.CLOSER, status: UserStatus.ACTIVE,
        email: 'closer@x.ro', firstName: 'Dan', lastName: 'Closer',
        preferences: {
          channelAccess: { whatsapp: true, messenger: false },
          quietHours: { from: '22:00', to: '08:00' },
        },
      },
    ];

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(async ({ where }: any) =>
              users.find((u) => u.id === where.id && u.workspaceId === where.workspaceId) ?? null),
            save: jest.fn(async (u: any) => u),
            count: jest.fn(async () => 2),
          },
        },
        { provide: getRepositoryToken(Workspace), useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => 12 } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  const setPlatform = (provider: string | null, by = UserRole.ADMIN) =>
    service.update(
      CLOSER,
      { preferences: { meetingProvider: provider } } as any,
      WORKSPACE,
      by,
      ADMIN,
    );

  it('stores the platform on the teammate', async () => {
    await setPlatform('zoom');

    expect(users.find((u) => u.id === CLOSER).preferences.meetingProvider).toBe('zoom');
  });

  it('leaves the rest of their preferences alone', async () => {
    await setPlatform('zoom');

    const preferences = users.find((u) => u.id === CLOSER).preferences;
    expect(preferences.channelAccess).toEqual({ whatsapp: true, messenger: false });
    expect(preferences.quietHours).toEqual({ from: '22:00', to: '08:00' });
  });

  it('puts them back on automatic when the platform is cleared', async () => {
    await setPlatform('zoom');
    await setPlatform(null);

    expect(users.find((u) => u.id === CLOSER).preferences.meetingProvider).toBeNull();
    expect(users.find((u) => u.id === CLOSER).preferences.channelAccess).toEqual({
      whatsapp: true,
      messenger: false,
    });
  });

  it('lets a manager set it for a closer', async () => {
    await expect(setPlatform('zoom', UserRole.MANAGER)).resolves.toBeDefined();
  });

  it('does not let a closer set it for anyone', async () => {
    await expect(setPlatform('zoom', UserRole.CLOSER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let a manager touch an admin', async () => {
    await expect(
      service.update(
        ADMIN,
        { preferences: { meetingProvider: 'zoom' } } as any,
        WORKSPACE,
        UserRole.MANAGER,
        CLOSER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
