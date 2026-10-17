# Developer Quick Start Guide

**Get SlackCRM running locally in 15 minutes** ⚡

This guide is for developers who want to quickly set up the project for local development.

---

## Prerequisites Checklist

Before starting, make sure you have:

- [ ] Node.js 18+ or 20+ installed (`node --version`)
- [ ] npm 10+ installed (`npm --version`)
- [ ] PostgreSQL 14+ OR Neon account
- [ ] Git installed
- [ ] Code editor (VSCode recommended)
- [ ] Terminal/command line access

**Optional but recommended**:
- [ ] Redis installed (for queues)
- [ ] Stack Auth account (for frontend auth)
- [ ] Postman or similar API testing tool

---

## Quick Install (Copy-Paste Method)

### Step 1: Clone and Install (2 minutes)

```bash
# Clone repository
git clone <your-repo-url>
cd CRM

# Install all dependencies
npm install

# Verify installation
npm run typecheck
```

### Step 2: Database Setup (3 minutes)

**Option A: Neon (Easiest, Recommended)**

```bash
# 1. Go to https://neon.tech and create free account
# 2. Create a new database
# 3. Copy the connection string (looks like postgresql://user:pass@host/db)
# 4. Save it for next step
```

**Option B: Local PostgreSQL**

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
createdb slackcrm

# Ubuntu/Debian
sudo apt install postgresql-16
sudo systemctl start postgresql
sudo -u postgres createdb slackcrm

# Windows
# Download from https://www.postgresql.org/download/windows/
# Use pgAdmin to create database "slackcrm"
```

### Step 3: Configure Environment (3 minutes)

```bash
# Copy example environment file
cp backend/.env.example backend/.env

# Open backend/.env in your editor
code backend/.env  # or nano/vim

# Edit these required variables:
```

**Minimum Required Configuration**:

```bash
# Database (use ONE of these)
DATABASE_URL=postgresql://user:pass@host:5432/slackcrm

# OR (for local PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=yourpassword
DB_NAME=slackcrm

# JWT Secrets (generate random strings)
JWT_SECRET=your-very-long-secret-min-32-characters-please-change-this
JWT_REFRESH_SECRET=another-long-secret-min-32-characters-change-this-too

# URLs
FRONTEND_URL=http://localhost:3001
APP_URL=http://localhost:4000
NODE_ENV=development
```

**Quick Secret Generation**:
```bash
# Generate secure random secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to JWT_SECRET

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to JWT_REFRESH_SECRET
```

### Step 4: Validate Configuration (1 minute)

```bash
# Run environment validator
npm run validate:env

# Should show all green ✓ checkmarks for required variables
```

### Step 5: Set Up Database Tables (2 minutes)

```bash
# Run all migrations
npm run migration:run

# Verify tables were created
psql $DATABASE_URL -c "\dt"  # or use pgAdmin/TablePlus

# Expected output: List of 20+ tables (users, contacts, deals, tasks, etc.)
```

### Step 6: Start Development Servers (2 minutes)

```bash
# Start backend (Terminal 1)
npm run dev:backend

# In new terminal, start frontend (Terminal 2)
npm run dev:frontend

# Or start both together (Terminal 1)
npm run dev
```

### Step 7: Verify Everything Works (2 minutes)

```bash
# Check backend health
curl http://localhost:4000/api/v1/health/readiness

# Expected output: {"status":"ok",...}

# Open Swagger API docs
open http://localhost:4000/api

# Open frontend
open http://localhost:3001
```

**✅ You're ready to develop!**

---

## Development Workflow

### Common Commands

```bash
# Development
npm run dev                # Start both backend and frontend
npm run dev:backend        # Start only backend
npm run dev:frontend       # Start only frontend

# Testing
npm run test               # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:workflow      # Test workflow automation
npm run health             # Check backend health

# Database
npm run migration:generate # Create new migration
npm run migration:run      # Run pending migrations
npm run migration:revert   # Undo last migration
npm run db:seed            # Seed with demo data
npm run db:reset           # Reset and reseed database

