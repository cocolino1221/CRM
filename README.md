# SlackCRM - Modern CRM Platform

A full-stack CRM application built with NestJS, Next.js 15, PostgreSQL, and TypeScript. Features include contact management, deal pipeline, integrations with Stack Auth, analytics, and more.

## 🚀 Features

- **Contact & Company Management** - Full CRUD operations with relationships
- **Deal Pipeline** - Visual pipeline with analytics and forecasting
- **Task Management** - Assign and track tasks with due dates and priorities
- **Activity Tracking** - Automatic activity logging
- **Integrations** - Slack, Google, Typeform, Zoom, and more
- **Analytics Dashboard** - Sales metrics, forecasting, team performance
- **Multi-tenancy** - Workspace-based isolation
- **Authentication** - JWT + Stack Auth, role-based access control (6 roles)
- **Email Service** - Password reset, invitations, notifications
- **Health Monitoring** - Database, memory, disk checks
- **API Documentation** - Auto-generated Swagger docs

## 📦 Tech Stack

### Backend
- **NestJS** - Progressive Node.js framework
- **TypeORM** - Database ORM with PostgreSQL
- **Passport & JWT** - Authentication
- **Bull** - Queue processing with Redis
- **Joi** - Environment validation
- **Swagger** - API documentation
- **Stack Auth** - Modern authentication

### Frontend
- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **Tailwind CSS** - Styling
- **Stack Auth** - Authentication

