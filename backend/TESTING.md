# Testing Guide for SlackCRM Backend

This guide provides comprehensive information about the testing strategy, setup, and best practices for the SlackCRM Backend application.

## 🎯 Testing Strategy

Our testing approach follows the **Test Pyramid** principle with three levels of testing:

### 1. Unit Tests (70%)
- **Purpose**: Test individual components in isolation
- **Scope**: Services, utilities, helpers, pure functions
- **Speed**: Very fast (< 1s per test)
- **Dependencies**: Mocked/stubbed
- **Coverage Target**: 85%+

### 2. Integration Tests (20%)
- **Purpose**: Test component interactions and database operations
- **Scope**: Controllers, database repositories, external service integrations
- **Speed**: Medium (1-5s per test)
- **Dependencies**: Real database, mocked external services
- **Coverage Target**: 80%+

### 3. E2E Tests (10%)
- **Purpose**: Test complete user workflows
- **Scope**: Full API endpoints, authentication, business processes
- **Speed**: Slower (5-30s per test)
- **Dependencies**: Real database, mocked external services
- **Coverage Target**: Key user journeys

## 🏗️ Test Infrastructure

### Test Types & File Structure

```
test/
├── config/
│   └── test.config.ts          # Test configuration
├── utils/
│   ├── test-utils.ts           # Test utilities and factories
│   └── database.ts             # Database test utilities
├── setup.ts                    # Unit test setup
├── setup-e2e.ts              # E2E test setup
├── run-tests.sh               # Test runner script
└── *.e2e-spec.ts             # E2E test files

src/
├── **/*.spec.ts               # Unit tests (co-located)
└── **/*.controller.spec.ts    # Integration tests
```

### Test Configuration

#### Jest Configuration
- **Unit Tests**: `jest.config.js`
- **E2E Tests**: `test/jest-e2e.json`
- **Coverage**: HTML and LCOV reports
- **Thresholds**: 80% coverage minimum

#### Database Setup
- **Unit Tests**: In-memory/mocked database
- **Integration Tests**: PostgreSQL test database
- **E2E Tests**: Isolated PostgreSQL database with cleanup

## 🚀 Running Tests

### Using NPM Scripts

```bash
# Run all unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run tests with debugging
npm run test:debug
```

### Using Test Runner Script

```bash
# Make script executable (first time only)
chmod +x test/run-tests.sh

# Run specific test types
./test/run-tests.sh unit          # Unit tests only
./test/run-tests.sh integration   # Integration tests only
./test/run-tests.sh e2e          # E2E tests only
./test/run-tests.sh all          # All tests
./test/run-tests.sh coverage     # With coverage
./test/run-tests.sh watch        # Watch mode

# Database management
./test/run-tests.sh setup        # Setup test databases
./test/run-tests.sh clean        # Clean test databases
```

## 📋 Prerequisites

### Required Software
- **Node.js**: >= 18.x
- **PostgreSQL**: >= 14.x
- **Redis**: >= 6.x (optional for unit tests)

### Database Setup
1. Install PostgreSQL
2. Create test databases:
   ```bash
   createdb slackcrm_test
   createdb slackcrm_test_e2e
   ```

### Environment Variables
Create `.env.test` file:
```bash
NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=test
DB_PASSWORD=test
DB_NAME=slackcrm_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-jwt-secret
JWT_REFRESH_SECRET=test-jwt-refresh-secret
```

## 🧪 Writing Tests

### Unit Test Example

```typescript
// src/contacts/contacts.service.spec.ts
describe('ContactsService', () => {
  let service: ContactsService;
  let contactRepository: jest.Mocked<Repository<Contact>>;

  beforeEach(async () => {
    const module = await createTestModule([ContactsService]);
    service = module.get<ContactsService>(ContactsService);
    contactRepository = module.get(getRepositoryToken(Contact));
  });

  describe('create', () => {
    it('should create contact successfully', async () => {
      // Arrange
      const createDto: CreateContactDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: generateUniqueEmail(),
      };

      const mockContact = createMockContact(createDto);
      contactRepository.save.mockResolvedValue(mockContact);

      // Act
      const result = await service.create('workspace-123', createDto);

      // Assert
      expect(result).toMatchObject(createDto);
      expect(contactRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(createDto)
      );
    });
  });
});
```

