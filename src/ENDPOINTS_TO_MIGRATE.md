# All Endpoints That Need Migration from KV to Postgres

## Quick Reference Table

| # | Endpoint | Lines | KV Operation | Postgres Table | Priority |
|---|----------|-------|--------------|----------------|----------|
| **INTEGRATION SETTINGS** |
| 1 | Helper: `getIntegrationSettings()` | 333 | `kv.get(kvKey)` | `integration_settings` | 🔴 HIGH |
| 2 | Helper: `sendWhatsAppMessage()` | 2680 | `kv.get('whatsapp:settings')` | `integration_settings` | 🔴 HIGH |
| 3 | Helper: `sendTelegramMessage()` | 2853 | `kv.get('telegram:settings')` | `integration_settings` | 🔴 HIGH |
| 4 | `POST /whatsapp/connect` | 2784 | `kv.set('whatsapp:settings', ...)` | `integration_settings` | 🔴 HIGH |
| 5 | `GET /whatsapp/status` | 2819 | `kv.get('whatsapp:settings')` | `integration_settings` | 🔴 HIGH |
| 6 | `POST /telegram/connect` | 2963 | `kv.set('telegram:settings', ...)` | `integration_settings` | 🔴 HIGH |
| 7 | `GET /telegram/status` | 2998 | `kv.get('telegram:settings')` | `integration_settings` | 🔴 HIGH |
| 8 | `POST /telegram/send-all` | 3161 | `kv.get('telegram:settings')` | `integration_settings` | 🟡 MEDIUM |
| 9 | `POST /telegram/send-test` | 3222 | `kv.get('telegram:settings')` | `integration_settings` | 🟡 MEDIUM |
| 10 | `POST /events/:id/cancel` | 1655 | `kv.get('telegram:settings')` | `integration_settings` | 🔴 HIGH |
| 11 | `POST /events/close` | 5093 | `kv.get('telegram:settings')` | `integration_settings` | ✅ DONE |
| 12 | `GET /debug` | 3327 | `kv.get('telegram:settings')` | `integration_settings` | 🟢 LOW |
| **ADMIN SETTINGS** |
| 13 | `GET /admin/settings` | 2640 | `kv.get('admin:settings')` | `admin_settings` | 🟡 MEDIUM |
| 14 | `POST /admin/settings` | 2667 | `kv.set('admin:settings', ...)` | `admin_settings` | 🟡 MEDIUM |
| **POINT ADJUSTMENTS** |
| 15 | `POST /adjustments` | 3784 | `kv.set(\`adjustment:\${id}\`, ...)` | `point_adjustments` | 🔴 HIGH |
| 16 | `POST /events/:id/award-points/:staffId` | 4348-4405 | Multiple KV operations | `point_adjustments` + `events` | 🔴 HIGH |
| 17 | `POST /events/:id/award-points-bulk` | 4522-4591 | Multiple KV operations | `point_adjustments` + `events` | 🔴 HIGH |
| **EVENT MANAGEMENT** |
| 18 | `POST /events/:id/cancel` | 1713 | `kv.set(\`event:\${id}\`, ...)` | `events` | 🔴 HIGH |
| 19 | `DELETE /staff/:id` | 2251-2258 | `kv.getByPrefix('event:')` + `kv.set(...)` | `event_signups` | 🟡 MEDIUM |
| **FALLBACK/DIAGNOSTIC (Keep for now)** |
| 20 | `GET /health` | 368, 377 | Fallback to KV | N/A | 🟢 LOW |
| 21 | `GET /events` | 651 | Fallback to KV | N/A | 🟢 LOW |
| 22 | Helper: `fetchLevelsFromDatabase()` | 178 | Fallback to KV | N/A | 🟢 LOW |
| 23 | `GET /debug` | 3304 | `kv.getByPrefix('user:')` | Supabase Auth | 🟢 LOW |
| 24 | `GET /diagnose-staff` | 5302 | `kv.getByPrefix('user:')` | Supabase Auth | 🟢 LOW |
| 25 | `POST /deduplicate-users` | 5406-5529 | Multiple KV operations | Supabase Auth | 🟢 LOW |
| 26 | `POST /repair-staff-names` | 5599 | `kv.get(\`user:\${id}\`)` | Supabase Auth | 🟢 LOW |
| **LEGACY (Can remove after migration)** |
| 27 | `POST /init-db` | 4615-4766 | Creates data in KV | N/A | ⚫ REMOVE |
| 28 | `POST /migrate-admin` | 4832-4836 | Updates KV | N/A | ⚫ REMOVE |
| 29 | `POST /reinit-db` | 4876-4972 | Clears and recreates KV | N/A | ⚫ REMOVE |
| 30 | `POST /migrate-to-postgres` | 5998-6280 | Reads from KV to migrate | N/A | ⚫ REMOVE |

