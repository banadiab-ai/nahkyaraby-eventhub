# 🔧 Database Schema Fix Required

## ❌ Current Error

```
API Error for /events: 500 Failed to create event: Could not find the 'required_level' column of 'events' in the schema cache
Error adding event: Error: Failed to create event: Could not find the 'required_level' column of 'events' in the schema cache
```

## 🔍 Root Cause

The `events` table in your Supabase Postgres database is missing the `required_level` column that the application code expects. This column stores the minimum level required for staff to sign up for an event (e.g., "Level 1", "Level 2", etc.).

## ✅ Solution 1: Use the Built-in Schema Verification Tool (Easiest)

1. **Go to the Settings Tab** in your app
2. **Click "Verify Database Schema"** button
3. **Review the results**:
   - ✅ If all columns exist: You're good to go!
   - ⚠️ If issues are found: The tool will show you exactly what SQL to run
4. **Copy the SQL command** shown in the error message
5. **Run it in Supabase** (see steps below)
6. **Try creating an event again**

---

## ✅ Solution 2: Add Missing Column Manually

You need to add the `required_level` column to your `events` table in Supabase.

### Steps to Fix:

1. **Open Supabase Dashboard**
   - Go to https://supabase.com
   - Open your project

2. **Go to SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Run This SQL Command**:

```sql
-- Add the required_level column to the events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS required_level TEXT;

-- Optional: Add a comment explaining the column
COMMENT ON COLUMN events.required_level IS 'Minimum level required for staff to access this event (e.g., "Level 1", "Level 2")';
```

4. **Verify the Fix**:

After running the SQL, verify the column was added:

```sql
-- Check the events table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'events' 
ORDER BY ordinal_position;
```

You should see `required_level` listed with type `text`.

---

## 📋 Complete Events Table Schema

For reference, here's what your complete `events` table schema should look like:

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  end_date TEXT NOT NULL,
  time TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  required_level TEXT,  -- ⬅️ This is the missing column
  points INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'open', 'closed', 'cancelled'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  points_awarded TEXT[], -- Array of user IDs who have received points
  has_been_closed_before BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
```

---

## 🚨 Why This Happened

The Postgres migration created the table structure, but the `required_level` column was likely:
- Not included in the original table creation SQL
- Or the table was created manually in Supabase without all columns

The application code at `/supabase/functions/server/index.tsx` line 638 tries to insert this field:

```typescript
.insert({
  id: eventId,
  name: eventData.name,
  end_date: eventData.endDate || eventData.date,
  time: eventData.time,
  location: eventData.location,
  description: eventData.description || null,
  notes: eventData.notes || null,
  required_level: eventData.requiredLevel,  // ⬅️ Requires this column
  points: eventData.points,
  status: eventData.status || 'draft',
  created_at: new Date().toISOString()
})
```

---

## ⚡ Quick Fix (Option 2): Recreate the Table

If you prefer to start fresh, you can drop and recreate the events table with the correct schema:

**⚠️ WARNING: This will DELETE all existing events!**

```sql
-- Drop existing table (careful - this deletes all data!)
DROP TABLE IF EXISTS event_signups CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- Recreate events table with correct schema
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  end_date TEXT NOT NULL,
  time TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  required_level TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  points_awarded TEXT[],
  has_been_closed_before BOOLEAN DEFAULT FALSE
);

-- Recreate event_signups junction table
CREATE TABLE event_signups (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  points_awarded_at TIMESTAMPTZ,
  is_admin_signup BOOLEAN DEFAULT FALSE,
  UNIQUE(event_id, user_id)
);

-- Indexes
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_end_date ON events(end_date);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_event_signups_event_id ON event_signups(event_id);
CREATE INDEX idx_event_signups_user_id ON event_signups(user_id);
```

After recreating the tables, you'll need to use the "Initialize Database" button in the Settings tab to populate with demo data.

---

## ✅ After Applying the Fix

1. Refresh your application
2. Try creating a new event
3. The error should be gone!

If you still see errors, check the browser console and server logs for additional details.

---

## 📝 Related Files

- Server code: `/supabase/functions/server/index.tsx` (line 606-670)
- Migration plan: `/POSTGRES_MIGRATION_PLAN.md`
- Initialization guide: `/DATABASE_INITIALIZATION_GUIDE.md`