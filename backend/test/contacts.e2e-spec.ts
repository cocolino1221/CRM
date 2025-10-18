import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ContactsModule } from '../src/contacts/contacts.module';
import { Contact, ContactStatus, ContactSource } from '../src/database/entities/contact.entity';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { Company } from '../src/database/entities/company.entity';
import { CreateContactDto } from '../src/contacts/dto/create-contact.dto';
import { UpdateContactDto } from '../src/contacts/dto/update-contact.dto';
import {
  createMockUser,
  createMockCompany,
  truncateDatabase,
  generateUniqueEmail,
  generateUniqueString,
} from './utils/test-utils';

describe('ContactsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  // Test data
  let testWorkspace: { id: string; name: string };
  let testUser: User;
  let testCompany: Company;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env'],
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get('DB_HOST', 'localhost'),
            port: configService.get('DB_PORT', 5432),
            username: configService.get('DB_USERNAME', 'test'),
            password: configService.get('DB_PASSWORD', 'test'),
            database: configService.get('DB_NAME', 'slackcrm_test_e2e'),
            entities: [Contact, User, Company],
            synchronize: true,
            logging: false,
            dropSchema: true, // Clean slate for each test run
          }),
          inject: [ConfigService],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get('JWT_SECRET', 'test-secret-e2e'),
            signOptions: { expiresIn: '1h' },
          }),
          inject: [ConfigService],
        }),
        ContactsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

    dataSource = moduleFixture.get<DataSource>(DataSource);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    await app.init();

    // Set up test data
    await setupTestData();
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    // Clean up contacts before each test
    await dataSource.getRepository(Contact).delete({});
  });

  async function setupTestData() {
    // Create test workspace (in a real app, this would be a workspace entity)
    testWorkspace = {
      id: 'test-workspace-e2e',
      name: 'Test Workspace E2E',
    };

    // Create test user
    const userRepository = dataSource.getRepository(User);
    testUser = userRepository.create({
      workspaceId: testWorkspace.id,
      email: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: '$2b$10$hashedpassword', // bcrypt hash for 'password'
      role: UserRole.SALES_REP,
      status: UserStatus.ACTIVE,
    });
    testUser = await userRepository.save(testUser);

    // Create test company
    const companyRepository = dataSource.getRepository(Company);
    testCompany = companyRepository.create({
      workspaceId: testWorkspace.id,
      name: 'Test Company E2E',
      website: 'https://testcompany.com',
      industry: 'Technology',
      size: '50-100',
    });
    testCompany = await companyRepository.save(testCompany);

    // Generate auth token
    authToken = jwtService.sign({
      sub: testUser.id,
      email: testUser.email,
      workspaceId: testWorkspace.id,
    });
  }

  function getAuthHeaders() {
    return {
      Authorization: `Bearer ${authToken}`,
      'X-Workspace-Id': testWorkspace.id,
    };
  }

  describe('/contacts (POST)', () => {
    it('should create a new contact', async () => {
      const createContactDto: CreateContactDto = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: generateUniqueEmail(),
        phone: '+1234567890',
        jobTitle: 'Software Engineer',
        status: ContactStatus.LEAD,
        source: ContactSource.WEBSITE,
        ownerId: testUser.id,
        companyId: testCompany.id,
      };

      const response = await request(app.getHttpServer())
        .post('/contacts')
        .set(getAuthHeaders())
        .send(createContactDto)
        .expect(201);

      expect(response.body).toMatchObject({
        firstName: createContactDto.firstName,
        lastName: createContactDto.lastName,
        email: createContactDto.email,
        phone: createContactDto.phone,
        jobTitle: createContactDto.jobTitle,
        status: createContactDto.status,
        source: createContactDto.source,
        ownerId: testUser.id,
        companyId: testCompany.id,
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return 400 for invalid data', async () => {
      const invalidDto = {
        firstName: '', // Empty string should fail validation
        email: 'invalid-email', // Invalid email format
        phone: '123', // Too short phone number
      };

      await request(app.getHttpServer())
        .post('/contacts')
        .set(getAuthHeaders())
        .send(invalidDto)
        .expect(400);
    });

    it('should return 409 for duplicate email', async () => {
      const email = generateUniqueEmail();
      const createContactDto: CreateContactDto = {
        firstName: 'John',
        lastName: 'Doe',
        email,
      };

      // Create first contact
      await request(app.getHttpServer())
        .post('/contacts')
        .set(getAuthHeaders())
        .send(createContactDto)
        .expect(201);

      // Try to create duplicate
      await request(app.getHttpServer())
        .post('/contacts')
        .set(getAuthHeaders())
        .send({ ...createContactDto, firstName: 'Different' })
        .expect(409);
    });

    it('should return 401 without auth token', async () => {
      const createContactDto: CreateContactDto = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: generateUniqueEmail(),
      };

      await request(app.getHttpServer())
        .post('/contacts')
        .send(createContactDto)
        .expect(401);
    });
  });

  describe('/contacts (GET)', () => {
    beforeEach(async () => {
      // Create test contacts
      const contactRepository = dataSource.getRepository(Contact);
      const contacts = [
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Alice',
          lastName: 'Johnson',
          email: 'alice@example.com',
          status: ContactStatus.LEAD,
          source: ContactSource.WEBSITE,
          leadScore: 85,
        }),
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Bob',
          lastName: 'Smith',
          email: 'bob@example.com',
          status: ContactStatus.QUALIFIED,
          source: ContactSource.REFERRAL,
          leadScore: 92,
        }),
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Charlie',
          lastName: 'Brown',
          email: 'charlie@example.com',
          status: ContactStatus.CUSTOMER,
          source: ContactSource.SOCIAL_MEDIA,
          leadScore: 78,
        }),
      ];
      await contactRepository.save(contacts);
    });

    it('should return paginated contacts', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts')
        .set(getAuthHeaders())
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body).toHaveProperty('contacts');
      expect(response.body).toHaveProperty('total', 3);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 2);
      expect(response.body).toHaveProperty('totalPages', 2);
      expect(response.body.contacts).toHaveLength(2);
    });

    it('should filter contacts by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts')
        .set(getAuthHeaders())
        .query({ status: ContactStatus.QUALIFIED })
        .expect(200);

      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0].status).toBe(ContactStatus.QUALIFIED);
    });

    it('should search contacts by name and email', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts')
        .set(getAuthHeaders())
        .query({ search: 'alice' })
        .expect(200);

      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0].firstName).toBe('Alice');
    });

    it('should filter by lead score range', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts')
        .set(getAuthHeaders())
        .query({ minLeadScore: 80, maxLeadScore: 90 })
        .expect(200);

      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0].leadScore).toBe(85);
    });
  });

  describe('/contacts/stats (GET)', () => {
    beforeEach(async () => {
      // Create test contacts with various statuses
      const contactRepository = dataSource.getRepository(Contact);
      const contacts = [
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Lead1',
          lastName: 'User',
          email: 'lead1@example.com',
          status: ContactStatus.LEAD,
          leadScore: 50,
        }),
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Lead2',
          lastName: 'User',
          email: 'lead2@example.com',
          status: ContactStatus.LEAD,
          leadScore: 60,
        }),
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Qualified1',
          lastName: 'User',
          email: 'qualified1@example.com',
          status: ContactStatus.QUALIFIED,
          leadScore: 80,
        }),
      ];
      await contactRepository.save(contacts);
    });

    it('should return contact statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts/stats')
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('total', 3);
      expect(response.body).toHaveProperty('byStatus');
      expect(response.body.byStatus[ContactStatus.LEAD]).toBe(2);
      expect(response.body.byStatus[ContactStatus.QUALIFIED]).toBe(1);
      expect(response.body).toHaveProperty('averageLeadScore');
      expect(response.body.averageLeadScore).toBeCloseTo(63.33, 1);
    });
  });

  describe('/contacts/:id (GET)', () => {
    let testContact: Contact;

    beforeEach(async () => {
      const contactRepository = dataSource.getRepository(Contact);
      testContact = contactRepository.create({
        workspaceId: testWorkspace.id,
        firstName: 'Test',
        lastName: 'Contact',
        email: generateUniqueEmail(),
        ownerId: testUser.id,
        companyId: testCompany.id,
      });
      testContact = await contactRepository.save(testContact);
    });

    it('should return contact by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/contacts/${testContact.id}`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body).toMatchObject({
        id: testContact.id,
        firstName: testContact.firstName,
        lastName: testContact.lastName,
        email: testContact.email,
      });
    });

    it('should return contact with relations', async () => {
      const response = await request(app.getHttpServer())
        .get(`/contacts/${testContact.id}`)
        .set(getAuthHeaders())
        .query({ include: 'owner,company' })
        .expect(200);

      expect(response.body).toHaveProperty('owner');
      expect(response.body).toHaveProperty('company');
      expect(response.body.owner.id).toBe(testUser.id);
      expect(response.body.company.id).toBe(testCompany.id);
    });

    it('should return 404 for non-existent contact', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app.getHttpServer())
        .get(`/contacts/${nonExistentId}`)
        .set(getAuthHeaders())
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/contacts/invalid-uuid')
        .set(getAuthHeaders())
        .expect(400);
    });
  });

  describe('/contacts/:id (PUT)', () => {
    let testContact: Contact;

    beforeEach(async () => {
      const contactRepository = dataSource.getRepository(Contact);
      testContact = contactRepository.create({
        workspaceId: testWorkspace.id,
        firstName: 'Original',
        lastName: 'Name',
        email: generateUniqueEmail(),
      });
      testContact = await contactRepository.save(testContact);
    });

    it('should update contact successfully', async () => {
      const updateDto: UpdateContactDto = {
        firstName: 'Updated',
        lastName: 'Name',
        jobTitle: 'Senior Developer',
      };

      const response = await request(app.getHttpServer())
        .put(`/contacts/${testContact.id}`)
        .set(getAuthHeaders())
        .send(updateDto)
        .expect(200);

      expect(response.body).toMatchObject(updateDto);
      expect(response.body.id).toBe(testContact.id);
    });

    it('should return 404 for non-existent contact', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app.getHttpServer())
        .put(`/contacts/${nonExistentId}`)
        .set(getAuthHeaders())
        .send({ firstName: 'Test' })
        .expect(404);
    });
  });

  describe('/contacts/:id (DELETE)', () => {
    let testContact: Contact;

    beforeEach(async () => {
      const contactRepository = dataSource.getRepository(Contact);
      testContact = contactRepository.create({
        workspaceId: testWorkspace.id,
        firstName: 'ToDelete',
        lastName: 'Contact',
        email: generateUniqueEmail(),
      });
      testContact = await contactRepository.save(testContact);
    });

    it('should delete contact successfully', async () => {
      await request(app.getHttpServer())
        .delete(`/contacts/${testContact.id}`)
        .set(getAuthHeaders())
        .expect(204);

      // Verify contact is soft deleted
      const contactRepository = dataSource.getRepository(Contact);
      const deletedContact = await contactRepository.findOne({
        where: { id: testContact.id },
        withDeleted: true,
      });
      expect(deletedContact.deletedAt).toBeDefined();
    });

    it('should return 404 for non-existent contact', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app.getHttpServer())
        .delete(`/contacts/${nonExistentId}`)
        .set(getAuthHeaders())
        .expect(404);
    });
  });

  describe('/contacts/:id/status (PUT)', () => {
    let testContact: Contact;

    beforeEach(async () => {
      const contactRepository = dataSource.getRepository(Contact);
      testContact = contactRepository.create({
        workspaceId: testWorkspace.id,
        firstName: 'Status',
        lastName: 'Test',
        email: generateUniqueEmail(),
        status: ContactStatus.LEAD,
      });
      testContact = await contactRepository.save(testContact);
    });

    it('should update contact status successfully', async () => {
      const response = await request(app.getHttpServer())
        .put(`/contacts/${testContact.id}/status`)
        .set(getAuthHeaders())
        .send({ status: ContactStatus.QUALIFIED })
        .expect(200);

      expect(response.body.status).toBe(ContactStatus.QUALIFIED);
    });

    it('should return 400 for invalid status', async () => {
      await request(app.getHttpServer())
        .put(`/contacts/${testContact.id}/status`)
        .set(getAuthHeaders())
        .send({ status: 'invalid-status' })
        .expect(400);
    });
  });

  describe('/contacts/bulk/delete (POST)', () => {
    let testContacts: Contact[];

    beforeEach(async () => {
      const contactRepository = dataSource.getRepository(Contact);
      testContacts = await contactRepository.save([
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Bulk1',
          lastName: 'Delete',
          email: generateUniqueEmail(),
        }),
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Bulk2',
          lastName: 'Delete',
          email: generateUniqueEmail(),
        }),
      ]);
    });

    it('should bulk delete contacts successfully', async () => {
      const ids = testContacts.map(c => c.id);

      const response = await request(app.getHttpServer())
        .post('/contacts/bulk/delete')
        .set(getAuthHeaders())
        .send({ ids })
        .expect(200);

      expect(response.body.deletedCount).toBe(2);
    });

    it('should return 400 for empty ids array', async () => {
      await request(app.getHttpServer())
        .post('/contacts/bulk/delete')
        .set(getAuthHeaders())
        .send({ ids: [] })
        .expect(400);
    });
  });

  describe('/contacts/bulk/status (POST)', () => {
    let testContacts: Contact[];

    beforeEach(async () => {
      const contactRepository = dataSource.getRepository(Contact);
      testContacts = await contactRepository.save([
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Bulk1',
          lastName: 'Status',
          email: generateUniqueEmail(),
          status: ContactStatus.LEAD,
        }),
        contactRepository.create({
          workspaceId: testWorkspace.id,
          firstName: 'Bulk2',
          lastName: 'Status',
          email: generateUniqueEmail(),
          status: ContactStatus.LEAD,
        }),
      ]);
    });

    it('should bulk update contact statuses successfully', async () => {
      const ids = testContacts.map(c => c.id);

      const response = await request(app.getHttpServer())
        .post('/contacts/bulk/status')
        .set(getAuthHeaders())
        .send({ ids, status: ContactStatus.QUALIFIED })
        .expect(200);

      expect(response.body.updatedCount).toBe(2);
    });

    it('should return 400 for invalid status', async () => {
      const ids = testContacts.map(c => c.id);

      await request(app.getHttpServer())
        .post('/contacts/bulk/status')
        .set(getAuthHeaders())
        .send({ ids, status: 'invalid-status' })
        .expect(400);
    });
  });
});