# Code Quality
npm run lint               # Lint all code
npm run lint:fix           # Auto-fix lint errors
npm run format             # Format all files
npm run typecheck          # TypeScript type checking

# Building
npm run build              # Build everything
npm run build:backend      # Build backend only
npm run clean:build        # Clean build artifacts

# Validation
npm run validate           # Run all validators
npm run validate:env       # Check environment variables
npm run validate:production # Pre-deployment checks

# Docker
npm run docker:build       # Build Docker containers
npm run docker:up          # Start containers
npm run docker:down        # Stop containers
npm run docker:logs        # View logs
```

### Project Structure for Developers

```
backend/src/
├── auth/                  # 🔐 JWT authentication, login, register
├── users/                 # 👤 User management, RBAC
├── contacts/              # 📇 Contact CRUD, lead scoring
├── companies/             # 🏢 Company management
├── deals/                 # 💰 Deal pipeline, stages
├── tasks/                 # ✅ Task management
├── workflows/             # 🔄 Automation engine ⭐
├── integrations/          # 🔗 Third-party integrations
│   ├── handlers/          #   Integration implementations
│   ├── auth/              #   OAuth service
│   └── webhook/           #   Webhook processing
├── email/                 # 📧 Email service
│   └── templates/         #   HTML email templates
├── analytics/             # 📊 Reporting and KPIs
├── database/              # 🗄️ TypeORM entities & migrations
└── common/                # 🛠️ Shared utilities

frontend/app/
├── (auth)/                # 🔑 Login, register pages
└── (dashboard)/           # 📈 Main app pages
    ├── contacts/
    ├── deals/
    ├── tasks/
    ├── calendar/
    ├── integrations/
    ├── analytics/
    └── settings/
```

---

## Making Your First Change

### Example 1: Add a New API Endpoint

**Goal**: Create a `/api/v1/contacts/stats` endpoint

```typescript
// backend/src/contacts/contacts.controller.ts

@Get('stats')
@ApiOperation({ summary: 'Get contact statistics' })
async getStats(@Request() req): Promise<any> {
  const workspaceId = req.user.workspaceId;
  return this.contactsService.getStats(workspaceId);
}
```

```typescript
// backend/src/contacts/contacts.service.ts

async getStats(workspaceId: string): Promise<any> {
  const total = await this.contactRepository.count({ where: { workspaceId } });
  const leads = await this.contactRepository.count({
    where: { workspaceId, stage: 'lead' }
  });

  return { total, leads, converted: total - leads };
}
```

**Test it**:
```bash
# Start backend
npm run dev:backend

# In another terminal
curl -X GET http://localhost:4000/api/v1/contacts/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Example 2: Add a Database Migration

**Goal**: Add `linkedinUrl` field to contacts

```bash
# 1. Modify entity
# backend/src/database/entities/contact.entity.ts

@Column({ nullable: true })
linkedinUrl: string;

# 2. Generate migration
npm run migration:generate -- src/database/migrations/AddLinkedInToContacts

# 3. Review generated migration in backend/src/database/migrations/

# 4. Run migration
npm run migration:run

# 5. Verify
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='contacts'"
```

### Example 3: Create a New Workflow Action

**Goal**: Add a "SEND_SMS" workflow action

```typescript
// backend/src/database/entities/workflow.entity.ts
export enum WorkflowActionType {
  // ... existing actions
  SEND_SMS = 'send_sms',  // Add this
}

// backend/src/workflows/workflows.service.ts
private async executeAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
  switch (action.type) {
    // ... existing cases

    case WorkflowActionType.SEND_SMS:
      return this.executeSendSMSAction(action, triggerData);
  }
}

private async executeSendSMSAction(action: any, triggerData: any): Promise<any> {
  const { phoneNumber, message } = action.config;

  // Implement SMS sending logic
  const processedMessage = this.replaceVariables(message, triggerData);

  // Use Twilio, AWS SNS, or other SMS provider
  // await this.smsService.send(phoneNumber, processedMessage);

  return { success: true, phoneNumber, message: processedMessage };
}
```

