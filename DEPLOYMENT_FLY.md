# 🚀 Deploy to Fly.io (FREE - Always On)

**Why Fly.io:**
- ✅ Free tier with 3 VMs (256MB RAM each)
- ✅ No sleep - always on
- ✅ Faster than Render
- ✅ Global deployment
- ✅ Free PostgreSQL (3GB)
- ✅ Better performance

**Total Cost: $0/month**

---

## 📋 Prerequisites

1. **Fly.io account** - https://fly.io/app/sign-up
2. **flyctl CLI** installed
3. **Neon database** (or use Fly.io's free Postgres)

---

## 🛠️ Step 1: Install Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Verify installation
flyctl version
```

---

## 🔐 Step 2: Login to Fly.io

```bash
flyctl auth login
# Opens browser for authentication
```

---

## 🗄️ Step 3: Set Up Database

**Option A: Use Fly.io's Free PostgreSQL**
```bash
# Create Postgres cluster (FREE - 3GB storage)
flyctl postgres create --name slackcrm-db --region iad

# Get connection string
flyctl postgres connect -a slackcrm-db
# Copy the connection string shown
```

**Option B: Use Neon (Recommended)**
```bash
# Just get your Neon connection string
# We'll set it as a secret later
```

---

## 🚀 Step 4: Deploy Backend

### 4.1 Navigate to Backend Directory
```bash
cd /Users/constantinpristavita/CRM/backend
```

### 4.2 Launch App
```bash
# This creates the app and fly.toml config
flyctl launch

# Answer the prompts:
# App name: slackcrm-backend
# Region: Choose closest (e.g., iad for US East)
# PostgreSQL: No (we're using Neon or created separately)
# Redis: No (optional for now)
# Deploy now: No (we need to set secrets first)
```

### 4.3 Set Environment Variables (Secrets)
```bash
# Database
flyctl secrets set DATABASE_URL="postgresql://user:pass@host.neon.tech/db?sslmode=require"
flyctl secrets set DB_SSL=true
flyctl secrets set DB_SYNC=false

# Stack Auth
flyctl secrets set NEXT_PUBLIC_STACK_PROJECT_ID="c0256b4b-12d4-44ad-9eea-126af89d909c"
flyctl secrets set NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY="pck_1h7wrs1bjk6g7pw2n8gmhvz62mv6tbp9p6cwzshde3h6g"
flyctl secrets set STACK_SECRET_SERVER_KEY="ssk_q3mpn2w7nwmbgd9htzte1dz36dt0b301ztpat2yj5tcg0"

# JWT Secrets (generate strong random strings)
flyctl secrets set JWT_SECRET="$(openssl rand -base64 64)"
flyctl secrets set JWT_REFRESH_SECRET="$(openssl rand -base64 64)"

# App URLs (update after first deployment)
flyctl secrets set APP_URL="https://slackcrm-backend.fly.dev"
flyctl secrets set FRONTEND_URL="https://your-app.vercel.app"

# Optional: Email
flyctl secrets set SENDGRID_API_KEY="your-sendgrid-key"
flyctl secrets set FROM_EMAIL="noreply@yourdomain.com"
```

### 4.4 Deploy
```bash
# Deploy from backend directory
flyctl deploy

# Or specify Dockerfile path from root
cd ..
flyctl deploy --config backend/fly.toml --dockerfile backend/Dockerfile
```

### 4.5 Run Migrations
```bash
# SSH into the app
flyctl ssh console -a slackcrm-backend

# Once inside, run migrations
cd backend
npm run migration:run

# Exit
exit
```

### 4.6 Verify Deployment
```bash
# Check status
flyctl status

# View logs
flyctl logs

# Open in browser
flyctl open
# Or visit: https://slackcrm-backend.fly.dev/health
```

---

## 🎨 Step 5: Deploy Frontend to Vercel

```bash
# Same as before - Vercel is perfect for Next.js
# See DEPLOYMENT_GUIDE.md for Vercel instructions
```

---

## 📊 Fly.io Free Tier Limits

**What you get:**
- ✅ **3 shared-cpu VMs** (256MB RAM each)
- ✅ **3GB PostgreSQL storage** (if using Fly Postgres)
- ✅ **160GB outbound data transfer**
- ✅ **No sleep** - always running
- ✅ **Auto SSL certificates**
- ✅ **Global Anycast network**

**Limits:**
- Max 3 VMs on free tier
- 256MB RAM per VM (sufficient for NestJS)
- Shared CPU (performance may vary)

---

## 🔧 Useful Commands

```bash
# View app status
flyctl status -a slackcrm-backend

# View logs (real-time)
flyctl logs -a slackcrm-backend

# SSH into app
flyctl ssh console -a slackcrm-backend

# Scale up (if needed later)
flyctl scale count 2 # Run 2 instances
flyctl scale memory 512 # Use 512MB RAM

# View secrets
flyctl secrets list -a slackcrm-backend

# Update a secret
flyctl secrets set KEY=VALUE -a slackcrm-backend

# Restart app
flyctl apps restart slackcrm-backend

# Open app in browser
flyctl open -a slackcrm-backend

# Check health
curl https://slackcrm-backend.fly.dev/health/readiness
```

---

## 🚨 Troubleshooting

### Build fails
```bash
# Check Dockerfile is in backend/
ls -la backend/Dockerfile

# Try deploying with explicit paths
flyctl deploy --config fly.toml --dockerfile backend/Dockerfile
```

### App not starting
```bash
# Check logs
flyctl logs -a slackcrm-backend

# Verify environment variables
flyctl secrets list -a slackcrm-backend

# Check health endpoint
curl https://slackcrm-backend.fly.dev/health/liveness
```

### Database connection issues
```bash
# Verify DATABASE_URL is set
flyctl secrets list -a slackcrm-backend

# Test connection from app
flyctl ssh console -a slackcrm-backend
# Then inside: curl $DATABASE_URL
```

### Out of memory
```bash
# Free tier has 256MB - might need optimization
# Check memory usage in logs
flyctl logs -a slackcrm-backend | grep "memory"

# Upgrade to 512MB (costs ~$2/month)
flyctl scale memory 512 -a slackcrm-backend
```

---

## 💰 Cost Comparison

| Resource | Free Tier | Paid Tier |
|----------|-----------|-----------|
| VMs | 3 x 256MB | $1.94/VM/month |
| RAM | 256MB | 512MB: +$2.38/month |
| PostgreSQL | 3GB | 10GB: $5/month |
| Bandwidth | 160GB | 100GB/month included |

**Estimated cost for always-on app:**
- Free: $0/month (3 VMs with 256MB)
- Hobby: ~$5/month (1 VM with 512MB + DB)

---

## 🎯 Why Fly.io vs Render?

| Feature | Fly.io Free | Render Free |
|---------|-------------|-------------|
| **Uptime** | Always on | Always on |
| **RAM** | 256MB x 3 | 512MB x 1 |
| **Cold start** | ~5s | ~15-30s |
| **Global** | ✅ Multi-region | ❌ Single region |
| **PostgreSQL** | ✅ 3GB free | ❌ Extra cost |
| **Performance** | ⚡ Faster | 🐌 Slower |
| **Scaling** | 3 VMs | 1 service |

**Winner: Fly.io for performance, Render for simplicity**

---

## 📈 Next Steps

1. **Monitor your app**
   - Set up Fly.io metrics dashboard
   - Use `flyctl logs` to debug

2. **Add custom domain**
   ```bash
   flyctl certs add yourdomain.com -a slackcrm-backend
   ```

3. **Enable auto-scaling**
   ```bash
   # Scale based on load (paid feature)
   flyctl autoscale set min=1 max=3 -a slackcrm-backend
   ```

4. **Set up CI/CD**
   - Add Fly.io deploy to GitHub Actions
   - Auto-deploy on push to main

---

## 🔗 Resources

- **Fly.io Docs:** https://fly.io/docs/
- **Fly.io Status:** https://status.fly.io/
- **Community:** https://community.fly.io/
- **Pricing:** https://fly.io/docs/about/pricing/

---

**Your SlackCRM is now on Fly.io!** 🚀

- **Backend:** https://slackcrm-backend.fly.dev
- **API Docs:** https://slackcrm-backend.fly.dev/api
- **Health:** https://slackcrm-backend.fly.dev/health
