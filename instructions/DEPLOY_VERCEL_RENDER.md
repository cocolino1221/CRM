# 🚀 Complete Deployment Guide: Vercel + Render

**Deploy your SlackCRM in 30 minutes!**

**Stack:**
- 🔧 **Backend:** Render (Free tier - 750 hrs/month, always on)
- 🎨 **Frontend:** Vercel (Free tier - unlimited deployments)
- 🗄️ **Database:** Neon (Free tier - serverless PostgreSQL)

**Total Cost: $0/month** 🎉

---

## 📋 What You'll Need

- ✅ GitHub account (your code is already pushed)
- ✅ Neon account (for database)
- ✅ Render account (for backend)
- ✅ Vercel account (for frontend)
- ✅ 30 minutes of your time

**Your Stack Auth credentials (already have these):**
```
Project ID: c0256b4b-12d4-44ad-9eea-126af89d909c
Publishable Key: pck_1h7wrs1bjk6g7pw2n8gmhvz62mv6tbp9p6cwzshde3h6g
Secret Key: ssk_q3mpn2w7nwmbgd9htzte1dz36dt0b301ztpat2yj5tcg0
```

---

## 🎯 Deployment Overview

```
Step 1: Create Neon Database       (5 min)  → Get DATABASE_URL
Step 2: Deploy Backend to Render   (10 min) → Get API URL
Step 3: Run Database Migrations    (3 min)  → Setup tables
Step 4: Deploy Frontend to Vercel  (7 min)  → Get Frontend URL
Step 5: Update Environment Vars    (5 min)  → Connect everything
Step 6: Test Everything            (5 min)  → Verify it works
```

---

# 🗄️ STEP 1: Create Neon Database (5 minutes)

## 1.1 Sign Up for Neon

1. Go to: **https://console.neon.tech/signup**
2. Sign up with GitHub (easiest) or email
3. Verify your email if needed

## 1.2 Create Your Project

1. After login, click **"Create Project"**
2. Fill in:
   - **Project Name:** `SlackCRM`
   - **PostgreSQL Version:** `16` (default)
   - **Region:** Choose closest to you:
     - US East (N. Virginia) - `aws-us-east-1`
     - US West (Oregon) - `aws-us-west-2`
     - Europe (Frankfurt) - `aws-eu-central-1`
3. Click **"Create Project"**

## 1.3 Get Connection String

1. In your Neon dashboard, you'll see **"Connection Details"**
2. Under **"Connection string"**, you'll see a dropdown
3. Select **"Pooled connection"** (recommended)
4. Copy the entire connection string - it looks like:
   ```
   postgresql://username:password@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

5. **SAVE THIS STRING** - you'll need it for Render!

## 1.4 Verify Database Created

1. In Neon dashboard, click **"Tables"** in left sidebar
2. You should see an empty database (we'll add tables later)
3. ✅ Database is ready!

---

# 🔧 STEP 2: Deploy Backend to Render (10 minutes)

## 2.1 Sign Up for Render

1. Go to: **https://dashboard.render.com/register**
2. Click **"Sign up with GitHub"** (easiest)
3. Authorize Render to access your GitHub repos

## 2.2 Create New Web Service

1. In Render dashboard, click **"New +"** (top right)
2. Select **"Web Service"**
3. You'll see "Create a new Web Service"

## 2.3 Connect GitHub Repository

1. If first time:
   - Click **"Connect GitHub"**
   - Click **"Configure GitHub App"**
   - Select **"Only select repositories"**
   - Choose: `cocolino1221/CRM`
   - Click **"Install"**

2. Back in Render, you should see your `CRM` repository
3. Click **"Connect"** next to `cocolino1221/CRM`

## 2.4 Configure Service Settings

Fill in these **exact values**:

### Basic Settings:
```
Name: slackcrm-backend
Region: Oregon (US West) or closest to you
Branch: main
Root Directory: backend
Runtime: Node
```

### Build Settings:
```
Build Command:
npm install && npm run build

Start Command:
npm run start:prod
```

### Plan:
```
Instance Type: Free
```

Click **"Advanced"** to add environment variables.

## 2.5 Add Environment Variables

**IMPORTANT:** Add these environment variables one by one:

### Database Configuration:
```bash
# Click "Add Environment Variable"
Key: DATABASE_URL
Value: <paste your Neon connection string from Step 1.3>

Key: DB_SSL
Value: true

Key: DB_SYNC
Value: false

