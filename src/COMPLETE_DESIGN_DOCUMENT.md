# EventHub - Complete Design & Implementation Blueprint

**Version:** 2.0  
**Last Updated:** November 19, 2025  
**App Name:** Nahky Araby Event Hub  
**Purpose:** Internal Events & Staff Management with Gamification System

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Models & Database Schema](#data-models--database-schema)
4. [User Roles & Permissions](#user-roles--permissions)
5. [Complete Feature List](#complete-feature-list)
6. [Screen-by-Screen Design Specification](#screen-by-screen-design-specification)
7. [Component Library](#component-library)
8. [API Endpoints Reference](#api-endpoints-reference)
9. [Business Logic & Workflows](#business-logic--workflows)
10. [Gamification System](#gamification-system)
11. [Notification System](#notification-system)
12. [Responsive Design Specifications](#responsive-design-specifications)
13. [Technical Stack](#technical-stack)
14. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Executive Summary

### 1.1 App Overview
EventHub is a mobile-first internal staff management application designed to streamline the process of staffing part-time employees for variable company events. The app features a comprehensive gamification system where staff members earn points and advance through levels based on their participation.

### 1.2 Core Value Propositions
- **For Admins:** Simplified event creation, staff management, and participation tracking
- **For Staff:** Transparent event discovery, easy sign-up process, and progress tracking
- **For Organization:** Automated notifications, fair staffing system, and detailed analytics

### 1.3 Key Differentiators
- Gamified leveling system with reverse hierarchy (higher levels = more exclusive)
- Multi-channel notifications (Email, WhatsApp, Telegram)
- Real-time status updates and deadline enforcement
- Mobile-first responsive design
- Role-based access control

---

## 2. System Architecture

### 2.1 Architecture Pattern
**Three-Tier Architecture:**
```
Frontend (React + Tailwind) 
    ↓
Backend API Server (Hono on Supabase Edge Functions)
    ↓
Database Layer (Supabase Postgres)
```

### 2.2 Technology Stack Overview
- **Frontend:** React 18, TypeScript, Tailwind CSS v4
- **Backend:** Supabase Edge Functions (Deno), Hono Web Framework
- **Database:** Supabase Postgres
- **Authentication:** Supabase Auth
- **Notifications:** Resend (Email), WhatsApp Business API, Telegram Bot API
- **UI Components:** shadcn/ui, Lucide React Icons
- **State Management:** React useState/useEffect hooks
- **Date Handling:** Custom date utilities

### 2.3 Deployment Architecture
```
Supabase Project
├── Frontend: Static hosting
├── Edge Functions: /supabase/functions/server/
├── Database: Postgres with RLS policies
├── Auth: Supabase Auth service
└── Storage: Supabase Storage (if needed)
```

---

## 3. Data Models & Database Schema

### 3.1 Database Tables

#### 3.1.1 `events` Table
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE,
  time TEXT NOT NULL,
  duration TEXT,
  location TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  required_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
    -- Status: 'draft' | 'open' | 'closed' | 'cancelled'
  signup_deadline TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_date ON events(date);
```

#### 3.1.2 `event_signups` Table
```sql
CREATE TABLE event_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'signed_up',
    -- Status: 'signed_up' | 'confirmed' | 'cancelled'
  confirmed_at TIMESTAMP WITH TIME ZONE,
  points_awarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(event_id, staff_id)
);

CREATE INDEX idx_signups_event ON event_signups(event_id);
CREATE INDEX idx_signups_staff ON event_signups(staff_id);
CREATE INDEX idx_signups_status ON event_signups(status);
```

#### 3.1.3 `levels` Table
```sql
CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  min_points INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_levels_order ON levels(order_index);
CREATE UNIQUE INDEX idx_levels_name ON levels(name);
```

**Default Levels (Order 0 = highest prestige):**
| Order | Name | Min Points | Description |
|-------|------|-----------|-------------|
| 0 | Diamond Elite | 2000 | Top tier - Most exclusive events |
| 1 | Platinum Pro | 1500 | Advanced level |
| 2 | Gold Star | 1000 | Experienced staff |
| 3 | Silver Member | 500 | Regular contributor |
| 4 | Bronze Starter | 0 | Entry level |

#### 3.1.4 `point_adjustments` Table
```sql
CREATE TABLE point_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  event_id UUID REFERENCES events(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_adjustments_staff ON point_adjustments(staff_id);
CREATE INDEX idx_adjustments_created ON point_adjustments(created_at DESC);
```

#### 3.1.5 `admin_settings2` Table
```sql
CREATE TABLE admin_settings2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_email TEXT,
  admin_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3.1.6 `integration_settings2` Table
```sql
CREATE TABLE integration_settings2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_type TEXT NOT NULL UNIQUE,
    -- Type: 'whatsapp' | 'telegram'
  connected BOOLEAN DEFAULT FALSE,
  phone_number_id TEXT,
  access_token TEXT,
  bot_token TEXT,
  bot_name TEXT,
  connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3.1.7 Supabase Auth (`auth.users`)
Supabase Auth stores user authentication data with custom metadata:

```typescript
user_metadata: {
  name: string;
  role: 'admin' | 'staff';
  points: number;
  level: string;
  phone?: string;
  telegramUsername?: string;
  telegramChatId?: string;
  status?: 'active' | 'pending';
}
```

### 3.2 TypeScript Interfaces

```typescript
export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  points?: number;
  level?: string;
}

export interface Event {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  time: string; // HH:MM format
  duration?: string;
  location: string;
  description?: string;
  notes?: string;
  points: number;
  requiredLevel: string;
  signedUpStaff: string[]; // Array of staff IDs
  signUpTimestamps?: { [staffId: string]: string };
  confirmedStaff?: string[]; // Staff approved to participate
  pointsAwarded?: string[]; // Staff who received points
  createdAt: string;
  status?: 'draft' | 'open' | 'closed' | 'cancelled';
  signupDeadline?: string; // ISO timestamp
}

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  phone?: string;
  telegramUsername?: string;
  telegramChatId?: string;
  points: number;
  level: string;
  status: 'active' | 'pending';
  createdAt: string;
}

export interface Level {
  id: string;
  name: string;
  minPoints: number;
  order: number; // Lower order = higher prestige
}

export interface PointAdjustment {
  id: string;
  staffId: string;
  points: number;
  reason: string;
  timestamp: string;
  adminId: string;
  eventId?: string;
}

export interface PointTransaction {
  id: string;
  staffId: string;
  staffName: string;
  points: number;
  reason: string;
  timestamp: string;
  adminId: string;
  eventId?: string;
}
```

---

## 4. User Roles & Permissions

### 4.1 Admin Role

**Capabilities:**
- ✅ Create, edit, delete, cancel, reinstate events
- ✅ Manage event status (draft → open → closed)
- ✅ View all events regardless of level
- ✅ Invite, edit, delete staff members
- ✅ Manually sign up staff for events
- ✅ Confirm/reject staff participation
- ✅ Award points for event participation
- ✅ Adjust staff points manually (with reason)
- ✅ Create, edit, delete, reorder levels
- ✅ Configure admin contact information
- ✅ Connect/disconnect WhatsApp Business
- ✅ Connect/disconnect Telegram Bot
- ✅ View staffing reports and analytics
- ✅ Access diagnostic tools
- ✅ Send password reset emails

**Access Restrictions:**
- ❌ Cannot sign up for events as participant
- ❌ Cannot see staff-specific progress tracker

### 4.2 Staff Role

**Capabilities:**
- ✅ View events at their level and above (higher prestige)
- ✅ Sign up for open events (before deadline)
- ✅ Cancel their own signups (before deadline)
- ✅ View personal points and level progress
- ✅ Track progress to next level
- ✅ View signup history
- ✅ Update password on first login
- ✅ Receive notifications (email, WhatsApp, Telegram)

**Access Restrictions:**
- ❌ Cannot view draft events
- ❌ Cannot view events below their level (lower prestige)
- ❌ Cannot view other staff members' data
- ❌ Cannot access admin dashboard
- ❌ Cannot create or modify events
- ❌ Cannot adjust points
- ❌ Cannot invite other staff

### 4.3 Permission Matrix

| Feature | Admin | Staff |
|---------|-------|-------|
| View All Events | ✅ | ❌ (filtered by level) |
| Create Event | ✅ | ❌ |
| Edit Event | ✅ | ❌ |
| Delete Event | ✅ | ❌ |
| Cancel Event | ✅ | ❌ |
| View Draft Events | ✅ | ❌ |
| Sign Up for Event | ❌ | ✅ (if eligible) |
| Cancel Signup | ❌ | ✅ (before deadline) |
| Confirm Participation | ✅ | ❌ |
| Award Points | ✅ | ❌ |
| Adjust Points | ✅ | ❌ |
| Invite Staff | ✅ | ❌ |
| Edit Staff Profile | ✅ | ❌ |
| Delete Staff | ✅ | ❌ |
| View Own Progress | ✅ | ✅ |
| View All Staff Data | ✅ | ❌ |
| Manage Levels | ✅ | ❌ |
| Configure Integrations | ✅ | ❌ |
| View Reports | ✅ | ❌ |

---

## 5. Complete Feature List

### 5.1 Authentication & Onboarding
- [ ] **Login Screen**
  - Email/password authentication
  - Error handling
  - Session management
  - Password visibility toggle

- [ ] **Password Setup (First-time Staff)**
  - Temporary password validation
  - New password requirements
  - Confirmation step
  - Auto-login after setup

- [ ] **Session Management**
  - Automatic session restoration
  - Token refresh
  - Logout functionality

### 5.2 Admin Features

#### Event Management
- [ ] **Create Event**
  - Name, date(s), time, location
  - Duration field (optional)
  - Description and notes
  - Points assignment
  - Required level selection
  - Signup deadline setting
  - Status selection (draft/open)
  - Multi-date events support

- [ ] **Edit Event**
  - Update all event fields
  - Status transitions
  - Real-time validation

- [ ] **Delete Event**
  - Confirmation dialog
  - Permanent removal

- [ ] **Cancel Event**
  - Confirmation dialog
  - Auto-notify signed-up staff
  - Email notifications
  - Telegram notifications (if configured)
  - Preserve event data (soft delete)

- [ ] **Reinstate Event**
  - Restore cancelled event
  - Notify staff

- [ ] **Close Event**
  - Select approved participants
  - Reject unapproved signups
  - Send status notifications
  - Prevent further signups

- [ ] **Event Status Management**
  - Draft: Visible only to admin
  - Open: Visible to eligible staff, accepting signups
  - Closed: No more signups, selection made
  - Cancelled: Event not happening

#### Staff Management
- [ ] **Invite Staff**
  - Email input
  - Name input
  - Phone number (optional)
  - Auto-generate temporary password
  - Send invitation email
  - Set initial level (Bronze Starter)
  - Set status (active/pending)

- [ ] **Edit Staff Profile**
  - Update name
  - Update email
  - Update phone
  - Update Telegram username/chat ID
  - Change level manually
  - Save changes

- [ ] **Delete Staff**
  - Confirmation dialog
  - Cascade delete signups
  - Preserve point adjustment history

- [ ] **Manually Sign Up Staff**
  - Select event
  - Multi-select staff
  - Bulk signup action
  - Prevent duplicates

- [ ] **View Staff List**
  - All staff members displayed
  - Show points, level, status
  - Click to edit
  - Search/filter capability

#### Points & Rewards Management
- [ ] **Confirm Participation**
  - Select staff members
  - Award event points
  - Record transaction
  - Update staff levels automatically
  - Send confirmation to staff

- [ ] **Bulk Confirm All**
  - One-click confirm all signed-up staff
  - Award points to all
  - Update all levels

- [ ] **Manual Point Adjustment**
  - Select staff member
  - Enter points (positive or negative)
  - Required reason field
  - Record adjustment
  - Update level automatically

- [ ] **View Points Log**
  - All point transactions
  - Filter by staff
  - Filter by date
  - Show reason and admin
  - Event-linked transactions

#### Level Management
- [ ] **Create Level**
  - Name input
  - Minimum points threshold
  - Description (optional)
  - Auto-assign order

- [ ] **Edit Level**
  - Update name
  - Update min points
  - Update description

- [ ] **Delete Level**
  - Confirmation dialog
  - Check if in use
  - Prevent deletion if assigned to events/staff

- [ ] **Reorder Levels**
  - Drag-and-drop interface
  - Update order_index
  - Save new order

#### Settings & Configuration
- [ ] **Admin Contact Settings**
  - Admin email input
  - Admin phone input
  - Save to database
  - Display in instructions

- [ ] **WhatsApp Integration**
  - Connect WhatsApp Business
  - Phone Number ID input
  - Access Token input
  - Test connection
  - View status
  - Disconnect

- [ ] **Telegram Integration**
  - Connect Telegram Bot
  - Bot Token input
  - Test connection
  - View bot name
  - Clear old updates
  - Get recent chat IDs
  - Test specific chat ID
  - Disconnect

- [ ] **Notification Debug Tool**
  - View eligible staff for notifications
  - Check Telegram integration status
  - View staff chat IDs
  - Test notifications

#### Reports & Analytics
- [ ] **Staffing Overview**
  - Upcoming events list
  - Events needing attention
  - Signup counts per event
  - Status indicators
  - Quick actions (close event, etc.)

- [ ] **Points Leaderboard**
  - Top performers
  - Recent point changes
  - Level distribution

### 5.3 Staff Features

#### Event Discovery
- [ ] **View Available Events**
  - See events at their level and above
  - Filter: Upcoming, Signed Up, Past
  - See event details
  - See points offered
  - See signup deadline

- [ ] **Event Details View**
  - Event name, date(s), time
  - Location
  - Duration (if set)
  - Description & notes
  - Points reward
  - Required level
  - Signup deadline
  - Capacity info (if set)

#### Event Participation
- [ ] **Sign Up for Event**
  - Check eligibility (level)
  - Check deadline
  - One-click signup
  - Confirmation toast
  - Update UI instantly

- [ ] **Cancel Signup**
  - Before deadline only
  - Confirmation dialog
  - Update UI instantly

- [ ] **View Signup Status**
  - Signed up indicator
  - Confirmation status
  - Points awarded status

#### Progress Tracking
- [ ] **Progress Tracker Widget**
  - Current points display
  - Current level badge
  - Progress bar to next level
  - Points needed calculation
  - Animated transitions

- [ ] **Level Visualization**
  - All levels displayed
  - Current level highlighted
  - Next level highlighted
  - Lock icons for future levels

### 5.4 Cross-Role Features

- [ ] **Navigation**
  - Tab-based navigation
  - Role-specific tabs
  - Logout button
  - User name display

- [ ] **Notifications (Toast)**
  - Success messages
  - Error messages
  - Info messages
  - Auto-dismiss

- [ ] **Loading States**
  - Skeleton screens
  - Spinner indicators
  - Disabled states

- [ ] **Error Handling**
  - Network errors
  - Validation errors
  - Permission errors
  - User-friendly messages

---

## 6. Screen-by-Screen Design Specification

### 6.1 Login Screen (`LoginScreen.tsx`)

**Purpose:** Authenticate users and direct to appropriate dashboard

**Layout (Mobile):**
```
┌─────────────────────────────┐
│                             │
│        [App Logo]           │  ← Logo image (300x300px)
│                             │
│   Nahky Araby Event Hub     │  ← App title
│                             │
│  ┌───────────────────────┐  │
│  │ Email                 │  │  ← Email input
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Password          [👁] │  │  ← Password input + toggle
│  └───────────────────────┘  │
│                             │
│  [     Login Button      ]  │  ← Primary action
│                             │
│  [Error message here]       │  ← Error alert (conditional)
│                             │
└─────────────────────────────┘
```

**Components:**
- Card container with shadow
- Logo image (centered)
- App title (large, bold, centered)
- Email input field (type="email")
- Password input field (type="password" with toggle)
- Login button (full width, primary style)
- Error alert (conditional rendering)

**States:**
- Default
- Loading (button disabled, spinner shown)
- Error (red alert with error message)
- Success (transition to dashboard)

**Validations:**
- Email format validation
- Non-empty password
- Network error handling

**Interactions:**
1. User enters email and password
2. Clicks "Login" button
3. App validates and sends auth request
4. On success: Redirect to Admin or Staff Dashboard
5. On error: Show error message
6. Session persists until logout

**Desktop Adjustments:**
- Center card in viewport
- Max width: 400px
- Larger logo: 400x400px

---

### 6.2 Password Setup Screen (`PasswordSetup.tsx`)

**Purpose:** First-time staff password creation

**Layout (Mobile):**
```
┌─────────────────────────────┐
│  Set Up Your Password       │  ← Header
│                             │
│  Welcome! Please set up     │  ← Instructions
│  your password to continue. │
│                             │
│  ┌───────────────────────┐  │
│  │ Temporary Password    │  │  ← Temp password input
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ New Password      [👁] │  │  ← New password input
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Confirm Password  [👁] │  │  ← Confirm password input
│  └───────────────────────┘  │
│                             │
│  [  Set Password Button  ]  │  ← Primary action
│                             │
│  [← Back to Login]          │  ← Secondary action
│                             │
└─────────────────────────────┘
```

**Validations:**
- Temporary password must match
- New password minimum 8 characters
- Passwords must match
- Cannot reuse temporary password

**Flow:**
1. Staff receives invitation email with temp password
2. Logs in → Redirected to password setup
3. Enters temp password
4. Creates new password
5. Confirms new password
6. Submits → Auto-logged in → Dashboard

---

### 6.3 Admin Dashboard (`AdminDashboard.tsx`)

**Purpose:** Central hub for all admin operations

**Layout (Mobile):**
```
┌─────────────────────────────────────────┐
│ [Logo] Nahky Araby Event Hub    [⚙ ⋮] │  ← Header with menu
├─────────────────────────────────────────┤
│ [Events] [Staff] [Overview] [Settings] │  ← Tab navigation
├─────────────────────────────────────────┤
│                                         │
│         [ACTIVE TAB CONTENT]            │  ← Dynamic content area
│                                         │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**Header Components:**
- App logo (left)
- App title
- Settings dropdown menu (right):
  - User name
  - Admin email
  - View Instructions
  - Reset/Migration options
  - Logout

**Tabs:**
1. **Events** - Event management interface
2. **Staff** - Staff management interface
3. **Overview** - Staffing reports and analytics
4. **Settings** - Configuration panel
5. **Points Log** - Transaction history
6. **Debug** - Notification diagnostics (dev tool)

**Desktop Layout:**
```
┌───────────────────────────────────────────────────────────┐
│ [Logo] Nahky Araby Event Hub              [⚙ Settings ▼] │
├───────────────────────────────────────────────────────────┤
│ [Events] [Staff] [Overview] [Settings] [Points Log]       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│                     [TAB CONTENT]                         │
│                                                           │
│                    (Expanded width)                       │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

### 6.4 Admin Events Tab (`EventManagement.tsx`)

**Purpose:** Create, view, and manage events

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│  Events Management                  │
│                                     │
│  [+ Create New Event]               │  ← Primary action
│                                     │
│  Filter: [All ▼] [Search...]       │  ← Filters
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Summer Festival            │ │
│  │ June 15, 2025 • 6:00 PM      │ │
│  │ 📍 Main Hall • 100 pts       │ │
│  │ 👥 5 signed up               │ │
│  │ Status: Open                 │ │
│  │ [Edit] [Cancel] [Close]      │ │  ← Actions
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Holiday Party              │ │
│  │ Dec 20, 2024 • 7:00 PM      │ │
│  │ 📍 Conference Room • 150 pts │ │
│  │ 👥 12 signed up              │ │
│  │ Status: Closed               │ │
│  │ [View] [Reinstate]           │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Event Card Components:**
- Event name (heading)
- Date and time with calendar icon
- Location with pin icon
- Points reward
- Signup count with people icon
- Status badge (color-coded)
- Action buttons

**Status Colors:**
- Draft: Gray
- Open: Green
- Closed: Blue
- Cancelled: Red

**Action Buttons:**
- Edit: Opens edit dialog
- Cancel: Shows confirmation → Sends notifications
- Close: Opens selection dialog → Choose approved staff
- Delete: Confirmation → Permanent removal
- Reinstate: Restore cancelled event

---

#### Create/Edit Event Dialog

**Layout:**
```
┌─────────────────────────────────────┐
│  Create New Event              [✕] │  ← Modal header
├─────────────────────────────────────┤
│                                     │
│  Event Name *                       │
│  ┌───────────────────────────────┐ │
│  │ Summer Festival               │ │
│  └───────────────────────────────┘ │
│                                     │
│  Start Date *        End Date       │
│  ┌─────────────┐   ┌─────────────┐ │
│  │ 06/15/2025  │   │ 06/16/2025  │ │
│  └─────────────┘   └─────────────┘ │
│                                     │
│  Time *              Duration       │
│  ┌─────────────┐   ┌─────────────┐ │
│  │ 18:00       │   │ 3 hours     │ │
│  └─────────────┘   └─────────────┘ │
│                                     │
│  Location *                         │
│  ┌───────────────────────────────┐ │
│  │ Main Hall                     │ │
│  └───────────────────────────────┘ │
│                                     │
│  Points Reward *                    │
│  ┌───────────────────────────────┐ │
│  │ 100                           │ │
│  └───────────────────────────────┘ │
│                                     │
│  Required Level *                   │
│  ┌───────────────────────────────┐ │
│  │ Bronze Starter            [▼] │ │
│  └───────────────────────────────┘ │
│                                     │
│  Signup Deadline                    │
│  ┌───────────────────────────────┐ │
│  │ 06/14/2025 12:00 PM           │ │
│  └───────────────────────────────┘ │
│                                     │
│  Status *                           │
│  ┌───────────────────────────────┐ │
│  │ Open                      [▼] │ │
│  └───────────────────────────────┘ │
│                                     │
│  Description                        │
│  ┌───────────────────────────────┐ │
│  │ Annual summer celebration...  │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  Notes (Internal)                   │
│  ┌───────────────────────────────┐ │
│  │ Need setup crew...            │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  [Cancel]        [Create Event]    │  ← Actions
│                                     │
└─────────────────────────────────────┘
```

**Field Validations:**
- Event Name: Required, max 100 chars
- Start Date: Required, cannot be in past
- End Date: Optional, must be >= start date
- Time: Required, HH:MM format
- Duration: Optional, text field
- Location: Required, max 200 chars
- Points: Required, positive integer
- Required Level: Required, select from available levels
- Signup Deadline: Optional, must be before event date
- Status: Required, select from [draft, open, closed, cancelled]
- Description: Optional, max 500 chars
- Notes: Optional, max 500 chars

**Behavior:**
- Date picker for start/end dates
- Time picker for time field
- Dropdown for level selection
- Dropdown for status selection
- Auto-save draft
- Real-time validation
- Submit → Close dialog → Refresh event list → Show toast

---

#### Close Event Dialog

**Purpose:** Select which staff members to approve for participation

**Layout:**
```
┌─────────────────────────────────────┐
│  Close Event: Summer Festival  [✕] │
├─────────────────────────────────────┤
│                                     │
│  Select staff to approve for        │
│  participation. Approved staff      │
│  will receive points.               │
│                                     │
│  Signed Up Staff (5):               │
│                                     │
│  ☑ Sarah Johnson (Silver Member)   │  ← Checkboxes
│  ☑ Mike Chen (Gold Star)            │
│  ☐ Emma Davis (Bronze Starter)     │
│  ☑ John Smith (Platinum Pro)        │
│  ☑ Lisa Wong (Silver Member)        │
│                                     │
│  [Select All] [Deselect All]       │  ← Quick actions
│                                     │
│  Award 100 points to each           │  ← Info
│  approved staff member.             │
│                                     │
│  [Cancel]    [Close & Approve]     │  ← Actions
│                                     │
└─────────────────────────────────────┘
```

**Behavior:**
1. Shows all signed-up staff
2. All checked by default
3. Admin unchecks rejected staff
4. Click "Close & Approve"
5. Points awarded to checked staff
6. Telegram notifications sent
7. Event status → "closed"
8. Dialog closes

---

### 6.5 Admin Staff Tab (`StaffManagement.tsx`)

**Purpose:** Invite, view, and manage staff members

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│  Staff Management                   │
│                                     │
│  [+ Invite New Staff]               │  ← Primary action
│                                     │
│  Search: [_________________]        │  ← Search bar
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 👤 Sarah Johnson              │ │
│  │ sarah.johnson@company.com     │ │
│  │ 📞 +1-555-0123               │ │
│  │ ⭐ 850 pts • Silver Member    │ │
│  │ 📱 @sarah_tel                 │ │
│  │ Status: Active                │ │
│  │ [Edit] [Reset PW] [Delete]    │ │  ← Actions
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 👤 Mike Chen                  │ │
│  │ mike.chen@company.com         │ │
│  │ 📞 +1-555-0124               │ │
│  │ ⭐ 1250 pts • Gold Star       │ │
│  │ 📱 @mikechen                  │ │
│  │ Status: Active                │ │
│  │ [Edit] [Reset PW] [Delete]    │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Staff Card Components:**
- Profile icon
- Name (heading)
- Email
- Phone (with icon)
- Points and level (with star icon)
- Telegram username (with icon)
- Status badge
- Action buttons

**Action Buttons:**
- Edit: Opens edit dialog
- Reset PW: Sends password reset email
- Delete: Confirmation → Permanent removal

---

#### Invite Staff Dialog

**Layout:**
```
┌─────────────────────────────────────┐
│  Invite New Staff              [✕] │
├─────────────────────────────────────┤
│                                     │
│  Email Address *                    │
│  ┌───────────────────────────────┐ │
│  │ newstaff@company.com          │ │
│  └───────────────────────────────┘ │
│                                     │
│  Full Name *                        │
│  ┌───────────────────────────────┐ │
│  │ Alex Thompson                 │ │
│  └───────────────────────────────┘ │
│                                     │
│  Phone Number (Optional)            │
│  ┌───────────────────────────────┐ │
│  │ +1-555-0125                   │ │
│  └───────────────────────────────┘ │
│                                     │
│  ℹ️ A temporary password will be    │
│    sent to the staff member's      │
│    email. They will be prompted    │
│    to set a new password on        │
│    first login.                    │
│                                     │
│  [Cancel]        [Send Invite]     │
│                                     │
└─────────────────────────────────────┘
```

**Validations:**
- Email: Required, valid format, unique
- Name: Required, max 100 chars
- Phone: Optional, valid format

**Behavior:**
1. Admin enters staff info
2. Clicks "Send Invite"
3. System creates user account
4. System generates temp password
5. System sends invitation email
6. Staff status: "pending"
7. Dialog closes
8. Staff list refreshes

---

#### Edit Staff Dialog

**Layout:**
```
┌─────────────────────────────────────┐
│  Edit Staff Member             [✕] │
├─────────────────────────────────────┤
│                                     │
│  Full Name *                        │
│  ┌───────────────────────────────┐ │
│  │ Sarah Johnson                 │ │
│  └───────────────────────────────┘ │
│                                     │
│  Email Address *                    │
│  ┌───────────────────────────────┐ │
│  │ sarah.johnson@company.com     │ │
│  └───────────────────────────────┘ │
│                                     │
│  Phone Number                       │
│  ┌───────────────────────────────┐ │
│  │ +1-555-0123                   │ │
│  └───────────────────────────────┘ │
│                                     │
│  Telegram Username                  │
│  ┌───────────────────────────────┐ │
│  │ @sarah_tel                    │ │
│  └───────────────────────────────┘ │
│                                     │
│  Level *                            │
│  ┌───────────────────────────────┐ │
│  │ Silver Member             [▼] │ │
│  └───────────────────────────────┘ │
│                                     │
│  Current Points: 850                │
│  [Adjust Points]                    │  ← Link to adjust dialog
│                                     │
│  [Cancel]           [Save Changes] │
│                                     │
└─────────────────────────────────────┘
```

**Behavior:**
- Pre-filled with current data
- Email updates require re-verification
- Level dropdown shows all available levels
- "Adjust Points" opens separate dialog
- Save → Update database → Refresh list

---

### 6.6 Admin Overview Tab (`StaffingOverview.tsx`)

**Purpose:** High-level view of staffing status and upcoming events

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│  Staffing Overview                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📊 Summary Statistics          │ │
│  │                                │ │
│  │  Total Staff: 24               │ │
│  │  Active Events: 5              │ │
│  │  Upcoming Events: 3            │ │
│  │  Events Needing Staff: 2       │ │
│  └───────────────────────────────┘ │
│                                     │
│  Upcoming Events                    │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Summer Festival             │ │
│  │ June 15, 2025                  │ │
│  │                                │ │
│  │ 👥 Signups: 5 / 10             │ │
│  │ ⭐ Required: Gold Star          │ │
│  │ 📍 Main Hall                   │ │
│  │                                │ │
│  │ Status: Open ⚠️ Low signups    │ │
│  │                                │ │
│  │ [View Event] [Close Event]     │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Holiday Party               │ │
│  │ Dec 20, 2024                   │ │
│  │                                │ │
│  │ 👥 Signups: 12 / 15            │ │
│  │ ⭐ Required: Silver Member      │ │
│  │ 📍 Conference Room             │ │
│  │                                │ │
│  │ Status: Open ✅ Good staffing   │ │
│  │                                │ │
│  │ [View Event] [Close Event]     │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Summary statistics card
- Upcoming events list
- Staffing status indicators:
  - ⚠️ Low signups (< 50% capacity)
  - ✅ Good staffing (≥ 50% capacity)
  - 🔴 Overstaffed (> 100% capacity)
- Quick action buttons
- Sort by date (ascending)

---

### 6.7 Admin Settings Tab (`AdminSettings.tsx`)

**Purpose:** Configure app settings, integrations, and level management

**Layout (Mobile - Accordion Style):**
```
┌─────────────────────────────────────┐
│  Settings                           │
│                                     │
│  ▼ Admin Contact Information        │  ← Accordion section
│  ┌───────────────────────────────┐ │
│  │                                │ │
│  │ Admin Email                    │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │ admin@company.com        │  │ │
│  │ └──────────────────────────┘  │ │
│  │                                │ │
│  │ Admin Phone                    │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │ +1-555-0100              │  │ │
│  │ └──────────────────────────┘  │ │
│  │                                │ │
│  │ [Save Contact Info]            │ │
│  │                                │ │
│  └───────────────────────────────┘ │
│                                     │
│  ▼ Level Management                 │
│  ┌───────────────────────────────┐ │
│  │                                │ │
│  │ [+ Create New Level]           │ │
│  │                                │ │
│  │ Current Levels (Drag to reorder)│
│  │                                │ │
│  │ ☰ Diamond Elite (2000 pts)    │ │
│  │   [Edit] [Delete]              │ │
│  │                                │ │
│  │ ☰ Platinum Pro (1500 pts)     │ │
│  │   [Edit] [Delete]              │ │
│  │                                │ │
│  │ ☰ Gold Star (1000 pts)        │ │
│  │   [Edit] [Delete]              │ │
│  │                                │ │
│  │ ☰ Silver Member (500 pts)     │ │
│  │   [Edit] [Delete]              │ │
│  │                                │ │
│  │ ☰ Bronze Starter (0 pts)      │ │
│  │   [Edit] [Delete]              │ │
│  │                                │ │
│  └───────────────────────────────┘ │
│                                     │
│  ▼ WhatsApp Integration             │
│  ┌───────────────────────────────┐ │
│  │                                │ │
│  │ Status: ✅ Connected            │ │
│  │ Phone: +1-555-0100             │ │
│  │                                │ │
│  │ [Test Connection]              │ │
│  │ [Disconnect]                   │ │
│  │                                │ │
│  │ --- OR ---                     │ │
│  │                                │ │
│  │ Phone Number ID                │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │                          │  │ │
│  │ └──────────────────────────┘  │ │
│  │                                │ │
│  │ Access Token                   │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │                          │  │ │
│  │ └──────────────────────────┘  │ │
│  │                                │ │
│  │ [Connect WhatsApp]             │ │
│  │                                │ │
│  └───────────────────────────────┘ │
│                                     │
│  ▼ Telegram Integration             │
│  ┌───────────────────────────────┐ │
│  │                                │ │
│  │ Status: ✅ Connected            │ │
│  │ Bot: @EventHubBot              │ │
│  │                                │ │
│  │ [Test Bot] [Get Chat IDs]      │ │
│  │ [Clear Updates] [Disconnect]   │ │
│  │                                │ │
│  │ --- OR ---                     │ │
│  │                                │ │
│  │ Bot Token                      │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │                          │  │ │
│  │ └──────────────────────────┘  │ │
│  │                                │ │
│  │ [Connect Telegram]             │ │
│  │                                │ │
│  └───────────────────────────────┘ │
│                                     │
│  ▼ System Management                │
│  ┌───────────────────────────────┐ │
│  │                                │ │
│  │ [Reset System]                 │ │
│  │ [Run Migration]                │ │
│  │ [View Logs]                    │ │
│  │                                │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Accordion Sections:**
1. **Admin Contact Information**
2. **Level Management**
3. **WhatsApp Integration**
4. **Telegram Integration**
5. **System Management**

---

#### Create/Edit Level Dialog

**Layout:**
```
┌─────────────────────────────────────┐
│  Create New Level              [✕] │
├─────────────────────────────────────┤
│                                     │
│  Level Name *                       │
│  ┌───────────────────────────────┐ │
│  │ Emerald Elite                 │ │
│  └───────────────────────────────┘ │
│                                     │
│  Minimum Points *                   │
│  ┌───────────────────────────────┐ │
│  │ 3000                          │ │
│  └───────────────────────────────┘ │
│                                     │
│  Description (Optional)             │
│  ┌───────────────────────────────┐ │
│  │ Highest tier for top          │ │
│  │ performers...                 │ │
│  └───────────────────────────────┘ │
│                                     │
│  [Cancel]         [Create Level]   │
│                                     │
└─────────────────────────────────────┘
```

**Validations:**
- Level Name: Required, unique, max 50 chars
- Min Points: Required, non-negative integer, must be unique
- Description: Optional, max 200 chars

---

### 6.8 Admin Points Log Tab (`PointsLog.tsx`)

**Purpose:** View all point transactions and adjustments

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│  Points Transaction Log             │
│                                     │
│  Filter: [All Staff ▼] [Date ▼]    │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ⬆ +100 points                  │ │
│  │ Sarah Johnson                  │ │
│  │ Reason: Summer Festival        │ │
│  │ By: Admin • June 16, 2025      │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ⬇ -50 points                   │ │
│  │ Mike Chen                      │ │
│  │ Reason: Missed event           │ │
│  │ By: Admin • June 15, 2025      │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ⬆ +150 points                  │ │
│  │ Emma Davis                     │ │
│  │ Reason: Holiday Party          │ │
│  │ By: Admin • Dec 21, 2024       │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Transaction Card Components:**
- Direction indicator (⬆ positive, ⬇ negative)
- Points amount (color-coded)
- Staff member name
- Reason/description
- Admin who made adjustment
- Timestamp
- Event link (if applicable)

**Filters:**
- By staff member
- By date range
- By event
- By adjustment type (event/manual)

---

### 6.9 Staff Dashboard (`StaffDashboard.tsx`)

**Purpose:** Staff member's main view for events and progress

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│ [Logo] Welcome, Sarah!         [⋮] │  ← Header with menu
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │  ← Progress Widget
│  │ Your Progress                  │ │
│  │                                │ │
│  │ ⭐ Silver Member                │ │
│  │ 850 / 1000 points              │ │
│  │ ████████░░░░ 85%               │ │  ← Progress bar
│  │                                │ │
│  │ 🎯 150 points to Gold Star     │ │
│  └───────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ [Events] [Progress]                 │  ← Tab navigation
├─────────────────────────────────────┤
│                                     │
│         [ACTIVE TAB CONTENT]        │
│                                     │
└─────────────────────────────────────┘
```

**Header Components:**
- App logo
- Welcome message with user name
- Dropdown menu (right):
  - View profile
  - Change password
  - Logout

**Progress Widget (Always Visible):**
- Current level badge
- Current points / Next level points
- Visual progress bar
- Points needed message
- Animated updates

**Tabs:**
1. **Events** - Available events list
2. **Progress** - Detailed level tracker

---

### 6.10 Staff Events Tab (`EventList.tsx`)

**Purpose:** Browse and sign up for available events

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│  Available Events                   │
│                                     │
│  Filter: [Upcoming ▼]               │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Summer Festival             │ │
│  │ June 15-16, 2025               │ │
│  │ 🕐 6:00 PM • 3 hours           │ │
│  │ 📍 Main Hall                   │ │
│  │ ⭐ 100 points                   │ │
│  │ 🎯 Required: Silver Member     │ │
│  │                                │ │
│  │ Description: Annual summer     │ │
│  │ celebration with activities... │ │
│  │                                │ │
│  │ ⏰ Signup deadline:             │ │
│  │    June 14, 12:00 PM           │ │
│  │                                │ │
│  │ [   Sign Up for Event   ]     │ │  ← Action button
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Holiday Party               │ │
│  │ Dec 20, 2024                   │ │
│  │ 🕐 7:00 PM • 4 hours           │ │
│  │ 📍 Conference Room             │ │
│  │ ⭐ 150 points                   │ │
│  │ 🎯 Required: Bronze Starter    │ │
│  │                                │ │
│  │ ✅ You're signed up!            │ │  ← Status indicator
│  │                                │ │
│  │ [   Cancel Signup   ]          │ │  ← Alternative action
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Filter Options:**
- Upcoming: Events in the future
- Signed Up: Events user has signed up for
- Past: Completed events

**Event Card States:**
1. **Available to Sign Up:**
   - Green "Sign Up" button
   - Shows all event details
   - Deadline visible

2. **Signed Up:**
   - Green checkmark badge
   - "Signed up!" message
   - Red "Cancel Signup" button (if before deadline)

3. **Deadline Passed:**
   - Gray badge "Signup closed"
   - No action buttons

4. **Confirmed:**
   - Blue badge "Confirmed"
   - Message: "You've been selected!"

5. **Not Selected:**
   - Gray badge "Not selected"
   - Message: "Thank you for signing up"

6. **Completed:**
   - Points badge showing earned points
   - No action buttons

**Event Card Components:**
- Calendar icon + date(s)
- Clock icon + time and duration
- Location icon + venue
- Star icon + points reward
- Target icon + required level
- Description (expandable)
- Deadline countdown
- Status badge
- Action button (context-dependent)

---

### 6.11 Staff Progress Tab (`ProgressTracker.tsx`)

**Purpose:** Detailed visualization of level progression

**Layout (Mobile):**
```
┌─────────────────────────────────────┐
│  Your Progress Journey              │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Current Status                 │ │
│  │                                │ │
│  │    ⭐ Silver Member              │ │
│  │         850 points             │ │
│  │                                │ │
│  └───────────────────────────────┘ │
│                                     │
│  Level Progression                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 💎 Diamond Elite               │ │
│  │ 2000 points required           │ │
│  │ 🔒 Locked • 1150 pts needed    │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🏆 Platinum Pro                 │ │
│  │ 1500 points required           │ │
│  │ 🔒 Locked • 650 pts needed     │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ⭐ Gold Star                    │ │  ← Next level highlight
│  │ 1000 points required           │ │
│  │ 🎯 Next Level! 150 pts away    │ │
│  │                                │ │
│  │ ████████░░░░ 85%               │ │  ← Progress bar
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ⚡ Silver Member                 │ │  ← Current level
│  │ 500 points required            │ │
│  │ ✅ Current Level                │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🥉 Bronze Starter               │ │  ← Completed level
│  │ 0 points required              │ │
│  │ ✅ Completed                    │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Level Card States:**
1. **Locked (Future Levels):**
   - Lock icon
   - Gray background
   - Points needed message

2. **Next Level (Immediate Goal):**
   - Target icon
   - Green highlight border
   - Progress bar
   - "X pts away" message
   - Animated glow effect

3. **Current Level:**
   - Checkmark badge
   - Blue highlight
   - "Current Level" message

4. **Completed (Past Levels):**
   - Checkmark badge
   - Green background
   - "Completed" message

**Visual Hierarchy:**
- Levels displayed top-to-bottom (highest to lowest prestige)
- Current level is visually distinct
- Next level has special highlighting
- Progress bar animates on page load

---

## 7. Component Library

### 7.1 Core UI Components (shadcn/ui)

Located in `/components/ui/`:

- **accordion.tsx** - Collapsible sections (Settings tab)
- **alert-dialog.tsx** - Confirmation dialogs (Delete, Cancel actions)
- **alert.tsx** - Error/info messages
- **badge.tsx** - Status indicators, level badges
- **button.tsx** - Primary, secondary, destructive variants
- **card.tsx** - Container for content blocks
- **checkbox.tsx** - Multi-select (Close event dialog)
- **dialog.tsx** - Modal windows (Create/Edit forms)
- **dropdown-menu.tsx** - User menu, filter dropdowns
- **input.tsx** - Text input fields
- **label.tsx** - Form labels
- **progress.tsx** - Progress bars (Level tracker)
- **select.tsx** - Dropdown selections (Level, Status)
- **separator.tsx** - Visual dividers
- **switch.tsx** - Toggle settings
- **table.tsx** - Data tables (Staff list)
- **tabs.tsx** - Navigation tabs (Dashboard sections)
- **textarea.tsx** - Multi-line input (Description, Notes)
- **toast.tsx** (Sonner) - Notification toasts

### 7.2 Custom Components

#### 7.2.1 `LoginScreen.tsx`
**Purpose:** Authentication interface

**Props:**
```typescript
interface LoginScreenProps {
  onLogin: (email: string, password: string) => boolean | Promise<any>;
  onPasswordSetup?: (email: string, tempPassword: string, newPassword: string) => Promise<boolean>;
}
```

**Features:**
- Email/password form
- Password visibility toggle
- Error handling
- Password setup flow for new users

---

#### 7.2.2 `PasswordSetup.tsx`
**Purpose:** First-time password creation for new staff

**Props:**
```typescript
interface PasswordSetupProps {
  email: string;
  tempPassword: string;
  onSetPassword: (email: string, tempPassword: string, newPassword: string) => Promise<boolean>;
  onBack: () => void;
}
```

**Features:**
- Temporary password validation
- New password requirements
- Confirmation field
- Back to login link

---

#### 7.2.3 `AdminDashboard.tsx`
**Purpose:** Main admin interface container

**Props:**
```typescript
interface AdminDashboardProps {
  events: Event[];
  staffMembers: StaffMember[];
  pointAdjustments: PointAdjustment[];
  pointTransactions: PointTransaction[];
  levels: Level[];
  adminEmail: string;
  adminPhone: string;
  onAddEvent: (event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onUpdateEvent: (eventId: string, event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onCancelEvent: (eventId: string) => void;
  onReinstateEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddStaff: (email: string, name: string, phone: string) => StaffMember | null;
  onUpdateStaff: (staffId: string, name: string, email: string, phone: string, level: string, telegramUsername: string) => void;
  onDeleteStaff: (staffId: string) => void;
  onAdjustPoints: (staffId: string, pointsChange: number, reason: string) => void;
  onSendPasswordReset: (staffId: string) => void;
  onSaveAdminSettings: (email: string, phone: string) => Promise<void>;
  onUpdateCurrentUser: (updates: Partial<User>) => void;
  onLogout: () => void;
  currentUser: User;
  onAddLevel: (name: string, minPoints: number) => void;
  onUpdateLevel: (levelId: string, name: string, minPoints: number) => void;
  onDeleteLevel: (levelId: string) => void;
  onReorderLevels: (levels: Level[]) => void;
  whatsAppConnected: boolean;
  whatsAppPhoneNumber: string;
  telegramConnected: boolean;
  telegramBotName: string;
  onRefreshData: () => void;
}
```

**Features:**
- Tab navigation
- User menu dropdown
- Dynamic content rendering per tab

---

#### 7.2.4 `EventManagement.tsx`
**Purpose:** Event CRUD operations

**Props:**
```typescript
interface EventManagementProps {
  events: Event[];
  levels: Level[];
  staffMembers: StaffMember[];
  onAddEvent: (event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onUpdateEvent: (eventId: string, event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onCancelEvent: (eventId: string) => void;
  onReinstateEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
}
```

**Features:**
- Event list with filters
- Create/Edit dialog
- Close event dialog
- Cancel/Reinstate/Delete actions
- Status badges

---

#### 7.2.5 `StaffManagement.tsx`
**Purpose:** Staff CRUD operations

**Props:**
```typescript
interface StaffManagementProps {
  staffMembers: StaffMember[];
  levels: Level[];
  onAddStaff: (email: string, name: string, phone: string) => StaffMember | null;
  onUpdateStaff: (staffId: string, name: string, email: string, phone: string, level: string, telegramUsername: string) => void;
  onDeleteStaff: (staffId: string) => void;
  onSendPasswordReset: (staffId: string) => void;
  onAdjustPoints: (staffId: string, pointsChange: number, reason: string) => void;
}
```

**Features:**
- Staff list with search
- Invite dialog
- Edit dialog
- Point adjustment dialog
- Delete confirmation
- Password reset action

---

#### 7.2.6 `StaffingOverview.tsx`
**Purpose:** Event staffing analytics

**Props:**
```typescript
interface StaffingOverviewProps {
  events: Event[];
  staffMembers: StaffMember[];
}
```

**Features:**
- Summary statistics
- Upcoming events list
- Staffing indicators
- Quick actions

---

#### 7.2.7 `AdminSettings.tsx`
**Purpose:** App configuration

**Props:**
```typescript
interface AdminSettingsProps {
  onSave: (email: string, phone: string) => Promise<void>;
  onUpdateCurrentUser: (updates: Partial<User>) => void;
  initialEmail: string;
  initialPhone: string;
  currentUser: User;
  levels: Level[];
  onAddLevel: (name: string, minPoints: number) => void;
  onUpdateLevel: (levelId: string, name: string, minPoints: number) => void;
  onDeleteLevel: (levelId: string) => void;
  onReorderLevels: (levels: Level[]) => void;
  whatsAppConnected: boolean;
  whatsAppPhoneNumber: string;
  telegramConnected: boolean;
  telegramBotName: string;
  onRefreshData: () => void;
}
```

**Features:**
- Admin contact form
- Level management with drag-drop
- WhatsApp connection form
- Telegram connection form
- System tools

---

#### 7.2.8 `PointsLog.tsx`
**Purpose:** Transaction history viewer

**Props:**
```typescript
interface PointsLogProps {
  pointAdjustments: PointAdjustment[];
  pointTransactions: PointTransaction[];
  staffMembers: StaffMember[];
  events: Event[];
  currentUser: User;
}
```

**Features:**
- Combined transaction list
- Staff/date filters
- Event linking
- Reason display

---

#### 7.2.9 `StaffDashboard.tsx`
**Purpose:** Staff member interface container

**Props:**
```typescript
interface StaffDashboardProps {
  events: Event[];
  levels: Level[];
  currentUser: User;
  staffMembers: StaffMember[];
  onSignUp: (eventId: string, staffId: string) => void;
  onCancelSignUp?: (eventId: string, staffId: string) => void;
  onLogout: () => void;
}
```

**Features:**
- Progress widget (always visible)
- Tab navigation
- User menu

---

#### 7.2.10 `EventList.tsx`
**Purpose:** Staff event browsing and signup

**Props:**
```typescript
interface EventListProps {
  events: Event[];
  levels: Level[];
  currentUser: User;
  onSignUp: (eventId: string, staffId: string) => void;
  onCancelSignUp?: (eventId: string, staffId: string) => void;
}
```

**Features:**
- Event filtering (Upcoming/Signed Up/Past)
- Level-based visibility
- Signup/cancel actions
- Status indicators

---

#### 7.2.11 `ProgressTracker.tsx`
**Purpose:** Staff level progression visualization

**Props:**
```typescript
interface ProgressTrackerProps {
  points: number;
  level: string;
  levels: Level[];
}
```

**Features:**
- Current status summary
- Level list (top to bottom)
- Progress bar to next level
- Visual state indicators
- Animated transitions

---

#### 7.2.12 `DateInput.tsx`
**Purpose:** Date picker component

**Props:**
```typescript
interface DateInputProps {
  id?: string;
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}
```

**Features:**
- Calendar popup
- Date validation
- YYYY-MM-DD format
- Accessible

---

#### 7.2.13 `NotificationDebug.tsx`
**Purpose:** Admin tool for testing notifications

**Features:**
- View eligible staff
- Check integration status
- Test Telegram messages
- View chat IDs

---

#### 7.2.14 `MigrationButton.tsx`
**Purpose:** Database migration utility

**Features:**
- Run migration endpoint
- Progress indicator
- Success/error messages

---

#### 7.2.15 `InstructionsTab.tsx`
**Purpose:** Quick start guide for admins

**Features:**
- Step-by-step setup instructions
- Integration guides
- Best practices

---

### 7.3 Utility Functions

#### 7.3.1 `/utils/api.ts`
API service layer for backend communication:

```typescript
export const api = {
  // Auth
  login: (email: string, password: string) => Promise<LoginResponse>
  signup: (email: string, name: string, password: string) => Promise<SignupResponse>
  setupPassword: (email: string, tempPassword: string, newPassword: string) => Promise<void>
  
  // Events
  getEvents: (token: string) => Promise<Event[]>
  createEvent: (token: string, event: EventInput) => Promise<Event>
  updateEvent: (token: string, eventId: string, event: EventInput) => Promise<Event>
  deleteEvent: (token: string, eventId: string) => Promise<void>
  cancelEvent: (token: string, eventId: string) => Promise<void>
  reinstateEvent: (token: string, eventId: string) => Promise<void>
  closeEvent: (token: string, eventId: string, approvedStaffIds: string[], rejectedStaffIds: string[]) => Promise<void>
  
  // Staff
  getStaff: (token: string) => Promise<StaffMember[]>
  inviteStaff: (token: string, email: string, name: string, phone: string) => Promise<StaffMember>
  updateStaff: (token: string, staffId: string, updates: StaffUpdates) => Promise<StaffMember>
  deleteStaff: (token: string, staffId: string) => Promise<void>
  sendPasswordReset: (token: string, staffId: string) => Promise<void>
  
  // Signups
  signupForEvent: (token: string, eventId: string, staffId: string) => Promise<void>
  cancelSignup: (token: string, eventId: string, staffId: string) => Promise<void>
  adminSignupStaff: (token: string, eventId: string, staffIds: string[]) => Promise<void>
  
  // Points
  adjustPoints: (token: string, staffId: string, points: number, reason: string) => Promise<void>
  confirmParticipation: (token: string, eventId: string, staffId: string) => Promise<void>
  confirmAllParticipants: (token: string, eventId: string, staffIds: string[]) => Promise<void>
  getPointAdjustments: (token: string) => Promise<PointAdjustment[]>
  
  // Levels
  getLevels: (token: string) => Promise<Level[]>
  createLevel: (token: string, name: string, minPoints: number) => Promise<Level>
  updateLevel: (token: string, levelId: string, name: string, minPoints: number) => Promise<Level>
  deleteLevel: (token: string, levelId: string) => Promise<void>
  reorderLevels: (token: string, levels: Level[]) => Promise<void>
  
  // Settings
  getAdminSettings: (token: string) => Promise<AdminSettings>
  saveAdminSettings: (token: string, email: string, phone: string) => Promise<void>
  connectWhatsApp: (token: string, phoneNumberId: string, accessToken: string) => Promise<void>
  getWhatsAppStatus: (token: string) => Promise<IntegrationStatus>
  connectTelegram: (token: string, botToken: string) => Promise<void>
  getTelegramStatus: (token: string) => Promise<IntegrationStatus>
}
```

#### 7.3.2 `/utils/dateUtils.ts`
Date formatting utilities:

```typescript
export function formatDate(dateString: string): string
export function formatDateShort(dateString: string): string
export function formatTime(timeString: string): string
export function isDatePast(dateString: string): boolean
export function isDeadlinePassed(deadlineString: string): boolean
```

---

## 8. API Endpoints Reference

### 8.1 Base URL
```
https://${projectId}.supabase.co/functions/v1/make-server-08658f87
```

### 8.2 Authentication Endpoints

#### POST `/signup`
Create new staff account

**Request:**
```json
{
  "email": "staff@company.com",
  "name": "Staff Name",
  "password": "tempPassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": { "id": "...", "email": "...", "name": "..." },
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

#### POST `/login`
Authenticate user

**Request:**
```json
{
  "email": "user@company.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "role": "admin",
    "points": 0,
    "level": "Bronze Starter"
  },
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

#### POST `/refresh`
Refresh access token

**Request:**
```json
{
  "refreshToken": "..."
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

#### POST `/staff/setup-password`
Set new password for first-time staff

**Request:**
```json
{
  "email": "staff@company.com",
  "tempPassword": "temp123",
  "newPassword": "newPassword123"
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

### 8.3 Event Endpoints

#### GET `/events`
Get all events (filtered by role)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "events": [
    {
      "id": "...",
      "name": "Summer Festival",
      "date": "2025-06-15",
      "endDate": "2025-06-16",
      "time": "18:00",
      "duration": "3 hours",
      "location": "Main Hall",
      "description": "...",
      "notes": "...",
      "points": 100,
      "requiredLevel": "Silver Member",
      "signedUpStaff": ["id1", "id2"],
      "confirmedStaff": [],
      "pointsAwarded": [],
      "status": "open",
      "signupDeadline": "2025-06-14T12:00:00Z",
      "createdAt": "2025-06-01T10:00:00Z"
    }
  ]
}
```

---

#### POST `/events`
Create new event (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "name": "Summer Festival",
  "date": "2025-06-15",
  "endDate": "2025-06-16",
  "time": "18:00",
  "duration": "3 hours",
  "location": "Main Hall",
  "description": "Annual summer celebration",
  "notes": "Setup crew needed",
  "points": 100,
  "requiredLevel": "Silver Member",
  "status": "open",
  "signupDeadline": "2025-06-14T12:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "event": { /* Event object */ }
}
```

---

#### PUT `/events/:id`
Update event (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:** Same as POST `/events`

**Response:**
```json
{
  "success": true,
  "event": { /* Updated event object */ }
}
```

---

#### DELETE `/events/:id`
Delete event (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true
}
```

---

#### POST `/events/:id/cancel`
Cancel event (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "event": { /* Cancelled event */ }
}
```

**Side Effects:**
- Sends email notifications to signed-up staff
- Sends Telegram notifications (if configured)

---

#### POST `/events/:id/reinstate`
Reinstate cancelled event (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "event": { /* Reinstated event */ }
}
```

---

#### POST `/events/close`
Close event and select approved staff (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "eventId": "...",
  "approvedStaffIds": ["id1", "id2"],
  "rejectedStaffIds": ["id3"]
}
```

**Response:**
```json
{
  "success": true,
  "event": { /* Closed event */ }
}
```

**Side Effects:**
- Sends Telegram notifications to approved/rejected staff

---

### 8.4 Staff Endpoints

#### GET `/staff`
Get all staff members

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "staff": [
    {
      "id": "...",
      "email": "staff@company.com",
      "name": "Staff Name",
      "phone": "+1-555-0123",
      "telegramUsername": "@username",
      "telegramChatId": "12345678",
      "points": 850,
      "level": "Silver Member",
      "status": "active",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST `/staff/invite`
Invite new staff member (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "email": "newstaff@company.com",
  "name": "New Staff",
  "phone": "+1-555-0124"
}
```

**Response:**
```json
{
  "success": true,
  "staff": { /* Staff member object */ },
  "tempPassword": "temp123abc"
}
```

**Side Effects:**
- Sends invitation email with temp password

---

#### PUT `/staff/:id`
Update staff member (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "name": "Updated Name",
  "email": "updated@company.com",
  "phone": "+1-555-0125",
  "level": "Gold Star",
  "telegramUsername": "@updated"
}
```

**Response:**
```json
{
  "success": true,
  "staff": { /* Updated staff object */ }
}
```

---

#### DELETE `/staff/:id`
Delete staff member (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true
}
```

---

#### POST `/staff/password-reset`
Send password reset email (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "staffId": "..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

---

### 8.5 Signup Endpoints

#### POST `/signups`
Sign up for event (staff only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "eventId": "...",
  "staffId": "..."
}
```

**Response:**
```json
{
  "success": true,
  "event": { /* Updated event */ }
}
```

**Validations:**
- Event must be "open"
- Deadline not passed
- Staff level eligible
- Not already signed up

---

#### DELETE `/signups/:eventId`
Cancel event signup (staff only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query:**
```
?staffId=...
```

**Response:**
```json
{
  "success": true,
  "event": { /* Updated event */ }
}
```

**Validations:**
- Deadline not passed
- Staff is signed up

---

#### POST `/signups/admin`
Admin manually signs up staff (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "eventId": "...",
  "staffIds": ["id1", "id2", "id3"]
}
```

**Response:**
```json
{
  "success": true,
  "event": { /* Updated event */ },
  "addedCount": 3
}
```

---

### 8.6 Points Endpoints

#### POST `/points/adjust`
Manually adjust staff points (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "staffId": "...",
  "pointsChange": 50,
  "reason": "Bonus for exceptional work"
}
```

**Response:**
```json
{
  "success": true,
  "staff": { /* Updated staff with new points/level */ },
  "adjustment": {
    "id": "...",
    "staffId": "...",
    "points": 50,
    "reason": "...",
    "timestamp": "...",
    "adminId": "..."
  }
}
```

**Side Effects:**
- Updates staff points
- Recalculates level
- Records adjustment in point_adjustments table

---

#### POST `/participation/confirm`
Confirm participation and award points (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "eventId": "...",
  "staffId": "..."
}
```

**Response:**
```json
{
  "success": true,
  "staff": { /* Updated staff */ },
  "event": { /* Updated event */ }
}
```

**Side Effects:**
- Awards event points to staff
- Adds to pointsAwarded array
- Records in point_adjustments table
- Updates staff level

---

#### POST `/participation/confirm-all`
Confirm all participants at once (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "eventId": "...",
  "staffIds": ["id1", "id2", "id3"]
}
```

**Response:**
```json
{
  "success": true,
  "updatedStaff": [ /* Array of updated staff */ ],
  "adjustments": [ /* Array of point adjustments */ ],
  "event": { /* Updated event */ }
}
```

---

#### GET `/adjustments`
Get all point adjustments

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "adjustments": [
    {
      "id": "...",
      "staffId": "...",
      "points": 100,
      "reason": "Summer Festival participation",
      "timestamp": "2025-06-16T10:00:00Z",
      "adminId": "...",
      "eventId": "..."
    }
  ]
}
```

---

### 8.7 Level Endpoints

#### GET `/levels`
Get all levels

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "levels": [
    {
      "id": "...",
      "name": "Diamond Elite",
      "minPoints": 2000,
      "order": 0
    },
    {
      "id": "...",
      "name": "Platinum Pro",
      "minPoints": 1500,
      "order": 1
    }
  ]
}
```

---

#### POST `/levels`
Create new level (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "name": "Emerald Elite",
  "minPoints": 3000
}
```

**Response:**
```json
{
  "success": true,
  "level": { /* New level object */ }
}
```

---

#### PUT `/levels/:id`
Update level (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "name": "Updated Name",
  "minPoints": 3500
}
```

**Response:**
```json
{
  "success": true,
  "level": { /* Updated level */ }
}
```

---

#### DELETE `/levels/:id`
Delete level (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true
}
```

**Validations:**
- Cannot delete if level is assigned to events
- Cannot delete if level is assigned to staff

---

#### POST `/levels/reorder`
Reorder levels (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "levels": [
    { "id": "...", "order": 0 },
    { "id": "...", "order": 1 },
    { "id": "...", "order": 2 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "levels": [ /* Updated levels with new order */ ]
}
```

---

### 8.8 Settings Endpoints

#### GET `/admin/settings`
Get admin contact settings (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "settings": {
    "adminEmail": "admin@company.com",
    "adminPhone": "+1-555-0100"
  }
}
```

---

#### POST `/admin/settings`
Save admin contact settings (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "adminEmail": "admin@company.com",
  "adminPhone": "+1-555-0100"
}
```

**Response:**
```json
{
  "success": true,
  "settings": { /* Updated settings */ }
}
```

---

#### POST `/whatsapp/connect`
Connect WhatsApp Business (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "phoneNumberId": "...",
  "accessToken": "..."
}
```

**Response:**
```json
{
  "success": true,
  "status": {
    "connected": true,
    "phoneNumberId": "...",
    "phoneNumber": "+1-555-0100"
  }
}
```

---

#### GET `/whatsapp/status`
Get WhatsApp connection status (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "connected": true,
  "phoneNumberId": "...",
  "phoneNumber": "+1-555-0100",
  "connectedAt": "2025-01-01T00:00:00Z"
}
```

---

#### POST `/telegram/connect`
Connect Telegram Bot (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "botToken": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
}
```

**Response:**
```json
{
  "success": true,
  "status": {
    "connected": true,
    "botToken": "...",
    "botName": "EventHubBot",
    "botUsername": "@EventHubBot"
  }
}
```

---

#### GET `/telegram/status`
Get Telegram connection status (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "connected": true,
  "botName": "EventHubBot",
  "botUsername": "@EventHubBot",
  "connectedAt": "2025-01-01T00:00:00Z"
}
```

---

#### POST `/telegram/clear-updates`
Clear old Telegram updates (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "updatesCleared": 25
}
```

---

#### POST `/telegram/get-recent-chats`
Get recent Telegram chat IDs (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "chats": [
    {
      "chatId": "12345678",
      "firstName": "John",
      "lastName": "Doe",
      "username": "johndoe"
    }
  ]
}
```

---

#### POST `/telegram/test`
Test Telegram message to staff (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "staffId": "...",
  "message": "Test message"
}
```

**Response:**
```json
{
  "success": true,
  "messageSent": true
}
```

---

### 8.9 Diagnostic Endpoints

#### GET `/debug/notifications`
Debug notification eligibility (admin only)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "telegramSettings": {
    "connected": true,
    "botName": "EventHubBot"
  },
  "eligibleStaff": [
    {
      "id": "...",
      "name": "Staff Name",
      "email": "...",
      "telegramChatId": "12345678",
      "eligible": true
    }
  ]
}
```

---

#### GET `/status`
Check database initialization status

**Response:**
```json
{
  "initialized": true,
  "levelsCount": 5,
  "staffCount": 24,
  "eventsCount": 12
}
```

---

## 9. Business Logic & Workflows

### 9.1 User Authentication Flow

```
┌─────────────────────────────────────┐
│ User visits app                     │
└──────────────┬──────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Check session  │
      └────┬───────────┘
           │
   ┌───────┴────────┐
   │ Valid?         │
   └───┬────────┬───┘
       │        │
    YES│        │NO
       │        │
       ▼        ▼
  ┌────────┐  ┌──────────┐
  │ Go to  │  │ Show     │
  │ Dashboard│ │ Login    │
  └────────┘  └──┬───────┘
                 │
                 ▼
          ┌──────────────┐
          │ User enters  │
          │ credentials  │
          └──────┬───────┘
                 │
                 ▼
          ┌──────────────┐
          │ Validate     │
          │ with backend │
          └──────┬───────┘
                 │
         ┌───────┴────────┐
         │ Valid?         │
         └───┬────────┬───┘
             │        │
          YES│        │NO
             │        │
             ▼        ▼
      ┌─────────┐  ┌─────────┐
      │ Store   │  │ Show    │
      │ session │  │ error   │
      └────┬────┘  └─────────┘
           │
           ▼
    ┌──────────────┐
    │ Check role   │
    └──────┬───────┘
           │
    ┌──────┴──────┐
    │ Role?       │
    └──┬──────┬───┘
       │      │
    ADMIN│    │STAFF
       │      │
       ▼      ▼
  ┌────────┐ ┌──────────┐
  │ Admin  │ │ Check if │
  │ Dashboard│ │ new user │
  └────────┘ └────┬─────┘
                  │
           ┌──────┴──────┐
           │ New?        │
           └──┬──────┬───┘
              │      │
           YES│      │NO
              │      │
              ▼      ▼
       ┌───────────┐ ┌──────────┐
       │ Password  │ │ Staff    │
       │ Setup     │ │ Dashboard│
       └─────┬─────┘ └──────────┘
             │
             ▼
       ┌───────────┐
       │ Set new   │
       │ password  │
       └─────┬─────┘
             │
             ▼
       ┌───────────┐
       │ Staff     │
       │ Dashboard │
       └───────────┘
```

---

### 9.2 Event Creation & Management Workflow

```
┌─────────────────────────────────────┐
│ Admin clicks "Create Event"         │
└──────────────┬──────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Show create    │
      │ event dialog   │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Admin fills    │
      │ event details  │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Validate input │
      └────┬───────────┘
           │
    ┌──────┴──────┐
    │ Valid?      │
    └──┬──────┬───┘
       │      │
    YES│      │NO
       │      │
       ▼      ▼
  ┌────────┐ ┌─────────┐
  │ Submit │ │ Show    │
  │ to API │ │ errors  │
  └────┬───┘ └─────────┘
       │
       ▼
  ┌────────────┐
  │ Save to DB │
  └────┬───────┘
       │
       ▼
  ┌────────────┐
  │ Return to  │
  │ event list │
  └────┬───────┘
       │
       ▼
  ┌────────────┐
  │ Show toast │
  │ "Success!" │
  └────────────┘

Event Status Transitions:
┌──────┐     ┌──────┐     ┌────────┐
│Draft │────▶│ Open │────▶│ Closed │
└──────┘     └───┬──┘     └────────┘
                 │            ▲
                 │            │
                 ▼            │
            ┌──────────┐     │
            │Cancelled │─────┘
            └────┬─────┘
                 │
                 ▼
            ┌──────────┐
            │ Open     │ (Reinstated)
            └──────────┘
```

---

### 9.3 Staff Signup Flow

```
┌─────────────────────────────────────┐
│ Staff views event list              │
└──────────────┬──────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Filter by level│
      │ eligibility    │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Show eligible  │
      │ events only    │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Staff clicks   │
      │ "Sign Up"      │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Check deadline │
      └────┬───────────┘
           │
    ┌──────┴───────┐
    │ Before       │
    │ deadline?    │
    └──┬───────┬───┘
       │       │
    YES│       │NO
       │       │
       ▼       ▼
  ┌────────┐ ┌──────────┐
  │ Check  │ │ Show     │
  │ if     │ │ "Deadline│
  │ already│ │ passed"  │
  │ signed │ └──────────┘
  └────┬───┘
       │
  ┌────┴────┐
  │ Already?│
  └─┬─────┬─┘
    │     │
   YES│   │NO
    │     │
    ▼     ▼
  ┌────┐ ┌────────┐
  │Show│ │ Submit │
  │"Already"│ API│
  │signed"│ └───┬──┘
  └────┘     │
             ▼
        ┌────────┐
        │ Save to│
        │ DB     │
        └───┬────┘
            │
            ▼
        ┌────────┐
        │ Update │
        │ UI     │
        └───┬────┘
            │
            ▼
        ┌────────┐
        │ Show   │
        │ toast  │
        └────────┘
```

---

### 9.4 Event Closure & Point Award Flow

```
┌─────────────────────────────────────┐
│ Admin clicks "Close Event"          │
└──────────────┬──────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Show close     │
      │ event dialog   │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ List all       │
      │ signed-up staff│
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ All checked    │
      │ by default     │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Admin unchecks │
      │ rejected staff │
      └────┬───────────┘
           │
           ▼
      ┌────────────────┐
      │ Admin clicks   │
      │ "Close & Approve"│
      └────┬───────────┘
           │
           ▼
  ┌────────────────────┐
  │ For each approved: │
  ├────────────────────┤
  │ 1. Award points    │
  │ 2. Update level    │
  │ 3. Record txn      │
  │ 4. Send Telegram   │
  └────┬───────────────┘
       │
       ▼
  ┌────────────────────┐
  │ For each rejected: │
  ├────────────────────┤
  │ 1. Send Telegram   │
  │    notification    │
  └────┬───────────────┘
       │
       ▼
  ┌────────────────┐
  │ Update event   │
  │ status: closed │
  └────┬───────────┘
       │
       ▼
  ┌────────────────┐
  │ Refresh UI     │
  └────┬───────────┘
       │
       ▼
  ┌────────────────┐
  │ Show success   │
  │ toast          │
  └────────────────┘
```

---

### 9.5 Level Calculation Logic

```typescript
/**
 * Calculate staff level based on points
 * Levels are ordered with 0 being highest prestige
 */
function calculateLevel(points: number, levels: Level[]): string {
  // Sort levels by order (ascending)
  const sortedLevels = [...levels].sort((a, b) => a.order - b.order);
  
  // Start from highest prestige (order 0) and go down
  // Find the highest level where points >= minPoints
  for (let i = 0; i < sortedLevels.length; i++) {
    const level = sortedLevels[i];
    
    // Check if points meet this level's requirement
    if (points >= level.minPoints) {
      // Check if there's a higher level (lower order number)
      if (i > 0) {
        const higherLevel = sortedLevels[i - 1];
        // If we don't meet the higher level, return current
        if (points < higherLevel.minPoints) {
          return level.name;
        }
      } else {
        // This is the top level and we meet it
        return level.name;
      }
    }
  }
  
  // If no level matched, return the lowest level
  return sortedLevels[sortedLevels.length - 1].name;
}

/**
 * Check if staff is eligible for event
 */
function isEligibleForEvent(staffLevel: string, eventRequiredLevel: string, levels: Level[]): boolean {
  const staffLevelObj = levels.find(l => l.name === staffLevel);
  const requiredLevelObj = levels.find(l => l.name === eventRequiredLevel);
  
  if (!staffLevelObj || !requiredLevelObj) return false;
  
  // Staff can access events at their level and above (lower order numbers)
  return staffLevelObj.order <= requiredLevelObj.order;
}
```

---

### 9.6 Notification Logic

#### Email Notifications
Sent via Resend API:
- **Staff invitation** (with temp password)
- **Password reset**
- **Event cancellation** (to signed-up staff)

#### Telegram Notifications
Sent via Telegram Bot API when configured:
- **Event creation** (to eligible staff)
- **Event cancellation** (to signed-up staff)
- **Event closure** (approved/rejected status to signed-up staff)
- **Point awards** (when participation confirmed)

**Eligibility Rules:**
```typescript
function isEligibleForTelegramNotification(staff: StaffMember, telegramSettings: any): boolean {
  // Telegram must be connected
  if (!telegramSettings || !telegramSettings.connected) return false;
  
  // Staff must have chat ID
  if (!staff.telegramChatId || staff.telegramChatId.trim() === '') return false;
  
  // Staff must be active
  if (staff.status !== 'active') return false;
  
  return true;
}
```

#### WhatsApp Notifications (Not Currently Implemented)
Framework in place for future implementation via WhatsApp Business API

---

### 9.7 Deadline Enforcement

```typescript
/**
 * Check if signup deadline has passed
 */
function isSignupDeadlinePassed(event: Event): boolean {
  if (!event.signupDeadline) return false;
  
  const now = new Date();
  const deadline = new Date(event.signupDeadline);
  
  return now > deadline;
}

/**
 * Signup button logic
 */
function canSignUpForEvent(event: Event, staff: StaffMember, levels: Level[]): {
  canSignUp: boolean;
  reason?: string;
} {
  // Check event status
  if (event.status !== 'open') {
    return { canSignUp: false, reason: 'Event is not open' };
  }
  
  // Check deadline
  if (isSignupDeadlinePassed(event)) {
    return { canSignUp: false, reason: 'Signup deadline has passed' };
  }
  
  // Check if already signed up
  if (event.signedUpStaff.includes(staff.id)) {
    return { canSignUp: false, reason: 'Already signed up' };
  }
  
  // Check level eligibility
  if (!isEligibleForEvent(staff.level, event.requiredLevel, levels)) {
    return { canSignUp: false, reason: 'Level requirement not met' };
  }
  
  return { canSignUp: true };
}
```

---

## 10. Gamification System

### 10.1 Level Hierarchy

**Reverse Hierarchy:** Top levels have lower order numbers (0) and are most prestigious

**Default Levels:**
1. **Diamond Elite** (Order: 0, Min: 2000 pts)
   - Top tier
   - Access to all events
   - Most exclusive

2. **Platinum Pro** (Order: 1, Min: 1500 pts)
   - Advanced level
   - Access to all except Diamond events

3. **Gold Star** (Order: 2, Min: 1000 pts)
   - Experienced staff
   - Access to Gold, Silver, Bronze events

4. **Silver Member** (Order: 3, Min: 500 pts)
   - Regular contributor
   - Access to Silver and Bronze events

5. **Bronze Starter** (Order: 4, Min: 0 pts)
   - Entry level
   - Access to Bronze events only

### 10.2 Point System

**Earning Points:**
- Event participation (points set by admin)
- Manual adjustments (admin only, with reason)

**Point Awards:**
- Triggered when admin confirms participation
- Or when admin manually adjusts points
- Auto-recalculate level after point change

**Negative Points:**
- Admins can subtract points (e.g., penalties)
- Minimum: 0 points (cannot go negative)

### 10.3 Level Progression

**Automatic Level Updates:**
```typescript
// After points change
const newPoints = staff.points + pointsAwarded;
const newLevel = calculateLevel(newPoints, levels);

// Update staff
staff.points = newPoints;
staff.level = newLevel;

// Save to database
await updateStaffInDatabase(staff);
```

**Level-Up Notification:**
- Toast notification when level changes
- Highlight new level in UI
- Update progress tracker

### 10.4 Event Access Control

**Visibility Rules:**
- Staff can only see events at their level and above (higher prestige)
- Example: Gold Star staff can see Gold, Silver, Bronze events
- Example: Bronze staff can only see Bronze events

**Signup Rules:**
- Must meet level requirement
- Event must be "open" status
- Deadline must not have passed
- Cannot already be signed up

### 10.5 Motivation Mechanics

**Progress Visualization:**
- Progress bar showing % to next level
- Points needed display
- Visual feedback on point awards

**Status Indicators:**
- Level badges with icons
- Color-coded levels
- Achievement feel

**Transparency:**
- Full points history
- Clear reason for each adjustment
- Visible level requirements

---

## 11. Notification System

### 11.1 Email Notifications (Resend)

**Configuration:**
```typescript
FROM_EMAIL = 'onboarding@resend.dev' // Test mode
// OR
FROM_EMAIL = 'admin@yourdomain.com' // Production
```

**Email Templates:**

#### Staff Invitation
```
Subject: Welcome to Nahky Araby Event Hub

Hello {{staffName}},

You've been invited to join the Event Hub as a staff member.

Your temporary password is: {{tempPassword}}

Please log in at: {{appUrl}}

You'll be prompted to set a new password on your first login.

Best regards,
Event Hub Team
```

#### Password Reset
```
Subject: Password Reset - Event Hub

Hello {{staffName}},

Your password has been reset by an administrator.

Your new temporary password is: {{tempPassword}}

Please log in and set a new password immediately.

Login: {{appUrl}}

Best regards,
Event Hub Team
```

#### Event Cancellation
```
Subject: Event Cancelled - {{eventName}}

Hello {{staffName}},

We regret to inform you that the following event has been cancelled:

Event: {{eventName}}
Date: {{eventDate}}
Time: {{eventTime}}
Location: {{eventLocation}}

We apologize for any inconvenience.

Best regards,
Event Hub Team
```

---

### 11.2 Telegram Notifications

**Setup Requirements:**
1. Create bot via @BotFather
2. Get bot token
3. Connect bot in admin settings
4. Staff must chat with bot to get chat ID
5. Admin stores chat ID in staff profile

**Message Templates:**

#### Event Creation Notification
```
🎉 New Event Available!

📅 {{eventName}}
📆 {{eventDate}}
🕐 {{eventTime}}
📍 {{eventLocation}}
⭐ {{points}} points

🎯 Required Level: {{requiredLevel}}

Sign up in the app to participate!
```

#### Event Cancellation
```
⚠️ Event Cancelled

Hello {{staffName}},

The following event has been cancelled:

📅 {{eventName}}
📆 {{eventDate}}
📍 {{eventLocation}}

We apologize for any inconvenience.
```

#### Event Closure - Approved
```
✅ You've Been Selected!

Congratulations! You've been selected to participate in:

📅 {{eventName}}
📆 {{eventDate}}
⭐ {{points}} points will be awarded

Please make sure to attend. See you there!
```

#### Event Closure - Not Selected
```
ℹ️ Event Update

Hello {{staffName}},

Thank you for signing up for "{{eventName}}".

Unfortunately, you were not selected this time, but we appreciate your interest! Keep an eye out for future events.
```

#### Points Awarded
```
🎊 Points Awarded!

Congratulations! You've earned {{points}} points for participating in:

📅 {{eventName}}

Your new total: {{totalPoints}} points
Current level: {{level}}

{{#if leveledUp}}
🎉 Level Up! You've reached {{newLevel}}!
{{/if}}
```

---

### 11.3 WhatsApp Notifications (Framework Ready)

**Setup Requirements:**
1. WhatsApp Business Account
2. Phone Number ID
3. Access Token
4. Configured in admin settings

**Status:** Infrastructure in place, not actively sending messages

---

## 12. Responsive Design Specifications

### 12.1 Breakpoints

```css
/* Mobile First Approach */
/* Default: 320px - 767px (Mobile) */

/* Tablet: 768px - 1023px */
@media (min-width: 768px) { }

/* Desktop: 1024px+ */
@media (min-width: 1024px) { }
```

### 12.2 Mobile Design (320px - 767px)

**Layout:**
- Single column
- Full-width components
- Stacked cards
- Bottom navigation (tabs)
- Hamburger menu for settings

**Typography:**
- Base: 16px
- Headings: 24px-32px
- Labels: 14px

**Spacing:**
- Container padding: 16px
- Card gap: 12px
- Component padding: 12px

**Touch Targets:**
- Minimum: 44x44px
- Buttons: Full width or min 44px height

---

### 12.3 Tablet Design (768px - 1023px)

**Layout:**
- Two-column grid where appropriate
- Side-by-side forms
- Wider cards (max-width: 600px)
- Horizontal tabs

**Typography:**
- Base: 16px
- Headings: 28px-36px

**Spacing:**
- Container padding: 24px
- Card gap: 16px

---

### 12.4 Desktop Design (1024px+)

**Layout:**
- Max container width: 1200px
- Centered content
- Multi-column grids (2-3 columns)
- Sidebar navigation (optional)
- Horizontal tabs

**Typography:**
- Base: 16px
- Headings: 32px-48px

**Spacing:**
- Container padding: 32px
- Card gap: 24px

**Interactions:**
- Hover states
- Tooltips
- Larger dialogs (max 600px width)

---

### 12.5 Component Responsive Behavior

#### Event Cards
- **Mobile:** Full width, stacked vertically
- **Tablet:** 2 columns
- **Desktop:** 3 columns

#### Dialogs/Modals
- **Mobile:** Full screen or near-full (90% width)
- **Tablet:** 600px width, centered
- **Desktop:** 600px width, centered

#### Tables
- **Mobile:** Card layout (stacked rows)
- **Tablet:** Scrollable table
- **Desktop:** Full table

#### Navigation
- **Mobile:** Bottom tabs or drawer
- **Tablet:** Top tabs
- **Desktop:** Top tabs or sidebar

---

## 13. Technical Stack

### 13.1 Frontend

**Core:**
- React 18.x
- TypeScript
- Vite (build tool)

**Styling:**
- Tailwind CSS v4.0
- CSS Variables for theming
- `/styles/globals.css`

**UI Library:**
- shadcn/ui components
- Radix UI primitives
- Lucide React icons

**State Management:**
- React useState
- React useEffect
- No external state library

**HTTP Client:**
- Native Fetch API
- Custom API service layer (`/utils/api.ts`)

---

### 13.2 Backend

**Runtime:**
- Deno (Supabase Edge Functions)

**Framework:**
- Hono (lightweight web framework)
- CORS support via `hono/cors`
- Logger via `hono/logger`

**Database:**
- Supabase Postgres
- Direct SQL queries via Supabase client

**Authentication:**
- Supabase Auth
- JWT tokens
- User metadata storage

**File I/O:**
- Only `/tmp` directory writable
- No permanent file storage

---

### 13.3 External Services

**Email:**
- Resend API
- API Key: RESEND_API_KEY

**Notifications:**
- Telegram Bot API
- WhatsApp Business API (ready, not active)

**Database:**
- Supabase Postgres
- Connection string: SUPABASE_DB_URL

**Environment Variables:**
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
RESEND_API_KEY
```

---

### 13.4 Development Tools

**Code Editor:**
- VS Code (recommended)

**Version Control:**
- Git

**Package Manager:**
- npm or pnpm

**Linting:**
- ESLint (TypeScript)

**Formatting:**
- Prettier

---

## 14. Implementation Roadmap

### 14.1 Phase 1: Foundation (Week 1)

**Database Setup:**
- [ ] Create Supabase project
- [ ] Run schema migrations
- [ ] Insert default levels
- [ ] Configure RLS policies

**Authentication:**
- [ ] Implement login screen
- [ ] Set up Supabase Auth
- [ ] Add session management
- [ ] Add password setup flow

**Basic UI:**
- [ ] Set up Tailwind v4
- [ ] Install shadcn/ui components
- [ ] Create basic layout structure

---

### 14.2 Phase 2: Admin Core (Week 2)

**Event Management:**
- [ ] Create event list view
- [ ] Build create event form
- [ ] Implement edit event
- [ ] Add delete event
- [ ] Implement cancel event

**Staff Management:**
- [ ] Create staff list view
- [ ] Build invite staff form
- [ ] Implement edit staff
- [ ] Add delete staff
- [ ] Add password reset

**Backend Endpoints:**
- [ ] POST /events
- [ ] PUT /events/:id
- [ ] DELETE /events/:id
- [ ] POST /events/:id/cancel
- [ ] POST /staff/invite
- [ ] PUT /staff/:id
- [ ] DELETE /staff/:id

---

### 14.3 Phase 3: Staff Experience (Week 3)

**Event Discovery:**
- [ ] Build event list for staff
- [ ] Implement level filtering
- [ ] Add event details view

**Signup Flow:**
- [ ] Implement signup button
- [ ] Add cancel signup
- [ ] Show signup status
- [ ] Enforce deadlines

**Progress Tracking:**
- [ ] Build progress widget
- [ ] Create progress tracker page
- [ ] Add level visualization
- [ ] Implement animations

**Backend Endpoints:**
- [ ] POST /signups
- [ ] DELETE /signups/:eventId
- [ ] GET /events (filtered by role)

---

### 14.4 Phase 4: Gamification (Week 4)

**Points System:**
- [ ] Implement point awards
- [ ] Build manual adjustment form
- [ ] Create points log
- [ ] Add level calculation logic

**Event Closure:**
- [ ] Build close event dialog
- [ ] Implement staff selection
- [ ] Award points on confirmation
- [ ] Update levels automatically

**Backend Endpoints:**
- [ ] POST /events/close
- [ ] POST /points/adjust
- [ ] POST /participation/confirm
- [ ] POST /participation/confirm-all
- [ ] GET /adjustments

---

### 14.5 Phase 5: Notifications (Week 5)

**Email Setup:**
- [ ] Configure Resend API
- [ ] Create email templates
- [ ] Implement invitation emails
- [ ] Add password reset emails
- [ ] Add event cancellation emails

**Telegram Integration:**
- [ ] Build bot connection UI
- [ ] Implement bot connection
- [ ] Add chat ID discovery
- [ ] Create notification templates
- [ ] Send event notifications
- [ ] Send closure notifications

**Backend Endpoints:**
- [ ] POST /telegram/connect
- [ ] GET /telegram/status
- [ ] POST /telegram/clear-updates
- [ ] POST /telegram/get-recent-chats
- [ ] POST /telegram/test

---

### 14.6 Phase 6: Settings & Admin Tools (Week 6)

**Admin Settings:**
- [ ] Build settings accordion UI
- [ ] Add contact info form
- [ ] Implement level management
- [ ] Add level reordering (drag-drop)

**WhatsApp (Framework):**
- [ ] Build connection UI
- [ ] Implement status check
- [ ] Add framework for sending (not active)

**System Tools:**
- [ ] Add migration button
- [ ] Create diagnostic endpoints
- [ ] Build notification debug tool

**Backend Endpoints:**
- [ ] GET /admin/settings
- [ ] POST /admin/settings
- [ ] POST /levels
- [ ] PUT /levels/:id
- [ ] DELETE /levels/:id
- [ ] POST /levels/reorder
- [ ] POST /whatsapp/connect
- [ ] GET /whatsapp/status

---

### 14.7 Phase 7: Polish & Testing (Week 7)

**UI/UX Refinement:**
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Add success toasts
- [ ] Implement animations
- [ ] Optimize mobile layout

**Testing:**
- [ ] Test all user flows
- [ ] Test on mobile devices
- [ ] Test notifications
- [ ] Test edge cases
- [ ] Fix bugs

**Documentation:**
- [ ] Write user guides
- [ ] Create admin documentation
- [ ] Add inline help
- [ ] Create FAQ

---

### 14.8 Phase 8: Deployment & Launch (Week 8)

**Pre-Launch:**
- [ ] Final security audit
- [ ] Performance optimization
- [ ] Database backup strategy
- [ ] Monitoring setup

**Launch:**
- [ ] Deploy to production
- [ ] Configure custom domain
- [ ] Set up production email
- [ ] Create admin account
- [ ] Invite initial staff

**Post-Launch:**
- [ ] Monitor for issues
- [ ] Gather user feedback
- [ ] Plan future enhancements

---

## 15. Future Enhancements

### 15.1 Short-term (3-6 months)

- [ ] **Push Notifications**
  - Browser push for new events
  - Mobile PWA notifications

- [ ] **Advanced Reporting**
  - Attendance history
  - Staff performance analytics
  - Event success metrics

- [ ] **Calendar Integration**
  - Export to Google Calendar
  - iCal support
  - Sync with Outlook

- [ ] **Bulk Operations**
  - Bulk staff import (CSV)
  - Bulk event creation
  - Mass notifications

---

### 15.2 Medium-term (6-12 months)

- [ ] **Mobile App**
  - Native iOS app
  - Native Android app
  - Offline support

- [ ] **Advanced Gamification**
  - Badges and achievements
  - Streaks and milestones
  - Leaderboards
  - Rewards catalog

- [ ] **Event Templates**
  - Save recurring events as templates
  - Quick create from template

- [ ] **Staff Availability**
  - Staff can set availability
  - Auto-match based on availability

---

### 15.3 Long-term (12+ months)

- [ ] **Multi-tenancy**
  - Support multiple organizations
  - Separate data per org
  - Org-level settings

- [ ] **Advanced Scheduling**
  - AI-powered staff recommendations
  - Conflict detection
  - Shift trading

- [ ] **Payment Integration**
  - Track hours worked
  - Generate invoices
  - Payment processing

- [ ] **White-label**
  - Custom branding per org
  - Custom domains
  - Custom themes

---

## 16. Appendix

### 16.1 Color Palette

**Primary Colors:**
```css
--primary: #3b82f6; /* Blue */
--primary-foreground: #ffffff;
```

**Status Colors:**
```css
--success: #10b981; /* Green */
--warning: #f59e0b; /* Amber */
--error: #ef4444; /* Red */
--info: #3b82f6; /* Blue */
```

**Level Colors:**
```css
--diamond: #b9f2ff; /* Light blue */
--platinum: #e5e7eb; /* Light gray */
--gold: #fbbf24; /* Yellow */
--silver: #cbd5e1; /* Gray */
--bronze: #d97706; /* Orange */
```

---

### 16.2 Typography Scale

```css
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
--text-4xl: 2.25rem;   /* 36px */
```

---

### 16.3 Icon Library (Lucide React)

**Commonly Used Icons:**
- Calendar: `<Calendar />`
- Clock: `<Clock />`
- MapPin: `<MapPin />`
- Users: `<Users />`
- Star: `<Star />`
- Award: `<Award />`
- TrendingUp: `<TrendingUp />`
- Bell: `<Bell />`
- Settings: `<Settings />`
- LogOut: `<LogOut />`
- Plus: `<Plus />`
- Edit: `<Edit />`
- Trash2: `<Trash2 />`
- Check: `<Check />`
- X: `<X />`
- AlertCircle: `<AlertCircle />`
- Info: `<Info />`

---

### 16.4 Database Initialization Script

```sql
-- Run this script to initialize the database

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE,
  time TEXT NOT NULL,
  duration TEXT,
  location TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  required_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  signup_deadline TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create event_signups table
CREATE TABLE IF NOT EXISTS event_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'signed_up',
  confirmed_at TIMESTAMP WITH TIME ZONE,
  points_awarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, staff_id)
);

-- Create levels table
CREATE TABLE IF NOT EXISTS levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  min_points INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create point_adjustments table
CREATE TABLE IF NOT EXISTS point_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  event_id UUID REFERENCES events(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create admin_settings2 table
CREATE TABLE IF NOT EXISTS admin_settings2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_email TEXT,
  admin_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create integration_settings2 table
CREATE TABLE IF NOT EXISTS integration_settings2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_type TEXT NOT NULL UNIQUE,
  connected BOOLEAN DEFAULT FALSE,
  phone_number_id TEXT,
  access_token TEXT,
  bot_token TEXT,
  bot_name TEXT,
  connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_signups_event ON event_signups(event_id);
CREATE INDEX IF NOT EXISTS idx_signups_staff ON event_signups(staff_id);
CREATE INDEX IF NOT EXISTS idx_signups_status ON event_signups(status);
CREATE INDEX IF NOT EXISTS idx_levels_order ON levels(order_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_levels_name ON levels(name);
CREATE INDEX IF NOT EXISTS idx_adjustments_staff ON point_adjustments(staff_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_created ON point_adjustments(created_at DESC);

-- Insert default levels
INSERT INTO levels (name, min_points, order_index, description) VALUES
  ('Diamond Elite', 2000, 0, 'Top tier - Most exclusive events'),
  ('Platinum Pro', 1500, 1, 'Advanced level'),
  ('Gold Star', 1000, 2, 'Experienced staff'),
  ('Silver Member', 500, 3, 'Regular contributor'),
  ('Bronze Starter', 0, 4, 'Entry level')
ON CONFLICT (name) DO NOTHING;
```

---

### 16.5 Environment Setup Guide

**1. Create Supabase Project:**
- Go to supabase.com
- Create new project
- Note project URL and keys

**2. Set Environment Variables:**
```bash
# In Supabase Edge Functions secrets
supabase secrets set SUPABASE_URL=https://xxx.supabase.co
supabase secrets set SUPABASE_ANON_KEY=xxx
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx
supabase secrets set SUPABASE_DB_URL=postgresql://xxx
supabase secrets set RESEND_API_KEY=re_xxx
```

**3. Deploy Edge Function:**
```bash
supabase functions deploy server
```

**4. Initialize Database:**
- Run SQL script from 16.4
- Or use built-in `/init` endpoint

**5. Create Admin Account:**
- Use `/signup` endpoint with admin credentials
- Manually set role to 'admin' in auth.users.user_metadata

**6. Configure Frontend:**
- Update `/utils/supabase/info.tsx` with project details
- Deploy frontend to Supabase hosting or Vercel

---

## Conclusion

This document provides a complete blueprint for rebuilding the Nahky Araby Event Hub from scratch. It includes:

- ✅ Full data models and database schema
- ✅ Complete UI/UX specifications for all screens
- ✅ Detailed component library documentation
- ✅ Comprehensive API endpoint reference
- ✅ Business logic and workflows
- ✅ Gamification system design
- ✅ Notification system architecture
- ✅ Responsive design specifications
- ✅ Technical stack details
- ✅ Step-by-step implementation roadmap

**Total Estimated Development Time:** 8 weeks (1 developer)

**Next Steps:**
1. Review this document with stakeholders
2. Set up development environment
3. Follow implementation roadmap
4. Iterate based on user feedback

---

**Document Version:** 2.0  
**Last Updated:** November 19, 2025  
**Author:** AI Assistant  
**Status:** Ready for Implementation
