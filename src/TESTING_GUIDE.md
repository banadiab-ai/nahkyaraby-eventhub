# Testing Guide - Refactor Progress Check

## Current Refactor Status

We've migrated approximately **50% of endpoints** from KV Store to Supabase Auth for user data storage.

### ✅ FULLY MIGRATED (Should Work):
1. **Authentication Flow**
   - Admin login (simple username like "admin" works)
   - Staff login (email-based)
   - Password setup for new staff
   - Admin credential changes

2. **Staff Management (Admin)**
   - View all staff members
   - Invite new staff (sends email)
   - Update staff info (name, phone, telegram)
   - Delete staff members
   - Reset staff passwords

3. **Points Management (Admin)**
   - Adjust staff points (add/subtract with reason)
   - View point adjustment history

4. **Event Creation & Updates (Admin)**
   - Create new events
   - Update event details
   - Delete events
   - Cancel events (with notifications)
   - Staff selection/deselection notifications

5. **Event Notifications**
   - New event notifications via Telegram
   - Selection/deselection notifications
   - Update notifications
   - Cancellation emails

### ⚠️ PARTIALLY MIGRATED (May Have Issues):
1. **Event Sign-Up (Staff)**
   - Staff signing up for events - **NOT YET MIGRATED**
   - May fail when checking staff level eligibility

2. **Level Management (Admin)**
   - Create/update/delete levels - **NOT YET MIGRATED**
   - Reorder levels - **NOT YET MIGRATED**

3. **Award Points (Admin)**
   - Awarding points after events - **NOT YET MIGRATED**

4. **Settings Management**
   - Admin contact settings - **NOT YET MIGRATED**
   - Telegram integration settings - **NOT YET MIGRATED**

5. **Database Initialization**
   - Reset database - **NOT YET MIGRATED**
   - Creates demo users in old format

### ❌ NOT MIGRATED (Will Definitely Fail):
- Telegram test message endpoint
- Any endpoint using `kv.get('user:${userId}')` for role checking

---

## Recommended Testing Order

### Test 1: Basic Admin Login ✅
**Expected: WORKS**
1. Open the app
2. Click "Admin Login"
3. Login with: username = `admin`, password = `admin123`
4. Should see admin dashboard

**What to check:**
- Login succeeds
- Dashboard loads
- No console errors related to user data

---

### Test 2: Staff Management ✅
**Expected: WORKS**
1. Go to "Staff" tab
2. Try to view staff list
3. Try inviting a new staff member
4. Try updating staff info

**What to check:**
- Staff list displays correctly
- Can add/edit/delete staff
- Email invitations work

---

### Test 3: Event Creation ✅
**Expected: WORKS**
1. Go to "Events" tab
2. Click "Create Event"
3. Fill in event details
4. Save event

**What to check:**
- Event saves successfully
- Event appears in list
- Can edit/delete event

---

### Test 4: Points Adjustment ✅
**Expected: WORKS**
1. Select a staff member
2. Click "Adjust Points"
3. Add/subtract points with reason
4. Check point history

**What to check:**
- Points update correctly
- History shows in staff profile
- Staff level may auto-advance

---

### Test 5: Level Management ⚠️
**Expected: MAY FAIL - Admin check not migrated**
1. Go to "Levels" tab
2. Try to create a new level
3. Try to reorder levels

**What to check:**
- May get "Admin access required" error
- Or may work if admin check passes

---

### Test 6: Staff Sign-Up for Events ⚠️
**Expected: MAY FAIL - Staff lookup not migrated**
1. Logout and login as staff
2. Go to "Available Events"
3. Try to sign up for an event

**What to check:**
- May fail when checking eligibility
- Console errors about missing user data

---

## Known Issues to Look For

### Issue #1: "Admin access required" on migrated endpoints
**Cause:** Endpoint still using old `kv.get('user:${userId}')` check
**Fix Needed:** Update to use `verifyAdmin()` helper

### Issue #2: "Staff member not found" 
**Cause:** Endpoint trying to fetch from KV instead of Auth
**Fix Needed:** Update to use `getStaffFromAuth()` helper

### Issue #3: Missing user metadata fields
**Cause:** Data not being read from `user_metadata`
**Fix Needed:** Update endpoint to read from Auth metadata

### Issue #4: Duplicate users appearing
**Cause:** Some code still creating/updating in KV store
**Fix Needed:** Remove KV operations for user data

---

## How to Report Issues

When testing, please note:
1. **Which feature** you were testing
2. **What action** you performed
3. **Error message** (check browser console)
4. **Expected vs actual** behavior

Example:
```
Feature: Staff Sign-Up
Action: Clicked "Sign Up" on an event
Error: "Cannot read property 'level' of null"
Expected: Should sign up successfully
Actual: Got error, sign-up failed
```

---

## Next Steps After Testing

Based on what breaks, we can prioritize:
1. **Critical fixes** - Features that completely break core workflows
2. **Medium priority** - Features with workarounds
3. **Low priority** - Edge cases or rarely used features

Then we'll complete the remaining 24 endpoint migrations systematically.
