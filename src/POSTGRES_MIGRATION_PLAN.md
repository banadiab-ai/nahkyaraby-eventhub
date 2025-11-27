# Complete KV Store to Postgres Migration Plan

## Current Postgres Tables (Already Exist)
1. ✅ `levels` - Stores gamification levels
2. ✅ `staff_profiles` - Stores staff profile data
3. ✅ `events` - Stores event information
4. ✅ `event_signups` - Stores event sign-ups
5. ✅ `point_adjustments` - Stores point adjustment history

## Missing Tables (Need to Create)
1. ❌ `integration_settings` - For WhatsApp/Telegram settings
2. ❌ `admin_settings` - For admin contact settings

## SQL Schema for Missing Tables

```sql
-- Integration Settings Table (WhatsApp/Telegram)
CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL UNIQUE, -- 'whatsapp' or 'telegram'
  connected BOOLEAN DEFAULT false,
  
  -- WhatsApp specific
  phone_number_id TEXT,
  access_token TEXT,
  business_account_id TEXT,
  
  -- Telegram specific
  bot_token TEXT,
  bot_name TEXT,
  
  -- Common fields
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Admin Settings Table
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_integration_type ON integration_settings(integration_type);
```

## Migration Strategy

### Phase 1: Create Missing Tables
- Create `integration_settings` table
- Create `admin_settings` table

### Phase 2: Migrate Data
- Migrate WhatsApp settings from KV to `integration_settings`
- Migrate Telegram settings from KV to `integration_settings`
- Migrate admin settings from KV to `admin_settings`

### Phase 3: Update Endpoints (Grouped by Category)

#### A. Integration Settings Endpoints
1. `POST /whatsapp/connect` - Line 2784
2. `GET /whatsapp/status` - Line 2819
3. `POST /telegram/connect` - Line 2963
4. `GET /telegram/status` - Line 2998
5. `POST /telegram/send-all` - Line 3161
6. `POST /telegram/send-test` - Line 3222
7. Helper: `sendWhatsAppMessage()` - Line 2680
8. Helper: `sendTelegramMessage()` - Line 2853
9. Helper: `getIntegrationSettings()` - Line 333

#### B. Admin Settings Endpoints
1. `GET /admin/settings` - Line 2640
2. `POST /admin/settings` - Line 2667

#### C. Point Adjustment Endpoints
1. `POST /adjustments` - Line 3784
2. `POST /events/:id/award-points/:staffId` - Lines 4348-4405
3. `POST /events/:id/award-points-bulk` - Lines 4522-4591

#### D. Event Management Endpoints
1. `POST /events/:id/cancel` - Lines 1655, 1713

#### E. Staff Management Endpoints
1. `DELETE /staff/:id` - Lines 2251, 2258

#### F. Debug/Diagnostic Endpoints (Keep as fallback)
1. `GET /debug` - Lines 3304, 3327
2. `GET /diagnose-staff` - Line 5302
3. `POST /deduplicate-users` - Lines 5406-5529
4. `POST /repair-staff-names` - Line 5599

#### G. Legacy Endpoints (Can be removed after migration)
1. `POST /init-db` - Lines 4615-4766
2. `POST /migrate-admin` - Lines 4832-4836
3. `POST /reinit-db` - Lines 4876-4972
4. `POST /migrate-kv-to-postgres` - Lines 5998-6280

### Phase 4: Testing
- Test each migrated endpoint
- Verify data integrity
- Ensure fallback logic works

### Phase 5: Cleanup (Optional)
- Remove KV store dependencies
- Archive legacy endpoints
- Update documentation