Key: DB_LOGGING
Value: false
```

### Stack Auth Configuration:
```bash
Key: NEXT_PUBLIC_STACK_PROJECT_ID
Value: c0256b4b-12d4-44ad-9eea-126af89d909c

Key: NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
Value: pck_1h7wrs1bjk6g7pw2n8gmhvz62mv6tbp9p6cwzshde3h6g

Key: STACK_SECRET_SERVER_KEY
Value: ssk_q3mpn2w7nwmbgd9htzte1dz36dt0b301ztpat2yj5tcg0
```

### JWT Secrets (GENERATE STRONG RANDOM STRINGS):

**Option A - Generate with OpenSSL (Mac/Linux):**
```bash
# In your terminal, run:
openssl rand -base64 64
# Copy the output
```

**Option B - Use Online Generator:**
Go to: https://www.random.org/strings/ and generate 64-character strings

**Add to Render:**
```bash
Key: JWT_SECRET
Value: <paste your 64-character random string>

Key: JWT_REFRESH_SECRET
Value: <paste another different 64-character random string>

Key: JWT_EXPIRES_IN
Value: 24h

Key: JWT_REFRESH_EXPIRES_IN
Value: 7d
```

### Application Configuration:
```bash
Key: NODE_ENV
Value: production

Key: PORT
Value: 10000

Key: APP_URL
Value: https://slackcrm-backend.onrender.com

Key: FRONTEND_URL
Value: https://your-app.vercel.app
```
⚠️ **Note:** We'll update `FRONTEND_URL` after deploying to Vercel in Step 4

### Optional - Email (if you have SendGrid):
```bash
Key: SENDGRID_API_KEY
Value: <your SendGrid API key>

Key: FROM_EMAIL
Value: noreply@yourdomain.com

Key: FROM_NAME
Value: SlackCRM
```

## 2.6 Deploy!

1. After adding all environment variables, click **"Create Web Service"**
2. Render will start building your app
3. You'll see logs streaming - this takes **5-10 minutes**
4. Wait for: `==> Build successful 🎉`
5. Then wait for: `==> Your service is live 🎉`

## 2.7 Get Your Backend URL

1. Once deployed, you'll see your service dashboard
2. At the top, you'll see: `https://slackcrm-backend.onrender.com`
3. **SAVE THIS URL** - you'll need it for Vercel!

## 2.8 Test Backend Health

1. Click the URL or visit: `https://slackcrm-backend.onrender.com/health/readiness`
2. You should see:
   ```json
   {
     "status": "ok",
     "timestamp": "2025-10-18T...",
     "service": "SlackCRM API",
     "version": "1.0.0",
     "environment": "production",
     "uptime": 123.456
   }
   ```
3. ✅ Backend is live!

---

# 🗃️ STEP 3: Run Database Migrations (3 minutes)

We need to create the database tables.

## 3.1 Open Render Shell

1. In your Render service dashboard
2. Click **"Shell"** tab (top navigation)
3. Wait for shell to connect (~10 seconds)
4. You'll see a terminal prompt

## 3.2 Navigate to Backend Directory

```bash
# In the Render shell, type:
cd backend
```

## 3.3 Run Migrations

```bash
# Run the migration command:
npm run migration:run
```

You should see output like:
```
query: SELECT * FROM "migrations"
query: CREATE TABLE "users" ...
query: CREATE TABLE "workspaces" ...
query: CREATE TABLE "contacts" ...
...
Migration completed successfully!
```

## 3.4 Verify Tables Created

1. Go back to your **Neon dashboard**
2. Click **"Tables"** in left sidebar
3. You should now see tables:
   - users
   - workspaces
   - contacts
   - companies
   - deals
   - tasks
   - activities
   - integrations
   - and more...

4. ✅ Database tables created!

---

# 🎨 STEP 4: Deploy Frontend to Vercel (7 minutes)

## 4.1 Sign Up for Vercel

1. Go to: **https://vercel.com/signup**
2. Click **"Continue with GitHub"**
3. Authorize Vercel

## 4.2 Import Project

1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. Find your repository: `cocolino1221/CRM`
3. Click **"Import"**

## 4.3 Configure Project Settings

### Framework Settings:
```
Framework Preset: Next.js
Root Directory: automation/saas-messaging-platform/apps/frontend
Build Command: (leave default - npm run build)
Output Directory: (leave default - .next)
Install Command: (leave default - npm install)
```

### Environment Variables:

Click **"Environment Variables"** and add these:

```bash
# Backend API URL (your Render backend from Step 2.7)
Name: NEXT_PUBLIC_API_URL
Value: https://slackcrm-backend.onrender.com

# Stack Auth Configuration
Name: NEXT_PUBLIC_STACK_PROJECT_ID
Value: c0256b4b-12d4-44ad-9eea-126af89d909c

Name: NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
Value: pck_1h7wrs1bjk6g7pw2n8gmhvz62mv6tbp9p6cwzshde3h6g

Name: NODE_ENV
Value: production
```

## 4.4 Deploy!

1. Click **"Deploy"**
2. Vercel will build your frontend (takes **3-5 minutes**)
3. You'll see build logs streaming
4. Wait for: **"✓ Production: https://your-app.vercel.app"**

## 4.5 Get Your Frontend URL

1. Once deployed, Vercel shows your URL
2. It will be something like: `https://slackcrm-xyz123.vercel.app`
3. Or you can get a custom domain later
4. **SAVE THIS URL** - we need to update Render!

## 4.6 Test Frontend

1. Visit your Vercel URL
2. You should see the SlackCRM homepage
3. ✅ Frontend is live!

---

# 🔄 STEP 5: Update Environment Variables (5 minutes)

Now we need to connect everything!

## 5.1 Update Render FRONTEND_URL

1. Go back to **Render dashboard**: https://dashboard.render.com
2. Click on your **slackcrm-backend** service
3. Click **"Environment"** tab in left sidebar
4. Find `FRONTEND_URL`
5. Click **"Edit"** (pencil icon)
6. Change value to your Vercel URL: `https://slackcrm-xyz123.vercel.app`
7. Click **"Save Changes"**

**Important:** Render will automatically redeploy (takes ~2 minutes)

## 5.2 Optional: Add Custom Domain to Vercel

If you have a domain:

1. In Vercel dashboard, go to your project
2. Click **"Settings"** → **"Domains"**
3. Enter your domain: `app.yourdomain.com`
4. Follow DNS instructions
5. Update `FRONTEND_URL` in Render to use your custom domain

## 5.3 Optional: Add Custom Domain to Render

If you have a domain:

1. In Render dashboard, go to your service
2. Click **"Settings"** in sidebar
3. Scroll to **"Custom Domain"**
4. Click **"Add Custom Domain"**
5. Enter: `api.yourdomain.com`
6. Follow DNS instructions
7. Update `NEXT_PUBLIC_API_URL` in Vercel

---

# ✅ STEP 6: Test Everything (5 minutes)

Let's make sure everything works!

## 6.1 Test Backend API

**Health Check:**
```bash
Visit: https://slackcrm-backend.onrender.com/health
```
Should return:
```json
{
  "status": "healthy",
  "database": "connected",
  ...
}
```

**API Documentation:**
```bash
Visit: https://slackcrm-backend.onrender.com/api
```
Should show Swagger UI with all endpoints

**Readiness:**
```bash
Visit: https://slackcrm-backend.onrender.com/health/readiness
```
Should return: `{"status":"ok",...}`

## 6.2 Test Frontend

**Homepage:**
```bash
Visit: https://your-app.vercel.app
```
Should load the SlackCRM landing page

**API Connection:**
```bash
# Open browser console (F12)
# Look for any CORS errors or failed API calls
# Should see successful connections to your Render backend
```

## 6.3 Test Authentication

1. Go to your frontend: `https://your-app.vercel.app`
2. Click **"Sign Up"** or **"Login"**
3. Try creating an account with Stack Auth
4. You should be able to:
   - Sign up with email/password
   - Receive verification email
   - Log in successfully
   - See the dashboard

## 6.4 Test Database Connection

1. After logging in, try creating a contact or company
2. The data should save to your Neon database
3. Refresh the page - data should persist

## 6.5 Check Logs

**Render Logs:**
1. Go to Render dashboard → Your service → **"Logs"** tab
2. Should see successful API requests
3. No errors about database connection

**Vercel Logs:**
1. Go to Vercel dashboard → Your project → **"Deployments"**
2. Click latest deployment → **"View Function Logs"**
3. Should see successful page loads

---

# 🎉 SUCCESS! Your App is Live!

**Your URLs:**
```
🌐 Frontend:  https://your-app.vercel.app
🔧 Backend:   https://slackcrm-backend.onrender.com
📚 API Docs:  https://slackcrm-backend.onrender.com/api
🗄️ Database:  Neon (managed)
🔐 Auth:      Stack Auth (managed)
```