### Integration Test Example

```typescript
// src/contacts/contacts.controller.spec.ts
describe('ContactsController', () => {
  let controller: ContactsController;
  let contactsService: jest.Mocked<ContactsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [{ provide: ContactsService, useValue: mockContactsService }],
    }).compile();

    controller = module.get<ContactsController>(ContactsController);
    contactsService = module.get(ContactsService);
  });

  it('should return paginated contacts', async () => {
    // Test controller integration with service
    const mockResult = { contacts: [], total: 0, page: 1, limit: 20 };
    contactsService.findAll.mockResolvedValue(mockResult);

    const result = await controller.findAll('workspace-123', {});

    expect(result).toEqual(mockResult);
  });
});
```

### E2E Test Example

```typescript
// test/contacts.e2e-spec.ts
describe('ContactsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [/* modules */],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/contacts (POST)', async () => {
    return request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'test@example.com' })
      .expect(201)
      .expect(res => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.firstName).toBe('John');
      });
  });
});
```

## 🛠️ Test Utilities

### Factory Functions
- `createMockContact()`: Create mock contact objects
- `createMockUser()`: Create mock user objects
- `createMockCompany()`: Create mock company objects
- `generateUniqueEmail()`: Generate unique test emails
- `generateUniqueString()`: Generate unique test strings

### Repository Mocks
- `createMockRepository()`: Create mock TypeORM repositories
- `createMockConfigService()`: Create mock ConfigService
- `createMockJwtService()`: Create mock JwtService

### Database Utilities
- `createTestDatabase()`: Setup test database connection
- `cleanDatabase()`: Clean all tables
- `truncateDatabase()`: Truncate all tables
- `seedTestData()`: Seed test data

### Assertion Helpers
- `expectContactToMatch()`: Assert contact properties
- `expectUserToMatch()`: Assert user properties

## 📊 Coverage Reports

### Generating Coverage
```bash
npm run test:cov
```

### Viewing Reports
- **HTML Report**: `coverage/lcov-report/index.html`
- **Terminal Summary**: Displayed after test run
- **LCOV File**: `coverage/lcov.info` (for CI/CD)

### Coverage Thresholds
```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
}
```

## 🔧 Best Practices

### Writing Good Tests

#### ✅ Do
- **Use descriptive test names**: Explain what is being tested and expected outcome
- **Follow AAA pattern**: Arrange, Act, Assert
- **Test one thing at a time**: Each test should verify a single behavior
- **Use factories for test data**: Consistent, maintainable test objects
- **Mock external dependencies**: Keep tests isolated and fast
- **Clean up after tests**: Reset state between tests

#### ❌ Don't
- **Test implementation details**: Focus on behavior, not internal structure
- **Share state between tests**: Each test should be independent
- **Use real external services**: Mock APIs, databases, etc.
- **Write too many E2E tests**: They're slow and fragile
- **Ignore failing tests**: Fix or remove broken tests immediately

### Naming Conventions
- **Test files**: `*.spec.ts` for unit/integration, `*.e2e-spec.ts` for E2E
- **Test descriptions**: Use "should [expected behavior] when [condition]"
- **Mock objects**: Prefix with `mock` (e.g., `mockContactRepository`)
- **Test data**: Use factories and descriptive names

### Performance Tips
- **Parallel execution**: Tests run in parallel by default
- **Database transactions**: Use transactions for faster cleanup
- **Selective mocking**: Only mock what you need
- **Test data cleanup**: Clean up test data to prevent flaky tests

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Recreate test databases
./test/run-tests.sh clean
```

#### Permission Errors
```bash
# Fix test script permissions
chmod +x test/run-tests.sh

# Check database permissions
psql -d slackcrm_test -c "SELECT current_user;"
```

#### Memory Issues
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm run test
```

#### Timeout Issues
```typescript
// Increase timeout for specific tests
jest.setTimeout(30000);

// Or in individual tests
it('should handle long operation', async () => {
  // Test code
}, 30000);
```

### Debug Mode
```bash
# Run tests in debug mode
npm run test:debug

# Or with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

## 📈 Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: ./test/run-tests.sh all
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [TypeORM Testing](https://typeorm.io/testing)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

---

For questions or issues with testing, please check the troubleshooting section or create an issue in the repository.