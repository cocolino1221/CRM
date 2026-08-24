import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { ContactsModule } from '../../src/contacts/contacts.module';
import { DealsModule } from '../../src/deals/deals.module';
import { TasksModule } from '../../src/tasks/tasks.module';
import { AnalyticsModule } from '../../src/analytics/analytics.module';
import { ContactsService } from '../../src/contacts/contacts.service';
import { DealsService } from '../../src/deals/deals.service';
import { TasksService } from '../../src/tasks/tasks.service';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { McpToolInvocation } from '../../src/database/entities/mcp-tool-invocation.entity';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { Workspace } from '../../src/database/entities/workspace.entity';
import { Contact, ContactStatus, ContactSource } from '../../src/database/entities/contact.entity';
import { Deal, DealStage } from '../../src/database/entities/deal.entity';
import { Task, TaskStatus } from '../../src/database/entities/task.entity';
import { McpAuthContext } from '../../src/mcp/auth/mcp-auth.context';
import {
  createContactsReadTools,
  createContactsWriteTools,
  createContactsDestructiveTools,
} from '../../src/mcp/tools/contacts.tools';
import {
  createDealsReadTools,
  createDealsWriteTools,
  createDealsDestructiveTools,
} from '../../src/mcp/tools/deals.tools';
import { createTasksReadTools, createTasksWriteTools } from '../../src/mcp/tools/tasks.tools';
import { createAnalyticsReadTools } from '../../src/mcp/tools/analytics.tools';
import { ToolDef } from '../../src/mcp/tools/tool.types';

/**
 * Focused, real-DB Nest test module hosting the domain services the MCP
 * tools wrap (Contacts/Deals/Tasks/Analytics) — deliberately NOT the full
 * McpModule/AppModule, which drags in Bull/Redis. Only ContactsModule/
 * DealsModule/TasksModule/AnalyticsModule (verified Bull/Redis-free) are
 * imported for providers/controllers.
 *
 * Entities are loaded by glob (mirrors `src/database/data-source.ts` and
 * `test/utils/database.ts`) rather than `autoLoadEntities: true` — the
 * domain modules above only `forFeature`-register the entities they query
 * directly, but TypeORM's metadata builder still needs every *relation
 * target* reachable from those (e.g. `User#workspace` -> `Workspace`,
 * `Contact#pipelineStage` -> `PipelineStage` -> `Pipeline`, etc.) or it
 * throws at connection init. Globbing the whole entities directory avoids
 * chasing that relation graph by hand while still only registering
 * ContactsModule/DealsModule/TasksModule/AnalyticsModule's controllers and
 * services — no Bull/Redis/other module is imported.
 *
 * IMPORTANT: hardcodes `database: 'slackcrm_mcp_e2e'` (same DB as the other
 * MCP e2e suites, see helpers.ts) — do NOT read DB_NAME from env.
 */
export interface McpDomainTestApp {
  moduleRef: TestingModule;
  dataSource: DataSource;
  contactsService: ContactsService;
  dealsService: DealsService;
  tasksService: TasksService;
  analyticsService: AnalyticsService;
  workspaceRepo: Repository<Workspace>;
  userRepo: Repository<User>;
  contactRepo: Repository<Contact>;
  dealRepo: Repository<Deal>;
  taskRepo: Repository<Task>;
  invocationRepo: Repository<McpToolInvocation>;
  /** Every tool def across contacts/deals/tasks/analytics, keyed by name. */
  tools: Map<string, ToolDef>;
  close(): Promise<void>;
}

