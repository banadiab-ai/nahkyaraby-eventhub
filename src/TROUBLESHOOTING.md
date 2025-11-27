# Troubleshooting Guide

Common issues and their solutions for the Nahky Araby Event Hub.

## 🚨 Critical Issues

### 404 Errors on All API Calls

**Symptom**: All API requests return 404 Not Found

**Cause**: Edge Function not deployed

**Solution**:
```bash
# Quick fix
./deploy.sh

# Or manually
supabase login
supabase link --project-ref ojeewoebsidiiufvfwco
supabase functions deploy server
```

**Verify**:
```bash
curl https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/health
# Should return: {"status":"ok"}
```

---

### "Server error: 404" on Status Check

**Symptom**: Connection Diagnostic fails with "Status check failed with status: 404"

**Cause**: Same as above - function not deployed

**Solution**: Deploy the function (see above)

---

### Cannot Login - "Invalid credentials"

**Symptom**: Login fails even with correct credentials

**Possible Causes**:

1. **User doesn't exist**
   - Solution: Create user via signup or use `/initialize` endpoint to create demo accounts

2. **Wrong password**
   - Solution: Use forgot password feature or reset via Supabase Dashboard

3. **Inactive account**
   - Solution: Admin needs to activate the account in Staff Management

4. **Email format mismatch**
   - If admin user: Try both `admin` and `admin@company.local`
   - Old accounts may use `admin@company.com` (run `/migrate-admin` endpoint)

**Debug Steps**:
```bash
# Check if user exists in Supabase Dashboard
https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/auth/users

# Check Edge Function logs
supabase functions logs server
```

---

## 🔐 Authentication Issues

### JWT Token Expired

**Symptom**: "Unauthorized" errors after being logged in for a while

**Solution**: The app should auto-refresh tokens. If not:
1. Log out and log back in
2. Check browser localStorage for tokens
3. Verify refresh token logic in `/utils/api.ts`

---

### "Cannot use public anon key for authenticated endpoints"

**Symptom**: Error when calling protected endpoints

**Cause**: Frontend is sending the anon key instead of the user's JWT token

**Solution**:
1. Verify login is working and storing the access token
2. Check that `Authorization` header includes the user's JWT, not the anon key
3. Look in browser DevTools → Application → Local Storage for `supabase.auth.token`

---

## 📧 Email Issues

### Emails Not Sending

**Symptom**: "Email service not configured" or no emails received

**Cause**: Missing or invalid RESEND_API_KEY

**Solution**:
1. Get API key from https://resend.com
2. Set it in Supabase:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
   ```
3. Redeploy function (not required but recommended):
   ```bash
   supabase functions deploy server
   ```

---

### "Testing Mode" - Emails Go to delivered@resend.dev

**Symptom**: Email response says "testing mode" and provides manual credentials

**Cause**: Using `onboarding@resend.dev` as sender (Resend's test email)

**Solution**: This is intentional for testing. For production:
1. Verify a domain at https://resend.com/domains
2. Update `/supabase/functions/server/index.tsx`:
   ```typescript
   const FROM_EMAIL = 'noreply@yourdomain.com';
   ```
3. Redeploy function:
   ```bash
   supabase functions deploy server
   ```

---

## 🗄️ Database Issues

### "Relation does not exist" Error

**Symptom**: Database queries fail with "relation 'table_name' does not exist"

**Cause**: Database migrations not run

**Solution**:
```bash
# Run all migrations
supabase db push

