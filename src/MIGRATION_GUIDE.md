# Complete KV Store to Postgres Migration Guide

## Overview
This guide will help you migrate all remaining KV store data to Postgres tables.

## Prerequisites
- Admin access to the Nahky Araby Event Hub
- Access to Supabase Dashboard (for creating tables)
- Basic understanding of SQL

---

## Step 1: Create Missing Postgres Tables

You need to create two tables in Supabase. Go to **Supabase Dashboard → SQL Editor** and run this SQL:

```sql
-- Create Integration Settings Table (WhatsApp/Telegram)
CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL UNIQUE, -- 'whatsapp' or 'telegram'
  connected BOOLEAN DEFAULT false,
  
  -- WhatsApp specific fields
  phone_number_id TEXT,
  access_token TEXT,
  business_account_id TEXT,
  
  -- Telegram specific fields
  bot_token TEXT,
  bot_name TEXT,
  
  -- Common fields
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create Admin Settings Table
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_integration_type ON integration_settings(integration_type);

-- Enable Row Level Security (RLS)
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for service role)
CREATE POLICY "Allow all for service role" ON integration_settings
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow all for service role" ON admin_settings
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Step 2: Run the Data Migration

After creating the tables, call the migration endpoint:

**Endpoint:** `POST /make-server-08658f87/complete-migration`

This will:
- Migrate WhatsApp settings from KV to Postgres
- Migrate Telegram settings from KV to Postgres
- Migrate admin contact settings from KV to Postgres

---

## Step 3: Verify Migration

Check that the data was migrated successfully by calling:

**Endpoint:** `GET /make-server-08658f87/check-postgres-tables`

This will show you:
- Which tables exist
- How many records are in each table
- Any errors encountered

---

## Step 4: Update Helper Functions

After migration is complete, the following helper functions need to be updated to use Postgres instead of KV:

### A. `getIntegrationSettings()` - Line 333
**Current:** Falls back to KV store
**Update To:** Query `integration_settings` table

### B. `sendWhatsAppMessage()` - Line 2680
**Current:** Gets settings from KV
**Update To:** Query `integration_settings` WHERE `integration_type = 'whatsapp'`

### C. `sendTelegramMessage()` - Line 2853
**Current:** Gets settings from KV
**Update To:** Query `integration_settings` WHERE `integration_type = 'telegram'`

---

## Endpoints to Update (Detailed List)

### Category 1: Integration Settings (9 endpoints)
| Endpoint | Line | What to Update |
|----------|------|----------------|
| `POST /whatsapp/connect` | 2784 | Replace `kv.set('whatsapp:settings', ...)` with Postgres INSERT/UPDATE |
| `GET /whatsapp/status` | 2819 | Replace `kv.get('whatsapp:settings')` with Postgres SELECT |
| `POST /telegram/connect` | 2963 | Replace `kv.set('telegram:settings', ...)` with Postgres INSERT/UPDATE |
| `GET /telegram/status` | 2998 | Replace `kv.get('telegram:settings')` with Postgres SELECT |
| `POST /telegram/send-all` | 3161 | Replace `kv.get('telegram:settings')` with Postgres SELECT |
| `POST /telegram/send-test` | 3222 | Replace `kv.get('telegram:settings')` with Postgres SELECT |
| `POST /events/:id/cancel` | 1655 | Replace `kv.get('telegram:settings')` with Postgres SELECT |
| `POST /events/close` | 5093 | Replace `kv.get('telegram:settings')` with Postgres SELECT |
| `GET /debug` | 3327 | Replace `kv.get('telegram:settings')` with Postgres SELECT |

### Category 2: Admin Settings (2 endpoints)
| Endpoint | Line | What to Update |
|----------|------|----------------|
| `GET /admin/settings` | 2640 | Replace `kv.get('admin:settings')` with Postgres SELECT |
| `POST /admin/settings` | 2667 | Replace `kv.set('admin:settings', ...)` with Postgres INSERT/UPDATE |

### Category 3: Point Adjustments (3 endpoints)
| Endpoint | Line | What to Update |
|----------|------|----------------|
| `POST /adjustments` | 3784 | Replace `kv.set(\`adjustment:\${adjustmentId}\`, ...)` with Postgres INSERT into `point_adjustments` |
| `POST /events/:id/award-points/:staffId` | 4348-4405 | Replace all KV operations with Postgres |
| `POST /events/:id/award-points-bulk` | 4522-4591 | Replace all KV operations with Postgres |

### Category 4: Event Management (2 endpoints)
| Endpoint | Line | What to Update |
|----------|------|----------------|
| `POST /events/:id/cancel` | 1713 | Replace `kv.set(\`event:\${eventId}\`, ...)` with Postgres UPDATE (ALREADY USING POSTGRES, just needs KV removal) |
| `DELETE /staff/:id` | 2251-2258 | Replace event KV operations with Postgres queries |

---

## Migration Code Examples

### Example 1: Get Integration Settings (Telegram)

**Before (KV):**
```typescript
const telegramSettings = await kv.get('telegram:settings');
```

**After (Postgres):**
```typescript
const { data: telegramSettings } = await supabase
  .from('integration_settings')
  .select('*')
  .eq('integration_type', 'telegram')
  .single();
```

### Example 2: Save Integration Settings (WhatsApp)

**Before (KV):**
```typescript
await kv.set('whatsapp:settings', whatsAppSettings);
```

**After (Postgres):**
```typescript
const { data: existing } = await supabase
  .from('integration_settings')
  .select('id')
  .eq('integration_type', 'whatsapp')
  .single();

if (existing) {
  // Update
  await supabase
    .from('integration_settings')
    .update({
      connected: whatsAppSettings.connected,
      phone_number_id: whatsAppSettings.phoneNumberId,
      access_token: whatsAppSettings.accessToken,
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id);
} else {
  // Insert
  await supabase
    .from('integration_settings')
    .insert({
      integration_type: 'whatsapp',
      connected: whatsAppSettings.connected,
      phone_number_id: whatsAppSettings.phoneNumberId,
      access_token: whatsAppSettings.accessToken
    });
}
```

### Example 3: Get Admin Settings

**Before (KV):**
```typescript
const settings = await kv.get('admin:settings') || { email: '', phone: '' };
```

**After (Postgres):**
```typescript
const { data: settings } = await supabase
  .from('admin_settings')
  .select('*')
  .limit(1)
  .single();

// If no settings exist, return defaults
const adminSettings = settings || { email: '', phone: '' };
```

### Example 4: Save Point Adjustment

**Before (KV):**
```typescript
const adjustmentId = `${Date.now()}`;
const adjustment = {
  id: adjustmentId,
  staffId: staffId,
  points: points,
  reason: reason,
  timestamp: new Date().toISOString(),
  adminId: user.id
};

await kv.set(`adjustment:${adjustmentId}`, adjustment);
```

**After (Postgres):**
```typescript
const { data: adjustment, error } = await supabase
  .from('point_adjustments')
  .insert({
    staff_id: staffId,
    points: points,
    reason: reason,
    admin_id: user.id,
    created_at: new Date().toISOString()
  })
  .select()
  .single();
```

---

## Testing Checklist

After updating each category, test the following:

### Integration Settings
- [ ] Connect WhatsApp integration
- [ ] Disconnect WhatsApp integration
- [ ] Check WhatsApp status
- [ ] Connect Telegram integration
- [ ] Disconnect Telegram integration
- [ ] Check Telegram status
- [ ] Send test Telegram message

### Admin Settings
- [ ] Get admin settings
- [ ] Update admin email
- [ ] Update admin phone

### Point Adjustments
- [ ] Award points manually
- [ ] Award points from event
- [ ] View adjustment history

### Event Management
- [ ] Cancel an event (check Telegram notifications)
- [ ] Close an event (check Telegram notifications)
- [ ] Delete staff member (check event signups are removed)

---

## Rollback Plan

If something goes wrong, you can temporarily revert to KV store by:

1. Keep the KV store code as fallback
2. Add a feature flag to switch between KV and Postgres
3. Monitor logs for any errors

---

## Next Steps

After completing this migration:

1. **Remove KV store dependencies** - Once everything is verified working
2. **Archive legacy endpoints** - `/init-db`, `/reinit-db`, `/migrate-to-postgres`
3. **Update documentation** - Remove references to KV store
4. **Monitor performance** - Postgres should be faster than KV for most operations

---

## Need Help?

If you encounter any issues during migration:

1. Check the server logs for detailed error messages
2. Verify all tables were created correctly in Supabase
3. Ensure RLS policies allow service_role access
4. Test with a single endpoint first before migrating all

---

## Summary

This migration will:
- ✅ Move all integration settings (WhatsApp/Telegram) to Postgres
- ✅ Move all admin settings to Postgres  
- ✅ Update all point adjustment operations to use Postgres
- ✅ Ensure all event operations use Postgres
- ✅ Maintain data consistency across the app
- ✅ Improve performance and scalability