export async function bootstrapMcpDomainTestApp(): Promise<McpDomainTestApp> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.test', '.env'] }),
      EventEmitterModule.forRoot(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'localhost',
        port: 55432,
        username: 'postgres',
        password: 'password',
        database: 'slackcrm_mcp_e2e',
        entities: [join(__dirname, '../../src/database/entities/**/*.entity{.ts,.js}')],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
      TypeOrmModule.forFeature([McpToolInvocation]),
      ContactsModule,
      DealsModule,
      TasksModule,
      AnalyticsModule,
    ],
  }).compile();

  const dataSource = moduleRef.get(DataSource);
  const contactsService = moduleRef.get(ContactsService);
  const dealsService = moduleRef.get(DealsService);
  const tasksService = moduleRef.get(TasksService);
  const analyticsService = moduleRef.get(AnalyticsService);

  const toolList: ToolDef[] = [
    ...createContactsReadTools({ contacts: contactsService }),
    ...createContactsWriteTools({ contacts: contactsService }),
    ...createContactsDestructiveTools({ contacts: contactsService }),
    ...createDealsReadTools({ deals: dealsService }),
    ...createDealsWriteTools({ deals: dealsService }),
    ...createDealsDestructiveTools({ deals: dealsService }),
    ...createTasksReadTools({ tasks: tasksService }),
    ...createTasksWriteTools({ tasks: tasksService }),
    ...createAnalyticsReadTools({ analytics: analyticsService }),
  ];
  const tools = new Map(toolList.map((t) => [t.name, t]));

  return {
    moduleRef,
    dataSource,
    contactsService,
    dealsService,
    tasksService,
    analyticsService,
    workspaceRepo: dataSource.getRepository(Workspace),
    userRepo: dataSource.getRepository(User),
    contactRepo: dataSource.getRepository(Contact),
    dealRepo: dataSource.getRepository(Deal),
    taskRepo: dataSource.getRepository(Task),
    invocationRepo: dataSource.getRepository(McpToolInvocation),
    tools,
    close: async () => {
      await dataSource.destroy();
      await moduleRef.close();
    },
  };
}

/**
 * Persist a real Workspace row. `User#workspace` is a (non-nullable-FK)
 * ManyToOne sharing the `workspaceId` column with the plain WorkspaceEntity
 * uuid column, so any workspaceId used for a User (or any WorkspaceEntity
 * row, in this schema) must reference an existing `workspaces` row.
 */
export async function seedWorkspace(
  workspaceRepo: Repository<Workspace>,
  label: string,
): Promise<Workspace> {
  const workspace = workspaceRepo.create({
    name: `${label} workspace`,
    domain: `${label}-${randomUUID()}.mcp-e2e.test`,
  });
  return workspaceRepo.save(workspace);
}

/** Build a real, persisted User with the given role in the given workspace. */
export async function seedUser(
  userRepo: Repository<User>,
  workspaceId: string,
  role: UserRole,
  label: string,
): Promise<User> {
  const user = userRepo.create({
    workspaceId,
    email: `${label}-${randomUUID()}@mcp-e2e.test`,
    firstName: label,
    lastName: 'Tester',
    password: 'unused-hash',
    role,
    status: UserStatus.ACTIVE,
  });
  return userRepo.save(user);
}

export function buildAuthContext(user: User, scopes: string[]): McpAuthContext {
  return {
    workspaceId: user.workspaceId,
    userId: user.id,
    role: user.role,
    user,
    scopes,
  };
}

export interface WorkspaceFixture {
  workspaceId: string;
  admin: User;
  contacts: Contact[];
  deal: Deal;
  task: Task;
}

/** Seed a couple of contacts, a deal, and a task for one workspace. */
export async function seedWorkspaceFixture(
  app: McpDomainTestApp,
  label: string,
): Promise<WorkspaceFixture> {
  const workspace = await seedWorkspace(app.workspaceRepo, label);
  const workspaceId = workspace.id;
  const admin = await seedUser(app.userRepo, workspaceId, UserRole.ADMIN, `${label}-admin`);

  const contacts = await app.contactRepo.save([
    app.contactRepo.create({
      workspaceId,
      firstName: label,
      lastName: 'One',
      email: `${label}-one-${randomUUID()}@mcp-e2e.test`,
      status: ContactStatus.LEAD,
      source: ContactSource.WEBSITE,
    }),
    app.contactRepo.create({
      workspaceId,
      firstName: label,
      lastName: 'Two',
      email: `${label}-two-${randomUUID()}@mcp-e2e.test`,
      status: ContactStatus.LEAD,
      source: ContactSource.WEBSITE,
    }),
  ]);

  const deal = await app.dealRepo.save(
    app.dealRepo.create({
      workspaceId,
      title: `${label} deal`,
      value: 1000,
      stage: DealStage.LEAD,
    }),
  );

  const task = await app.taskRepo.save(
    app.taskRepo.create({
      workspaceId,
      title: `${label} task`,
      status: TaskStatus.PENDING,
    }),
  );

  return { workspaceId, admin, contacts, deal, task };
}
