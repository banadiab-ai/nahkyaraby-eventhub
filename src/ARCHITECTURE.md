# Nahky Araby Event Hub - Architecture

## System Overview

The Nahky Araby Event Hub is a full-stack web application built with React (frontend) and Supabase (backend), featuring a gamified event management system for part-time staff coordination.

## Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling
- **Vite** - Build tool
- **Lucide React** - Icons
- **Recharts** - Charts and analytics
- **Sonner** - Toast notifications

### Backend
- **Supabase** - Backend-as-a-Service
  - **PostgreSQL** - Primary database
  - **Supabase Auth** - Authentication system
  - **Supabase Real-time** - WebSocket subscriptions
  - **Edge Functions (Deno)** - API backend
- **Hono** - Lightweight web framework for Edge Functions
- **Resend** - Email service

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React App (Vite + TypeScript + Tailwind)           │   │
│  │  - Admin Dashboard                                   │   │
│  │  - Staff Portal                                      │   │
│  │  - Event Management                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
                        ↓
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Platform                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Edge Function (Hono + Deno)                        │   │
│  │  - REST API endpoints                               │   │
│  │  - Authentication middleware                        │   │
│  │  - Business logic                                   │   │
│  │  - Email sending (Resend)                           │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐   │
│  │                      ↓                               │   │
│  │  Supabase Auth                                       │   │
│  │  - User accounts                                     │   │
│  │  - Session management                                │   │
│  │  - JWT tokens                                        │   │
│  │  - User metadata (points, level, role)              │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐   │
│  │                      ↓                               │   │
│  │  PostgreSQL Database                                 │   │
│  │  - events                                            │   │
│  │  - event_participants                                │   │
│  │  - staff_profiles                                    │   │
│  │  - levels                                            │   │
│  │  - user_roles                                        │   │
│  │  - integration_settings2                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Supabase Real-time                                  │   │
│  │  - WebSocket subscriptions                           │   │
│  │  - Live event_participants updates                   │   │
│  │  - Instant UI refresh                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
│  - Resend (Email)                                           │
│  - WhatsApp Business API (Optional)                         │
│  - Telegram Bot API (Optional)                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Authentication Flow

```
User → Login Form
  ↓
POST /login (Edge Function)
  ↓
Supabase Auth → Verify Credentials
  ↓
Return JWT Token + User Data
  ↓
Store in localStorage
  ↓
Include in Authorization header for all requests
```

### 2. Event Creation Flow (Admin)

```
Admin → Create Event Form
  ↓
POST /events (Edge Function)
  ↓
Verify admin role from JWT
  ↓
Insert into events table
  ↓
Return event ID
  ↓
Real-time broadcasts update to all subscribed clients
  ↓
UI refreshes automatically
```

### 3. Staff Event Signup Flow

```
Staff → Click "Sign Up" on Event
  ↓
POST /events/{id}/signup (Edge Function)
  ↓
Verify authentication
  ↓
Check if event is full or past deadline
  ↓
Insert into event_participants (status: pending)
  ↓
Real-time broadcasts update
  ↓
Admin sees new participant request instantly
```

### 4. Participation Confirmation Flow

```
Admin → Approve/Reject Participant
  ↓
PUT /events/{id}/participants/{staffId} (Edge Function)
  ↓
Update event_participants table
  ↓
If confirmed: Calculate and award points
  ↓
Update user metadata in Supabase Auth
  ↓
Recalculate user level
  ↓
Real-time broadcasts update
  ↓
Staff sees status change and points update instantly
```

## Database Schema

### Core Tables

#### `events`
- `id` (UUID, PK)
- `title` (TEXT)
- `description` (TEXT)
- `location` (TEXT)
- `date` (TIMESTAMP)
- `points` (INTEGER) - Points awarded for participation
- `max_participants` (INTEGER)
- `current_participants` (INTEGER)
- `signup_deadline` (TIMESTAMP)
- `event_time` (TEXT) - e.g., "14:00"
- `event_duration` (TEXT) - e.g., "3 hours"
- `created_by` (UUID, FK → auth.users)
- `created_at` (TIMESTAMP)

#### `event_participants`
- `id` (UUID, PK)
- `event_id` (UUID, FK → events)
- `staff_id` (UUID, FK → auth.users)
- `status` (TEXT) - 'pending' | 'confirmed' | 'rejected' | 'cancelled'
- `signed_up_at` (TIMESTAMP)
- `confirmed_at` (TIMESTAMP, nullable)

**Real-time Enabled**: Yes - broadcasts changes to all subscribed clients

#### `staff_profiles`
- `id` (UUID, PK, FK → auth.users)
- `name` (TEXT)
- `email` (TEXT)
- `phone` (TEXT)
- `telegram_chat_id` (TEXT, nullable)
- `status` (TEXT) - 'active' | 'pending' | 'inactive'
- `created_at` (TIMESTAMP)

#### `levels`
- `id` (UUID, PK)
- `name` (TEXT)
- `min_points` (INTEGER)
- `order_index` (INTEGER)

