/**
 * Database test utilities for setting up and managing test databases
 */

import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Contact } from '../../src/database/entities/contact.entity';
import { User } from '../../src/database/entities/user.entity';
import { Company } from '../../src/database/entities/company.entity';
import { Deal } from '../../src/database/entities/deal.entity';
import { Task } from '../../src/database/entities/task.entity';
import { Activity } from '../../src/database/entities/activity.entity';
import { Integration } from '../../src/database/entities/integration.entity';

/**
 * Get test database configuration
 */
export const getTestDatabaseConfig = (configService?: ConfigService): DataSourceOptions => {
  const isE2E = process.env.NODE_ENV?.includes('e2e');

  return {
    type: 'postgres',
    host: configService?.get('DB_HOST') || process.env.DB_HOST || 'localhost',
    port: configService?.get('DB_PORT') || parseInt(process.env.DB_PORT || '5432'),
    username: configService?.get('DB_USERNAME') || process.env.DB_USERNAME || 'test',
    password: configService?.get('DB_PASSWORD') || process.env.DB_PASSWORD || 'test',
    database: configService?.get('DB_NAME') || process.env.DB_NAME || (isE2E ? 'slackcrm_test_e2e' : 'slackcrm_test'),
    entities: [Contact, User, Company, Deal, Task, Activity, Integration],
    synchronize: true,
    logging: false,
    dropSchema: isE2E, // Fresh database for E2E tests
  };
};

/**
 * Create a test database connection
 */
export const createTestDatabase = async (configService?: ConfigService): Promise<DataSource> => {
  const config = getTestDatabaseConfig(configService);
  const dataSource = new DataSource(config);

  try {
    await dataSource.initialize();
    return dataSource;
  } catch (error) {
    console.error('Failed to initialize test database:', error);
    throw error;
  }
};

/**
 * Clean all tables in the database
 */
export const cleanDatabase = async (dataSource: DataSource): Promise<void> => {
  if (!dataSource.isInitialized) {
    throw new Error('Database connection is not initialized');
  }

  const entities = dataSource.entityMetadatas;

  // Disable foreign key constraints temporarily
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');

  try {
    // Clear all tables
    for (const entity of entities) {
      const repository = dataSource.getRepository(entity.name);
      await repository.clear();
    }
  } finally {
    // Re-enable foreign key constraints
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};

/**
 * Truncate all tables (more aggressive cleanup)
 */
export const truncateDatabase = async (dataSource: DataSource): Promise<void> => {
  if (!dataSource.isInitialized) {
    throw new Error('Database connection is not initialized');
  }

  const entities = dataSource.entityMetadatas;

  for (const entity of entities) {
    try {
      await dataSource.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
    } catch (error) {
      // Some tables might not exist yet, ignore the error
      console.warn(`Failed to truncate table ${entity.tableName}:`, error.message);
    }
  }
};

/**
 * Seed basic test data
 */
export const seedTestData = async (dataSource: DataSource) => {
  const workspaceId = 'test-workspace-123';

  // Create test user
  const userRepository = dataSource.getRepository(User);
  const testUser = userRepository.create({
    workspaceId,
    email: 'testuser@example.com',
    firstName: 'Test',
    lastName: 'User',
    password: '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // secret
    role: 'SALES_REP' as any,
    status: 'ACTIVE' as any,
  });
  await userRepository.save(testUser);

  // Create test company
  const companyRepository = dataSource.getRepository(Company);
  const testCompany = companyRepository.create({
    workspaceId,
    name: 'Test Company',
    website: 'https://testcompany.com',
    industry: 'Technology',
    size: '50-100',
  });
  await companyRepository.save(testCompany);

  // Create test contacts
  const contactRepository = dataSource.getRepository(Contact);
  const testContacts = [
    contactRepository.create({
      workspaceId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      status: 'LEAD' as any,
      source: 'WEBSITE' as any,
      leadScore: 75,
      ownerId: testUser.id,
      companyId: testCompany.id,
    }),
    contactRepository.create({
      workspaceId,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      status: 'QUALIFIED' as any,
      source: 'REFERRAL' as any,
      leadScore: 85,
      ownerId: testUser.id,
    }),
  ];
  await contactRepository.save(testContacts);

  return {
    workspaceId,
    user: testUser,
    company: testCompany,
    contacts: testContacts,
  };
};

/**
 * Create a database connection pool for concurrent tests
 */
export class TestDatabasePool {
  private connections: Map<string, DataSource> = new Map();

  async getConnection(name: string = 'default', configService?: ConfigService): Promise<DataSource> {
    if (!this.connections.has(name)) {
      const config = getTestDatabaseConfig(configService);
      // Use unique database name for each connection
      config.database = `${config.database}_${name}`;

      const dataSource = new DataSource(config);
      await dataSource.initialize();
      this.connections.set(name, dataSource);
    }

    return this.connections.get(name)!;
  }

  async closeAll(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(conn =>
      conn.isInitialized ? conn.destroy() : Promise.resolve()
    );
    await Promise.all(promises);
    this.connections.clear();
  }
}

/**
 * Wait for database to be ready
 */
export const waitForDatabase = async (dataSource: DataSource, maxRetries = 10, delay = 1000): Promise<void> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await dataSource.query('SELECT 1');
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Database not ready after ${maxRetries} retries: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Execute raw SQL safely
 */
export const executeRawSQL = async (dataSource: DataSource, sql: string, parameters?: any[]): Promise<any> => {
  if (!dataSource.isInitialized) {
    throw new Error('Database connection is not initialized');
  }

  try {
    return await dataSource.query(sql, parameters);
  } catch (error) {
    console.error(`Failed to execute SQL: ${sql}`, error);
    throw error;
  }
};

/**
 * Get table row count
 */
export const getTableCount = async (dataSource: DataSource, tableName: string): Promise<number> => {
  const result = await dataSource.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
  return parseInt(result[0].count);
};

/**
 * Check if table exists
 */
export const tableExists = async (dataSource: DataSource, tableName: string): Promise<boolean> => {
  try {
    const result = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    return result.length > 0;
  } catch {
    return false;
  }
};