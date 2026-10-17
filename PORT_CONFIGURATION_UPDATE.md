# Port Configuration Update

## Changes Made

All ports have been updated from 3000/3001 to 4000/4001 to avoid conflicts with other processes.

### Backend Port: 3000 → 4000

**Files Updated:**
1. `backend/src/main.ts`
   - Default port changed from 3000 to 4000
   - CORS origins updated to allow `localhost:4000` and `localhost:4001`

2. `backend/.env`
   - `PORT=4000`
   - `FRONTEND_URL=http://localhost:4001`

3. `backend/.env.example`
   - `PORT=4000`
   - `FRONTEND_URL=http://localhost:4001`
   - `APP_URL=http://localhost:4000`
   - All OAuth redirect URIs updated to `http://localhost:4000/api/v1/integrations/oauth/callback`

### Frontend Port: 3001 → 4001

**Files Updated:**
1. `frontend/package.json`
   - Dev script: `next dev -p 4001`
   - Start script: `next start -p 4001`

2. `frontend/.env.local`
   - `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` (already correct)

3. `frontend/lib/api.ts`
   - Default API URL fallback changed to `http://localhost:4000/api/v1`

## How to Start the Application

### Option 1: Start Both (Recommended)
```bash
npm run dev
```
This starts:
- Backend on http://localhost:4000
- Frontend on http://localhost:4001

### Option 2: Start Individually

**Backend:**
```bash
cd backend
npm run start:dev
```
Backend will run on: http://localhost:4000
API docs available at: http://localhost:4000/api/docs

**Frontend:**
```bash
cd frontend
npm run dev
```
Frontend will run on: http://localhost:4001

## API Endpoints

All API endpoints are now accessible at:
```
http://localhost:4000/api/v1/
```

Examples:
- Auth: `http://localhost:4000/api/v1/auth/login`
- Contacts: `http://localhost:4000/api/v1/contacts`
- Deals: `http://localhost:4000/api/v1/deals`
- AI: `http://localhost:4000/api/v1/ai/`
- Workflows: `http://localhost:4000/api/v1/workflows/`

## Swagger Documentation

Access the interactive API documentation at:
```
http://localhost:4000/api/docs
```

## CORS Configuration

The backend now accepts requests from:
- `http://localhost:4000` (backend itself)
- `http://localhost:4001` (frontend)
- Production frontend URL (when `FRONTEND_URL` is set)

## OAuth Integration Redirect URIs

If you're using OAuth integrations (Google, Slack, etc.), update your OAuth app configurations:

**Old Redirect URI:**
```
http://localhost:3000/integrations/oauth/callback
```

**New Redirect URI:**
```
http://localhost:4000/api/v1/integrations/oauth/callback
```

### Services to Update:
1. **Google Cloud Console** (for Google OAuth)
   - Go to: https://console.cloud.google.com/apis/credentials
   - Update authorized redirect URIs

2. **Slack App Settings** (for Slack OAuth)
   - Go to: https://api.slack.com/apps
   - Update OAuth redirect URLs

3. **Other OAuth Providers**
   - Update redirect URIs in their respective developer consoles

## Environment Variables Summary

### Backend (.env)
```bash
PORT=4000
FRONTEND_URL=http://localhost:4001
APP_URL=http://localhost:4000

# OAuth Redirect URIs (examples)
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/integrations/oauth/callback
OAUTH_SLACK_REDIRECT_URI=http://localhost:4000/api/v1/integrations/oauth/callback
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Troubleshooting

### Port Already in Use
If you see "port already in use" errors:

**Check what's running on the port:**
```bash
# Mac/Linux
lsof -i :4000
lsof -i :4001

# Windows
netstat -ano | findstr :4000
netstat -ano | findstr :4001
```

**Kill the process:**
```bash
# Mac/Linux
kill -9 <PID>

# Windows
taskkill /PID <PID> /F
```

### CORS Errors
If you see CORS errors in the browser console:
1. Verify frontend is running on port 4001
2. Verify backend is running on port 4000
3. Check that `FRONTEND_URL` in backend `.env` is set to `http://localhost:4001`
4. Clear browser cache and restart both services

### API Connection Errors
If frontend can't connect to backend:
1. Verify `NEXT_PUBLIC_API_URL` in frontend `.env.local` is set to `http://localhost:4000/api/v1`
2. Make sure backend is running: `curl http://localhost:4000/api/v1/health`
3. Check browser console for specific error messages

## Production Deployment

For production, update your environment variables:

**Backend:**
```bash
PORT=4000  # Or your production port
FRONTEND_URL=https://your-frontend-domain.com
APP_URL=https://your-backend-domain.com
```

**Frontend:**
```bash
NEXT_PUBLIC_API_URL=https://your-backend-domain.com/api/v1
```

## Testing the Configuration

1. **Start the services:**
   ```bash
   npm run dev
   ```

2. **Test backend:**
   ```bash
   curl http://localhost:4000/api/v1/health
   ```
   Should return: `{"status":"ok"}`

3. **Test frontend:**
   Open browser to: http://localhost:4001

4. **Test API communication:**
   - Open http://localhost:4001
   - Login or register
   - Verify data loads correctly

## Quick Reference

| Service | Old Port | New Port | URL |
|---------|----------|----------|-----|
| Backend API | 3000 | 4000 | http://localhost:4000/api/v1 |
| Frontend | 3001 | 4001 | http://localhost:4001 |
| API Docs | 3000 | 4000 | http://localhost:4000/api/docs |

## Notes

- All port changes are backward compatible if you update your environment variables
- The changes only affect local development by default
- Production ports can be configured via environment variables
- No database migrations or schema changes were required
- All existing data and functionality remain unchanged