# Or create tables manually via Supabase Dashboard SQL Editor
```

---

### RLS Policy Violations

**Symptom**: "new row violates row-level security policy"

**Cause**: Row Level Security policies blocking operation

**Solution**:
1. Check RLS policies in Supabase Dashboard → Database → Tables
2. Ensure policies allow the operation for the user's role
3. Admin operations should use service role key (handled by Edge Function)

---

### Data Not Updating in UI

**Symptom**: Changes in database don't reflect in UI

**Cause**: Real-time subscription not working

**Solution**:
1. Check browser console for subscription errors
2. Verify Real-time is enabled for the table:
   - Go to: Database → Replication
   - Enable for `event_participants` and other tables
3. Check subscription code is active (look for `.channel()` calls)
4. Refresh the page as a temporary workaround

---

## 🎮 Real-time Subscription Issues

### Real-time Not Working

**Symptom**: Need to manually refresh to see updates

**Debug Steps**:

1. **Check browser console**:
   - Look for `SUBSCRIBED` message
   - Look for WebSocket connection errors

2. **Verify Supabase Real-time is enabled**:
   - Go to: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/database/replication
   - Enable for `event_participants` table

3. **Check subscription code**:
   ```typescript
   // Should see this in your component
   const subscription = supabase
     .channel('event_participants_changes')
     .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, ...)
     .subscribe();
   ```

4. **Verify authentication**:
   - Real-time requires valid JWT token
   - Check that user is logged in

---

### Subscription Memory Leak

**Symptom**: Multiple subscriptions created, performance degrades

**Cause**: Not unsubscribing when component unmounts

**Solution**:
```typescript
useEffect(() => {
  const subscription = supabase.channel(...).subscribe();
  
  // Cleanup function
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

---

## 👥 Staff Management Issues

### Cannot Invite Staff

**Symptom**: "Admin access required" when trying to invite

**Cause**: User is not admin or role not properly set

**Solution**:
1. Check user's role in Supabase Dashboard → Auth → Users → (select user) → Raw User Meta Data
2. Should have: `"role": "admin"`
3. If not, update manually or use `/setup-password` endpoint after invite

---

### Invited Staff Cannot Login

**Symptom**: Invited staff get "invalid credentials"

**Possible Causes**:

1. **Using wrong password**:
   - In testing mode, temp password is shown in API response
   - In production mode, check their email

2. **Account status is 'inactive'**:
   - Admin needs to change status to 'active' in Staff Management

3. **Account not created**:
   - Check Supabase Dashboard → Auth → Users
   - If missing, try invite again

---

### Points Not Updating

**Symptom**: Confirming participation doesn't award points

**Debug Steps**:

1. **Check Edge Function logs**:
   ```bash
   supabase functions logs server
   ```
   Look for errors during confirmation

2. **Verify levels are configured**:
   - Go to Admin Settings → Levels Management
   - Must have at least one level configured

3. **Check user metadata**:
   - Supabase Dashboard → Auth → Users
   - Check `raw_user_meta_data` has `points` and `level` fields

---

## 📅 Event Issues

### Cannot Create Event

**Symptom**: "Admin access required" or event creation fails

**Cause**: Not logged in as admin

**Solution**: Ensure logged in with admin account

---

### Cannot Sign Up for Event

**Symptom**: Signup button disabled or error when clicking

**Possible Causes**:

1. **Event is full**:
   - Check current_participants vs max_participants

2. **Past signup deadline**:
   - Check event's signup_deadline

3. **Already signed up**:
   - Check if you're already in participants list

4. **Event in the past**:
   - Cannot sign up for past events

---

### Participant Count Not Updating

**Symptom**: Event shows wrong number of participants

**Cause**: Counter not synchronized

**Solution**:
1. Check `event_participants` table for actual count
2. Admin can edit event to refresh the count
3. Or manually update via SQL:
   ```sql
   UPDATE events
   SET current_participants = (
     SELECT COUNT(*) FROM event_participants 
     WHERE event_id = events.id AND status != 'cancelled'
   )
   WHERE id = 'event-uuid-here';
   ```

---

## 🔗 Integration Issues

### WhatsApp/Telegram Not Connecting

**Symptom**: Integration settings not saving or connection fails

**Cause**: Invalid credentials or API issues

**Solution**:
1. Verify API keys/tokens are correct
2. Check integration service is running (WhatsApp Business, Telegram Bot)
3. Check Edge Function logs for specific errors
4. Ensure `integration_settings2` table exists

---

## 🖥️ Frontend Issues

### UI Not Loading / Blank Screen

**Debug Steps**:

1. **Check browser console** for errors

2. **Verify Supabase connection**:
   - Check `/utils/supabase/info.tsx` has correct project ID
   - Should be: `ojeewoebsidiiufvfwco`

3. **Check environment**:
   - Ensure `npm install` was run
   - Try `npm run dev` again

4. **Clear cache**:
   ```bash
   # Clear browser cache
   # Or use incognito mode
   
   # Clear Vite cache
   rm -rf node_modules/.vite
   npm run dev
   ```

---

### "Connection Diagnostic" Shows All Failures

**Symptom**: All diagnostic tests fail

**Cause**: Edge Function not deployed or network issue

**Solution**:
1. Deploy Edge Function (see top of this guide)
2. Check network/firewall settings
3. Verify Supabase project is active
4. Try accessing function URL directly in browser:
   ```
   https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server/health
   ```

---

## 🛠️ Development Issues

### Supabase CLI Not Found

**Symptom**: `supabase: command not found`

**Solution**:
```bash
npm install -g supabase
```

---

### Cannot Link Project

**Symptom**: `supabase link` fails

**Possible Causes**:

1. **Not logged in**:
   ```bash
   supabase login
   ```

2. **No access to project**:
   - Verify project ID: `ojeewoebsidiiufvfwco`
   - Check you have access in Supabase Dashboard

3. **Wrong database password**:
   - Get password from Supabase Dashboard → Settings → Database

---

### Function Deployment Fails

**Symptom**: `supabase functions deploy server` fails

**Debug**:

1. **Check for syntax errors**:
   - Look at error message
   - Verify TypeScript code is valid

2. **Check dependencies**:
   - All imports should use `npm:` prefix for Deno
   - Example: `import { Hono } from "npm:hono"`

3. **Check file structure**:
   ```
   /supabase/functions/server/
   ├── index.tsx
   └── kv_store.tsx
   ```

4. **Try with --debug flag**:
   ```bash
   supabase functions deploy server --debug
   ```

---

## 📊 Performance Issues

### Slow API Responses

**Debug**:

1. **Check Edge Function logs** for slow queries

2. **Check database performance**:
   - Supabase Dashboard → Database → Performance

3. **Add indexes** if needed:
   ```sql
   CREATE INDEX idx_event_participants_event_id 
   ON event_participants(event_id);
   ```

---

### High Memory Usage in Browser

**Cause**: Possible memory leak from subscriptions

**Solution**:
1. Ensure all subscriptions are properly unsubscribed
2. Check for infinite loops in useEffect hooks
3. Use React DevTools Profiler to identify issues

---

## 🆘 Getting More Help

### View Logs

```bash
# Edge Function logs
supabase functions logs server

# Follow logs in real-time
supabase functions logs server --follow

# Database logs
# View in Supabase Dashboard → Logs
```

### Check Supabase Status

- https://status.supabase.com/

### Dashboard Links

- **Project Overview**: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco
- **Auth Users**: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/auth/users
- **Database**: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/editor
- **Edge Functions**: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/functions
- **Logs**: https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/logs/explorer

### Useful Commands

```bash
# Test deployment
./test-deployment.sh

# Deploy function
./deploy.sh

# View logs
supabase functions logs server

# Check function status
supabase functions list

# Check secrets
supabase secrets list

# Reset database (CAUTION - DELETES ALL DATA)
supabase db reset
```

---

## 📝 Still Stuck?

If none of these solutions work:

1. **Check the logs** - Most issues show up in logs
2. **Verify deployment** - Make sure function is actually deployed
3. **Test endpoints manually** - Use curl or Postman to test API directly
4. **Check Supabase Dashboard** - Many issues visible in the dashboard
5. **Review recent changes** - What changed before the issue started?

**Remember**: The most common issue is the Edge Function not being deployed!

```bash
# When in doubt, redeploy
./deploy.sh
```
