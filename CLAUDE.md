# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SlackCRM is a full-stack CRM application built with NestJS (backend) and Next.js 15 (frontend). It features contact management, deal pipeline, task management, analytics, and integrations with Slack, Google Calendar, Stack Auth, and more. The application uses PostgreSQL for data persistence, Redis for queues/caching, and supports multi-tenancy through workspace-based isolation.

## Common Commands

### Development

```bash
# Start both backend and frontend
npm run dev

# Start only backend (runs on http://localhost:3000)
cd backend && npm run start:dev

# Start only frontend (runs on http://localhost:3001)
cd frontend && npm run dev

# Type checking
npm run typecheck
npm run typecheck:backend
npm run typecheck:frontend
```

### Testing

```bash
# Run all tests
npm run test

# Backend tests only
cd backend && npm run test

# Backend tests with coverage
cd backend && npm run test:cov

# Backend E2E tests
cd backend && npm run test:e2e

# Backend tests in watch mode
cd backend && npm run test:watch

# Frontend tests
cd frontend && npm run test
```

### Database Migrations

```bash
# Generate a new migration from entity changes
npm run migration:generate -- src/database/migrations/MigrationName
# OR from backend directory:
cd backend && npm run migration:generate -- src/database/migrations/MigrationName

# Run pending migrations
npm run migration:run
# OR: cd backend && npm run migration:run

# Revert the last migration
npm run migration:revert
# OR: cd backend && npm run migration:revert

# Drop entire schema (destructive!)
cd backend && npm run schema:drop

# Sync schema without migrations (dev only)
cd backend && npm run schema:sync
```

### Building

```bash
# Build all projects
npm run build

# Build backend only
npm run build:backend
# OR: cd backend && npm run build

# Build frontend only
npm run build:frontend
# OR: cd frontend && npm run build

# Build shared packages first (if developing shared code)
npm run build:shared
```

### Linting & Formatting

```bash
# Lint all code
npm run lint

# Lint backend
cd backend && npm run lint

# Lint frontend
cd frontend && npm run lint

# Format backend code
cd backend && npm run format
```

### Docker

```bash
# Build Docker containers
npm run docker:build

# Start containers in detached mode
npm run docker:up

# Stop containers
npm run docker:down
```

## Architecture

### Backend Architecture (NestJS)

The backend follows a modular architecture with clear separation of concerns:

**Core Structure:**
- **Modules**: Each feature is a self-contained module (`auth`, `users`, `contacts`, `companies`, `deals`, `tasks`, `activities`, `integrations`, `analytics`, `email`, `health`)
- **Database Layer**: TypeORM with PostgreSQL, entities in `backend/src/database/entities/`
- **Multi-tenancy**: All entities extend `WorkspaceEntity` (from `base.entity.ts`) which includes `workspaceId` for data isolation
- **Configuration**: Centralized in `backend/src/config/` with Joi validation in `env.validation.ts`

**Key Patterns:**
- **Authentication**: Dual system - JWT for API auth (Passport) + Stack Auth for frontend
- **Role-Based Access Control (RBAC)**: 6 roles - ADMIN, MANAGER, CLOSER, SETTER, SALES_REP, SUPPORT_AGENT
- **Integration Framework**:
  - Registry pattern in `integrations/registry/integration.registry.ts`
  - Handlers for each integration type in `integrations/handlers/`
  - OAuth flow managed by `integrations/auth/oauth.service.ts`
  - Webhook handling in `integrations/webhook/webhook.service.ts`
  - Sync service in `integrations/sync/sync.service.ts`
- **Event System**: `@nestjs/event-emitter` for domain events (e.g., `integration.installed`, `integration.synced`)
- **Queue Processing**: Bull + Redis for background jobs
- **Health Monitoring**: Terminus for health checks at `/health`, `/health/readiness`, `/health/liveness`

**Database Connection:**
- Supports both `DATABASE_URL` (for Neon/Supabase) OR individual params (`DB_HOST`, `DB_PORT`, etc.)
- Connection pooling configured in `database/data-source.ts`
- Auto-runs migrations in production (`migrationsRun: true`)
- Never use `synchronize: true` in production

### Frontend Architecture (Next.js 15)

**Structure:**
- **App Router**: Routes in `frontend/app/` with route groups `(auth)` and `(dashboard)`
- **Components**: Reusable UI components in `frontend/components/`
- **API Client**: Axios-based API wrapper in `frontend/lib/api.ts`
- **Authentication**: Stack Auth with `AuthGuard` component wrapping the layout
- **Styling**: Tailwind CSS 4.x

**Key Pages:**
- `/login`, `/register` - Authentication (auth route group)
- `/dashboard` - Main dashboard with analytics
- `/contacts`, `/companies`, `/deals`, `/tasks` - CRM features
- `/calendar` - Event management with Google Calendar integration
- `/integrations` - Manage third-party integrations
- `/analytics` - Sales metrics and team performance
- `/settings` - User preferences

### Entity Relationships

All entities extend `BaseEntity` (has `id`, `createdAt`, `updatedAt`) or `WorkspaceEntity` (adds `workspaceId`).

**Key Relationships:**
- `User` belongs to `Workspace`, has many `Contact`, `Deal`, `Task`
- `Contact` belongs to `User` (owner), `Company`, has many `Deal`, `Activity`, `Task`
- `Deal` belongs to `Contact`, `User` (owner), has many `Activity`, `Task`
- `Company` has many `Contact`, `Deal`
- `Integration` belongs to `Workspace`, `User`, has many `IntegrationWebhook`, `IntegrationLog`
- All CRM entities are workspace-scoped for multi-tenancy