#### `user_roles`
- `user_id` (UUID, PK, FK → auth.users)
- `role` (TEXT) - 'admin' | 'staff'
- `created_at` (TIMESTAMP)

#### `integration_settings2`
- `id` (UUID, PK)
- `integration_type` (TEXT) - 'whatsapp' | 'telegram'
- `connected` (BOOLEAN)
- `phone_number_id` (TEXT, nullable)
- `access_token` (TEXT, nullable)
- `bot_token` (TEXT, nullable)
- `bot_name` (TEXT, nullable)
- `connected_at` (TIMESTAMP, nullable)

### Auth Metadata Structure

User data stored in `auth.users.raw_user_meta_data`:

```typescript
{
  name: string;
  role: 'admin' | 'staff';
  points: number;
  level: string;
  status: 'active' | 'pending' | 'inactive';
  phone: string;
  telegramChatId: string;
  telegramUsername: string;
  whatsappPhone: string;
}
```

## API Structure

### Edge Function: `/supabase/functions/server`

All API endpoints are served through a single Hono-based Edge Function deployed at:
```
https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server
```

### Endpoint Categories

#### Public Endpoints (No Auth Required)
- `GET /health` - Health check
- `GET /status` - Database initialization status
- `GET /email-config` - Email configuration info
- `POST /login` - User authentication
- `POST /signup` - User registration
- `POST /forgot-password` - Password reset

#### Auth Required Endpoints
- `GET /me` - Current user info
- `POST /logout` - Sign out
- `POST /refresh` - Refresh JWT token
- `POST /change-password` - Change password
- `POST /setup-password` - First-time password setup

#### Event Endpoints (Auth Required)
- `GET /events` - List events (filtered by role)
- `GET /events/:id` - Get single event
- `POST /events` - Create event (admin only)
- `PUT /events/:id` - Update event (admin only)
- `DELETE /events/:id` - Delete event (admin only)
- `POST /events/:id/signup` - Sign up for event (staff)
- `POST /events/:id/cancel` - Cancel signup (staff)
- `PUT /events/:id/participants/:staffId` - Confirm/reject participant (admin)

#### Staff Management (Admin Only)
- `GET /staff` - List all staff
- `GET /staff/:id` - Get staff details
- `POST /staff/invite` - Invite new staff
- `PUT /staff/:id/status` - Update staff status
- `PUT /staff/:id/points` - Adjust staff points
- `PUT /staff/:id/contact` - Update contact info
- `DELETE /staff/:id` - Delete staff

#### Levels Management (Admin Only)
- `GET /levels` - List all levels
- `POST /levels` - Create level
- `PUT /levels/:id` - Update level
- `DELETE /levels/:id` - Delete level
- `PUT /levels/reorder` - Reorder levels

#### Integration Endpoints (Admin Only)
- `POST /whatsapp/connect` - Connect WhatsApp
- `GET /whatsapp/status` - Get WhatsApp status
- `POST /telegram/connect` - Connect Telegram
- `GET /telegram/status` - Get Telegram status

#### Utility Endpoints
- `POST /initialize` - Initialize database with demo data
- `POST /migrate-admin` - Migrate admin account (legacy)

## Authentication & Authorization

### Authentication Mechanism

1. **Login**: User provides email/password
2. **Verification**: Supabase Auth validates credentials
3. **Token Generation**: JWT access token + refresh token returned
4. **Storage**: Tokens stored in localStorage
5. **Requests**: Access token sent in `Authorization: Bearer {token}` header
6. **Validation**: Edge Function verifies token with Supabase Auth
7. **Refresh**: When token expires, use refresh token to get new access token

### Authorization Levels

#### Public
- Anyone can access (login, signup, forgot password)

#### Authenticated
- Must have valid JWT token
- Can access own profile and events

#### Staff Role
- Can view available events
- Can sign up/cancel for events
- Can view own participation history

#### Admin Role
- All staff permissions +
- Can create/edit/delete events
- Can invite/manage staff members
- Can approve/reject participants
- Can adjust points and levels
- Can configure integrations
- Can view analytics

### Role Verification

```typescript
// In Edge Function
const verifyAuth = async (authHeader: string) => {
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user, error };
};

const verifyAdmin = async (userId: string) => {
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (user.user_metadata?.role !== 'admin') {
    return { error: 'Admin access required' };
  }
  return { isAdmin: true };
};
```

## Real-time Architecture

### Subscription Setup

The app uses Supabase Real-time to eliminate polling and provide instant updates.

#### Frontend Subscription (Staff View)

```typescript
// Subscribe to event_participants changes
const subscription = supabase
  .channel('event_participants_changes')
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'event_participants',
    },
    (payload) => {
      // Refresh data when changes detected
      fetchEvents();
    }
  )
  .subscribe();
```

#### Benefits

- **Instant Updates**: Changes appear immediately across all connected clients
- **No Polling**: Eliminates wasteful 30-second polling loops
- **Efficient**: WebSocket connection maintained, only sends updates when data changes
- **Scalable**: Supabase handles connection management

