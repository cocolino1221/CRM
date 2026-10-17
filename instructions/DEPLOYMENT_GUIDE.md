# 🚀 Deployment Guide - Render + Vercel (FREE)

This guide will help you deploy SlackCRM to production using:
- **Render** (Backend) - FREE tier, no sleep
- **Vercel** (Frontend) - FREE tier
- **Neon** (Database) - FREE tier

Total cost: **$0/month** 🎉

---

## 📋 Prerequisites

1. **GitHub account** with your code pushed
2. **Neon account** - https://console.neon.tech/signup
3. **Render account** - https://dashboard.render.com/register
4. **Vercel account** - https://vercel.com/signup
5. **Stack Auth credentials** (you already have these)

---

## 🗄️ Step 1: Set Up Neon Database (5 minutes)

### 1.1 Create Neon Project
```bash
1. Go to https://console.neon.tech/
2. Click "Create Project"
3. Name: "SlackCRM"
4. Region: Choose closest to you (e.g., US East)
5. PostgreSQL version: 16
6. Click "Create Project"
```

### 1.2 Get Connection String
```bash
1. In your Neon dashboard, click "Connection Details"
2. Copy the "Connection string" (should look like):
   postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

3. Save this - you'll need it for Render!
```

### 1.3 Create Database Tables
```bash
# We'll run migrations after deploying to Render
# For now, just have your connection string ready
```

---

## 🔧 Step 2: Deploy Backend to Render (10 minutes)

### 2.1 Connect GitHub
```bash
1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select repository: "cocolino1221/CRM"
5. Click "Connect"
```

### 2.2 Configure Service
```
Name: slackcrm-backend
Region: Oregon (or closest to you)
Branch: main
Root Directory: backend
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run start:prod
Plan: Free
```

### 2.3 Set Environment Variables

Click "Advanced" and add these environment variables:

**Required - Database:**
```bash
DATABASE_URL=<paste-your-neon-connection-string>
DB_SSL=true
DB_SYNC=false
DB_LOGGING=false
```

**Required - Stack Auth:**
```bash
NEXT_PUBLIC_STACK_PROJECT_ID=c0256b4b-12d4-44ad-9eea-126af89d909c
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=pck_1h7wrs1bjk6g7pw2n8gmhvz62mv6tbp9p6cwzshde3h6g
STACK_SECRET_SERVER_KEY=ssk_q3mpn2w7nwmbgd9htzte1dz36dt0b301ztpat2yj5tcg0
```

**Required - JWT (use strong random values):**
```bash
JWT_SECRET=<generate-64-character-random-string>
JWT_REFRESH_SECRET=<generate-64-character-random-string>
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

**Required - App Config:**
```bash
NODE_ENV=production
PORT=10000
APP_URL=https://slackcrm-backend.onrender.com
FRONTEND_URL=https://your-app.vercel.app
```

**Optional - Email (if you have SendGrid):**
```bash
SENDGRID_API_KEY=<your-sendgrid-key>
FROM_EMAIL=noreply@yourdomain.com
```

### 2.4 Deploy
```bash
1. Click "Create Web Service"
2. Wait 5-10 minutes for deployment
3. Your backend will be at: https://slackcrm-backend.onrender.com
```

### 2.5 Run Database Migrations
```bash
1. In Render dashboard, go to your service
2. Click "Shell" tab
3. Run: npm run migration:run
4. Verify migrations completed successfully
```

### 2.6 Test Backend
```bash
# Visit these URLs to verify:
https://slackcrm-backend.onrender.com/health/readiness
# Should return: {"status":"ok","timestamp":"..."}

https://slackcrm-backend.onrender.com/api
# Should show Swagger documentation
```

---

## 🎨 Step 3: Deploy Frontend to Vercel (5 minutes)

### 3.1 Connect GitHub
```bash
1. Go to https://vercel.com/new
2. Import your GitHub repository: "cocolino1221/CRM"
3. Click "Import"
```

### 3.2 Configure Project
```
Framework Preset: Next.js
Root Directory: automation/saas-messaging-platform/apps/frontend
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

### 3.3 Set Environment Variables
```bash
# Backend API URL (your Render backend)
NEXT_PUBLIC_API_URL=https://slackcrm-backend.onrender.com

# Stack Auth (same as backend)
NEXT_PUBLIC_STACK_PROJECT_ID=c0256b4b-12d4-44ad-9eea-126af89d909c
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=pck_1h7wrs1bjk6g7pw2n8gmhvz62mv6tbp9p6cwzshde3h6g
```

### 3.4 Deploy
```bash
1. Click "Deploy"
2. Wait 3-5 minutes
3. Your frontend will be at: https://your-app.vercel.app
```

### 3.5 Update Backend FRONTEND_URL
```bash
1. Go back to Render dashboard
2. Update FRONTEND_URL environment variable:
   FRONTEND_URL=https://your-app.vercel.app
3. Redeploy backend (click "Manual Deploy" → "Deploy latest commit")
```