### Database & Infrastructure
- **PostgreSQL 16** - Primary database (Neon/Supabase supported)
- **Redis 7** - Caching and queues (optional)
- **Docker** - Containerization

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 16+ (or Neon/Supabase account)
- Redis 7+ (optional)
- pnpm (recommended) or npm
- Stack Auth account (https://stack-auth.com)

### Environment Setup

1. **Clone the repository:**
```bash
git clone <your-repo-url>
cd CRM
```

2. **Install dependencies:**
```bash
# Backend
cd backend
npm install

# Frontend (if applicable)
cd ../automation/saas-messaging-platform/apps/frontend
npm install
```

3. **Configure environment variables:**

**Backend** - Copy `.env.example` to `.env`:
```bash
cd backend
cp .env.example .env
```

**Required variables:**

**Database (Choose one option):**
- `DATABASE_URL` - Neon/Supabase connection string (recommended), OR
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` - Individual params

**Authentication:**
- `JWT_SECRET` - Min 32 characters (for security)
- `JWT_REFRESH_SECRET` - Min 32 characters
- `STACK_SECRET_SERVER_KEY` - From Stack Auth dashboard
- `NEXT_PUBLIC_STACK_PROJECT_ID` - From Stack Auth
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` - From Stack Auth

**Optional but recommended:**
- `SENDGRID_API_KEY` or SMTP settings - For email functionality
- `REDIS_HOST`, `REDIS_PORT` - For queues and caching
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` - For Slack integration
- `TYPEFORM_API_KEY` - For Typeform integration
- `OPENAI_API_KEY` - For AI features

4. **Database setup:**

**Option A: Using Neon (Recommended for production)**
```bash
# 1. Create account at https://neon.tech
# 2. Create a new project
# 3. Copy DATABASE_URL to .env
DATABASE_URL=postgresql://username:password@ep-xxx.region.neon.tech/dbname?sslmode=require

# 4. Run migrations
npm run migration:run
```

**Option B: Local PostgreSQL**
```bash
# Start PostgreSQL
brew services start postgresql@16

# Create database
createdb slackcrm

# Update .env with local credentials
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=slackcrm

# Run migrations
npm run migration:run
```

5. **Stack Auth setup:**
```bash
# 1. Create account at https://stack-auth.com
# 2. Create a new project
# 3. Copy these values to .env:
NEXT_PUBLIC_STACK_PROJECT_ID=c0256b4b-12d4-44ad-9eea-126af89d909c
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=pck_xxx
STACK_SECRET_SERVER_KEY=ssk_xxx
```

6. **Start development servers:**

**Backend:**
```bash
cd backend
npm run start:dev
# Server runs on http://localhost:3000
# Swagger docs: http://localhost:3000/api
```

**Frontend:**
```bash
cd automation/saas-messaging-platform/apps/frontend
npm run dev
# App runs on http://localhost:3001
```

## 🗄️ Database Migrations

```bash
# Generate migration from entity changes
npm run migration:generate -- src/database/migrations/MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

## 📚 API Documentation

Once the backend is running, visit:
- **Swagger UI:** http://localhost:3000/api
- **Health Check:** http://localhost:3000/health
- **Readiness:** http://localhost:3000/health/readiness
- **Metrics:** http://localhost:3000/health/metrics

## 🏗️ Project Structure

```
CRM/
├── backend/                    # NestJS backend
│   ├── src/
│   │   ├── auth/              # Authentication & JWT
│   │   ├── users/             # User management
│   │   ├── contacts/          # Contact management
│   │   ├── companies/         # Company management
│   │   ├── deals/             # Deal pipeline & analytics
│   │   ├── tasks/             # Task management
│   │   ├── activities/        # Activity tracking
│   │   ├── integrations/      # Third-party integrations
│   │   │   ├── handlers/      # Integration handlers
│   │   │   ├── auth/          # OAuth service
│   │   │   ├── webhook/       # Webhook service
│   │   │   └── sync/          # Sync service
│   │   ├── analytics/         # Analytics & reporting
│   │   ├── email/             # Email service (SendGrid/SMTP)
│   │   ├── health/            # Health monitoring
│   │   ├── database/          # Entities & migrations
│   │   ├── config/            # Configuration files
│   │   └── common/            # Shared utilities
│   ├── .env.example           # Environment template
│   ├── .env                   # Your config (not committed)
│   └── package.json
│
└── automation/saas-messaging-platform/
    └── apps/
        └── frontend/          # Next.js frontend
            ├── app/           # App Router pages
            ├── components/    # React components
            └── lib/           # Utilities
```

## 🔐 Authentication

The app uses a dual authentication system:

1. **JWT Authentication** - Backend API
   - Access tokens (24h expiry by default)
   - Refresh tokens (7d expiry)
   - Role-based access control (ADMIN, MANAGER, USER, VIEWER, AGENT, GUEST)

2. **Stack Auth** - Frontend
   - Email/password authentication
   - OAuth providers (Google, GitHub, etc.)
   - Session management
   - User profile management

## 🎯 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - User logout
- `POST /auth/refresh` - Refresh access token
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token
- `POST /auth/verify-email` - Verify email address
- `GET /auth/profile` - Get current user profile

### Users
- `GET /users` - List users (with filters)
- `POST /users` - Create user
- `GET /users/:id` - Get user by ID
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Remove user
- `POST /users/invite` - Invite user via email
- `GET /users/statistics` - Get user statistics

### Contacts
- `GET /contacts` - List contacts
- `POST /contacts` - Create contact
- `GET /contacts/:id` - Get contact
- `PATCH /contacts/:id` - Update contact
- `DELETE /contacts/:id` - Delete contact

### Deals
- `GET /deals` - List deals
- `POST /deals` - Create deal
- `GET /deals/pipeline` - Get pipeline view
- `GET /deals/analytics/velocity` - Get velocity metrics
- `GET /deals/analytics/conversion` - Get conversion rates
- `PATCH /deals/:id/stage` - Move deal to stage

### Analytics
- `GET /analytics/dashboard` - Dashboard overview
- `GET /analytics/sales` - Sales metrics
- `GET /analytics/contacts` - Contact metrics
- `GET /analytics/team-performance` - Team performance
- `GET /analytics/comprehensive` - Comprehensive dashboard
- `GET /analytics/leaderboard` - Sales leaderboard

### Integrations
- `GET /integrations` - List integrations
- `POST /integrations` - Create integration
- `POST /integrations/:id/test` - Test connection
- `POST /integrations/:id/sync` - Trigger sync
- `GET /integrations/oauth/authorize` - OAuth authorization
- `POST /integrations/webhook/:type` - Webhook receiver

### Health
- `GET /health` - Full health check
- `GET /health/readiness` - Readiness probe
- `GET /health/liveness` - Liveness probe
- `GET /health/metrics` - Application metrics

## 🚢 Deployment

### Environment Variables for Production

Make sure to set these in your deployment platform:

**Required:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
STACK_SECRET_SERVER_KEY=ssk_...
NEXT_PUBLIC_STACK_PROJECT_ID=...
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=pck_...
```

**Recommended:**
```bash
SENDGRID_API_KEY=SG...
REDIS_HOST=...
REDIS_PORT=6379
APP_URL=https://your-domain.com
FRONTEND_URL=https://app.your-domain.com
```

### Railway (Recommended)

1. **Create Railway account:** https://railway.app
2. **Deploy from GitHub:**
```bash
# Connect your GitHub repo
# Railway will auto-detect NestJS
```
3. **Set environment variables** in Railway dashboard
4. **Deploy!** Railway handles the rest

### Render

1. **Create Render account:** https://render.com
2. **Create PostgreSQL database** on Render
3. **Create Web Service** and connect GitHub repo
4. **Set environment variables**
5. **Deploy** using provided `render.yaml`

### Vercel (Frontend)

```bash
cd automation/saas-messaging-platform/apps/frontend
vercel deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## 📊 Application Status

**Current Completion: 87-90%**

### ✅ Completed Features
- ✅ Full authentication flow (JWT + Stack Auth)
- ✅ User management with RBAC (6 roles)
- ✅ Contact & company management
- ✅ Deal pipeline with analytics
- ✅ Task management system
- ✅ Activity tracking
- ✅ Integration framework (9 integrations registered)
  - Slack (complete)
  - Google (calendar/contacts sync)
  - Typeform (webhooks)
  - HubSpot, Microsoft, Salesforce, Zoom (stubs)
- ✅ Email service (SendGrid/SMTP)
- ✅ Analytics dashboard (sales, team, leaderboard)
- ✅ Health monitoring (database, memory, disk)
- ✅ API documentation (Swagger)
- ✅ Environment validation (Joi)
- ✅ Database migrations
- ✅ Multi-tenancy (workspace isolation)
- ✅ Deployment configs (Railway, Render, Vercel, Docker)

### 🚧 In Progress
- WhatsApp integration
- Advanced reporting
- File uploads & storage
- Calendar integration (full)

### 📝 Planned
- Mobile app (React Native)
- Advanced AI features
- Custom dashboards
- Marketplace integrations
- Email campaigns
- SMS notifications

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Code Style

- Use TypeScript for all new code
- Follow NestJS conventions
- Use Prettier for formatting
- Write tests for new features
- Document public APIs

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
- 📧 Open an issue on GitHub
- 📚 Check existing documentation
- 🔍 Review Swagger API docs at `/api`
- 💬 Join our community discussions

## 🙏 Acknowledgments

- Built with [NestJS](https://nestjs.com/), [Next.js](https://nextjs.org/), and [TypeORM](https://typeorm.io/)
- Authentication by [Stack Auth](https://stack-auth.com)
- Database hosting by [Neon](https://neon.tech)
- Icons from [Heroicons](https://heroicons.com/)
- UI components from [Tailwind CSS](https://tailwindcss.com/)

---

**Made with ❤️ and TypeScript**

🚀 **Ready for deployment at 87-90% completion!**
