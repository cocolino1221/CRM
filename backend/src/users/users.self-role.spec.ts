import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { EmailService } from '../email/email.service';

/**
 * Changing your own role.
 *
 * The screen refused it outright — "You cannot change your own role from this
 * screen" — which is the right instinct for the wrong reason: what must never
 * happen is the workspace losing its last administrator. A super_admin with a
 * colleague who can still administer is not that case, and was blocked anyway.
 */
describe('UsersService — a super_admin may re-role themselves, but not into a locked-out workspace', () => {
  let service: UsersService;
  let users: any[];

  const WORKSPACE = 'ws-1';
  const ME = 'me';

  beforeEach(async () => {
    users = [
      { id: ME, workspaceId: WORKSPACE, role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE,
        email: 'me@x.ro', firstName: 'Me', lastName: 'Myself', preferences: {} },
      { id: 'other', workspaceId: WORKSPACE, role: UserRole.ADMIN, status: UserStatus.ACTIVE,
        email: 'other@x.ro', firstName: 'Other', lastName: 'Admin', preferences: {} },
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
            count: jest.fn(async ({ where }: any) =>
              users.filter(
                (u) =>
                  u.workspaceId === where.workspaceId &&
                  u.status === where.status &&
                  (Array.isArray(where.role?._value ?? where.role)
                    ? (where.role?._value ?? where.role).includes(u.role)
                    : u.role === where.role) &&
                  (where.id?._value === undefined || u.id !== where.id._value),
              ).length),
          },
        },
        { provide: getRepositoryToken(Workspace), useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => 12 } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  const changeOwnRole = (role: UserRole) =>
    service.update(ME, { role } as any, WORKSPACE, UserRole.SUPER_ADMIN, ME);

  it('lets a super_admin step down while a colleague still administers', async () => {
    await expect(changeOwnRole(UserRole.CLOSER)).resolves.toMatchObject({ role: UserRole.CLOSER });
  });

  it('refuses when nobody else could administer the workspace afterwards', async () => {
    users = users.filter((u) => u.id === ME);

    await expect(changeOwnRole(UserRole.CLOSER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not count a suspended colleague as cover', async () => {
    users[1].status = UserStatus.INACTIVE;

    await expect(changeOwnRole(UserRole.CLOSER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still refuses an admin changing their own role', async () => {
    users[0].role = UserRole.ADMIN;

    await expect(
      service.update(ME, { role: UserRole.CLOSER } as any, WORKSPACE, UserRole.ADMIN, ME),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('leaves other fields of your own profile editable', async () => {
    await expect(
      service.update(ME, { firstName: 'Nume' } as any, WORKSPACE, UserRole.SUPER_ADMIN, ME),
    ).resolves.toMatchObject({ firstName: 'Nume' });
  });
});
