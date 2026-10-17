# Redis Setup Guide for SlackCRM

Redis is used for background job processing, workflow automation, caching, and session management in SlackCRM.

## Why Redis?

**Current Status**: Redis/Bull queue system is commented out in `backend/src/app.module.ts` (lines 126-143)

**Benefits of Enabling Redis**:
- ✅ Asynchronous workflow execution (workflows run in background)
- ✅ Email queue processing (send emails without blocking API requests)
- ✅ Integration sync jobs (scheduled background sync with external services)
- ✅ Webhook processing queue (handle high-volume webhook traffic)
- ✅ Caching for improved performance
- ✅ Session storage for distributed deployments

---

## Quick Start Options

### Option 1: Local Redis (Development)

#### macOS (via Homebrew)
```bash
# Install Redis
brew install redis

# Start Redis
brew services start redis

# Verify it's running
redis-cli ping
# Should respond: PONG
```

#### Ubuntu/Debian
```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping
```

#### Docker
```bash
# Run Redis in Docker
docker run -d \
  --name slackcrm-redis \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --appendonly yes

# Verify
docker exec slackcrm-redis redis-cli ping
```

#### Environment Variables (Local)
```bash
# Add to backend/.env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

---

### Option 2: Upstash (Serverless Redis - Recommended for Production)

[Upstash](https://upstash.com) offers serverless Redis with a generous free tier.

#### Setup Steps

1. **Create Account**
   - Go to https://upstash.com
   - Sign up (free tier includes 10,000 commands/day)

2. **Create Database**
   - Click "Create Database"
   - Choose region closest to your backend deployment
   - Select "TLS Enabled" for security
   - Click "Create"

3. **Get Connection Details**
   - Copy the connection details from dashboard
   - You'll see: Host, Port, Password

4. **Configure Environment**
   ```bash
   # Add to backend/.env
   REDIS_HOST=your-redis-xxxxx.upstash.io
   REDIS_PORT=6379
   REDIS_PASSWORD=your-upstash-password
   REDIS_DB=0
   REDIS_TLS=true
   ```

5. **Update Code for TLS** (if using TLS)

   Edit `backend/src/app.module.ts` lines 128-143:
   ```typescript
   BullModule.forRootAsync({
     imports: [ConfigModule],
     useFactory: (configService: ConfigService) => ({
       redis: {
         host: configService.get('redis.host'),
         port: configService.get('redis.port'),
         password: configService.get('redis.password'),
         db: configService.get('redis.db', 0),
         tls: configService.get('redis.tls') ? {} : undefined, // ADD THIS LINE
       },
       defaultJobOptions: {
         removeOnComplete: 100,
         removeOnFail: 50,
       },
     }),
     inject: [ConfigService],
   }),
   ```

**Pricing**:
- Free tier: 10,000 commands/day, 256 MB storage
- Pay-as-you-go: $0.20 per 100K commands

---

### Option 3: Fly.io Redis (If deploying backend to Fly.io)

Fly.io offers managed Redis for apps deployed on their platform.

#### Setup Steps

1. **Create Redis Instance**
   ```bash
   flyctl redis create
   # Follow prompts to name your Redis instance
   ```

2. **Attach to Your App**
   ```bash
   flyctl redis attach --app your-backend-app
   ```

3. **Get Connection String**
   ```bash
   flyctl redis status
   ```

4. **Set as Secret**
   ```bash
   flyctl secrets set \
     REDIS_HOST="your-redis.fly.dev" \
     REDIS_PORT="6379" \
     REDIS_PASSWORD="your-password" \
     -a your-backend-app
   ```

**Pricing**:
- Starts at $1.94/month for 256 MB
- Scales with your needs

---

### Option 4: Redis Cloud (Enterprise)

For high-scale production environments.

1. Go to https://redis.com/redis-enterprise-cloud/
2. Create free account (30 MB free tier)
3. Create database
4. Copy connection credentials
5. Update environment variables

---

## Enabling Redis in SlackCRM

Once you have Redis running, enable it in your application:

### Step 1: Update Environment Variables

Add to `backend/.env`:
```bash
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password-if-needed
REDIS_DB=0
REDIS_TLS=false  # Set to true for Upstash or Redis Cloud
```

### Step 2: Uncomment Bull Module

Edit `backend/src/app.module.ts` (lines 126-143):

**BEFORE** (commented out):
```typescript
// Queue management (disabled if Redis not available)
// TODO: Enable when Redis is configured
// BullModule.forRootAsync({
//   imports: [ConfigModule],
//   useFactory: (configService: ConfigService) => ({
//     redis: {
//       host: configService.get('redis.host'),
//       port: configService.get('redis.port'),
//       password: configService.get('redis.password'),
//       db: configService.get('redis.db', 0),
//     },
//     defaultJobOptions: {
//       removeOnComplete: 100,
//       removeOnFail: 50,
//     },
//   }),
//   inject: [ConfigService],
// }),
```

**AFTER** (enabled):
```typescript
// Queue management
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    redis: {
      host: configService.get('redis.host'),
      port: configService.get('redis.port'),
      password: configService.get('redis.password'),
      db: configService.get('redis.db', 0),
      tls: configService.get('redis.tls') ? {} : undefined,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  }),
  inject: [ConfigService],
}),
```

### Step 3: Update Redis Config

Edit `backend/src/config/redis.config.ts` to add TLS support:

```typescript
export default () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true', // ADD THIS LINE
  },
});
```

### Step 4: Restart Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### Step 5: Verify Redis Connection

Check application logs for:
```
[NestFactory] Starting Nest application...
[BullModule] Redis connection established
[QueueService] Queues initialized: email, webhook, workflow
```

Or check health endpoint:
```bash
curl http://localhost:4000/api/v1/health/readiness
```

---

## Queue Configuration

SlackCRM uses these queues (configured in `backend/src/queues/queue.constants.ts`):

### 1. Email Queue
- **Purpose**: Send emails asynchronously
- **Jobs**: Welcome emails, password resets, notifications
- **Priority**: High
- **Retry**: 3 attempts

### 2. Webhook Queue
- **Purpose**: Process incoming webhooks from integrations
- **Jobs**: Typeform submissions, Slack events, Calendar updates
- **Priority**: Medium
- **Retry**: 5 attempts

### 3. Workflow Queue
- **Purpose**: Execute workflow automation actions
- **Jobs**: Create tasks, send emails, update contacts
- **Priority**: High
- **Retry**: 3 attempts

### 4. Integration Sync Queue
- **Purpose**: Sync data with external services
- **Jobs**: Google Calendar sync, Slack channel sync, Contact imports
- **Priority**: Low
- **Retry**: 3 attempts

---

## Monitoring Redis

### Using Redis CLI

```bash
# Connect to Redis
redis-cli

