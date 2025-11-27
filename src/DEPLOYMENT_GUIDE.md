# Nahky Araby Event Hub - Deployment Guide

## 🚀 Deploying the Edge Function to Supabase

Your Edge Function code is ready but needs to be deployed to your Supabase project. Follow these steps:

### Prerequisites

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```
   This will open a browser window for authentication.

### Deployment Steps

#### Step 1: Link Your Project

Link your local project to your Supabase project:

```bash
supabase link --project-ref ojeewoebsidiiufvfwco
```

When prompted, enter your database password.

#### Step 2: Deploy the Edge Function

Deploy the `server` function:

```bash
supabase functions deploy server
```

This command will:
- Bundle your Edge Function code
- Upload it to Supabase
- Make it available at: `https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server`

#### Step 3: Set Environment Variables

Your Edge Function needs these environment variables set in Supabase:

```bash
# Set Resend API Key (for email functionality)
supabase secrets set RESEND_API_KEY=your_resend_api_key_here
```

**Important Environment Variables:**
- `SUPABASE_URL` - Auto-set by Supabase
- `SUPABASE_ANON_KEY` - Auto-set by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-set by Supabase
- `RESEND_API_KEY` - **You need to set this manually** (get it from [resend.com](https://resend.com))

#### Step 4: Verify Deployment

After deployment, test your endpoints:

1. **Health Check**:
   ```bash
   curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/health
   ```
   Should return: `{"status":"ok"}`

2. **Status Check**:
   ```bash
   curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/status
   ```

3. **Use the Connection Diagnostic Tool** in your app (Admin Settings page)

### Troubleshooting

#### Error: "Function not found" or 404

- **Solution**: Make sure you deployed with the correct function name:
  ```bash
  supabase functions deploy server
  ```
  NOT `make-server-08658f87` (that's the old function name)

#### Error: "RESEND_API_KEY not configured"

- **Solution**: Set the Resend API key:
  ```bash
  supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
  ```

#### Error: "Unauthorized" or Auth issues

- **Solution**: Check that your Supabase environment variables are set correctly in the dashboard:
  - Go to: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/settings/api
  - Verify your keys are correct

#### Error: "Database connection failed"

- **Solution**: 
  1. Check your database is running
  2. Verify RLS policies are set correctly
  3. Make sure tables exist (run migrations if needed)

### Viewing Logs

To see real-time logs from your Edge Function:

```bash
supabase functions logs server
```

Or view them in the Supabase Dashboard:
- Go to: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/functions/server/logs

### Quick Commands Reference

```bash
# Deploy the function
supabase functions deploy server

# View logs
supabase functions logs server

# Set a secret
supabase secrets set KEY_NAME=value

# List all secrets
supabase secrets list

# Delete the function (if you need to remove it)
supabase functions delete server
```

## 📋 Post-Deployment Checklist

After deploying, verify these items:

- [ ] Health endpoint responds: `/health`
- [ ] Status endpoint responds: `/status`
- [ ] Login works for existing users: `/login`
- [ ] Connection Diagnostic tool passes all tests (in Admin Settings)
- [ ] Email functionality works (or test mode is configured correctly)
- [ ] Real-time subscriptions work for event updates

## 🔗 Useful Links

- **Supabase Dashboard**: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco
- **Edge Functions Docs**: https://supabase.com/docs/guides/functions
- **Your Function URL**: `https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server`

## ⚠️ Important Notes

1. **Old Function Removed**: The old `make-server-08658f87` function directory has been cleaned up. Only deploy the `server` function.

2. **Environment Variables**: The function will automatically have access to `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. You only need to manually set `RESEND_API_KEY`.

3. **CORS**: The function is configured to accept requests from any origin (`origin: "*"`). In production, you may want to restrict this to your app's domain.

4. **Testing Mode**: If you don't have a Resend API key yet, the function will work but emails will be in "testing mode" and provide manual credentials instead.

## 🎯 Next Steps After Deployment

1. **Initialize the Database** (if this is a fresh project):
   - Use the `/initialize` endpoint to create demo accounts and levels
   - Or manually create an admin account through the signup flow

2. **Test All Features**:
   - Create an event
   - Invite staff members
   - Test notifications (if configured)
   - Verify points and level calculations work

3. **Configure Email** (optional but recommended):
   - Get a Resend API key from [resend.com](https://resend.com)
   - Set it in Supabase: `supabase secrets set RESEND_API_KEY=your_key`
   - Verify your domain with Resend for production use

---

**Need Help?** Check the Supabase documentation or the function logs for detailed error messages.
