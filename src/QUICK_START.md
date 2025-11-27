# 🚀 Quick Start - Fix 404 Errors

Your Edge Function code is ready but **not deployed yet**. That's why you're getting 404 errors.

## One-Command Deploy (Recommended)

### Option 1: Use the deploy script

```bash
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Manual deployment

```bash
# 1. Login to Supabase
supabase login

# 2. Link your project
supabase link --project-ref ojeewoebsidiiufvfwco

# 3. Deploy the function
supabase functions deploy server

# 4. Test it
./test-deployment.sh
```

## After Deployment

Your function will be available at:
```
https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server
```

### Test Endpoints

```bash
# Health check
curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/health

# Status check
curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/status

# Email config
curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/email-config
```

All should return JSON responses without 404 errors.

## Environment Variables

Optional - Set if you want email functionality:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
```

Get a free key at: https://resend.com

---

## What is `/migrate-admin`?

The `/migrate-admin` endpoint is a **legacy migration tool** that updates old admin accounts from `admin@company.com` to `admin@company.local` format.

**You don't need to use it** because:
- You're on a new Supabase project
- Your login system already supports both email and username formats
- No old admin accounts exist that need migration

**When it was used:**
- During the transition from email-based to username-based logins
- To migrate existing `admin@company.com` accounts to the new format

You can safely ignore this endpoint or remove it in a future cleanup.

---

## Need More Details?

See **DEPLOYMENT_GUIDE.md** for comprehensive instructions.