# Check memory usage
> INFO memory

# Check all keys
> KEYS *

# Check queue lengths
> LLEN bull:email:waiting
> LLEN bull:webhook:waiting
> LLEN bull:workflow:waiting

# Monitor real-time commands
> MONITOR

# Get stats
> INFO stats
```

### Using Bull Board (Optional)

SlackCRM can integrate Bull Board for a web UI to monitor queues.

1. Install (already included):
   ```bash
   npm install @bull-board/api @bull-board/nestjs
   ```

2. Access dashboard (if configured):
   ```
   http://localhost:4000/admin/queues
   ```

---

## Troubleshooting

### Connection Refused

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solutions**:
1. Verify Redis is running: `redis-cli ping`
2. Check Redis port: `netstat -an | grep 6379`
3. Check firewall rules
4. Verify REDIS_HOST and REDIS_PORT in .env

### Authentication Failed

**Error**: `Error: ERR AUTH <password> called without any password configured`

**Solutions**:
1. If Redis has no password, set `REDIS_PASSWORD=` (empty)
2. If Redis requires password, check Redis config: `redis-cli CONFIG GET requirepass`

### TLS/SSL Errors

**Error**: `Error: unable to get issuer certificate`

**Solutions**:
1. Set `REDIS_TLS=true` in .env
2. Update Bull config to include `tls: {}`
3. For Upstash, ensure using the TLS endpoint

### High Memory Usage

**Solutions**:
1. Set max memory limit in Redis config: `maxmemory 256mb`
2. Enable eviction policy: `maxmemory-policy allkeys-lru`
3. Reduce job retention: Set `removeOnComplete: 10` in Bull config

---

## Performance Tuning

### For Development
```bash
# Small resource footprint
REDIS_DB=0
maxmemory 64mb
maxmemory-policy allkeys-lru
```

### For Production
```bash
# Higher throughput
maxmemory 512mb
maxmemory-policy allkeys-lru
timeout 300
tcp-keepalive 60
```

### Bull Job Options
```typescript
// In backend/src/app.module.ts
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 100,  // Keep last 100 completed jobs
  removeOnFail: 50,       // Keep last 50 failed jobs
},
```

---

## Cost Comparison

| Option | Free Tier | Paid Plans | Best For |
|--------|-----------|------------|----------|
| **Local Redis** | ∞ | $0 | Development |
| **Docker Redis** | ∞ | $0 | Development |
| **Upstash** | 10K cmds/day | $0.20/100K | Production (serverless) |
| **Fly.io Redis** | None | $1.94/mo+ | Production (if using Fly.io) |
| **Redis Cloud** | 30 MB | $5/mo+ | Enterprise |

---

## Next Steps After Enabling Redis

1. **Test Workflow Automation**
   ```bash
   curl -X POST http://localhost:4000/api/v1/workflows/test
   ```

2. **Test Email Queue**
   ```bash
   curl -X POST http://localhost:4000/api/v1/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com"}'
   ```

3. **Monitor Queues**
   ```bash
   redis-cli
   > KEYS bull:*
   ```

4. **Check Logs**
   ```bash
   tail -f logs/app.log | grep "Queue"
   ```

---

## Summary

**Recommendation for SlackCRM**:
- **Development**: Local Redis (Docker or Homebrew)
- **Production**: Upstash (serverless, cost-effective, global)
- **Enterprise**: Redis Cloud or Fly.io Redis

**Time to Enable**: 10-15 minutes
**Effort**: Low (mostly configuration)
**Impact**: High (enables async workflows, improves performance)

---

**Ready to enable Redis?** Follow Option 1 or 2 above, then uncomment the Bull module in `app.module.ts` and restart your application! 🚀
