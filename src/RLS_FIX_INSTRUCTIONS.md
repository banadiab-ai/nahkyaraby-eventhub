# Row Level Security (RLS) Fix for Points Log

## Problem
Staff users were able to see all point adjustments (like admins) instead of only their own records. The JWT token does not automatically include `raw_user_meta_data`, so RLS policies cannot check roles from the JWT.

## Solution
Create a dedicated `user_roles` table that stores user_id and role, and update RLS policies to query this table instead of relying on JWT metadata.

---

## Step 1: Run SQL Script in Supabase SQL Editor

Copy and paste this entire SQL script into your **Supabase SQL Editor** and run it:

```sql
-- ============================================
-- CREATE user_roles TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own role
CREATE POLICY "users_read_own_role"
ON user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend)
CREATE POLICY "service_role_all_access"
ON user_roles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- POPULATE user_roles FROM EXISTING USERS
-- ============================================

-- Insert roles for all existing users from auth.users metadata
INSERT INTO user_roles (user_id, role)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'role', 'staff') as role
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- UPDATE RLS POLICIES FOR point_adjustments
-- ============================================

DROP POLICY IF EXISTS "users_read_adjustments_based_on_role" ON point_adjustments;

-- Admins can read everything, staff can only read their own
CREATE POLICY "users_read_adjustments_based_on_role"
ON point_adjustments
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  -- Check role from user_roles table
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
  OR
  -- Staff can only see their own
  auth.uid() = staff_id
);

-- ============================================
-- UPDATE RLS POLICIES FOR point_transactions
-- ============================================

DROP POLICY IF EXISTS "users_read_transactions_based_on_role" ON point_transactions;

-- Admins can read everything, staff can only read their own
CREATE POLICY "users_read_transactions_based_on_role"
ON point_transactions
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  -- Check role from user_roles table
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
  OR
  -- Staff can only see their own
  auth.uid() = staff_id
);
```

---

## Step 2: Backend Changes (Already Applied)

The following backend changes have been made to `/supabase/functions/server/index.tsx`:

### 1. **Signup Endpoint** (`POST /signup`)
- Now inserts into `user_roles` table when a new user is created

### 2. **Staff Invite Endpoint** (`POST /staff/invite`)
- Now inserts into `user_roles` table when a new staff member is invited

### 3. **Delete Staff Endpoint** (`DELETE /staff/:id`)
- User deletion automatically cascades to `user_roles` table via foreign key constraint

---

## Step 3: Test the Fix

### Test as Staff:
1. **Logout** from admin account
2. **Login** as staff member (e.g., Bayan)
3. **Go to Points Log tab**
4. **Verify**: You should ONLY see your own point adjustments

### Test as Admin:
1. **Login** as admin
2. **Go to Points Log tab**
3. **Verify**: You should see ALL point adjustments from all staff members

---

## How It Works

### Before (Broken):
- RLS policies tried to check `auth.jwt() -> 'user_metadata' ->> 'role'`
- JWT doesn't automatically include `raw_user_meta_data`
- Result: All queries returned NULL for role, so the policy failed

### After (Fixed):
- RLS policies check the `user_roles` table
- `user_roles` table is populated when users are created
- Result: Policies correctly identify admins vs staff

### Key Features:
✅ **New users** → Automatically added to `user_roles` table  
✅ **Deleted users** → Automatically removed from `user_roles` table (CASCADE)  
✅ **Existing users** → Migrated to `user_roles` table by the SQL script  
✅ **Admin access** → Can see all point adjustments  
✅ **Staff access** → Can only see their own point adjustments  

---

## Verification Query

To verify roles are stored correctly, run this in **Supabase SQL Editor**:

```sql
SELECT 
  u.email,
  ur.role,
  u.raw_user_meta_data->>'role' as metadata_role
FROM auth.users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
ORDER BY ur.role, u.email;
```

This should show all users with their roles from both `user_roles` table and `raw_user_meta_data`.

---

## Notes

- The `user_roles` table has a foreign key to `auth.users` with **ON DELETE CASCADE**
- This means when a user is deleted from Auth, their role is automatically removed
- The backend has been updated to insert into `user_roles` whenever a new user is created
- Existing users have been migrated to the `user_roles` table automatically