**Features Working:**
- ✅ User authentication (Stack Auth)
- ✅ Contact management
- ✅ Company management
- ✅ Deal pipeline
- ✅ Task management
- ✅ Activity tracking
- ✅ Analytics dashboard
- ✅ Integrations framework
- ✅ Email notifications
- ✅ API documentation

---

# 🚨 Troubleshooting

## Problem: "Module not found" during Render build

**Solution:**
```bash
1. In Render dashboard → Environment
2. Check Root Directory is set to: backend
3. Build Command should be: npm install && npm run build
4. Try manual redeploy
```

## Problem: Database connection timeout

**Solution:**
```bash
1. Check DATABASE_URL has ?sslmode=require at the end
2. Verify DB_SSL=true in Render environment
3. Go to Neon dashboard and wake up your project (click on it)
4. Try redeploying Render service
```

## Problem: CORS errors on frontend

**Solution:**
```bash
1. Verify FRONTEND_URL in Render matches your Vercel URL exactly
2. No trailing slash: ✅ https://app.vercel.app  ❌ https://app.vercel.app/
3. Include https://
4. Redeploy Render after updating
```

## Problem: Frontend can't connect to backend

**Solution:**
```bash
1. Check NEXT_PUBLIC_API_URL in Vercel environment variables
2. Should be: https://slackcrm-backend.onrender.com
3. No trailing slash
4. Redeploy Vercel after updating
```

## Problem: Migrations failed

**Solution:**
```bash
# In Render Shell:
cd backend

# Try running migrations manually:
npm run migration:run

# If that fails, check database connection:
npx typeorm query "SELECT 1" -d ./src/database/data-source.ts

# Check migrations exist:
ls src/database/migrations/
```

## Problem: Render service keeps restarting

**Solution:**
```bash
1. Check Render logs for errors
2. Common issues:
   - Missing environment variables
   - Database connection failed
   - Wrong start command
3. Verify Start Command is: npm run start:prod
4. Check all required env vars are set
```

## Problem: Stack Auth not working

**Solution:**
```bash
1. Verify all 3 Stack Auth variables are set:
   - NEXT_PUBLIC_STACK_PROJECT_ID
   - NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
   - STACK_SECRET_SERVER_KEY

2. Check Stack Auth dashboard settings:
   - Add your Vercel URL to allowed origins
   - Add your Render URL to allowed origins

3. Redeploy both Render and Vercel
```

---

# 🔧 Maintenance & Updates

## Updating Your App

**For Backend Changes:**
```bash
1. Push changes to GitHub main branch
2. Render auto-deploys (if auto-deploy enabled)
3. Or click "Manual Deploy" → "Deploy latest commit"
```

**For Frontend Changes:**
```bash
1. Push changes to GitHub main branch
2. Vercel auto-deploys automatically
3. Check deployment in Vercel dashboard
```

## Adding Environment Variables

**Render:**
```bash
1. Dashboard → Your service → Environment
2. Add new variable
3. Click "Save Changes" (triggers redeploy)
```

**Vercel:**
```bash
1. Dashboard → Your project → Settings → Environment Variables
2. Add variable for Production
3. Redeploy to apply changes
```

## Monitoring

**Render:**
- Check **"Metrics"** tab for CPU/Memory usage
- Check **"Logs"** tab for errors
- Set up **"Events"** for notifications

**Vercel:**
- Check **"Analytics"** for traffic
- Check **"Speed Insights"** for performance
- Check **"Deployments"** for build status

**Neon:**
- Check **"Monitoring"** for database stats
- Check **"Queries"** for slow queries
- Set up **"Alerts"** for issues

---

# 💰 Cost & Limits

## Free Tier Limits

**Render Free:**
- ✅ 750 hours/month (enough for always-on)
- ✅ 512MB RAM
- ✅ Shared CPU
- ⚠️ Slower cold starts (15-30s after inactivity)
- ✅ Free SSL

**Vercel Free:**
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ 6000 build minutes/month
- ✅ Free SSL
- ✅ Custom domains

**Neon Free:**
- ✅ 0.5GB storage
- ✅ 1 project
- ✅ Shared compute
- ⚠️ Auto-pauses after inactivity
- ✅ 7-day backups

## Upgrading Later

**When to upgrade:**
- More than 100 users
- Need faster performance
- Need more storage
- Want better support

**Upgrade costs:**
- Render Starter: $7/month (512MB RAM, faster)
- Vercel Pro: $20/month (unlimited bandwidth)
- Neon Launch: $19/month (3GB storage)

