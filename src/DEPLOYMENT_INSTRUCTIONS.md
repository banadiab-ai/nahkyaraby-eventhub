# Edge Function Deployment Instructions

## Current Situation
You're getting 404 errors because the Edge Function is not properly deployed to your Supabase project.

## What You Need to Deploy

The Edge Function code is located at:
- `/supabase/functions/server/index.tsx`
- `/supabase/functions/server/kv_store.tsx`

## Deployment Steps

### Option 1: Deploy via Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project**:
   ```bash
   supabase link --project-ref ojeewoebsidiiufvfwco
   ```

4. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy server
   ```

### Option 2: Deploy via Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/functions

2. Click **"Create a new function"** or find the existing `server` function

3. Copy the content from `/supabase/functions/server/index.tsx` and paste it into the editor

4. Also create/update the `kv_store.tsx` file with content from `/supabase/functions/server/kv_store.tsx`

5. Click **Deploy**

## Verify Deployment

After deployment, test the function:

```bash
curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/make-server-08658f87/health
```

You should get: `{"status":"ok"}`

## Important Notes

- The function name is `server` (not `make-server-08658f87`)
- The routes inside the function have the prefix `/make-server-08658f87/`
- So the full URL is: `https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/make-server-08658f87/health`

## After Deployment

Once deployed, your app should work immediately. Just reload the page.