---

## ✅ Step 4: Verify Everything Works

### 4.1 Health Checks
```bash
# Backend health
https://slackcrm-backend.onrender.com/health

# Backend API docs
https://slackcrm-backend.onrender.com/api

# Frontend
https://your-app.vercel.app
```

### 4.2 Test Authentication
```bash
1. Go to your frontend: https://your-app.vercel.app
2. Click "Sign Up"
3. Create an account with Stack Auth
4. Verify you can log in
```

### 4.3 Test API Endpoints
```bash
# Using curl or Postman:
curl https://slackcrm-backend.onrender.com/health/metrics

# Should return system metrics
```

---

## 🔒 Security Checklist

- ✅ DATABASE_URL contains `sslmode=require`
- ✅ DB_SSL=true is set
- ✅ JWT_SECRET is 64+ characters
- ✅ JWT_REFRESH_SECRET is 64+ characters
- ✅ NODE_ENV=production
- ✅ DB_SYNC=false (never use in production!)
- ✅ All sensitive keys in environment variables (not in code)

---

## 📊 What You Get (FREE Tier)

**Render Free Tier:**
- ✅ 750 hours/month (enough for 1 app always on)
- ✅ 512MB RAM
- ✅ No sleep (unlike Railway/Heroku free tier)
- ❌ Slower cold starts (15-30 seconds if inactive)
- ✅ Auto SSL certificate
- ✅ Custom domain support

**Vercel Free Tier:**
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Auto SSL
- ✅ Edge network (fast globally)
- ✅ Custom domain support

**Neon Free Tier:**
- ✅ 0.5GB storage
- ✅ 1 project
- ✅ Serverless Postgres
- ✅ Auto-pause when inactive
- ✅ Always-available compute

**Total: $0/month** 🎉

---

## 🚨 Common Issues & Solutions

### Issue: "Module not found" during build
**Solution:**
```bash
# In Render, set Build Command to:
cd backend && npm install && npm run build
```

### Issue: Database connection timeout
**Solution:**
```bash
# Check your DATABASE_URL has ?sslmode=require at the end
# Verify DB_SSL=true is set
# Check Neon project is not paused (visit Neon dashboard)
```

### Issue: CORS errors from frontend
**Solution:**
```bash
# Make sure FRONTEND_URL in backend matches your Vercel URL exactly
# Include https:// and no trailing slash
```

### Issue: Migrations fail
**Solution:**
```bash
# Run migrations manually in Render shell:
cd backend
npm run migration:run

# If that fails, run:
npm run typeorm migration:run -- -d ./src/database/data-source.ts
```

### Issue: Backend cold starts are slow
**Solution:**
```bash
# Render free tier spins down after inactivity
# Use a service like UptimeRobot (free) to ping your health endpoint every 5 minutes:
https://slackcrm-backend.onrender.com/health/liveness
```

---

## 🔄 Making Updates

### Update Backend:
```bash
1. Push changes to GitHub main branch
2. Render auto-deploys (if enabled)
3. Or click "Manual Deploy" in Render dashboard
```

### Update Frontend:
```bash
1. Push changes to GitHub main branch
2. Vercel auto-deploys automatically
3. Visit Vercel dashboard to see deployment
```

---

## 📈 Upgrading Later

If you need more resources, here are upgrade paths:

**Render:**
- Starter: $7/month (faster, no sleep)
- Standard: $25/month (2GB RAM, better performance)

**Vercel:**
- Pro: $20/month (unlimited bandwidth, better analytics)

**Neon:**
- Launch: $19/month (3GB storage, better compute)
- Scale: $69/month (15GB storage, high availability)

---

## 🆘 Need Help?

**Documentation:**
- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Neon Docs: https://neon.tech/docs

**Support:**
- Render Community: https://community.render.com/
- Vercel Discord: https://vercel.com/discord
- Neon Discord: https://discord.gg/neon

**Your Application:**
- GitHub Issues: https://github.com/cocolino1221/CRM/issues
- README: Your repo's README.md

---

## 🎯 Next Steps After Deployment

1. **Set up custom domain** (optional)
   - Add CNAME in your DNS
   - Configure in Render/Vercel settings

2. **Enable monitoring**
   - Set up UptimeRobot for health checks
   - Monitor Render logs for errors
   - Check Vercel analytics

3. **Configure email**
   - Sign up for SendGrid (free tier: 100 emails/day)
   - Add SENDGRID_API_KEY to Render

4. **Add integrations**
   - Configure Slack app
   - Set up Typeform webhooks
   - Add other integration credentials

5. **Backup database**
   - Neon has automatic backups (7 days retention on free tier)
   - Export data periodically for safety

---

**Congratulations! Your SlackCRM is now live in production! 🎉**

Backend: https://slackcrm-backend.onrender.com
Frontend: https://your-app.vercel.app
Database: Neon (serverless PostgreSQL)