---

# 📊 What You've Deployed

**Application Features:**
- ✅ Full authentication with Stack Auth
- ✅ User management (6 role types)
- ✅ Contact & company CRM
- ✅ Deal pipeline with analytics
- ✅ Task management
- ✅ Activity tracking
- ✅ 9 integration handlers (Slack, Google, Typeform, etc.)
- ✅ Email notifications
- ✅ Analytics dashboard
- ✅ Health monitoring
- ✅ API documentation (Swagger)

**Tech Stack:**
- ✅ NestJS backend (TypeScript)
- ✅ Next.js 15 frontend (React 19)
- ✅ PostgreSQL 16 (Neon)
- ✅ TypeORM for database
- ✅ JWT + Stack Auth
- ✅ Joi validation
- ✅ Swagger API docs

**Completion: 87-90%** 🎯

---

# 🎯 Next Steps

## 1. Configure Integrations

**Slack:**
```bash
1. Create Slack app: https://api.slack.com/apps
2. Add credentials to Render environment
3. Test in your app
```

**SendGrid (Email):**
```bash
1. Sign up: https://sendgrid.com/
2. Get API key (100 emails/day free)
3. Add to Render: SENDGRID_API_KEY
```

**Typeform:**
```bash
1. Get API key from Typeform
2. Add to Render: TYPEFORM_API_KEY
3. Set up webhooks
```

## 2. Set Up Custom Domain

**For Frontend:**
```bash
1. Buy domain (Namecheap, GoDaddy, etc.)
2. In Vercel: Settings → Domains
3. Add: app.yourdomain.com
4. Update DNS with Vercel records
```

**For Backend:**
```bash
1. In Render: Settings → Custom Domain
2. Add: api.yourdomain.com
3. Update DNS with Render records
4. Update NEXT_PUBLIC_API_URL in Vercel
```

## 3. Monitor Your App

**Set up monitoring:**
```bash
1. UptimeRobot (free): Monitor uptime
   - Add: https://slackcrm-backend.onrender.com/health/liveness
   - Check every 5 minutes

2. Sentry (optional): Error tracking
   - Sign up and integrate

3. Google Analytics: Track usage
   - Add to frontend
```

## 4. Backup Strategy

**Database:**
```bash
1. Neon has automatic backups (7 days on free tier)
2. Set up weekly manual exports
3. Store in GitHub or Google Drive
```

## 5. Documentation

**Update for your team:**
```bash
1. Add your URLs to README.md
2. Document any custom configurations
3. Create user guides if needed
```

---

# 🆘 Getting Help

**Documentation:**
- 📖 Render Docs: https://render.com/docs
- 📖 Vercel Docs: https://vercel.com/docs
- 📖 Neon Docs: https://neon.tech/docs
- 📖 Stack Auth: https://docs.stack-auth.com

**Community Support:**
- 💬 Render Community: https://community.render.com/
- 💬 Vercel Discord: https://vercel.com/discord
- 💬 Neon Discord: https://discord.gg/neon

**Your Project:**
- 🐛 GitHub Issues: https://github.com/cocolino1221/CRM/issues
- 📧 Stack Auth Support: support@stack-auth.com

---

# ✅ Deployment Checklist

Use this to verify everything:

**Pre-Deployment:**
- [ ] GitHub repo pushed
- [ ] Stack Auth credentials ready
- [ ] Accounts created (Neon, Render, Vercel)

**Neon Database:**
- [ ] Project created
- [ ] Connection string copied
- [ ] Tables visible in dashboard

**Render Backend:**
- [ ] Service created and deployed
- [ ] All environment variables set
- [ ] Health endpoint returns OK
- [ ] API docs accessible
- [ ] Migrations ran successfully

**Vercel Frontend:**
- [ ] Project imported and deployed
- [ ] Environment variables set
- [ ] Site loads correctly
- [ ] No console errors

**Integration:**
- [ ] FRONTEND_URL updated in Render
- [ ] NEXT_PUBLIC_API_URL correct in Vercel
- [ ] CORS working (no errors)
- [ ] Authentication working
- [ ] Database CRUD operations working

**Optional:**
- [ ] Custom domains configured
- [ ] SendGrid email configured
- [ ] Monitoring set up
- [ ] Integrations configured

---

**🎉 Congratulations! Your SlackCRM is live in production!**

**Total deployment time:** ~30 minutes
**Total cost:** $0/month

Enjoy your production CRM! 🚀