---

## Debugging Tips

### Backend Debugging

**Enable detailed logging**:
```bash
# backend/.env
LOG_LEVEL=debug
DB_LOGGING=true
```

**Use VSCode debugger**:
```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "start:debug"],
  "cwd": "${workspaceFolder}/backend",
  "console": "integratedTerminal"
}
```

**Check logs**:
```bash
# Backend logs (look for errors)
tail -f backend/logs/error.log

# Database query logs
tail -f backend/logs/queries.log
```

### Frontend Debugging

**React DevTools**: Install browser extension
**Redux DevTools**: Install browser extension (if using Redux)

**Console debugging**:
```typescript
// Add debugging to components
useEffect(() => {
  console.log('Component mounted', { props, state });
}, []);
```

### Common Issues

**Issue 1: Port already in use**
```bash
# Find and kill process
lsof -ti:4000 | xargs kill -9  # Backend
lsof -ti:3001 | xargs kill -9  # Frontend
```

**Issue 2: Database connection refused**
```bash
# Check PostgreSQL is running
pg_isready

# Or for Neon, test connection
psql $DATABASE_URL -c "SELECT 1"
```

**Issue 3: TypeScript compilation errors**
```bash
# Clean and rebuild
npm run clean:build
npm run build
```

**Issue 4: Migration fails**
```bash
# Revert and try again
npm run migration:revert
npm run migration:run

# Or check migration status
npm run migration:show
```

---

## Testing Your Changes

### Manual API Testing

**Using curl**:
```bash
# Register user
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Test123!@#", "firstName": "Test", "lastName": "User"}'

# Login
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Test123!@#"}'

# Save the accessToken from response

# Create contact (with auth)
curl -X POST http://localhost:4000/api/v1/contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"firstName": "John", "lastName": "Doe", "email": "john@example.com"}'
```

**Using Postman**:
1. Import collection (coming soon: `docs/SlackCRM.postman_collection.json`)
2. Set environment variables: `BASE_URL=http://localhost:4000/api/v1`
3. Test endpoints

### Writing Unit Tests

```typescript
// backend/src/contacts/contacts.service.spec.ts
describe('ContactsService', () => {
  let service: ContactsService;
  let repository: Repository<Contact>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    repository = module.get(getRepositoryToken(Contact));
  });

  it('should create a contact', async () => {
    const contactDto = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };

    jest.spyOn(repository, 'save').mockResolvedValue(contactDto as any);

    const result = await service.create('workspace-id', contactDto);
    expect(result.firstName).toBe('John');
  });
});
```

### Run tests:
```bash
npm run test                # All tests
npm run test:watch          # Watch mode
npm run test:cov            # With coverage
```

---

## Git Workflow

### Branching Strategy

```bash
# Create feature branch
git checkout -b feature/add-linkedin-field

# Make changes
# ... edit files ...

# Commit with descriptive message
git add .
git commit -m "feat: add LinkedIn URL field to contacts"

# Push to remote
git push origin feature/add-linkedin-field

# Create Pull Request on GitHub
```

### Commit Message Convention

```
feat: add new feature
fix: bug fix
docs: documentation update
style: formatting, missing semi-colons, etc.
refactor: code refactoring
test: adding tests
chore: maintenance tasks
```

**Examples**:
- `feat: add SMS workflow action`
- `fix: resolve contact duplication issue`
- `docs: update API documentation`
- `refactor: optimize database queries`

---

## Environment Variables Reference

**Critical (Required)**:
```bash
DATABASE_URL                        # PostgreSQL connection
JWT_SECRET                          # Min 32 chars
JWT_REFRESH_SECRET                  # Min 32 chars
STACK_SECRET_SERVER_KEY             # Stack Auth (optional for backend-only dev)
FRONTEND_URL                        # http://localhost:3001
APP_URL                             # http://localhost:4000
NODE_ENV                            # development
```

