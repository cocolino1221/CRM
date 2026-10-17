import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { Contact } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { Deal } from '../database/entities/deal.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleSheetsService } from '../integrations/google-sheets/google-sheets.service';
import { MetaConversionsService } from '../integrations/meta-conversions/meta-conversions.service';

const WORKSPACE = 'workspace-123';

const qb = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  withDeleted: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
});

/** Every andWhere SQL fragment the service pushed, as one string. */
function clauses(builder: any): string {
  return builder.andWhere.mock.calls.map((c: any[]) => String(c[0])).join(' | ');
}

/** The merged parameter object across every andWhere call. */
function params(builder: any): Record<string, any> {
  return builder.andWhere.mock.calls.reduce(
    (acc: any, c: any[]) => ({ ...acc, ...(c[1] ?? {}) }),
    {},
  );
}

describe('ContactsService.findAll — filtering by date', () => {
  let service: ContactsService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: getRepositoryToken(Contact), useValue: { createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Company), useValue: {} },
        { provide: getRepositoryToken(Activity), useValue: {} },
        { provide: getRepositoryToken(Deal), useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationsService, useValue: { notifyLead: jest.fn().mockResolvedValue(undefined) } },
        { provide: GoogleSheetsService, useValue: { appendContact: jest.fn().mockResolvedValue(undefined) } },
        { provide: MetaConversionsService, useValue: { trackLead: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(ContactsService);
    repo = module.get(getRepositoryToken(Contact));
  });

  it('asks for nothing about dates when no range is given', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, {} as any);

    expect(clauses(builder)).not.toContain('createdAt');
  });

  it('filters from a start date', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, { createdFrom: '2026-10-01T00:00:00.000Z' } as any);

    expect(clauses(builder)).toContain('contact.createdAt >= :createdFrom');
    expect(params(builder).createdFrom).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('filters up to an end date', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, { createdTo: '2026-10-31T23:59:59.999Z' } as any);

    expect(clauses(builder)).toContain('contact.createdAt <= :createdTo');
    expect(params(builder).createdTo).toEqual(new Date('2026-10-31T23:59:59.999Z'));
  });

  it('filters a closed range', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, {
      createdFrom: '2026-10-01T00:00:00.000Z',
      createdTo: '2026-10-31T23:59:59.999Z',
    } as any);

    const sql = clauses(builder);
    expect(sql).toContain('contact.createdAt >= :createdFrom');
    expect(sql).toContain('contact.createdAt <= :createdTo');
  });

  // A caller picking a month gets a range built by the browser. A typo, a bad
  // paste or a hand-edited URL must not become a query that silently returns
  // everything — or one that throws a 500.
  it('rejects an unparseable date rather than ignoring it', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await expect(
      service.findAll(WORKSPACE, { createdFrom: 'last tuesday' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a range that ends before it starts', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await expect(
      service.findAll(WORKSPACE, {
        createdFrom: '2026-10-31T00:00:00.000Z',
        createdTo: '2026-10-01T00:00:00.000Z',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still filters by source alongside a date range', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, {
      source: 'typeform',
      createdFrom: '2026-10-01T00:00:00.000Z',
    } as any);

    const sql = clauses(builder);
    expect(sql).toContain('contact.source');
    expect(sql).toContain('contact.createdAt >= :createdFrom');
  });
});
