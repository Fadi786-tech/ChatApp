# Manual Vercel Deployment Guide

This guide covers manually deploying the frontend and backend separately on Vercel using the web interface.

## Prerequisites

1. Create a [Vercel account](https://vercel.com) if you don't have one
2. Have your code in a Git repository (GitHub, GitLab, or Bitbucket)
3. Ensure you have a MongoDB database (MongoDB Atlas recommended)

## Step 1: Deploy Backend First

### 1.1 Create New Project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"New Project"**
3. Import your Git repository
4. **Important**: Select only the `backend` folder for deployment
   - Click **"Configure Project"**
   - Set **Root Directory** to `backend`

### 1.2 Configure Backend Settings

1. **Framework Preset**: Select "Other" or leave as detected
2. **Build Command**: Leave empty (not needed for Node.js)
3. **Output Directory**: Leave empty
4. **Install Command**: `npm install`

### 1.3 Set Environment Variables

Before deploying, add these environment variables:

1. Click **"Environment Variables"** section
2. Add the following variables:

```
MONGO_URI = mongodb+srv://username:password@cluster.mongodb.net/database
JWT_SECRET = your-super-secret-jwt-key-here
JWT_EXPIRES_IN = 7d
NODE_ENV = production
```

**Important**: Replace the MongoDB URI with your actual connection string

### 1.4 Deploy Backend

1. Click **"Deploy"**
2. Wait for deployment to complete
3. **Copy the deployment URL** (e.g., `https://your-backend-abc123.vercel.app`)
4. Test the backend by visiting: `https://your-backend-abc123.vercel.app/api/auth/login`

## Step 2: Deploy Frontend

### 2.1 Create Another New Project

1. Go back to Vercel dashboard
2. Click **"New Project"** again
3. Import the same Git repository
4. **Important**: Select only the `frontend` folder for deployment
   - Click **"Configure Project"**
   - Set **Root Directory** to `frontend`

### 2.2 Configure Frontend Settings

1. **Framework Preset**: Should auto-detect as "Vite"
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`
4. **Install Command**: `npm install`

### 2.3 Set Frontend Environment Variables

Add these environment variables using your backend URL from Step 1:

```
VITE_API_URL = https://your-backend-abc123.vercel.app/api
VITE_WS_URL = wss://your-backend-abc123.vercel.app
```

**Replace** `your-backend-abc123.vercel.app` with your actual backend domain

### 2.4 Deploy Frontend

1. Click **"Deploy"**
2. Wait for deployment to complete
3. **Copy the frontend URL** (e.g., `https://your-frontend-xyz789.vercel.app`)

## Step 3: Update CORS Configuration

### 3.1 Update Backend CORS

1. Go to your backend project in Vercel dashboard
2. Go to **Settings** → **Environment Variables**
3. The CORS is already configured in your code, but you need to update it:

**Option A: Add Frontend URL as Environment Variable**
Add this environment variable to your backend:
```
FRONTEND_URL = https://your-frontend-xyz789.vercel.app
```

Then update your backend code to use it, or...

**Option B: Directly update the code**
Update the CORS configuration in `backend/server.js`:

```javascript
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-frontend-xyz789.vercel.app'] // Replace with your actual frontend URL
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));
```

### 3.2 Redeploy Backend

1. After updating CORS, go to your backend project
2. Go to **Deployments** tab
3. Click **"Redeploy"** on the latest deployment

## Step 4: Test Your Application

1. Visit your frontend URL
2. Try to log in with any email/password (it will create an account automatically)
3. Test chat functionality
4. Test video calling features

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure frontend URL is added to CORS configuration
   - Check browser console for specific CORS errors

2. **API Connection Failed**
   - Verify `VITE_API_URL` environment variable is correct
   - Check if backend is responding at `/api` endpoint

3. **WebSocket Connection Failed**
   - Verify `VITE_WS_URL` uses `wss://` (not `ws://`)
   - Check if backend supports WebSocket connections

4. **MongoDB Connection Issues**
   - Verify MongoDB URI is correct
   - Ensure MongoDB Atlas allows connections from anywhere (0.0.0.0/0)

### Checking Logs

1. Go to your project in Vercel dashboard
2. Click **"Functions"** tab to see serverless function logs
3. Click **"View Function Details"** for detailed logs

## Environment Variables Summary

### Backend Environment Variables:
```
MONGO_URI = mongodb+srv://username:password@cluster.mongodb.net/database
JWT_SECRET = your-super-secret-jwt-key-here
JWT_EXPIRES_IN = 7d
NODE_ENV = production
```

### Frontend Environment Variables:
```
VITE_API_URL = https://your-backend-domain.vercel.app/api
VITE_WS_URL = wss://your-backend-domain.vercel.app
```

## Final URLs

After successful deployment, you'll have:
- **Backend**: `https://your-backend-domain.vercel.app`
- **Frontend**: `https://your-frontend-domain.vercel.app`

Your chat application should now be fully functional on Vercel!