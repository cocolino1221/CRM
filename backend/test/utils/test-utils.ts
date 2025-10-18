/**
 * Test utilities and helpers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Contact, ContactStatus, ContactSource } from '../../src/database/entities/contact.entity';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { Company, CompanyIndustry, CompanySize } from '../../src/database/entities/company.entity';

/**
 * Create mock repository with common methods
 */
export const createMockRepository = <T = any>(): Partial<Repository<T>> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn().mockImplementation((entity) => entity),
  save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  softRemove: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    getManyAndCount: jest.fn(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    getCount: jest.fn(),
  })) as any,
});

/**
 * Create mock ConfigService
 */
export const createMockConfigService = (): Partial<ConfigService> => ({
  get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
    const config = {
      'JWT_SECRET': 'test-secret',
      'JWT_EXPIRES_IN': '1h',
      'JWT_REFRESH_EXPIRES_IN': '7d',
      'database.host': 'localhost',
      'database.port': 5432,
      'database.name': 'slackcrm_test',
    };
    return config[key] || defaultValue;
  }),
});

/**
 * Create mock JwtService
 */
export const createMockJwtService = (): Partial<JwtService> => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-id', email: 'test@example.com' }),
  signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
  verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-id', email: 'test@example.com' }),
});

/**
 * Mock user factory
 */
export const createMockUser = (overrides: Partial<User> = {}): User => {
  const user = new User();
  user.id = overrides.id || 'user-123';
  user.workspaceId = overrides.workspaceId || 'workspace-123';
  user.email = overrides.email || 'test@example.com';
  user.firstName = overrides.firstName || 'John';
  user.lastName = overrides.lastName || 'Doe';
  user.password = overrides.password || '$2b$10$hashedpassword';
  user.role = overrides.role || UserRole.SALES_REP;
  user.status = overrides.status || UserStatus.ACTIVE;
  user.createdAt = overrides.createdAt || new Date('2024-01-01');
  user.updatedAt = overrides.updatedAt || new Date('2024-01-01');
  user.lastLoginAt = overrides.lastLoginAt || new Date('2024-01-01');
  user.failedLoginAttempts = overrides.failedLoginAttempts || 0;
  return user;
};

/**
 * Mock contact factory
 */
export const createMockContact = (overrides: Partial<Contact> = {}): Contact => {
  const contact = new Contact();
  contact.id = overrides.id || 'contact-123';
  contact.workspaceId = overrides.workspaceId || 'workspace-123';
  contact.firstName = overrides.firstName || 'Jane';
  contact.lastName = overrides.lastName || 'Smith';
  contact.email = overrides.email || 'jane@example.com';
  contact.phone = overrides.phone || '+1234567890';
  contact.jobTitle = overrides.jobTitle || 'Software Engineer';
  contact.status = overrides.status || ContactStatus.LEAD;
  contact.source = overrides.source || ContactSource.WEBSITE;
  contact.leadScore = overrides.leadScore || 75;
  contact.notes = overrides.notes || 'Test contact notes';
  contact.emailOptIn = overrides.emailOptIn !== undefined ? overrides.emailOptIn : false;
  contact.createdAt = overrides.createdAt || new Date('2024-01-01');
  contact.updatedAt = overrides.updatedAt || new Date('2024-01-01');
  contact.ownerId = overrides.ownerId || 'user-123';
  contact.companyId = overrides.companyId;
  contact.lastContactedAt = overrides.lastContactedAt;
  contact.customFields = overrides.customFields;
  contact.tags = overrides.tags;
  contact.deletedAt = overrides.deletedAt;

  // Ensure all entity methods are available
  Object.setPrototypeOf(contact, Contact.prototype);

  return contact;
};

/**
 * Mock company factory
 */
export const createMockCompany = (overrides: Partial<Company> = {}): Company => {
  const company = new Company();
  company.id = overrides.id || 'company-123';
  company.workspaceId = overrides.workspaceId || 'workspace-123';
  company.name = overrides.name || 'Test Company';
  company.website = overrides.website || 'https://testcompany.com';
  company.industry = overrides.industry || CompanyIndustry.TECHNOLOGY;
  company.size = overrides.size || CompanySize.MEDIUM;
  company.createdAt = overrides.createdAt || new Date('2024-01-01');
  company.updatedAt = overrides.updatedAt || new Date('2024-01-01');
  return company;
};

/**
 * Create test module with common providers
 */
export const createTestModule = async (providers: any[] = []): Promise<TestingModule> => {
  const module = await Test.createTestingModule({
    providers: [
      ...providers,
      {
        provide: getRepositoryToken(Contact),
        useValue: createMockRepository<Contact>(),
      },
      {
        provide: getRepositoryToken(User),
        useValue: createMockRepository<User>(),
      },
      {
        provide: getRepositoryToken(Company),
        useValue: createMockRepository<Company>(),
      },
      {
        provide: ConfigService,
        useValue: createMockConfigService(),
      },
      {
        provide: JwtService,
        useValue: createMockJwtService(),
      },
    ],
  }).compile();

  return module;
};

/**
 * Mock authentication context
 */
export interface MockAuthContext {
  user: User;
  workspace: { id: string; name: string };
  token: string;
}

export const createMockAuthContext = (overrides: Partial<MockAuthContext> = {}): MockAuthContext => ({
  user: overrides.user || createMockUser(),
  workspace: overrides.workspace || { id: 'workspace-123', name: 'Test Workspace' },
  token: overrides.token || 'mock-jwt-token',
});

/**
 * Database test utilities
 */
export const truncateDatabase = async (dataSource: DataSource): Promise<void> => {
  if (!dataSource.isInitialized) return;

  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }
};

/**
 * Wait for a specified amount of time
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate unique test data
 */
export const generateUniqueEmail = (): string =>
  `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;

export const generateUniqueString = (prefix: string = 'test'): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Assertion helpers
 */
export const expectContactToMatch = (actual: Contact, expected: Partial<Contact>): void => {
  Object.keys(expected).forEach(key => {
    expect(actual[key]).toEqual(expected[key]);
  });
};

export const expectUserToMatch = (actual: User, expected: Partial<User>): void => {
  Object.keys(expected).forEach(key => {
    if (key !== 'password') { // Don't compare passwords directly
      expect(actual[key]).toEqual(expected[key]);
    }
  });
};