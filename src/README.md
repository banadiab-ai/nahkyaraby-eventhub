# Nahky Araby Event Hub

Internal Events & Staff Management App designed to streamline staffing part-time employees for variable company events through a gamified leveling and reward system.

## 🎯 Features

- **Two User Roles**: Admin and Part-Time Staff
- **Event Management**: Create events, invite staff, track participation
- **Gamified System**: Points and levels reward system
- **Real-time Updates**: Instant notifications using Supabase Real-time
- **Email Notifications**: Powered by Resend
- **Mobile Responsive**: Works on all devices

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Supabase CLI: `npm install -g supabase`
- A Supabase account and project

### Initial Setup

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Deploy the Edge Function** (REQUIRED - fixes 404 errors)
   
   **Linux/Mac:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   
   **Windows:**
   ```bash
   deploy.bat
   ```
   
   **Manual:**
   ```bash
   supabase login
   supabase link --project-ref ojeewoebsidiiufvfwco
   supabase functions deploy server
   ```

3. **Test Deployment**
   ```bash
   chmod +x test-deployment.sh
   ./test-deployment.sh
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## 📚 Documentation

- **[QUICK_START.md](QUICK_START.md)** - Fast deployment guide (START HERE if you have 404 errors)
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Comprehensive deployment instructions
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design decisions

## 🔧 Project Structure

```
/
├── components/           # React components
├── supabase/
│   ├── functions/
│   │   └── server/      # Edge Function (API backend)
│   └── migrations/      # Database migrations
├── utils/               # Utility functions
├── deploy.sh            # Deployment script (Linux/Mac)
├── deploy.bat           # Deployment script (Windows)
└── test-deployment.sh   # Test script
```

## 🌐 API Endpoints

After deploying, your API will be available at:
```
https://ojeewoebsidiiufvfwco.supabase.co/functions/v1/server
```

### Public Endpoints
- `GET /health` - Health check
- `GET /status` - Database status
- `POST /login` - User authentication
- `POST /signup` - User registration
- `POST /forgot-password` - Password reset

### Protected Endpoints (require authentication)
- `GET /events` - List events
- `POST /events` - Create event (admin only)
- `GET /staff` - List staff members
- `POST /staff/invite` - Invite staff (admin only)
- And many more...

## 🔐 Environment Variables

The Edge Function uses these environment variables (auto-configured by Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (admin)

Optional (for email functionality):
- `RESEND_API_KEY` - Get from [resend.com](https://resend.com)
  ```bash
  supabase secrets set RESEND_API_KEY=your_key_here
  ```

## 🐛 Troubleshooting

### Getting 404 Errors?
Your Edge Function isn't deployed yet. Run:
```bash
./deploy.sh
```

See [QUICK_START.md](QUICK_START.md) for details.

### Email Not Working?
You need to configure Resend:
1. Get an API key from [resend.com](https://resend.com)
2. Set it: `supabase secrets set RESEND_API_KEY=your_key`
3. For production, verify your domain with Resend

### Database Errors?
1. Run migrations: `supabase db push`
2. Check RLS policies are enabled
3. Use the Connection Diagnostic tool in Admin Settings

### Real-time Not Working?
1. Verify Supabase Real-time is enabled for your tables
2. Check browser console for subscription errors
3. Ensure you're authenticated

## 📊 Database Schema

Key tables:
- `events` - Event information
- `event_participants` - Staff event participation
- `staff_profiles` - Staff member profiles
- `levels` - Gamification levels
- `user_roles` - User role assignments
- `integration_settings2` - WhatsApp/Telegram settings

## 🎮 User Roles

### Admin
- Create and manage events
- Invite staff members
- Approve/reject participation
- Adjust points and levels
- View reports and analytics
- Configure integrations

### Staff
- View available events
- Sign up for events
- Track points and level
- View personal event history
- Receive notifications

## 🔄 Migration Notes

This project recently completed:
- ✅ Full migration from KV Store to Postgres
- ✅ Migration from polling to Real-time subscriptions
- ✅ Clean API routes (removed legacy prefixes)
- ✅ Simplified participation confirmation system
- ✅ User data stored in Supabase Auth metadata

## 📝 License

Internal use only - Nahky Araby

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs: `supabase functions logs server`
3. Use the Connection Diagnostic tool in the app
4. Check the Supabase Dashboard for errors

---

**Current Project**: ojeewoebsidiiufvfwco  
**Status**: ✅ Ready for deployment  
**Version**: 2.0 (Postgres + Real-time)