### Integration System

The integration system is designed for extensibility:

1. **Registration**: Integrations are registered in `IntegrationRegistry` with metadata (name, auth type, scopes, etc.)
2. **Handler Pattern**: Each integration type has a handler implementing `IntegrationHandler` interface
3. **OAuth Flow**:
   - Initiate: `/integrations/oauth/authorize?type=google`
   - Callback: `/integrations/oauth/callback`
   - Token storage: Encrypted in `Integration.credentials`
4. **Webhooks**: Generic webhook receiver at `/integrations/webhook/:type`
5. **Sync**: Scheduled or manual sync via `SyncService`, tracks sync status in `Integration.syncInfo`

**Currently Implemented:**
- Google (Calendar + Contacts, OAuth2)
- Slack (Bot + OAuth2)
- Typeform (Webhooks + API key)
- HubSpot, Salesforce, Microsoft, Zoom (stubs)
- WhatsApp (in progress)

## Important Development Notes

### Authentication & Authorization

- **Backend API**: Use JWT tokens via `JwtAuthGuard`
- **Frontend**: Stack Auth handles user sessions
- **OAuth**: For integrations, use `OAuthService` to exchange codes for tokens
- When adding protected endpoints, use `@UseGuards(JwtAuthGuard)` and access user via `@Req() req` (req.user contains the authenticated User entity)
- Role checks: Use `user.hasPermission(action)` method or create custom guards

### Environment Variables

**Critical Backend Variables:**
- `DATABASE_URL` or (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`)
- `JWT_SECRET` (min 32 chars), `JWT_REFRESH_SECRET`
- `STACK_SECRET_SERVER_KEY`, `NEXT_PUBLIC_STACK_PROJECT_ID`, `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`

**Optional but Recommended:**
- `REDIS_HOST`, `REDIS_PORT` - For queues and caching
- `SENDGRID_API_KEY` or SMTP settings - For emails
- Integration credentials: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, etc.

**Frontend Variables:**
- `NEXT_PUBLIC_API_URL` - Backend API URL (defaults to http://localhost:3000)
- `NEXT_PUBLIC_STACK_PROJECT_ID`, `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`

### Database Migration Workflow

1. Modify entity files in `backend/src/database/entities/`
2. Generate migration: `npm run migration:generate -- src/database/migrations/DescriptiveName`
3. Review generated migration in `backend/src/database/migrations/`
4. Test migration locally: `npm run migration:run`
5. If needed, revert: `npm run migration:revert`
6. Commit migration files with entity changes

**Never** use `synchronize: true` in production. Always use migrations.

### Adding a New Integration

1. Create handler in `backend/src/integrations/handlers/your-integration.handler.ts` implementing `IntegrationHandler`
2. Register in `IntegrationRegistry` with metadata (auth type, scopes, endpoints)
3. If OAuth: Add client credentials to environment variables
4. Add to `IntegrationType` enum in `integration.entity.ts`
5. Implement `testConnection()`, `handleWebhook()`, `syncData()` methods
6. Add frontend UI in `frontend/app/(dashboard)/integrations/`

### API Documentation

- Swagger UI available at http://localhost:3000/api when backend is running
- Add `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()` decorators to controllers
- DTOs automatically generate schema documentation

### Code Style & Patterns

- Use TypeScript for all code
- Follow NestJS dependency injection patterns
- Use DTOs for request validation (`class-validator`, `class-transformer`)
- Prefer repository pattern over direct entity manager
- Use event emitters for cross-module communication
- Log important actions using `Logger` service
- Add indexes for frequently queried fields
- Use JSONB columns for flexible metadata storage

### Testing Guidelines

- Unit tests: Mock external dependencies (repositories, HTTP, etc.)
- E2E tests: Use test database (configure with `NODE_ENV=test`)
- Test files: `*.spec.ts` for unit tests, `*.e2e-spec.ts` for E2E
- Use Jest for both backend and frontend
- Coverage target: Aim for >70% on critical business logic

## Deployment

The application is configured for deployment on multiple platforms:

- **Backend**: Fly.io (primary), Railway, Render
- **Frontend**: Netlify (primary), Vercel
- **Database**: Neon PostgreSQL (serverless) or Supabase
- **Redis**: Upstash or Fly.io Redis

See `DEPLOYMENT.md`, `DEPLOYMENT_FLY.md`, and other deployment guides for platform-specific instructions.

**Key Deployment Commands:**
```bash
# Fly.io backend
flyctl deploy -a slackcrm-backend

# Set secrets on Fly.io
flyctl secrets set DATABASE_URL="postgresql://..." -a slackcrm-backend

# Netlify frontend (auto-deploys on git push)
# Or manual: cd frontend && netlify deploy --prod
```

## Current Status

**Completion: ~87-90%**

✅ Complete: Authentication, Users, Contacts, Companies, Deals, Tasks, Activities, Analytics, Email, Health monitoring, Core integrations (Slack, Google, Typeform)

🚧 In Progress: WhatsApp integration, Advanced reporting, File uploads

📝 Planned: Mobile app, Advanced AI features, Custom dashboards, Email campaigns

## Key Files Reference

- **Main app module**: `backend/src/app.module.ts`
- **Database config**: `backend/src/database/data-source.ts`
- **Environment validation**: `backend/src/config/env.validation.ts`
- **Integration service**: `backend/src/integrations/integrations.service.ts`
- **Auth service**: `backend/src/auth/auth.service.ts`
- **API client**: `frontend/lib/api.ts`
- **Root layout**: `frontend/app/layout.tsx`
