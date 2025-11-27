# 🎯 Demo Accounts Guide

## ⚠️ CRITICAL INFORMATION

### This is NOT an error!

If you see:
```
Auth login error for [some-email] : Invalid login credentials
```

**This is EXPECTED and NORMAL behavior.** 

Personal email addresses (Gmail, Yahoo, Outlook, etc.) will **NEVER** work unless an admin has specifically invited that email address through the app's Staff Management feature.

---

## 🔑 Demo Accounts (Work Out of the Box)

The app comes with three pre-configured demo accounts that work immediately:

### 1. 👨‍💼 Admin Account
```
Email: admin@company.com
Password: admin123
```
**What you can do:**
- Create and manage events
- Invite new staff members
- Adjust staff points manually
- Configure notification settings (WhatsApp/Telegram)
- View staffing reports and analytics
- Manage level system

### 2. 👤 Staff Account - Sarah Johnson
```
Email: sarah.johnson@company.com
Password: password123
```
**Profile:**
- Points: 850
- Level: Level 1
- Status: Active

**What you can do:**
- View and sign up for events
- Track your points and level
- See your event history
- Receive notifications

### 3. 👤 Staff Account - Mike Chen
```
Email: mike.chen@company.com
Password: password123
```
**Profile:**
- Points: 1250
- Level: Level 2
- Status: Active

**What you can do:**
- View and sign up for events (including Level 2+ events)
- Track your points and level
- See your event history
- Receive notifications

---

## 🚀 How to Use Demo Accounts

### The Easy Way (Recommended)
1. Load the app
2. You'll see three large buttons:
   - 🔑 Demo Admin Account
   - 👤 Demo Staff - Sarah (850 pts)
   - 👤 Demo Staff - Mike (1250 pts)
3. **Click any button** - you're instantly logged in!
4. No typing, no registration, no hassle

### If You Have Real Credentials
1. Load the app
2. Click the small link: **"I have login credentials"**
3. Manual login form appears
4. Enter your email and password
5. Sign in

---

## 🔐 Creating Real Staff Accounts

Only admins can create new staff accounts:

1. Log in as admin
2. Go to "Staff Management" tab
3. Click "Invite New Staff Member"
4. Enter:
   - Name
   - Email address
   - Starting level
5. Click "Send Invitation"

The new staff member will:
- Receive an email with temporary password
- Must log in and set a new password on first use
- Their email address is now valid for login

---

## ❌ Why Personal Emails Don't Work

### The System Design

This is an **internal company app** with these security features:

1. **Closed System**: Not open for public registration
2. **Admin Control**: Only admins can create accounts
3. **Email Invitations**: All staff join by invitation only
4. **Temporary Passwords**: First login requires password change

### Why This Is Good

✅ **Security**: Random people can't create accounts  
✅ **Control**: Company controls who has access  
✅ **Tracking**: All users are verified company staff  
✅ **Accountability**: Clear audit trail of who was invited  

### What This Means for You

- ❌ Can't register yourself
- ❌ Can't use your personal Gmail/Yahoo/etc
- ✅ Use demo accounts to try the app
- ✅ Ask admin to invite you if you're real staff

---

## 🐛 Troubleshooting

### "Invalid credentials" error

**Q: I entered my email but got "Invalid credentials"**  
**A:** Your email isn't in the system. Use a demo account instead!

**Q: I was invited by an admin but can't log in**  
**A:** Check your email for the invitation with temporary password. Use that exact email and password.

**Q: I want to test the app with my own email**  
**A:** 
1. Log in as admin (admin@company.com / admin123)
2. Go to Staff Management
3. Invite yourself
4. Check your email for temporary password
5. Log in with your email and the temporary password
6. Set a new password

### "Session expired" error

**Q: I was logged in but now I'm not**  
**A:** Your session expired. Just click a demo button again to log back in.

### Can't see certain events

**Q: I'm logged in as Sarah but don't see all events**  
**A:** Events are level-restricted. Sarah is Level 1, so she only sees Level 1 events. Mike is Level 2, so he sees Level 1 AND Level 2 events.

---

## 🎓 Testing Scenarios

### Scenario 1: Admin Creating an Event
1. Log in as admin
2. Go to "Event Management"
3. Create a new event
4. Set point value
5. Choose level requirement
6. Staff at that level (and higher) will see it

### Scenario 2: Staff Signing Up for Event
1. Log in as Sarah or Mike
2. Go to "Available Events"
3. Click "Sign Up" on an event
4. See confirmation
5. Log in as admin to confirm participation

### Scenario 3: Level Progression
1. Log in as Sarah (850 pts)
2. Note her level (Level 1)
3. Log in as admin
4. Confirm Sarah's participation in events
5. Sarah gains points automatically
6. When she reaches 1000 pts, she levels up to Level 2
7. Now she can see Level 2 events

### Scenario 4: Inviting New Staff
1. Log in as admin
2. Go to Staff Management
3. Invite new staff member with your email
4. Log out
5. Check your email
6. Use temporary password to log in
7. Set new password
8. You're now a real staff member!

---

## 📧 Email Integration

The app uses **Resend** for emails:

- ✅ Invitation emails to new staff
- ✅ Event notification emails
- ✅ Password reset emails (if configured)

**Note:** Make sure the admin has configured their email in Settings for emails to send properly.

---

## 💡 Pro Tips

1. **Try all three accounts** to see different perspectives (admin vs staff with different levels)
2. **Test the level system** by creating events at different levels and seeing who can access them
3. **Explore notifications** by setting up WhatsApp or Telegram integration (requires external setup)
4. **Test point system** by confirming staff participation and watching points accumulate
5. **Try staff invitation flow** by inviting yourself with a real email to see the full experience

---

## 🆘 Still Having Issues?

If none of this helps:

1. **Clear browser cache** and reload
2. **Try incognito/private mode** to rule out cached data
3. **Check browser console** for technical errors (F12 → Console)
4. **Verify demo account credentials** (copy/paste from this document)
5. **Make sure database is initialized** (the app should handle this automatically on first load)

Remember: The demo accounts are there so you can **experience the full app immediately** without any setup. Use them! 🎉