**Optional (For Full Features)**:
```bash
# Redis (for queues)
REDIS_HOST=localhost
REDIS_PORT=6379

# Email
SENDGRID_API_KEY=SG.xxx             # Or SMTP settings
FROM_EMAIL=noreply@yourcompany.com

# Integrations
OAUTH_GOOGLE_CLIENT_ID=xxx
OAUTH_GOOGLE_CLIENT_SECRET=xxx
OAUTH_SLACK_CLIENT_ID=xxx
OAUTH_SLACK_CLIENT_SECRET=xxx

# AI Features
OPENAI_API_KEY=sk-xxx
CLAUDE_API_KEY=xxx
```

---

## Performance Tips

### Speed Up Development

1. **Use TypeScript watch mode**:
   ```bash
   cd backend && npm run start:dev  # Auto-reloads on changes
   ```

2. **Use database pooling**:
   Already configured in `data-source.ts` (max 100 connections)

3. **Enable caching** (if Redis installed):
   Uncomment BullModule in `backend/src/app.module.ts`

4. **Optimize imports**:
   ```typescript
   // Bad
   import { Injectable, Logger, HttpException, ... } from '@nestjs/common';

   // Good
   import { Injectable } from '@nestjs/common';
   import { Logger } from '@nestjs/common';
   ```

### Reduce Memory Usage

```bash
# Use lighter Node flags
NODE_OPTIONS="--max-old-space-size=2048" npm run dev:backend
```

---

## IDE Configuration

### VSCode (Recommended)

**Install Extensions**:
- ESLint
- Prettier
- TypeScript Vue Plugin (Volar)
- REST Client
- GitLens
- Thunder Client (API testing)

**Settings** (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true
  }
}
```

### WebStorm/IntelliJ IDEA

1. Enable ESLint: Preferences → Languages → JavaScript → Code Quality Tools → ESLint
2. Enable Prettier: Preferences → Languages → JavaScript → Prettier
3. Set Node.js interpreter: Preferences → Languages → Node.js

---

## Getting Help

### Documentation
- **README.md** - Project overview
- **FINAL_PRODUCTION_GUIDE.md** - Deployment guide
- **CLAUDE.md** - Project conventions
- **Swagger UI** - http://localhost:4000/api

### Community
- **GitHub Issues** - Bug reports and features
- **GitHub Discussions** - Q&A and ideas
- **Team Chat** - Slack/Discord (if applicable)

### Debugging Checklist

When something doesn't work:

1. [ ] Check backend logs for errors
2. [ ] Verify environment variables: `npm run validate:env`
3. [ ] Test database connection: `psql $DATABASE_URL -c "SELECT 1"`
4. [ ] Check for TypeScript errors: `npm run typecheck`
5. [ ] Verify migrations ran: `npm run migration:show`
6. [ ] Restart backend: `npm run dev:backend`
7. [ ] Clear build cache: `npm run clean:build && npm run build`
8. [ ] Check API docs: http://localhost:4000/api

---

## Next Steps

After completing this quick start:

1. **Explore the codebase** - Read through key files in `backend/src`
2. **Try the API** - Use Swagger UI to test endpoints
3. **Create a workflow** - Test the automation engine
4. **Add a feature** - Follow the examples above
5. **Write tests** - Add test coverage for your code
6. **Read full docs** - Check FINAL_PRODUCTION_GUIDE.md

---

## Quick Reference Card

```bash
# Daily workflow
npm run dev                  # Start development
npm run test:watch           # Run tests
npm run lint:fix             # Fix lint errors
npm run typecheck            # Check types

# Database operations
npm run migration:run        # Run migrations
npm run db:seed              # Seed data
npm run migration:revert     # Undo migration

# Validation
npm run validate             # Check everything
npm run health               # Test backend

# Building
npm run build                # Build all
npm run clean:build          # Clean builds

# Troubleshooting
lsof -ti:4000 | xargs kill -9    # Kill backend
psql $DATABASE_URL -c "SELECT 1" # Test DB
npm run validate:env              # Check env vars
```

---

**Happy Coding! 🚀**

*Having issues? Check the troubleshooting section or open a GitHub issue.*

---

**Last Updated**: January 19, 2026
**Version**: 1.0.0