---

## Priority Legend

- 🔴 **HIGH** - Critical functionality, migrate ASAP
- 🟡 **MEDIUM** - Important but not critical
- 🟢 **LOW** - Nice to have, can wait
- ✅ **DONE** - Already migrated
- ⚫ **REMOVE** - Legacy code, remove after migration

---

## Migration Order (Recommended)

### Phase 1: Foundation (Do First)
1. Create Postgres tables (`integration_settings`, `admin_settings`)
2. Run `/complete-migration` endpoint to migrate data
3. Update helper functions (Lines 333, 2680, 2853) - **CRITICAL**

### Phase 2: Integration Settings (High Priority)
4. `POST /whatsapp/connect` (2784)
5. `GET /whatsapp/status` (2819)
6. `POST /telegram/connect` (2963)
7. `GET /telegram/status` (2998)
8. `POST /telegram/send-all` (3161)
9. `POST /telegram/send-test` (3222)

### Phase 3: Event & Point Management (High Priority)
10. `POST /events/:id/cancel` (1655, 1713)
11. `POST /adjustments` (3784)
12. `POST /events/:id/award-points/:staffId` (4348-4405)
13. `POST /events/:id/award-points-bulk` (4522-4591)

### Phase 4: Admin & Staff Management (Medium Priority)
14. `GET /admin/settings` (2640)
15. `POST /admin/settings` (2667)
16. `DELETE /staff/:id` (2251-2258)

### Phase 5: Cleanup (Low Priority)
17. Update fallback logic in diagnostic endpoints
18. Remove legacy endpoints
19. Final testing and verification

---

## SQL for Creating Missing Tables

```sql
-- Run this in Supabase Dashboard → SQL Editor

-- Integration Settings Table
CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL UNIQUE,
  connected BOOLEAN DEFAULT false,
  phone_number_id TEXT,
  access_token TEXT,
  business_account_id TEXT,
  bot_token TEXT,
  bot_name TEXT,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_type ON integration_settings(integration_type);

-- Enable RLS
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all for service role" ON integration_settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow all for service role" ON admin_settings FOR ALL USING (auth.role() = 'service_role');
```

---

## After Migration Checklist

- [ ] All 🔴 HIGH priority endpoints migrated and tested
- [ ] All 🟡 MEDIUM priority endpoints migrated and tested
- [ ] Integration settings working (WhatsApp/Telegram)
- [ ] Point adjustments saving correctly
- [ ] Event cancellation notifications working
- [ ] Admin settings saving/loading correctly
- [ ] All ⚫ REMOVE legacy endpoints removed
- [ ] KV store fallback code removed
- [ ] Documentation updated

---

## Quick Start

To begin migration:

1. **Run SQL** in Supabase to create tables (see above)
2. **Call endpoint:** `POST /make-server-08658f87/complete-migration`
3. **Verify:** `GET /make-server-08658f87/check-postgres-tables`
4. **Start migrating** endpoints from Phase 1

---

Total Endpoints to Migrate: **19 endpoints** (excluding legacy/diagnostic)