### Events with Real-time

- **Event Participation**: When admin confirms/rejects, staff sees update instantly
- **Participant Count**: When someone signs up, counts update for all viewers
- **Status Changes**: Approval/rejection status updates in real-time

## Points & Leveling System

### Point Award Logic

```typescript
// When admin confirms participation
const awardPoints = async (staffId: string, eventPoints: number) => {
  // 1. Get current user data
  const { data: { user } } = await supabase.auth.admin.getUserById(staffId);
  
  // 2. Calculate new points
  const currentPoints = user.user_metadata.points || 0;
  const newPoints = currentPoints + eventPoints;
  
  // 3. Calculate new level
  const newLevel = await calculateLevel(newPoints);
  
  // 4. Update user metadata
  await supabase.auth.admin.updateUserById(staffId, {
    user_metadata: {
      ...user.user_metadata,
      points: newPoints,
      level: newLevel
    }
  });
};
```

### Level Calculation

```typescript
const calculateLevel = async (points: number): Promise<string> => {
  // Fetch all levels from database
  const { data: levels } = await supabase
    .from('levels')
    .select('*')
    .order('min_points', { ascending: false });
  
  // Find highest level user qualifies for
  for (const level of levels) {
    if (points >= level.min_points) {
      return level.name;
    }
  }
  
  // Return lowest level if no qualification
  return levels[levels.length - 1]?.name || '';
};
```

## Email System

### Resend Integration

```typescript
const sendEmail = async (to: string, subject: string, html: string) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });
  
  return await response.json();
};
```

### Email Types

1. **Invitation Email**: Sent when admin invites new staff
2. **Password Reset Email**: Sent on forgot password request
3. **Event Confirmation**: (Optional) Sent when participation confirmed
4. **Event Reminder**: (Optional) Sent before event starts

### Testing Mode

When using `onboarding@resend.dev`:
- Emails only go to `delivered@resend.dev`
- Manual credentials provided in API response
- Production requires verified domain

## Security

### Row Level Security (RLS)

All tables have RLS policies enabled:

```sql
-- Example: events table
CREATE POLICY "Users can view events"
  ON events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage events"
  ON events FOR ALL
  TO authenticated
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );
```

### API Security

- **JWT Verification**: All protected endpoints verify token
- **Role Checks**: Admin endpoints verify admin role
- **CORS**: Configured to accept requests from frontend
- **Service Role**: Backend uses service role key for privileged operations
- **Anon Key**: Frontend uses anon key for client operations

### Sensitive Data

- **Passwords**: Hashed by Supabase Auth (never stored plaintext)
- **API Keys**: Stored as Supabase secrets (environment variables)
- **User Data**: Stored in Supabase Auth metadata with encryption at rest

## Performance Optimizations

### Frontend

1. **Real-time Instead of Polling**: Eliminates constant API requests
2. **Optimistic Updates**: UI updates immediately, syncs in background
3. **Lazy Loading**: Components loaded on demand
4. **Memoization**: React hooks optimize re-renders

### Backend

1. **Connection Pooling**: PostgreSQL connections managed by Supabase
2. **Edge Functions**: Deployed globally, low latency
3. **Indexed Queries**: Database tables have proper indexes
4. **Batch Operations**: Multiple updates in single transaction

### Database

1. **Indexes**: Created on foreign keys and frequently queried columns
2. **Denormalization**: `current_participants` cached on events table
3. **Triggers**: Automatic updates for derived data

## Deployment

### Local Development

```bash
npm run dev
```

### Edge Function Deployment

```bash
supabase functions deploy server
```

### Database Migrations

```bash
supabase db push
```

### Environment Variables

Set in Supabase Dashboard or via CLI:
```bash
supabase secrets set RESEND_API_KEY=your_key
```

## Monitoring & Logging

### Edge Function Logs

```bash
# Real-time logs
supabase functions logs server

# Or view in Dashboard
https://supabase.com/dashboard/project/ojeewoebsidiiufvfwco/functions/server/logs
```

### Database Logs

View in Supabase Dashboard:
- Query performance
- Error logs
- Slow queries

### Frontend Errors

- Console logging
- Toast notifications for user-facing errors
- Error boundaries for React component errors

## Future Enhancements

Potential areas for expansion:

1. **Push Notifications**: Using Firebase Cloud Messaging
2. **Advanced Analytics**: More detailed reports and visualizations
3. **Mobile App**: React Native version
4. **Calendar Integration**: Sync with Google Calendar, Outlook
5. **Automated Reminders**: Scheduled notifications before events
6. **Team Chat**: In-app messaging system
7. **File Uploads**: Event attachments, staff documents
8. **Multi-tenancy**: Support multiple organizations
9. **Advanced Permissions**: More granular role-based access
10. **Audit Logs**: Track all admin actions

---

**Last Updated**: After Postgres migration and Real-time implementation  
**Version**: 2.0  
**Project**: ojeewoebsidiiufvfwco
