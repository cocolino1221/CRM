import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

// `contacts.tags` is a TypeORM simple-array, i.e. a plain `text` column with the
// tags comma-joined. Postgres rejects `text && text[]` outright, so the array
// filter this used to build turned every tag-filtered request into a 500.
describe('ContactsService.findAll — filtering by tag', () => {
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

  it('asks for nothing about tags when none are given', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, {} as any);

    expect(clauses(builder)).not.toContain('tags');
  });

  it('splits the comma-joined column rather than treating it as an array', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, { tags: ['vip'] } as any);

    const sql = clauses(builder);
    expect(sql).toContain(`string_to_array(lower(contact.tags), ',') && CAST(:tags AS text[])`);
    // The operator that made this a 500: `&&` applied straight to the text column.
    expect(sql).not.toMatch(/contact\.tags\s*&&/);
    expect(params(builder).tags).toEqual(['vip']);
  });

  it('matches regardless of the case the tag was typed in', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, { tags: ['VIP', 'Typeform'] } as any);

    expect(clauses(builder)).toContain('lower(contact.tags)');
    expect(params(builder).tags).toEqual(['vip', 'typeform']);
  });

  it('trims and collapses whitespace in the tag it searches for', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, { tags: ['  De   Sunat '] } as any);

    expect(params(builder).tags).toEqual(['de sunat']);
  });

  it('skips the filter entirely when every tag given is blank', async () => {
    const builder = qb();
    repo.createQueryBuilder.mockReturnValue(builder);

    await service.findAll(WORKSPACE, { tags: ['', '   '] } as any);

    expect(clauses(builder)).not.toContain('tags');
    expect(params(builder).tags).toBeUndefined();
  });
});
