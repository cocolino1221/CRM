# SlackCRM Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (optional)

## Environment Variables

### Backend (.env)
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-secure-password
DB_NAME=slackcrm

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# App
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend-url.com

# Auth
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=24h

# Email (Choose one)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@yourcompany.com

# OR SMTP
# EMAIL_PROVIDER=smtp
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password

# Integrations (Optional)
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
OPENAI_API_KEY=your-openai-key
CLAUDE_API_KEY=your-claude-key
MANYCHAT_API_TOKEN=your-manychat-token
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.com/api/v1
```

## Deployment Options

### 1. Railway (Recommended)

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Initialize project:
```bash
railway init
```

4. Add PostgreSQL and Redis:
```bash
railway add --database postgresql
railway add --database redis
```

5. Deploy:
```bash
railway up
```

6. Set environment variables in Railway dashboard

### 2. Render

1. Push code to GitHub

2. Go to [render.com](https://render.com)

3. Click "New Blueprint" and select your repository

4. The `render.yaml` file will be automatically detected

5. Set environment variables in Render dashboard

6. Deploy will start automatically

### 3. Docker Compose (Self-hosted)

1. Set environment variables in `.env` file

2. Build and start services:
```bash
docker-compose up -d
```

3. Run migrations:
```bash
docker-compose exec backend npm run migration:run
```

4. Access application:
- Frontend: http://localhost:3001
- Backend: http://localhost:3000
- pgAdmin: http://localhost:5050
- Redis Commander: http://localhost:8081

### 4. Manual Deployment

#### Backend

1. Install dependencies:
```bash
cd backend
npm install
```

2. Build application:
```bash
npm run build
```

3. Run migrations:
```bash
npm run migration:run
```

4. Start production server:
```bash
npm run start:prod
```

#### Frontend

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Build application:
```bash
npm run build
```

3. Start production server:
```bash
npm start
```

## Database Migrations

### Generate migration:
```bash
npm run migration:generate -- -n MigrationName
```

### Run migrations:
```bash
npm run migration:run
```

### Revert migration:
```bash
npm run migration:revert
```

## Health Checks

- Backend: `GET /health`
- Database status: `GET /health/db`
- Redis status: `GET /health/redis`

## Monitoring

### Recommended Tools
- **Errors**: Sentry
- **Performance**: Datadog / New Relic
- **Uptime**: UptimeRobot / Pingdom
- **Logs**: CloudWatch / Papertrail

## Security Checklist

- [ ] Set strong `JWT_SECRET` (min 32 characters)
- [ ] Enable HTTPS/SSL for all endpoints
- [ ] Set secure database passwords
- [ ] Enable Redis password authentication
- [ ] Configure CORS for your frontend domain
- [ ] Set rate limiting appropriately
- [ ] Enable helmet security headers
- [ ] Regular security updates (`npm audit`)
- [ ] Backup database regularly
- [ ] Enable database SSL in production
- [ ] Rotate API keys periodically
- [ ] Set up monitoring alerts

## Backup & Recovery

### Database Backup
```bash
pg_dump -h localhost -U postgres slackcrm > backup.sql
```

### Database Restore
```bash
psql -h localhost -U postgres slackcrm < backup.sql
```

### Redis Backup
```bash
redis-cli --rdb dump.rdb
```

## Scaling

### Horizontal Scaling
- Use load balancer (nginx, AWS ALB)
- Run multiple backend instances
- Use Redis for session storage
- Enable connection pooling

### Database Optimization
- Add indexes for frequently queried fields
- Enable query caching
- Use read replicas for analytics
- Implement database connection pooling

## Troubleshooting

### Backend won't start
- Check database connection
- Verify all environment variables
- Check migration status
- Review logs

### Database connection errors
- Verify PostgreSQL is running
- Check firewall rules
- Verify credentials
- Check SSL settings

### Redis connection errors
- Verify Redis is running
- Check Redis password
- Verify network connectivity

## Support

For deployment issues:
1. Check logs: `railway logs` or `docker-compose logs`
2. Verify environment variables
3. Test database connectivity
4. Check health endpoints
5. Review error messages

## Production Checklist

- [ ] All environment variables configured
- [ ] Database migrations run successfully
- [ ] Health checks passing
- [ ] SSL/HTTPS enabled
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Monitoring set up
- [ ] Backup strategy in place
- [ ] Error tracking configured
- [ ] Documentation updated
- [ ] Load testing completed
- [ ] Security audit performed
