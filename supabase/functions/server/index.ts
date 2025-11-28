import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

// Nahky Araby Event Hub - Staff Management Backend v1.0.2
// This server handles all backend operations for the event management system
// Updated: Added public forgot password endpoint that sends emails from admin email
// Email configuration updated to info@nahkyaraby.com - Production mode

// Helper function to add delay between requests (for rate limiting)
const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to extract time and duration from description
const extractTimeAndDuration = (description: string) => {
  let extractedTime = "";
  let extractedDuration = "";
  let cleanDescription = description || "";

  if (
    cleanDescription &&
    (cleanDescription.startsWith("Time: ") ||
      cleanDescription.startsWith("Duration: "))
  ) {
    const lines = cleanDescription.split("\\n");
    const firstLine = lines[0];

    // Parse "Time: XX:XX | Duration: X hours" format
    if (firstLine.includes("|")) {
      const parts = firstLine.split("|").map((p) => p.trim());
      parts.forEach((part) => {
        if (part.startsWith("Time: ")) {
          extractedTime = part.replace("Time: ", "");
        } else if (part.startsWith("Duration: ")) {
          extractedDuration = part.replace("Duration: ", "");
        }
      });
    } else if (firstLine.startsWith("Time: ")) {
      extractedTime = firstLine.replace("Time: ", "");
    } else if (firstLine.startsWith("Duration: ")) {
      extractedDuration = firstLine.replace("Duration: ", "");
    }

    cleanDescription = lines.slice(1).join("\\n").trim();
  }

  return {
    time: extractedTime,
    duration: extractedDuration,
    description: cleanDescription,
  };
};

// Email configuration - update this after verifying your domain with Resend
// IMPORTANT: When using 'onboarding@resend.dev', you can ONLY send to 'delivered@resend.dev'
// This is a Resend testing mode restriction
// When you're ready for production, verify a domain at resend.com/domains
// and update this to use your domain email
const FROM_EMAIL = "info@nahkyaraby.com";

// Resend email service
const sendEmail = async (
  to: string,
  subject: string,
  html: string,
) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return {
      success: false,
      error:
        "Email service not configured. Please set up your Resend API key in the environment variables.",
    };
  }

  const fromEmail = FROM_EMAIL;

  // In testing mode with onboarding@resend.dev, we can only send to delivered@resend.dev
  // So we send to the test address but log the intended recipient
  const isTestMode = fromEmail === "onboarding@resend.dev";
  const actualRecipient = isTestMode
    ? "delivered@resend.dev"
    : to;

  if (isTestMode) {
    console.log(
      `📧 TEST MODE: Sending email to ${actualRecipient} (intended for: ${to})`,
    );
  }

  try {
    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [actualRecipient],
          subject: subject,
          html: html,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      // Check if this is a Resend testing mode restriction
      const isTestingRestriction =
        result.message &&
        (result.message.includes("testing emails") ||
          result.message.includes("verify a domain"));

      if (isTestingRestriction) {
        // This is expected behavior in testing mode - use warning instead of error
        console.log(
          "📧 Resend testing mode: Email not sent to",
          to,
          "- Manual link will be provided",
        );
        return {
          success: false,
          error: "TESTING_MODE",
          isTestingMode: true,
        };
      }

      // For other errors, log them properly
      console.error("Resend API error:", result);
      return {
        success: false,
        error: result.message || "Failed to send email",
      };
    }

    console.log("Email sent successfully:", result.id);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
};

const app = new Hono();

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Initialize Supabase client with service role for admin operations
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
};

// Initialize Supabase client for auth operations
const getSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
};

// Helper function to deduplicate levels by ID
const deduplicateLevels = (levels: any[]): any[] => {
  const uniqueLevelsMap = new Map();
  levels.forEach((level) => {
    if (level && level.id) {
      uniqueLevelsMap.set(level.id, level);
    }
  });
  return Array.from(uniqueLevelsMap.values());
};

// Helper function to calculate level based on points
const calculateLevel = async (
  points: number,
): Promise<string> => {
  try {
    const supabase = getSupabaseAdmin();

    // Fetch levels from Postgres
    const { data: pgLevels, error: pgError } = await supabase
      .from("levels")
      .select("*")
      .order("order_index", { ascending: true });

    if (pgError) {
      console.error(
        "Error fetching levels from Postgres:",
        pgError,
      );
      // Fallback to KV Store
      const levelsData = await kv.getByPrefix("level:");
      const levels = deduplicateLevels(levelsData);

      if (levels.length === 0) {
        return ""; // No levels configured
      }

      // Sort levels by minPoints in descending order
      const sortedLevels = levels.sort(
        (a, b) => b.minPoints - a.minPoints,
      );

      // Find the highest level that the user qualifies for
      for (const level of sortedLevels) {
        if (points >= level.minPoints) {
          return level.name;
        }
      }

      // If no level qualifies, return the lowest level (first in original order)
      const lowestLevel = levels.sort(
        (a, b) => a.order - b.order,
      )[0];
      return lowestLevel?.name || "";
    }

    // Transform Postgres data
    const levels = pgLevels.map((level) => ({
      id: level.id,
      name: level.name,
      minPoints: level.min_points,
      order: level.order_index,
    }));

    if (levels.length === 0) {
      return ""; // No levels configured
    }

    // Sort levels by minPoints in descending order
    const sortedLevels = levels.sort(
      (a, b) => b.minPoints - a.minPoints,
    );

    // Find the highest level that the user qualifies for
    for (const level of sortedLevels) {
      if (points >= level.minPoints) {
        return level.name;
      }
    }

    // If no level qualifies, return the lowest level (first in original order)
    const lowestLevel = levels.sort(
      (a, b) => a.order - b.order,
    )[0];
    return lowestLevel?.name || "";
  } catch (error) {
    console.error("Error calculating level:", error);
    return "";
  }
};

// Helper function to verify user authentication
const verifyAuth = async (authHeader: string | null) => {
  if (!authHeader) {
    console.error(
      "Auth verification failed: No authorization header",
    );
    return { error: "No authorization header", user: null };
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    console.error(
      "Auth verification failed: Invalid authorization header format",
    );
    return {
      error: "Invalid authorization header format",
      user: null,
    };
  }

  // Check if this is the public anon key - if so, it's not a user session
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (token === anonKey) {
    console.error(
      "Auth verification failed: Cannot use public anon key for authenticated endpoints",
    );
    return { error: "Authentication required", user: null };
  }

  console.log(
    "Verifying token:",
    token.substring(0, 20) + "...",
  );

  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error) {
    console.error(
      "Auth verification failed: Supabase error:",
      error.message,
    );
    return { error: "Unauthorized", user: null };
  }

  if (!user) {
    console.error("Auth verification failed: No user found");
    return { error: "Unauthorized", user: null };
  }

  console.log(
    "Auth verification successful for user:",
    user.id,
  );
  return { error: null, user };
};

// Helper function to check if user is admin (from Auth metadata)
const verifyAdmin = async (userId: string) => {
  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await supabase.auth.admin.getUserById(userId);

  if (error || !user || user.user_metadata?.role !== "admin") {
    return { error: "Admin access required", isAdmin: false };
  }

  return { error: null, isAdmin: true, user };
};

// Helper function to get staff member from Auth
const getStaffFromAuth = async (staffId: string) => {
  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await supabase.auth.admin.getUserById(staffId);

  if (error || !user) {
    return { error: "Staff member not found", staff: null };
  }

  const staff = {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || user.email,
    points: user.user_metadata?.points || 0,
    level: user.user_metadata?.level || "",
    status: user.user_metadata?.status || "active",
    role: user.user_metadata?.role || "staff",
    phone: user.user_metadata?.phone || "",
    telegramChatId: user.user_metadata?.telegramChatId || "",
    telegramUsername:
      user.user_metadata?.telegramUsername || "",
    whatsappPhone: user.user_metadata?.whatsappPhone || "",
  };

  return { error: null, staff };
};

// Helper function to get integration settings from Postgres (with KV fallback)
const getIntegrationSettings = async (
  integrationType: "whatsapp" | "telegram",
) => {
  const supabase = getSupabaseAdmin();

  // Try Postgres first
  const { data, error } = await supabase
    .from("integration_settings2")
    .select("*")
    .eq("integration_type", integrationType)
    .single();

  if (!error && data) {
    // Return in the old format for compatibility
    return {
      connected: data.connected,
      phoneNumberId: data.phone_number_id,
      accessToken: data.access_token,
      botToken: data.bot_token,
      botName: data.bot_name,
      connectedAt: data.connected_at,
    };
  }

  // No fallback - return null if not in Postgres
  return null;
};

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Check if database is initialized
app.get("/status", async (c) => {
  try {
    // Check both KV Store (legacy) and Postgres (new)
    const supabase = getSupabaseAdmin();

    // Get users from Supabase Auth
    const {
      data: { users },
      error: usersError,
    } = await supabase.auth.admin.listUsers();

    // Check Postgres tables
    const { data: pgEvents, error: eventsError } =
      await supabase
        .from("events")
        .select("id", { count: "exact", head: true });

    const { data: pgLevels, error: levelsError } =
      await supabase
        .from("levels")
        .select("id", { count: "exact", head: true });

    // Fallback to KV Store for counts if Postgres not available
    let eventsCount = 0;
    let levelsCount = 0;

    if (!eventsError && pgEvents !== null) {
      // Use Postgres count if available
      eventsCount = Array.isArray(pgEvents)
        ? pgEvents.length
        : 0;
    } else {
      // Fallback to KV Store
      const kvEvents = await kv.getByPrefix("event:");
      eventsCount = kvEvents.length;
    }

    if (!levelsError && pgLevels !== null) {
      // Use Postgres count if available
      levelsCount = Array.isArray(pgLevels)
        ? pgLevels.length
        : 0;
    } else {
      // Fallback to KV Store
      const kvLevels = await kv.getByPrefix("level:");
      levelsCount = kvLevels.length;
    }

    return c.json({
      initialized: users && users.length > 0,
      eventsCount,
      usersCount: users ? users.length : 0,
      levelsCount,
      usingPostgres: !eventsError || !levelsError,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return c.json(
      { initialized: false, error: "Failed to check status" },
      500,
    );
  }
});

// Get email configuration
app.get("/email-config", (c) => {
  const isTestMode = FROM_EMAIL === "onboarding@resend.dev";
  return c.json({
    fromEmail: FROM_EMAIL,
    isTestMode,
  });
});

// ==================== AUTH ENDPOINTS ====================

// Sign up new staff member
app.post("/signup", async (c) => {
  try {
    const {
      email,
      password,
      name,
      role = "staff",
    } = await c.req.json();

    if (!email || !password || !name) {
      return c.json(
        { error: "Email, password, and name are required" },
        400,
      );
    }

    const supabase = getSupabaseAdmin();

    // Create user in Supabase Auth with ALL data in user_metadata
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          name,
          role,
          points: 0,
          level: "",
          status: role === "admin" ? "active" : "pending",
          phone: "",
          telegramChatId: "",
          whatsappPhone: "",
        },
        // Automatically confirm the user's email since an email server hasn't been configured.
        email_confirm: true,
      });

    if (authError) {
      console.error("Auth signup error:", authError);
      return c.json({ error: authError.message }, 400);
    }

    // Insert role into user_roles table
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role: role,
      });

    if (roleError) {
      console.error("Error inserting user role:", roleError);
      // Don't fail the signup, but log the error
    }

    // Create staff profile in Postgres (only for staff role)
    if (role === "staff") {
      const { error: profileError } = await supabase
        .from("staff_profiles")
        .insert({
          id: authData.user.id,
          name:
            authData.user.user_metadata.name ||
            authData.user.email ||
            "Unknown",
          email: authData.user.email || "",
          phone: authData.user.user_metadata.phone || "",
          telegram_chat_id:
            authData.user.user_metadata.telegramChatId || null,
          status:
            authData.user.user_metadata.status || "pending",
          created_at: new Date().toISOString(),
        });

      if (profileError) {
        console.error(
          "Error creating staff profile:",
          profileError,
        );
        // Don't fail the signup, but log the error
      }
    }

    // Return user data from auth metadata
    const staffMember = {
      id: authData.user.id,
      email: authData.user.email,
      name: authData.user.user_metadata.name,
      points: authData.user.user_metadata.points,
      level: authData.user.user_metadata.level,
      status: authData.user.user_metadata.status,
      role: authData.user.user_metadata.role,
      createdAt: authData.user.created_at,
    };

    return c.json({
      success: true,
      user: staffMember,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return c.json({ error: "Failed to create user" }, 500);
  }
});

// Login endpoint
app.post("/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    console.log("Login attempt for:", email);

    if (!email || !password) {
      return c.json(
        { error: "Username and password are required" },
        400,
      );
    }

    const supabase = getSupabaseClient();

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Convert username to email format if it doesn't contain @
    // This allows usernames like "admin" to work while keeping Supabase Auth compatibility
    let loginEmail = normalizedEmail.includes("@")
      ? normalizedEmail
      : `${normalizedEmail}@company.local`;

    // Try to login with the converted email
    let { data, error } =
      await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

    // If login failed and we were trying username format, try old email format as fallback
    if (
      (error || !data.session) &&
      !normalizedEmail.includes("@") &&
      normalizedEmail === "admin"
    ) {
      console.log(
        "Login with new format failed, trying old admin@company.com format...",
      );
      loginEmail = "admin@company.com";
      const fallbackResult =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error || !data.session) {
      // Only log as info, not error - invalid credentials are expected for non-demo accounts
      console.log(
        "Login failed for",
        loginEmail,
        "- This is normal if not using demo accounts",
      );
      return c.json({ error: "Invalid credentials" }, 401);
    }

    console.log("Login successful for user:", data.user.id);

    // Get user details from Auth user_metadata (NO KV lookup)
    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata.name || data.user.email,
      role: data.user.user_metadata.role || "staff",
      points: data.user.user_metadata.points || 0,
      level: data.user.user_metadata.level || "",
      status: data.user.user_metadata.status || "active",
      phone: data.user.user_metadata.phone || "",
      telegramChatId:
        data.user.user_metadata.telegramChatId || "",
      whatsappPhone:
        data.user.user_metadata.whatsappPhone || "",
    };

    // Block inactive users from logging in
    if (userData.status === "inactive") {
      console.log(
        "Login blocked for inactive user:",
        userData.email,
      );
      // Sign out the user immediately
      await supabase.auth.signOut();
      return c.json(
        {
          error:
            "Your account is inactive. Please contact an administrator.",
        },
        403,
      );
    }

    // Check if user is logging in with a temporary password (invitation or reset)
    // Temporary passwords start with 'temp' or 'reset'
    const isTempPassword =
      password.startsWith("temp") ||
      password.startsWith("reset");

    if (isTempPassword && userData.status === "pending") {
      // User needs to set up a new password (invitation flow)
      console.log(
        "User logging in with invitation temp password - requires password setup",
      );
      return c.json({
        success: true,
        needsPasswordSetup: true,
        email: email,
        tempPassword: password,
      });
    }

    if (isTempPassword && userData.status === "active") {
      // User is logging in with a reset password - also needs password setup
      console.log(
        "User logging in with reset temp password - requires password setup",
      );
      return c.json({
        success: true,
        needsPasswordSetup: true,
        email: email,
        tempPassword: password,
      });
    }

    return c.json({
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: userData,
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "Failed to login" }, 500);
  }
});

// Public forgot password endpoint (no auth required)
app.post("/forgot-password", async (c) => {
  try {
    console.log("🔐 Forgot password endpoint called");
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = getSupabaseAdmin();

    // Check if user exists in Auth
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error("Error listing users:", listError);
      return c.json(
        { error: "Failed to process password reset request" },
        500,
      );
    }

    // Log all registered emails for debugging
    console.log(
      "📧 Registered emails:",
      users.map((u) => u.email).join(", "),
    );
    console.log("🔍 Looking for email:", normalizedEmail);

    // Find user by email - case insensitive match
    const user = users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail,
    );

    if (!user) {
      // User not found - return error message
      console.log(
        `❌ User not found for email: ${normalizedEmail}`,
      );
      console.log(
        "Available emails:",
        users.map((u) => u.email).join(", "),
      );
      return c.json(
        { error: "This email is not registered in the system" },
        404,
      );
    }

    console.log(
      `✅ Found user for password reset: ${user.email}`,
    );

    // Generate temporary password
    const tempPassword = `reset${Math.random().toString(36).slice(2, 10)}`;

    // Update the user's password in Supabase Auth
    const { error: updateError } =
      await supabase.auth.admin.updateUserById(user.id, {
        password: tempPassword,
      });

    if (updateError) {
      console.error(
        "Error updating user password:",
        updateError,
      );
      return c.json(
        { error: "Failed to generate temporary password" },
        500,
      );
    }

    // Get user name from metadata
    const userName = user.user_metadata?.name || user.email;

    // Send password reset email with temporary password (bilingual: Arabic + English)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background-color: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
          .credential-row { margin: 15px 0; }
          .credential-label { color: #6B7280; font-size: 14px; margin-bottom: 5px; }
          .credential-value { background-color: #F3F4F6; padding: 10px 15px; border-radius: 6px; font-family: monospace; font-size: 16px; color: #1F2937; border: 1px solid #E5E7EB; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .warning-box { background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; }
          .info-box { background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6; }
          .arabic-section { direction: rtl; text-align: right; }
          .divider { border-top: 2px solid #E5E7EB; margin: 40px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="text-align: center; margin-bottom: 10px;">
              <img src="https://img1.wsimg.com/isteam/ip/aead55c7-5dc3-4ad4-8132-6139ccf3e033/nahky.png/:/rs=w:132,h:104,cg:true,m/cr=w:132,h:104/qt=q:95" alt="Nahky Araby Logo" style="max-width: 200px; height: auto;" />
            </div>
            <h2 style="margin: 10px 0 20px 0; font-size: 24px; font-weight: 600; opacity: 1;">Nahky Araby Event Hub</h2>
            <h1>إعادة تعيين كلمة المرور</h1>
          </div>
          <div class="content arabic-section">
            <h2>مرحبًا ${userName}،</h2>
            <p>لقد قام أحد المشرفين بإعادة تعيين كلمة المرور الخاصة بك. تجد أدناه بيانات تسجيل الدخول المؤقتة الجديدة.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #F59E0B;">🔐 بيانات الدخول الجديدة</h3>
              <div class="credential-row">
                <div class="credential-label">اسم المستخدم (البريد الإلكتروني)</div>
                <div class="credential-value" style="direction: ltr; text-align: left;">${user.email}</div>
              </div>
              <div class="credential-row">
                <div class="credential-label">كلمة المرور المؤقتة</div>
                <div class="credential-value" style="direction: ltr; text-align: left;">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ تنبيه مهم – أول تسجيل دخول</strong>
              <p style="margin: 10px 0 0 0;">عند تسجيل الدخول باستخدام كلمة المرور المؤقتة، سيُطلب منك إنشاء كلمة مرور جديدة وآمنة قبل الوصول إلى حسابك.</p>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">📋 الخطوات التالية</h3>
              <ol style="margin: 10px 0; padding-right: 20px;">
                <li>زيارة صفحة تسجيل الدخول لتطبيق إدارة الموظفين</li>
                <li>إدخال بريدك الإلكتروني وكلمة المرور المؤقتة</li>
                <li>إنشاء كلمة مرور جديدة وآمنة</li>
                <li>متابعة إدارة فعالياتك!</li>
              </ol>
            </div>
            
            <p>إذا لم تطلب أنت إعادة التعيين، يرجى التواصل مع المشرف فورًا.</p>
          </div>
          
          <div class="divider"></div>
          
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Your password has been reset by an administrator. Below are your new temporary login credentials.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #F59E0B;">🔐 Your New Login Credentials</h3>
              <div class="credential-row">
                <div class="credential-label">Username (Email)</div>
                <div class="credential-value">${user.email}</div>
              </div>
              <div class="credential-row">
                <div class="credential-label">Temporary Password</div>
                <div class="credential-value">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ Important - First Login</strong>
              <p style="margin: 10px 0 0 0;">When you log in with this temporary password, you will be required to set up a new secure password before accessing your account.</p>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">📋 Next Steps</h3>
              <ol style="margin: 10px 0; padding-left: 20px;">
                <li>Visit Nahky Araby Event Hub login page</li>
                <li>Enter your email and temporary password</li>
                <li>Create a new secure password</li>
                <li>Continue managing your events!</li>
              </ol>
            </div>
            
            <p>If you didn't request this password reset, please contact your administrator immediately.</p>
          </div>
          <div class="footer">
            <p>هذه رسالة آلية — يرجى عدم الرد على هذا البريد.<br>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const emailResult = await sendEmail(
      user.email,
      "Password Reset - Nahky Araby Event Hub",
      emailHtml,
    );

    if (!emailResult.success) {
      // Password reset successful, just email failed
      // This is expected in Resend testing mode
      console.log(
        "🔑 Temporary password generated for:",
        user.email,
        "- Manual credentials provided (email in testing mode)",
      );

      return c.json({
        success: true,
        message: `Temporary password generated for ${user.email}`,
        emailSent: false,
        isTestingMode: emailResult.isTestingMode || false,
        tempPassword: tempPassword,
      });
    }

    return c.json({
      success: true,
      message: `Password reset email sent to ${user.email}`,
      emailSent: true,
    });
  } catch (error) {
    console.error("Error processing forgot password:", error);
    return c.json(
      { error: "Failed to process password reset request" },
      500,
    );
  }
});

// Refresh token endpoint
app.post("/refresh", async (c) => {
  try {
    const { refreshToken } = await c.req.json();

    if (!refreshToken) {
      return c.json(
        { error: "Refresh token is required" },
        400,
      );
    }

    const supabase = getSupabaseAdmin();

    // Refresh the session using the refresh token
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      console.error("Refresh token error:", error);
      return c.json(
        { error: "Invalid or expired refresh token" },
        401,
      );
    }

    // Get updated user data
    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata.name || data.user.email,
      role: data.user.user_metadata.role || "staff",
      points: data.user.user_metadata.points || 0,
      level: data.user.user_metadata.level || "",
      status: data.user.user_metadata.status || "active",
      phone: data.user.user_metadata.phone || "",
      telegramChatId:
        data.user.user_metadata.telegramChatId || "",
      whatsappPhone:
        data.user.user_metadata.whatsappPhone || "",
    };

    return c.json({
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: userData,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return c.json({ error: "Failed to refresh token" }, 500);
  }
});

// ==================== EVENT ENDPOINTS ====================

// Get all events
app.get("/events", async (c) => {
  try {
    console.log("GET /events - Fetching events");
    const authHeader = c.req.header("Authorization");
    console.log(
      "GET /events - Auth header:",
      authHeader
        ? authHeader.substring(0, 30) + "..."
        : "MISSING",
    );

    const { error: authError } = await verifyAuth(authHeader);

    if (authError) {
      console.error("GET /events - Auth failed:", authError);
      return c.json({ error: authError }, 401);
    }

    const supabase = getSupabaseAdmin();

    // Fetch events from Postgres
    const { data: pgEvents, error: pgError } = await supabase
      .from("events")
      .select(
        `
        *,
        event_signups (*)
      `,
      )
      .order("created_at", { ascending: false });

    if (pgError) {
      console.error(
        "Postgres error, falling back to KV:",
        pgError,
      );
      // Fallback to KV Store
      const events = await kv.getByPrefix("event:");
      console.log(
        "GET /events - Fetched",
        events.length,
        "events from KV",
      );
      return c.json({ events });
    }

    // Fetch levels to map order_index back to level names
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");

    const levels = pgLevels || [];

    // Fetch all point adjustments with event_id to determine which staff have received points
    const { data: pointAdjustments } = await supabase
      .from("point_adjustments")
      .select("event_id, staff_id")
      .not("event_id", "is", null);

    // Build a map of event_id -> array of staff_ids who received points
    const pointsAwardedMap = new Map<string, string[]>();
    (pointAdjustments || []).forEach((adj: any) => {
      if (!pointsAwardedMap.has(adj.event_id)) {
        pointsAwardedMap.set(adj.event_id, []);
      }
      pointsAwardedMap.get(adj.event_id)!.push(adj.staff_id);
    });

    // Log first event's signups to see structure
    if (
      pgEvents.length > 0 &&
      pgEvents[0].event_signups?.length > 0
    ) {
      console.log(
        "GET /events - Sample signup structure:",
        JSON.stringify(pgEvents[0].event_signups[0]),
      );
    }

    // Transform Postgres data to match the expected format
    const events = pgEvents.map((event) => {
      // Get the staff ID from whichever column exists (user_id or staff_id)
      const signedUpStaff =
        event.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [];

      // Get confirmed staff from event_signups (filter by confirmed_at or is_selected)
      // Use confirmed_staff column as fallback if event_signups doesn't have the data
      const confirmedStaffFromSignups =
        event.event_signups
          ?.filter(
            (s: any) =>
              s.confirmed_at !== null || s.is_selected === true,
          )
          .map((s: any) => s.user_id || s.staff_id) || [];

      // Fallback to confirmed_staff column if signups don't have confirmed staff
      const confirmedStaff =
        confirmedStaffFromSignups.length > 0
          ? confirmedStaffFromSignups
          : event.confirmed_staff || [];

      // Log for closed/cancelled events to debug the issue
      if (
        event.status === "closed" ||
        event.status === "cancelled"
      ) {
        console.log(
          `🔍 GET /events - Processing ${event.status} event "${event.name}":`,
          {
            confirmed_staff_column: event.confirmed_staff,
            confirmedStaffFromSignups:
              confirmedStaffFromSignups,
            finalConfirmedStaff: confirmedStaff,
            event_signups_count:
              event.event_signups?.length || 0,
            event_signups_with_selection:
              event.event_signups?.filter(
                (s: any) => s.is_selected === true,
              ).length || 0,
          },
        );
      }

      // Build sign-up timestamps
      const signUpTimestamps =
        event.event_signups?.reduce((acc: any, s: any) => {
          const staffId = s.user_id || s.staff_id;
          acc[staffId] = s.signed_up_at;
          return acc;
        }, {}) || {};

      // Convert required_level (level ID) back to level name
      const level = levels.find(
        (l) => l.id === event.required_level,
      );
      const requiredLevelName = level ? level.name : "";

      return {
        id: event.id,
        name: event.name,
        date: event.start_date || event.end_date, // Use start_date as date for frontend compatibility, fallback to end_date for old data
        endDate: event.end_date || event.start_date, // Default to start_date if end_date is null
        time: event.start_time || "",
        duration: event.duration || "",
        location: event.location,
        description: event.description || "",
        notes: event.notes || "", // Default to empty string to prevent undefined
        requiredLevel: requiredLevelName,
        points: event.points,
        status: event.status,
        createdAt: event.created_at,
        signedUpStaff,
        confirmedStaff, // Now reading from the confirmed_staff column
        pointsAwarded: pointsAwardedMap.get(event.id) || [], // Get from point_adjustments table
        hasBeenClosedBefore:
          event.has_been_closed_before || false, // Read from database column
        signUpTimestamps,
      };
    });

    console.log(
      "GET /events - Fetched",
      events.length,
      "events from Postgres",
    );
    return c.json({ events });
  } catch (error) {
    console.error("Error fetching events:", error);
    return c.json({ error: "Failed to fetch events" }, 500);
  }
});

// Create new event
app.post("/events", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (!isAdmin) {
      return c.json(
        { error: adminError || "Admin access required" },
        403,
      );
    }

    const eventData = await c.req.json();
    const supabase = getSupabaseAdmin();

    // Generate UUID for event ID
    const eventId = crypto.randomUUID();

    // Look up the level to get its order_index (required_level expects a number)
    let requiredLevelId = null;
    if (
      eventData.requiredLevel &&
      eventData.requiredLevel.trim() !== ""
    ) {
      console.log(
        "Looking up level by name:",
        eventData.requiredLevel,
      );

      const { data: level, error: levelError } = await supabase
        .from("levels")
        .select("id, order_index, name")
        .eq("name", eventData.requiredLevel)
        .single();

      if (levelError) {
        console.error("Error looking up level:", levelError);
        console.error(
          "Level name searched:",
          eventData.requiredLevel,
        );
        return c.json(
          {
            error: `Invalid level: ${eventData.requiredLevel}`,
          },
          400,
        );
      }

      if (!level) {
        console.error(
          "No level found with name:",
          eventData.requiredLevel,
        );
        return c.json(
          {
            error: `Level not found: ${eventData.requiredLevel}`,
          },
          400,
        );
      }

      console.log("Found level:", level);
      requiredLevelId = level.id;
    } else {
      console.log(
        "No required level specified, setting to null",
      );
    }

    // Store time and duration in description since time column may not exist
    let enhancedDescription = eventData.description || "";
    if (eventData.time || eventData.duration) {
      const timeStr = eventData.time
        ? `Time: ${eventData.time}`
        : "";
      const durationStr = eventData.duration
        ? `Duration: ${eventData.duration}`
        : "";
      const combinedInfo = [timeStr, durationStr]
        .filter(Boolean)
        .join(" | ");
      enhancedDescription =
        `${combinedInfo}\n${enhancedDescription}`.trim();
    }

    // Insert event into Postgres with start_time and duration in their proper fields
    const { data: insertedEvent, error: insertError } =
      await supabase
        .from("events")
        .insert({
          id: eventId,
          name: eventData.name,
          start_date: eventData.date,
          end_date: eventData.endDate || eventData.date,
          start_time: eventData.time || null,
          duration: eventData.duration || null,
          location: eventData.location,
          description: eventData.description || null,
          notes: eventData.notes || null,
          required_level: requiredLevelId,
          points: eventData.points,
          status: eventData.status || "draft",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (insertError) {
      console.error(
        "Error inserting event to Postgres:",
        insertError,
      );
      console.error(
        "Error details:",
        JSON.stringify({
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        }),
      );
      return c.json(
        {
          error: `Failed to create event: ${insertError.message}`,
        },
        500,
      );
    }

    // Transform back to frontend format
    const event = {
      id: insertedEvent.id,
      name: insertedEvent.name,
      date: insertedEvent.start_date || insertedEvent.end_date, // Use start_date as date for frontend compatibility
      endDate:
        insertedEvent.end_date || insertedEvent.start_date, // Default to start_date if end_date is null
      time: insertedEvent.start_time || "",
      duration: insertedEvent.duration || "",
      location: insertedEvent.location,
      description: insertedEvent.description || "",
      notes: insertedEvent.notes || "", // Default to empty string to prevent undefined
      requiredLevel: eventData.requiredLevel, // Return the level name that was sent
      points: insertedEvent.points,
      status: insertedEvent.status,
      signedUpStaff: [],
      createdAt: insertedEvent.created_at,
    };

    // Only send email notifications if the event status is 'open'
    // Draft and closed events should not trigger notifications
    if (event.status === "open") {
      try {
        // Get all staff members from Supabase Auth and levels from KV
        const supabase = getSupabaseAdmin();
        const {
          data: { users: authUsers },
        } = await supabase.auth.admin.listUsers();

        const staffMembers = authUsers
          .filter(
            (u) =>
              u.user_metadata?.role === "staff" &&
              u.user_metadata?.status === "active",
          )
          .map((u) => ({
            id: u.id,
            email: u.email,
            name: u.user_metadata?.name || u.email,
            role: u.user_metadata?.role || "staff",
            level: u.user_metadata?.level || "",
            status: u.user_metadata?.status || "active",
            telegramChatId:
              u.user_metadata?.telegramChatId || "",
            telegramUsername:
              u.user_metadata?.telegramUsername || "",
          }));

        // Fetch levels from Postgres
        const { data: levels, error: levelsError } =
          await supabase
            .from("levels")
            .select("*")
            .order("order_index", { ascending: true });

        if (levelsError) {
          console.error("Error fetching levels:", levelsError);
        }

        console.log(
          `📧 Event notification system: Found ${staffMembers.length} active staff members`,
        );
        console.log(
          `📧 Staff members:`,
          staffMembers.map((s) => ({
            name: s.name,
            level: s.level,
            telegramChatId:
              s.telegramChatId || s.telegramUsername
                ? "SET"
                : "NOT SET",
          })),
        );

        // Sort levels by order (lower order = higher in hierarchy)
        const sortedLevels =
          levels?.sort(
            (a, b) => a.order_index - b.order_index,
          ) || [];

        // Find the event's required level
        const eventLevel = sortedLevels.find(
          (l) => l.name === event.requiredLevel,
        );

        if (!eventLevel) {
          console.log(
            `⚠️ Event level "${event.requiredLevel}" not found in system`,
          );
        }

        if (eventLevel && staffMembers.length > 0) {
          // Filter staff who can access this event
          // Staff can access if their level order >= event level order (same or below in list)
          const eligibleStaff = staffMembers.filter((staff) => {
            if (!staff.level) {
              console.log(
                `  - ${staff.name}: No level assigned`,
              );
              return false;
            }
            const staffLevel = sortedLevels.find(
              (l) => l.name === staff.level,
            );
            // Staff with order >= event order can access (they are at same level or higher in hierarchy)
            const canAccess =
              staffLevel &&
              staffLevel.order_index >= eventLevel.order_index;
            console.log(
              `  - ${staff.name} (${staff.level}, order: ${staffLevel?.order_index}): ${canAccess ? "✓ Eligible" : "✗ Not eligible"}`,
            );
            return canAccess;
          });

          // Skip email notifications for event creation (only Telegram will be used)
          console.log(
            `ℹ️ Skipping email notifications for event creation (only Telegram notifications will be sent)`,
          );

          // Email loop removed - only Telegram notifications for new events
          /*
        for (let i = 0; i < eligibleStaff.length; i++) {
          const staff = eligibleStaff[i];
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .event-details { background-color: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
                .detail-row { margin: 15px 0; display: flex; }
                .detail-icon { width: 24px; margin-right: 10px; color: #6B7280; }
                .detail-label { color: #6B7280; font-weight: bold; margin-right: 8px; }
                .detail-value { color: #1F2937; }
                .cta-button { display: inline-block; background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                .level-badge { display: inline-block; background-color: #EFF6FF; color: #3B82F6; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: bold; }
                .points-badge { display: inline-block; background-color: #FEF3C7; color: #F59E0B; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div style="text-align: center; margin-bottom: 10px;">
                    <img src="https://img1.wsimg.com/isteam/ip/aead55c7-5dc3-4ad4-8132-6139ccf3e033/nahky.png/:/rs=w:132,h:104,cg:true,m/cr=w:132,h:104/qt=q:95" alt="Nahky Araby Logo" style="max-width: 200px; height: auto;" />
                  </div>
                  <h2 style="margin: 10px 0 20px 0; font-size: 24px; font-weight: 600; opacity: 1;">Nahky Araby Event Hub</h2>
                  <h1>🎉 New Event Available!</h1>
                </div>
                <div class="content">
                  <h2>Hello ${staff.name},</h2>
                  <p>A new event has been posted that you're eligible to attend!</p>
                  
                  <div class="event-details">
                    <h3 style="margin-top: 0; color: #10B981;">📅 ${event.name}</h3>
                    
                    <div class="detail-row">
                      <span class="detail-icon">📍</span>
                      <div>
                        <span class="detail-label">Location:</span>
                        <span class="detail-value">${event.location}</span>
                      </div>
                    </div>
                    
                    <div class="detail-row">
                      <span class="detail-icon">📆</span>
                      <div>
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      </div>
                    </div>
                    
                    <div class="detail-row">
                      <span class="detail-icon">🕐</span>
                      <div>
                        <span class="detail-label">Time:</span>
                        <span class="detail-value">${event.time}</span>
                      </div>
                    </div>
                    
                    <div class="detail-row">
                      <span class="detail-icon">🎯</span>
                      <div>
                        <span class="detail-label">Required Level:</span>
                        <span class="level-badge">${event.requiredLevel}</span>
                      </div>
                    </div>
                    
                    <div class="detail-row">
                      <span class="detail-icon">⭐</span>
                      <div>
                        <span class="detail-label">Points:</span>
                        <span class="points-badge">${event.points} points</span>
                      </div>
                    </div>
                  </div>
                  
                  <p style="text-align: center;">
                    <a href="#" class="cta-button">Sign Up Now</a>
                  </p>
                  
                  <p style="color: #6B7280; font-size: 14px;">Log in to Nahky Araby Event Hub to sign up for this event and start earning points!</p>
                </div>
                <div class="footer">
                  <p>This is an automated notification. Please do not reply to this email.</p>
                </div>
              </div>
            </body>
            </html>
          `;
          
          const emailResult = await sendEmail(
            staff.email,
            `New Event Available: ${event.name}`,
            emailHtml
          );
          
          if (emailResult.success) {
            console.log(`  ✓ Email sent to ${staff.name} (${staff.email})`);
          } else {
            console.log(`  ✗ Failed to send email to ${staff.name}: ${emailResult.error}`);
          }
          
          // Rate limiting: Wait 600ms between emails (Resend allows 2 per second)
          // Only wait if this is not the last email
          if (i < eligibleStaff.length - 1) {
            await delay(600);
          }
        }
        */

          // Send WhatsApp notifications if WhatsApp is connected
          const whatsAppSettings =
            await getIntegrationSettings("whatsapp");
          if (whatsAppSettings && whatsAppSettings.connected) {
            console.log(
              `📱 WhatsApp is connected, sending notifications to ${eligibleStaff.length} staff members`,
            );

            for (let i = 0; i < eligibleStaff.length; i++) {
              const staff = eligibleStaff[i];

              // Check if staff member has a phone number
              if (!staff.phone || staff.phone.trim() === "") {
                console.log(
                  `  ⚠️ ${staff.name}: No phone number on file, skipping WhatsApp`,
                );
                continue;
              }

              // Format WhatsApp message
              const whatsAppMessage = `🎉 *New Event Available!*

Hello ${staff.name},

A new event has been posted that you're eligible to attend:

📅 *${event.name}*
📍 Location: ${event.location}
📆 Date: ${new Date(event.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
🕐 Time: ${event.time}
🎯 Required Level: ${event.requiredLevel}
⭐ Points: ${event.points} points

Log in to Nahky Araby Event Hub to sign up for this event and start earning points!`;

              const whatsAppResult = await sendWhatsAppMessage(
                staff.phone,
                whatsAppMessage,
              );

              if (whatsAppResult.success) {
                console.log(
                  `  ✓ WhatsApp sent to ${staff.name} (${staff.phone})`,
                );
              } else {
                console.log(
                  `  ✗ Failed to send WhatsApp to ${staff.name}: ${whatsAppResult.error}`,
                );
              }

              // Rate limiting: Wait 600ms between messages to avoid API limits
              if (i < eligibleStaff.length - 1) {
                await delay(600);
              }
            }

            console.log(
              `✅ Finished sending WhatsApp notifications`,
            );
          } else {
            console.log(
              `📱 WhatsApp not connected, skipping WhatsApp notifications`,
            );
          }

          // Send Telegram notifications if Telegram is connected
          const telegramSettings =
            await getIntegrationSettings("telegram");
          console.log(
            `✈️ Telegram settings:`,
            telegramSettings
              ? {
                  connected: telegramSettings.connected,
                  botName: telegramSettings.botName,
                }
              : "NOT CONFIGURED",
          );

          if (telegramSettings && telegramSettings.connected) {
            console.log(
              `✈️ Telegram is connected, checking ${eligibleStaff.length} eligible staff members for Telegram notifications`,
            );

            let telegramSentCount = 0;
            for (let i = 0; i < eligibleStaff.length; i++) {
              const staff = eligibleStaff[i];

              // Check if staff member has a Telegram chat ID (check both fields for backwards compatibility)
              const chatId =
                staff.telegramChatId || staff.telegramUsername;
              if (!chatId || chatId.trim() === "") {
                console.log(
                  `  ⚠️ ${staff.name}: No Telegram chat ID on file, skipping Telegram`,
                );
                continue;
              }

              console.log(
                `  📤 Attempting to send Telegram to ${staff.name} (Chat ID: ${chatId})...`,
              );

              // Format Telegram message
              const telegramMessage = `🎉 *فعالية جديدة*

مرحبًا ${staff.name}،

تم نشر فعالية جديدة يمكنك حضورها:

 📅 فعالية: *${event.name}*
 📍 الموقع: ${event.location}
 📆 التاريخ: ${new Date(event.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
 🕐 الوقت: ${event.time}
 ⏱️ المدّة: ${event.duration}
 🎯 المستوى المطلوب: ${event.requiredLevel}
 ⭐️ النقاط: ${event.points} نقطة ${
   event.description
     ? `
 
 📝 الوصف: ${event.description}`
     : ""
 }${
   event.notes
     ? `
 
 💬 ملاحظات: ${event.notes}`
     : ""
 }
 
قم بتسجيل الدخول إلى تطبيق إدارة الموظفين للتسجيل في الفعالية والبدء بجمع النقاط!`;

              const telegramResult = await sendTelegramMessage(
                chatId,
                telegramMessage,
              );

              if (telegramResult.success) {
                console.log(
                  `  ✓ Telegram sent successfully to ${staff.name} (${chatId})`,
                );
                telegramSentCount++;
              } else {
                console.log(
                  `  ✗ Failed to send Telegram to ${staff.name} (${chatId}): ${telegramResult.error}`,
                );
              }

              // Rate limiting: Wait 600ms between messages to avoid API limits
              if (i < eligibleStaff.length - 1) {
                await delay(600);
              }
            }

            console.log(
              `✅ Finished sending Telegram notifications: ${telegramSentCount} sent successfully`,
            );
          } else {
            console.log(
              `✈️ Telegram not connected, skipping Telegram notifications`,
            );
          }
        }
      } catch (emailError) {
        // Log email error but don't fail the event creation
        console.error(
          "Error sending event notification emails:",
          emailError,
        );
      }
    } else {
      console.log(
        `ℹ️ Event status is "${event.status}", skipping notifications (only 'open' events trigger notifications)`,
      );
    }

    return c.json({ success: true, event });
  } catch (error) {
    console.error("Error creating event:", error);
    return c.json({ error: "Failed to create event" }, 500);
  }
});

// Update event
app.put("/events/:id", async (c) => {
  console.log(
    "🚨 PUT /events/:id called - Event update started",
  );

  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (!isAdmin) {
      return c.json(
        { error: adminError || "Admin access required" },
        403,
      );
    }

    const eventId = c.req.param("id");
    const eventData = await c.req.json();
    const supabase = getSupabaseAdmin();

    // Get existing event from Postgres with signups
    const { data: existingEventData, error: fetchError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*),
        levels!required_level (
          name
        )
      `,
        )
        .eq("id", eventId)
        .single();

    if (fetchError || !existingEventData) {
      console.error("Error fetching event:", fetchError);
      return c.json({ error: "Event not found" }, 404);
    }

    // Get signed up staff and confirmed staff from event_signups
    const signedUpStaff =
      existingEventData.event_signups?.map(
        (s: any) => s.user_id || s.staff_id,
      ) || [];
    const confirmedStaff =
      existingEventData.event_signups
        ?.filter(
          (s: any) =>
            s.confirmed_at !== null || s.is_selected === true,
        )
        .map((s: any) => s.user_id || s.staff_id) || [];

    // Convert from Postgres format
    const existingEvent = {
      id: existingEventData.id,
      name: existingEventData.name,
      date:
        existingEventData.start_date ||
        existingEventData.end_date, // Use start_date as date, fallback to end_date for old data
      endDate:
        existingEventData.end_date ||
        existingEventData.start_date, // Default to start_date if end_date is null
      time: existingEventData.start_time,
      duration: existingEventData.duration,
      location: existingEventData.location,
      description: existingEventData.description,
      notes: existingEventData.notes || "", // Default to empty string to prevent undefined
      points: existingEventData.points,
      requiredLevel:
        existingEventData.levels?.name ||
        existingEventData.required_level,
      signedUpStaff,
      confirmedStaff,
      createdAt: existingEventData.created_at,
      status: existingEventData.status || "open",
    };

    // Merge the updates with existing event data
    const updatedEvent = {
      ...existingEvent,
      ...eventData,
      id: eventId,
      signedUpStaff: existingEvent.signedUpStaff,
      confirmedStaff: existingEvent.confirmedStaff,
      createdAt: existingEvent.createdAt,
    };

    // Convert requiredLevel name to ID if it's a string
    let requiredLevelId = updatedEvent.requiredLevel;
    if (
      typeof updatedEvent.requiredLevel === "string" &&
      updatedEvent.requiredLevel
    ) {
      const { data: level } = await supabase
        .from("levels")
        .select("id")
        .eq("name", updatedEvent.requiredLevel)
        .single();
      requiredLevelId = level?.id || null;
    }

    // Save to Postgres - only update actual event table columns
    const { error: updateError } = await supabase
      .from("events")
      .update({
        name: updatedEvent.name,
        start_date: updatedEvent.date, // Update start_date with the date field (which is the start date)
        end_date: updatedEvent.endDate || updatedEvent.date, // Update end_date with endDate or fall back to start date
        start_time: updatedEvent.time,
        duration: updatedEvent.duration,
        location: updatedEvent.location,
        description: updatedEvent.description,
        notes: updatedEvent.notes,
        points: updatedEvent.points,
        required_level: requiredLevelId,
        status: updatedEvent.status,
      })
      .eq("id", eventId);

    if (updateError) {
      console.error(
        "Error updating event in Postgres:",
        updateError,
      );
      return c.json(
        {
          error: `Failed to update event: ${updateError.message}`,
        },
        500,
      );
    }

    // Send notifications based on event status
    try {
      const eventStatus = updatedEvent.status || "open";
      const oldStatus = existingEvent.status || "open";

      console.log(
        `🔍 DEBUG: Event update notification check - Old status: "${oldStatus}", New status: "${eventStatus}"`,
      );

      // Check if event status changed from draft to open (publishing an event)
      const isPublishing =
        oldStatus === "draft" && eventStatus === "open";

      console.log(`🔍 DEBUG: isPublishing = ${isPublishing}`);

      if (isPublishing) {
        console.log(
          `📢 Event is being published (draft → open), sending "new event" notifications to all eligible staff...`,
        );

        // Get all staff members from Supabase Auth
        const supabase = getSupabaseAdmin();
        const {
          data: { users: authUsers },
        } = await supabase.auth.admin.listUsers();

        const staffMembers = authUsers
          .filter(
            (u) =>
              u.user_metadata?.role === "staff" &&
              u.user_metadata?.status === "active",
          )
          .map((u) => ({
            id: u.id,
            email: u.email,
            name: u.user_metadata?.name || u.email,
            role: u.user_metadata?.role || "staff",
            level: u.user_metadata?.level || "",
            status: u.user_metadata?.status || "active",
            phone: u.user_metadata?.phone || "",
            telegramChatId:
              u.user_metadata?.telegramChatId || "",
            telegramUsername:
              u.user_metadata?.telegramUsername || "",
          }));

        // Fetch levels from Postgres
        const { data: levels, error: levelsError } =
          await supabase
            .from("levels")
            .select("*")
            .order("order_index", { ascending: true });

        if (levelsError) {
          console.error("Error fetching levels:", levelsError);
        }

        console.log(
          `📧 Found ${staffMembers.length} active staff members`,
        );
        console.log(
          `📧 Staff members:`,
          staffMembers.map((s) => ({
            name: s.name,
            level: s.level,
            telegramChatId:
              s.telegramChatId || s.telegramUsername
                ? "SET"
                : "NOT SET",
          })),
        );

        // Sort levels by order (lower order = higher in hierarchy)
        const sortedLevels =
          levels?.sort(
            (a, b) => a.order_index - b.order_index,
          ) || [];

        // Find the event's required level
        const eventLevel = sortedLevels.find(
          (l) => l.name === updatedEvent.requiredLevel,
        );

        if (!eventLevel) {
          console.log(
            `⚠️ Event level "${updatedEvent.requiredLevel}" not found in system`,
          );
        }

        if (eventLevel && staffMembers.length > 0) {
          // Filter staff who can access this event
          const eligibleStaff = staffMembers.filter((staff) => {
            if (!staff.level) {
              console.log(
                `  - ${staff.name}: No level assigned`,
              );
              return false;
            }
            const staffLevel = sortedLevels.find(
              (l) => l.name === staff.level,
            );
            const canAccess =
              staffLevel &&
              staffLevel.order_index >= eventLevel.order_index;
            console.log(
              `  - ${staff.name} (${staff.level}, order: ${staffLevel?.order_index}): ${canAccess ? "✓ Eligible" : "✗ Not eligible"}`,
            );
            return canAccess;
          });

          console.log(
            `📋 ${eligibleStaff.length} eligible staff members for this event`,
          );

          // Send Telegram notifications if Telegram is connected
          const telegramSettings =
            await getIntegrationSettings("telegram");

          if (telegramSettings && telegramSettings.connected) {
            console.log(
              `✈️ Telegram is connected, sending "new event" notifications to ${eligibleStaff.length} staff members`,
            );

            let telegramSentCount = 0;
            for (let i = 0; i < eligibleStaff.length; i++) {
              const staff = eligibleStaff[i];

              const chatId =
                staff.telegramChatId || staff.telegramUsername;
              if (!chatId || chatId.trim() === "") {
                console.log(
                  `  ⚠️ ${staff.name}: No Telegram chat ID on file, skipping Telegram`,
                );
                continue;
              }

              console.log(
                `  📤 Attempting to send Telegram to ${staff.name} (Chat ID: ${chatId})...`,
              );

              const telegramMessage = `🎉 *فعالية جديدة!*

مرحبًا ${staff.name}،

تم نشر فعالية جديدة يمكنك حضورها:

 📅 فعالية: *${updatedEvent.name}*
 📍 الموقع: ${updatedEvent.location}
 📆 التاريخ: ${new Date(updatedEvent.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
 🕐 الوقت: ${updatedEvent.time}
 ⏱️ المدّة: ${updatedEvent.duration}
 🎯 المستوى المطلوب: ${updatedEvent.requiredLevel}
 ⭐️ النقاط: ${updatedEvent.points} نقطة ${
   updatedEvent.description
     ? `
 
 📝 الوصف: ${updatedEvent.description}`
     : ""
 }${
   updatedEvent.notes
     ? `
 
 💬 ملاحظات: ${updatedEvent.notes}`
     : ""
 }
 
قم بتسجيل الدخول إلى تطبيق إدارة الموظفين للتسجيل في الفعالية والبدء بجمع النقاط!`;

              const telegramResult = await sendTelegramMessage(
                chatId,
                telegramMessage,
              );

              if (telegramResult.success) {
                console.log(
                  `  ✓ Telegram sent successfully to ${staff.name} (${chatId})`,
                );
                telegramSentCount++;
              } else {
                console.log(
                  `  ✗ Failed to send Telegram to ${staff.name} (${chatId}): ${telegramResult.error}`,
                );
              }

              // Rate limiting: Wait 600ms between messages
              if (i < eligibleStaff.length - 1) {
                await delay(600);
              }
            }

            console.log(
              `✅ Finished sending "new event" notifications (${telegramSentCount} sent successfully)`,
            );
          } else {
            console.log(
              `✈️ Telegram not connected, skipping new event notifications`,
            );
          }
        }
      }

      if (eventStatus !== "draft") {
        console.log(
          `📢 Event updated with status "${eventStatus}", checking for changes to notify staff...`,
        );

        // First, check for selection/deselection changes
        const oldConfirmedStaff =
          existingEvent.confirmedStaff || [];
        const newConfirmedStaff =
          updatedEvent.confirmedStaff || [];

        // Calculate who was selected and deselected
        const newlySelected = newConfirmedStaff.filter(
          (id: string) => !oldConfirmedStaff.includes(id),
        );
        const newlyDeselected = oldConfirmedStaff.filter(
          (id: string) => !newConfirmedStaff.includes(id),
        );

        const hasSelectionChanges =
          newlySelected.length > 0 ||
          newlyDeselected.length > 0;

        if (hasSelectionChanges) {
          console.log(
            `👥 Selection changes detected: ${newlySelected.length} newly selected, ${newlyDeselected.length} newly deselected`,
          );

          // Send selection/deselection notifications
          const telegramSettings =
            await getIntegrationSettings("telegram");

          if (telegramSettings && telegramSettings.connected) {
            console.log(
              `✈️ Sending selection change notifications via Telegram`,
            );

            // Send selection notifications
            for (let i = 0; i < newlySelected.length; i++) {
              const staffId = newlySelected[i];
              const { error: staffError, staff } =
                await getStaffFromAuth(staffId);

              if (staffError || !staff) {
                console.log(
                  `  ⚠️ Staff ${staffId}: Not found, skipping`,
                );
                continue;
              }

              // Skip inactive staff
              if (staff.status !== "active") {
                console.log(
                  `  ⏭️ ${staff.name}: Inactive account, skipping Telegram notification`,
                );
                continue;
              }

              const chatId =
                staff.telegramChatId || staff.telegramUsername;
              if (!chatId || chatId.trim() === "") {
                console.log(
                  `  ⚠️ ${staff.name}: No Telegram chat ID, skipping`,
                );
                continue;
              }

              const telegramMessage = `مرحبا ${staff.name},

🎉 *تهانينا!* 🎉

لقد تم اختيارك للمشاركة في الفعالية التالية:

 📅 فعالية: *${updatedEvent.name}*
 📍 الموقع: ${updatedEvent.location}
 📆 التاريخ: ${new Date(updatedEvent.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
 🕐 الوقت: ${updatedEvent.time}
 ⏱️ المدّة: ${updatedEvent.duration}
 ⭐️ النقاط: ${updatedEvent.points} نقطة ${
   updatedEvent.description
     ? `
 
 📝 الوصف: ${updatedEvent.description}`
     : ""
 }${
   updatedEvent.notes
     ? `
 
 💬 ملاحظات: ${updatedEvent.notes}`
     : ""
 }

نتطلّع لرؤيتك هناك! ستحصل على نقاطك بعد انتهاء الفعالية.`;

              const telegramResult = await sendTelegramMessage(
                chatId,
                telegramMessage,
              );

              if (telegramResult.success) {
                console.log(
                  `  ✓ Selection notification sent to ${staff.name}`,
                );
              } else {
                console.log(
                  `  ✗ Failed to send selection notification to ${staff.name}: ${telegramResult.error}`,
                );
              }

              // Rate limiting
              if (
                i < newlySelected.length - 1 ||
                newlyDeselected.length > 0
              ) {
                await delay(600);
              }
            }

            // Send deselection notifications
            for (let i = 0; i < newlyDeselected.length; i++) {
              const staffId = newlyDeselected[i];
              const { error: staffError, staff } =
                await getStaffFromAuth(staffId);

              if (staffError || !staff) {
                console.log(
                  `  ⚠️ Staff ${staffId}: Not found, skipping`,
                );
                continue;
              }

              // Skip inactive staff
              if (staff.status !== "active") {
                console.log(
                  `  ⏭️ ${staff.name}: Inactive account, skipping Telegram notification`,
                );
                continue;
              }

              const chatId =
                staff.telegramChatId || staff.telegramUsername;
              if (!chatId || chatId.trim() === "") {
                console.log(
                  `  ⚠️ ${staff.name}: No Telegram chat ID, skipping`,
                );
                continue;
              }

              const telegramMessage = `مرحبا ${staff.name},

شكرًا لتسجيلك في الفعالية: *${updatedEvent.name}*
للأسف، لم يتم اختيارك لهذه الفعالية يوم ${new Date(updatedEvent.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

لا تقلق! ستكون هناك الكثير من الفرص القادمة للمشاركة. راقب التطبيق للفعاليات الجديدة واستمر بالتسجيل.
نقدّر حماسك ونتطلّع لرؤيتك في فعاليات قادمة!`;

              const telegramResult = await sendTelegramMessage(
                chatId,
                telegramMessage,
              );

              if (telegramResult.success) {
                console.log(
                  `  ✓ Deselection notification sent to ${staff.name}`,
                );
              } else {
                console.log(
                  `  ✗ Failed to send deselection notification to ${staff.name}: ${telegramResult.error}`,
                );
              }

              // Rate limiting
              if (i < newlyDeselected.length - 1) {
                await delay(600);
              }
            }

            console.log(
              `✅ Sent ${newlySelected.length + newlyDeselected.length} selection change notification(s)`,
            );
          } else {
            console.log(
              `✈️ Telegram not connected, skipping selection change notifications`,
            );
          }
        }

        // Then, detect changes between existing and updated event
        const changes: string[] = [];

        if (existingEvent.name !== updatedEvent.name) {
          changes.push(
            `Name: "${existingEvent.name}" → "${updatedEvent.name}"`,
          );
        }
        if (existingEvent.date !== updatedEvent.date) {
          const oldDate = new Date(
            existingEvent.date,
          ).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const newDate = new Date(
            updatedEvent.date,
          ).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          changes.push(`Date: ${oldDate} → ${newDate}`);
        }
        if (existingEvent.time !== updatedEvent.time) {
          changes.push(
            `Time: ${existingEvent.time} → ${updatedEvent.time}`,
          );
        }
        if (existingEvent.location !== updatedEvent.location) {
          changes.push(
            `Location: "${existingEvent.location}" → "${updatedEvent.location}"`,
          );
        }
        if (existingEvent.points !== updatedEvent.points) {
          changes.push(
            `Points: ${existingEvent.points} → ${updatedEvent.points}`,
          );
        }
        if (
          existingEvent.requiredLevel !==
          updatedEvent.requiredLevel
        ) {
          changes.push(
            `Required Level: ${existingEvent.requiredLevel} → ${updatedEvent.requiredLevel}`,
          );
        }
        if (
          existingEvent.description !== updatedEvent.description
        ) {
          changes.push(`Description updated`);
        }
        if (existingEvent.notes !== updatedEvent.notes) {
          changes.push(`Notes updated`);
        }

        if (changes.length > 0) {
          console.log(
            `✏️ Detected ${changes.length} change(s):`,
            changes,
          );

          // Determine which staff to notify based on status
          let staffToNotify: string[] = [];

          if (eventStatus === "open") {
            // Notify staff who are participating (signed up)
            staffToNotify = updatedEvent.signedUpStaff || [];
            console.log(
              `📋 Event is OPEN - notifying ${staffToNotify.length} participating staff`,
            );
          } else if (eventStatus === "closed") {
            // Notify staff who are selected (confirmed)
            staffToNotify = updatedEvent.confirmedStaff || [];
            console.log(
              `🔒 Event is CLOSED - notifying ${staffToNotify.length} selected staff`,
            );
          }

          if (staffToNotify.length > 0) {
            // Check if Telegram is connected
            const telegramSettings =
              await getIntegrationSettings("telegram");

            if (
              telegramSettings &&
              telegramSettings.connected
            ) {
              console.log(
                `✈️ Telegram connected, sending update notifications to ${staffToNotify.length} staff members`,
              );

              let notificationsSent = 0;

              for (let i = 0; i < staffToNotify.length; i++) {
                const staffId = staffToNotify[i];
                const { error: staffError, staff } =
                  await getStaffFromAuth(staffId);

                if (staffError || !staff) {
                  console.log(
                    `  ⚠️ Staff member ${staffId} not found, skipping`,
                  );
                  continue;
                }

                // Skip inactive staff
                if (staff.status !== "active") {
                  console.log(
                    `  ⏭️ ${staff.name}: Inactive account, skipping Telegram notification`,
                  );
                  continue;
                }

                const chatId =
                  staff.telegramChatId ||
                  staff.telegramUsername;
                if (!chatId || chatId.trim() === "") {
                  console.log(
                    `  ⚠️ ${staff.name}: No Telegram chat ID, skipping`,
                  );
                  continue;
                }

                // Format the changes list
                const changesText = changes
                  .map((change, idx) => `${idx + 1}. ${change}`)
                  .join("\n");

                const telegramMessage = `📝 *تعديل فعالية*

مرحبًا ${staff.name},

تم تحديث فعالية قمتِ بالتسجيل بها: ${eventStatus === "open" ? "signed up for" : "selected for"}

*${updatedEvent.name}*

*التعديلات:*
${changesText}

*بيانات الفعالية الحالية:*
📍 الموقع: ${updatedEvent.location}
📆 التاريخ: ${new Date(updatedEvent.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
🕐 الوقت: ${updatedEvent.time}
⏱️ المدّة: ${updatedEvent.duration}
⭐ النقاط: ${updatedEvent.points}

يرجى أخذ العلم بهذه التغييرات. سجّلي الدخول إلى التطبيق لعرض التفاصيل الكاملة.`;

                const telegramResult =
                  await sendTelegramMessage(
                    chatId,
                    telegramMessage,
                  );

                if (telegramResult.success) {
                  console.log(
                    `  ✓ Update notification sent to ${staff.name}`,
                  );
                  notificationsSent++;
                } else {
                  console.log(
                    `  ✗ Failed to send update notification to ${staff.name}: ${telegramResult.error}`,
                  );
                }

                // Rate limiting
                if (i < staffToNotify.length - 1) {
                  await delay(600);
                }
              }

              console.log(
                `✅ Sent ${notificationsSent} update notification(s)`,
              );
            } else {
              console.log(
                `✈️ Telegram not connected, skipping update notifications`,
              );
            }
          } else {
            console.log(
              `ℹ️ No staff to notify (event status: ${eventStatus})`,
            );
          }
        } else {
          console.log(
            `ℹ️ No significant event detail changes detected, skipping detail update notifications`,
          );
        }
      } else {
        console.log(
          `ℹ️ Event status is "draft", skipping update notifications`,
        );
      }
    } catch (notificationError) {
      console.error(
        "Error sending event update notifications:",
        notificationError,
      );
    }

    return c.json({ success: true, event: updatedEvent });
  } catch (error) {
    console.error("Error updating event:", error);
    return c.json({ error: "Failed to update event" }, 500);
  }
});

// Cancel event
app.post("/events/:id/cancel", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const eventId = c.req.param("id");
    const supabase = getSupabaseAdmin();

    // Get existing event from Postgres
    const { data: existingEventData, error: fetchError } =
      await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

    if (fetchError || !existingEventData) {
      console.error("Error fetching event:", fetchError);
      return c.json({ error: "Event not found" }, 404);
    }

    // Convert from Postgres format
    const existingEvent = {
      id: existingEventData.id,
      name: existingEventData.name,
      date:
        existingEventData.start_date ||
        existingEventData.end_date, // Use start_date as date, fallback to end_date for old data
      endDate:
        existingEventData.end_date ||
        existingEventData.start_date, // Default to start_date if end_date is null
      time: existingEventData.start_time,
      duration: existingEventData.duration || "",
      location: existingEventData.location,
      description: existingEventData.description || "",
      notes: existingEventData.notes || "", // Default to empty string to prevent undefined
      points: existingEventData.points,
      requiredLevel: existingEventData.required_level,
      signedUpStaff: existingEventData.signed_up_staff || [],
      signUpTimestamps:
        existingEventData.sign_up_timestamps || {},
      confirmedStaff: existingEventData.confirmed_staff || [],
      pointsAwarded: existingEventData.points_awarded || [],
      createdAt: existingEventData.created_at,
      status: existingEventData.status || "open",
    };

    // Log staff data before cancelling
    console.log(`🔍 BEFORE cancel - Database has:`, {
      id: existingEventData.id,
      name: existingEventData.name,
      signed_up_staff: existingEventData.signed_up_staff,
      confirmed_staff: existingEventData.confirmed_staff,
      status: existingEventData.status,
    });
    console.log(`🔍 BEFORE cancel - Built event object has:`, {
      signedUpStaff: existingEvent.signedUpStaff,
      confirmedStaff: existingEvent.confirmedStaff,
    });

    // Update event status to cancelled in Postgres (staff data is NOT modified)
    const { error: updateError } = await supabase
      .from("events")
      .update({ status: "cancelled" })
      .eq("id", eventId);

    if (updateError) {
      console.error(
        "Error cancelling event in Postgres:",
        updateError,
      );
      return c.json(
        {
          error: `Failed to cancel event: ${updateError.message}`,
        },
        500,
      );
    }

    // Re-fetch the event to get the complete current data with signups
    const { data: refetchedEventData, error: refetchError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*)
      `,
        )
        .eq("id", eventId)
        .single();

    if (refetchError || !refetchedEventData) {
      console.error(
        "Error re-fetching cancelled event:",
        refetchError,
      );
      return c.json(
        { error: "Failed to retrieve cancelled event data" },
        500,
      );
    }

    console.log("🔍 Re-fetched event from database:", {
      id: refetchedEventData.id,
      name: refetchedEventData.name,
      event_signups_count:
        refetchedEventData.event_signups?.length || 0,
      confirmed_staff: refetchedEventData.confirmed_staff,
      status: refetchedEventData.status,
    });

    // Log detailed event_signups to debug confirmed staff
    if (
      refetchedEventData.event_signups &&
      refetchedEventData.event_signups.length > 0
    ) {
      console.log(
        "🔍 Event signups details:",
        refetchedEventData.event_signups.map((s: any) => ({
          user_id: s.user_id || s.staff_id,
          confirmed_at: s.confirmed_at,
          is_selected: s.is_selected,
          signed_up_at: s.signed_up_at,
        })),
      );
    }

    // Get signed up staff from event_signups table (not from deprecated signed_up_staff column)
    const signedUpStaff =
      refetchedEventData.event_signups?.map(
        (s: any) => s.user_id || s.staff_id,
      ) || [];

    // Get confirmed staff from event_signups (filter by confirmed_at or is_selected)
    const confirmedStaffFromSignups =
      refetchedEventData.event_signups
        ?.filter(
          (s: any) =>
            s.confirmed_at !== null || s.is_selected === true,
        )
        .map((s: any) => s.user_id || s.staff_id) || [];

    // Fallback to confirmed_staff column if signups don't have confirmed staff
    const confirmedStaff =
      confirmedStaffFromSignups.length > 0
        ? confirmedStaffFromSignups
        : refetchedEventData.confirmed_staff || [];

    console.log(
      "🔍 Cancel endpoint - confirmedStaff resolution:",
      {
        fromSignups: confirmedStaffFromSignups,
        fromColumn: refetchedEventData.confirmed_staff,
        final: confirmedStaff,
        eventSignupsDetailed:
          refetchedEventData.event_signups?.map((s: any) => ({
            user_id: s.user_id,
            is_selected: s.is_selected,
            confirmed_at: s.confirmed_at,
          })),
      },
    );

    // Build sign-up timestamps from event_signups
    const signUpTimestamps =
      refetchedEventData.event_signups?.reduce(
        (acc: any, s: any) => {
          const staffId = s.user_id || s.staff_id;
          acc[staffId] = s.signed_up_at;
          return acc;
        },
        {},
      ) || {};

    // Fetch levels to map required_level back to level name
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");
    const level = (pgLevels || []).find(
      (l: any) => l.id === refetchedEventData.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Build the complete cancelled event from fresh database data
    const cancelledEvent = {
      id: refetchedEventData.id,
      name: refetchedEventData.name,
      date:
        refetchedEventData.start_date ||
        refetchedEventData.end_date,
      endDate:
        refetchedEventData.end_date ||
        refetchedEventData.start_date,
      time: refetchedEventData.start_time,
      duration: refetchedEventData.duration || "",
      location: refetchedEventData.location,
      description: refetchedEventData.description || "",
      notes: refetchedEventData.notes || "",
      points: refetchedEventData.points,
      requiredLevel: requiredLevelName,
      signedUpStaff: signedUpStaff,
      signUpTimestamps: signUpTimestamps,
      confirmedStaff: confirmedStaff,
      pointsAwarded: [], // Points awarded info would need to be fetched from point_adjustments table if needed
      createdAt: refetchedEventData.created_at,
      status: "cancelled",
    };

    console.log("🔍 Built cancelled event with:", {
      signedUpStaffCount: cancelledEvent.signedUpStaff.length,
      confirmedStaffCount: cancelledEvent.confirmedStaff.length,
      confirmedStaff: cancelledEvent.confirmedStaff,
    });

    // Determine who to notify based on event status before cancellation:
    // - If event was closed: Only notify confirmedStaff (selected staff)
    // - If event was open: Notify all signedUpStaff (everyone who signed up)
    const wasEventClosed =
      existingEventData.status === "closed";
    const staffToNotify = wasEventClosed
      ? cancelledEvent.confirmedStaff
      : cancelledEvent.signedUpStaff;

    console.log(
      `✅ Event cancelled successfully - Event was "${existingEventData.status}", will notify ${staffToNotify.length} staff ${wasEventClosed ? "(confirmed only)" : "(all signed up)"}`,
    );

    // Send Telegram notifications to staff members (NO EMAILS for cancellations)
    try {
      if (staffToNotify && staffToNotify.length > 0) {
        console.log(
          `📱 Sending Telegram cancellation notifications for event: ${cancelledEvent.name}`,
        );

        // Get all staff members who were confirmed from Auth
        const supabase = getSupabaseAdmin();
        const {
          data: { users: authUsers },
        } = await supabase.auth.admin.listUsers();

        const participatingStaff = authUsers
          .filter(
            (u) =>
              staffToNotify.includes(u.id) &&
              u.user_metadata?.status === "active",
          )
          .map((u) => ({
            id: u.id,
            email: u.email,
            name: u.user_metadata?.name || u.email,
            telegramChatId:
              u.user_metadata?.telegramChatId || "",
            telegramUsername:
              u.user_metadata?.telegramUsername || "",
            status: u.user_metadata?.status || "active",
          }));

        console.log(
          `Found ${participatingStaff.length} confirmed staff members to notify via Telegram`,
        );

        // Send Telegram notifications - Get settings from Postgres
        const { data: telegramSettings } = await supabase
          .from("integration_settings2")
          .select("*")
          .eq("integration_type", "telegram")
          .eq("connected", true)
          .single();

        console.log(
          `✈️ Telegram settings for cancellation:`,
          telegramSettings
            ? {
                connected: telegramSettings.connected,
                botName: telegramSettings.bot_name,
              }
            : "NOT CONFIGURED",
        );

        if (telegramSettings && telegramSettings.connected) {
          console.log(
            `✈️ Telegram is connected, sending cancellation notifications to ${participatingStaff.length} staff members`,
          );

          let telegramSentCount = 0;
          for (let i = 0; i < participatingStaff.length; i++) {
            const staff = participatingStaff[i];

            // Check if staff member has a Telegram chat ID (check both fields for backwards compatibility)
            const chatId =
              staff.telegramChatId || staff.telegramUsername;
            if (!chatId || chatId.trim() === "") {
              console.log(
                `  ⚠️ ${staff.name}: No Telegram chat ID on file, skipping Telegram`,
              );
              continue;
            }

            console.log(
              `  📤 Attempting to send Telegram to ${staff.name} (Chat ID: ${chatId})...`,
            );

            // Format Telegram message
            const telegramMessage = `⚠️ *إلغاء فعالية*

مرحبًا ${staff.name},

نأسف لإبلاغك بأن الفعالية التالية قد تم إلغاؤها:

📅 الفاعالية: *${cancelledEvent.name}*
📍 الموقع: ${cancelledEvent.location}
📆 التاريخ: ${new Date(cancelledEvent.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
🕐 الوقت: ${cancelledEvent.time}

نعتذر عن أي إزعاج. يرجى التحقق من التطبيق لرؤية فعاليات أخرى يمكنك المشاركة فيها.`;

            const telegramResult = await sendTelegramMessage(
              chatId,
              telegramMessage,
            );

            if (telegramResult.success) {
              console.log(
                `  ✓ Telegram sent successfully to ${staff.name} (${chatId})`,
              );
              telegramSentCount++;
            } else {
              console.log(
                `  ✗ Failed to send Telegram to ${staff.name} (${chatId}): ${telegramResult.error}`,
              );
            }

            // Rate limiting: Wait 600ms between messages
            if (i < participatingStaff.length - 1) {
              await delay(600);
            }
          }

          console.log(
            `✅ Finished sending Telegram cancellation notifications: ${telegramSentCount} sent successfully`,
          );
        }

        // DO NOT remove participants when cancelling - they should be preserved for reinstatement
        console.log(
          `✅ Event cancelled - ${cancelledEvent.signedUpStaff.length} participants preserved for potential reinstatement`,
        );
      }
    } catch (notificationError) {
      console.error(
        "Error sending cancellation notifications:",
        notificationError,
      );
      // Don't fail the cancellation if notifications fail
    }

    return c.json({
      success: true,
      event: cancelledEvent,
      debug: {
        dbBeforeCancel: {
          signed_up_staff: existingEventData.signed_up_staff,
          confirmed_staff: existingEventData.confirmed_staff,
        },
        dbAfterCancel: {
          signed_up_staff: refetchedEventData.signed_up_staff,
          confirmed_staff: refetchedEventData.confirmed_staff,
        },
        transformedEvent: {
          signedUpStaff: cancelledEvent.signedUpStaff,
          confirmedStaff: cancelledEvent.confirmedStaff,
        },
      },
    });
  } catch (error) {
    console.error("Error cancelling event:", error);
    return c.json({ error: "Failed to cancel event" }, 500);
  }
});

// Reinstate event
app.post("/events/:id/reinstate", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const eventId = c.req.param("id");

    const supabase = getSupabaseAdmin();

    // Get existing event from Postgres WITH signups
    const { data: existingEventData, error: fetchError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*)
      `,
        )
        .eq("id", eventId)
        .single();

    if (fetchError || !existingEventData) {
      console.error("Error fetching event:", fetchError);
      return c.json({ error: "Event not found" }, 404);
    }

    // Log the staff data for debugging
    console.log(
      `🔍 Reinstating event "${existingEventData.name}" - Staff data in database:`,
      {
        event_signups_count:
          existingEventData.event_signups?.length || 0,
        confirmed_staff: existingEventData.confirmed_staff,
        sign_up_timestamps:
          existingEventData.sign_up_timestamps,
      },
    );

    // Update event status back to 'open' in Postgres
    const { error: updateError } = await supabase
      .from("events")
      .update({ status: "open" })
      .eq("id", eventId);

    if (updateError) {
      console.error(
        "Error reinstating event in Postgres:",
        updateError,
      );
      return c.json(
        {
          error: `Failed to reinstate event: ${updateError.message}`,
        },
        500,
      );
    }

    // Re-fetch the event with signups after update to ensure fresh data
    const { data: refetchedEventData, error: refetchError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*)
      `,
        )
        .eq("id", eventId)
        .single();

    if (refetchError || !refetchedEventData) {
      console.error("Error re-fetching event:", refetchError);
      return c.json(
        { error: "Event not found after update" },
        404,
      );
    }

    console.log("🔍 Re-fetched event from database:", {
      id: refetchedEventData.id,
      name: refetchedEventData.name,
      event_signups_count:
        refetchedEventData.event_signups?.length || 0,
      confirmed_staff: refetchedEventData.confirmed_staff,
      status: refetchedEventData.status,
    });

    // Get signed up staff from event_signups table (not from deprecated signed_up_staff column)
    const signedUpStaff =
      refetchedEventData.event_signups?.map(
        (s: any) => s.user_id || s.staff_id,
      ) || [];

    // Build sign-up timestamps from event_signups
    const signUpTimestamps =
      refetchedEventData.event_signups?.reduce(
        (acc: any, s: any) => {
          const staffId = s.user_id || s.staff_id;
          acc[staffId] = s.signed_up_at;
          return acc;
        },
        {},
      ) || {};

    // Fetch levels to map required_level back to level name
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");
    const level = (pgLevels || []).find(
      (l: any) => l.id === refetchedEventData.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Convert from Postgres format for response
    const reinstatedEvent = {
      id: refetchedEventData.id,
      name: refetchedEventData.name,
      date:
        refetchedEventData.start_date ||
        refetchedEventData.end_date, // Use start_date as date, fallback to end_date for old data
      endDate:
        refetchedEventData.end_date ||
        refetchedEventData.start_date, // Default to start_date if end_date is null
      time: refetchedEventData.start_time,
      duration: refetchedEventData.duration,
      location: refetchedEventData.location,
      description: refetchedEventData.description || "",
      notes: refetchedEventData.notes || "", // Default to empty string to prevent undefined
      points: refetchedEventData.points,
      requiredLevel: requiredLevelName,
      signedUpStaff,
      signUpTimestamps,
      confirmedStaff: refetchedEventData.confirmed_staff || [],
      pointsAwarded: [], // Will be populated from point_adjustments if needed
      createdAt: refetchedEventData.created_at,
      status: "open",
    };

    console.log(
      `✅ Event "${reinstatedEvent.name}" has been reinstated`,
    );
    console.log(
      `ℹ️ Reinstated with ${reinstatedEvent.signedUpStaff.length} signed-up staff and ${reinstatedEvent.confirmedStaff.length} confirmed staff`,
    );
    console.log(
      `ℹ️ No notifications sent (reopening closed events does not trigger notifications)`,
    );

    return c.json({ success: true, event: reinstatedEvent });
  } catch (error) {
    console.error("Error reinstating event:", error);
    return c.json({ error: "Failed to reinstate event" }, 500);
  }
});

// Delete event
app.delete("/events/:id", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (!isAdmin) {
      return c.json(
        { error: adminError || "Admin access required" },
        403,
      );
    }

    const eventId = c.req.param("id");
    const supabase = getSupabaseAdmin();

    // Delete from Postgres
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId);

    if (deleteError) {
      console.error(
        "Error deleting event from Postgres:",
        deleteError,
      );
      return c.json(
        {
          error: `Failed to delete event: ${deleteError.message}`,
        },
        500,
      );
    }

    console.log(`✅ Event deleted successfully: ${eventId}`);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting event:", error);
    return c.json({ error: "Failed to delete event" }, 500);
  }
});

// ==================== STAFF ENDPOINTS ====================

// Get all staff members
app.get("/staff", async (c) => {
  try {
    console.log("GET /staff - Fetching staff");
    const authHeader = c.req.header("Authorization");
    console.log(
      "GET /staff - Auth header:",
      authHeader
        ? authHeader.substring(0, 30) + "..."
        : "MISSING",
    );

    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      console.error("GET /staff - Auth failed:", authError);
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Get staff from Supabase Auth instead of KV
    const supabase = getSupabaseAdmin();
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error(
        "Error fetching users from Auth:",
        listError,
      );
      return c.json({ error: "Failed to fetch staff" }, 500);
    }

    // Filter and map auth users to staff format
    const staff = users
      .filter(
        (u) =>
          u.user_metadata?.role === "staff" ||
          !u.user_metadata?.role,
      )
      .map((u) => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.name || u.email,
        points: u.user_metadata?.points || 0,
        level: u.user_metadata?.level || "",
        status: u.user_metadata?.status || "active",
        role: u.user_metadata?.role || "staff",
        phone: u.user_metadata?.phone || "",
        telegramChatId: u.user_metadata?.telegramChatId || "",
        telegramUsername:
          u.user_metadata?.telegramUsername || "",
        whatsappPhone: u.user_metadata?.whatsappPhone || "",
        createdAt: u.created_at,
      }));

    console.log(
      "GET /staff - Fetched",
      staff.length,
      "staff members",
    );

    return c.json({ staff });
  } catch (error) {
    console.error("Error fetching staff:", error);
    return c.json({ error: "Failed to fetch staff" }, 500);
  }
});

// Invite new staff member (admin only)
app.post("/staff/invite", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin (get from auth metadata)
    const supabase = getSupabaseAdmin();
    const {
      data: { user: adminUser },
    } = await supabase.auth.admin.getUserById(user.id);

    if (
      !adminUser ||
      adminUser.user_metadata?.role !== "admin"
    ) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { email, name, phone, appUrl } = await c.req.json();

    if (!email || !name) {
      return c.json(
        { error: "Email and name are required" },
        400,
      );
    }

    // Normalize email to lowercase to prevent case-sensitivity issues
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists (query Auth instead of KV)
    const {
      data: { users: existingUsers },
    } = await supabase.auth.admin.listUsers();
    const emailExists = existingUsers.some(
      (u) => u.email?.toLowerCase() === normalizedEmail,
    );

    if (emailExists) {
      return c.json(
        {
          error:
            "A staff member with this email already exists",
        },
        400,
      );
    }

    // Generate temporary password
    const tempPassword = `temp${Math.random().toString(36).slice(2, 10)}`;

    // Create user in Supabase Auth with ALL data in user_metadata
    const { data: authData, error: signupError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        user_metadata: {
          name,
          role: "staff",
          points: 0,
          level: "",
          status: "pending",
          phone: phone || "",
          telegramChatId: "",
          whatsappPhone: "",
        },
        // Automatically confirm the user's email since an email server hasn't been configured.
        email_confirm: true,
      });

    if (signupError) {
      console.error("Error creating staff user:", signupError);
      return c.json({ error: signupError.message }, 400);
    }

    // Insert role into user_roles table
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role: "staff",
      });

    if (roleError) {
      console.error("Error inserting user role:", roleError);
      // Don't fail the invite, but log the error
    }

    // Create staff profile in Postgres
    const { error: profileError } = await supabase
      .from("staff_profiles")
      .insert({
        id: authData.user.id,
        name:
          authData.user.user_metadata.name ||
          authData.user.email ||
          "Unknown",
        email: authData.user.email || "",
        phone: phone || "",
        telegram_chat_id: null,
        status: authData.user.user_metadata.status || "pending",
        created_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error(
        "Error creating staff profile:",
        profileError,
      );
      // Don't fail the invite, but log the error
    }

    // Return staff data from auth metadata
    const staffMember = {
      id: authData.user.id,
      email: authData.user.email,
      name: authData.user.user_metadata.name,
      phone: authData.user.user_metadata.phone,
      points: authData.user.user_metadata.points,
      level: authData.user.user_metadata.level,
      status: authData.user.user_metadata.status,
      role: authData.user.user_metadata.role,
      createdAt: authData.user.created_at,
    };

    // Send invitation email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background-color: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
          .credential-row { margin: 15px 0; }
          .credential-label { color: #6B7280; font-size: 14px; margin-bottom: 5px; }
          .credential-value { background-color: #F3F4F6; padding: 10px 15px; border-radius: 6px; font-family: monospace; font-size: 16px; color: #1F2937; border: 1px solid #E5E7EB; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .warning-box { background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; }
          .info-box { background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6; }
          .arabic-section { direction: rtl; text-align: right; }
          .divider { border-top: 2px solid #E5E7EB; margin: 40px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="text-align: center; margin-bottom: 10px;">
              <img src="https://img1.wsimg.com/isteam/ip/aead55c7-5dc3-4ad4-8132-6139ccf3e033/nahky.png/:/rs=w:132,h:104,cg:true,m/cr=w:132,h:104/qt=q:95" alt="Nahky Araby Logo" style="max-width: 200px; height: auto;" />
            </div>
            <h2 style="margin: 10px 0 20px 0; font-size: 24px; font-weight: 600; opacity: 1;">Nahky Araby Event Hub</h2>
            <h1>بريد الدعوة</h1>
          </div>
          <div class="content arabic-section">
            <h2>مرحبا بكم في تطبيق مركز فعاليات نحكي عربي!</h2>
            <h3>مرحبا ${name}،</h3>
            <p>لقد تمت دعوتك للانضمام إلى منصّة إدارة الموظفين. سيساعدك هذا التطبيق على تنظيم مشاركاتك في الفعاليات ومتابعة تقدّمك.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #10B981;">🔐 بيانات الدخول الخاصة بك</h3>
              <div class="credential-row">
                <div class="credential-label">اسم المستخدم (البريد الإلكتروني)</div>
                <div class="credential-value" style="direction: ltr; text-align: left;">${normalizedEmail}</div>
              </div>
              <div class="credential-row">
                <div class="credential-label">كلمة المرور المؤقتة</div>
                <div class="credential-value" style="direction: ltr; text-align: left;">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ تنبيه مهم – أول تسجيل دخول</strong>
              <p style="margin: 10px 0 0 0;">عند تسجيل الدخول للمرة الأولى باستخدام هذه البيانات، سيُطلب منك إنشاء كلمة مرور جديدة وآمنة قبل الوصول إلى حسابك.</p>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">📋 الخطوات التالية</h3>
              <ol style="margin: 10px 0; padding-right: 20px;">
                <li>زيارة صفحة تسجيل الدخول لتطبيق إدارة الموظفين</li>
                <li>إدخال بريدك الإلكتروني وكلمة المرور المؤقتة</li>
                <li>إنشاء كلمة مرور جديدة وآمنة</li>
                <li>البدء بإدارة فعالياتك وتتبع تقدّمك!</li>
              </ol>
            </div>
            
            <div class=\"info-box\" style=\"background-color: #DBEAFE;\">
              <h3 style=\"margin-top: 0;\">✈️ إعداد إشعارات تيليغرام</h3>
              <p style=\"margin: 10px 0;\">ابقَ على اطّلاع دائم بالفعاليات الجديدة والتنبيهات المهمة عبر تيليغرام:</p>
              <ol style=\"margin: 10px 0; padding-left: 20px;\">
                <li><strong>حمّل تطبيق تيليغرام</strong> وأنشئ حسابًا</li>
                <li><strong>ابحث عن: "nahkyaraby_bot@"</strong> ثم اضغط "Start"</li>
                <li><strong>تواصل مع المشرف</strong> لتأكيد اكتمال الإعداد</li>
              </ol>
              <p style=\"margin: 10px 0 0 0; font-size: 14px; color: #6B7280;\">ملاحظة: إعداد تيليغرام اختياري ولكنه موصى به بشدة للحصول على إشعارات فورية حول الفعاليات والتحديثات.</p>
            </div>
            
            <p>لأي استفسار، يرجى التواصل مع المشرف.</p>
          </div>
          
          <div class="divider"></div>
          
          <div class="content">
            <h2>Welcome to Our Platform!</h2>
            <h3>Hello ${name},</h3>
            <p>You've been invited to join Nahky Araby Event Hub. This app will help you manage your event participation and track your progress.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #10B981;">🔐 Your Login Credentials</h3>
              <div class="credential-row">
                <div class="credential-label">Username (Email)</div>
                <div class="credential-value">${normalizedEmail}</div>
              </div>
              <div class="credential-row">
                <div class="credential-label">Temporary Password</div>
                <div class="credential-value">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ Important - First Login</strong>
              <p style="margin: 10px 0 0 0;">When you first log in with these credentials, you will be required to set up a new secure password before accessing your account.</p>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">📋 Next Steps</h3>
              <ol style="margin: 10px 0; padding-left: 20px;">
                <li>Visit Nahky Araby Event Hub login page</li>
                <li>Enter your email and temporary password</li>
                <li>Create a new secure password</li>
                <li>Start managing your events and tracking your progress!</li>
              </ol>
            </div>
            
            <div class="info-box" style="background-color: #DBEAFE;">
              <h3 style=\\\"margin-top: 0;\\\">✈️ Setting Up Telegram Notifications</h3>
              <p style=\\\"margin: 10px 0;\\\">Stay updated on new events and important notifications via Telegram:</p>
              <ol style=\\\"margin: 10px 0; padding-right: 20px;\\\">
                <li><strong>Download Telegram</strong> and sign up for an account</li>
                <li><strong>Search for "@nahkyaraby_bot"</strong> and click the "Start" button</li>
                <li><strong>Contact the admin</strong> and confirm that the setup is completed</li>
              </ol>
              <p style=\\\"margin: 10px 0 0 0; font-size: 14px; color: #6B7280;\\\">Note: Setting up Telegram is optional but highly recommended to receive real-time notifications about new events and updates.</p>
            </div>
            
            <p>If you have any questions, please contact your administrator.</p>
          </div>
          <div class="footer">
            <p>هذه رسالة آلية — يرجى عدم الرد على هذا البريد.<br>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResult = await sendEmail(
      normalizedEmail,
      "Welcome to Nahky Araby Event Hub - Your Invitation",
      emailHtml,
    );

    if (!emailResult.success) {
      // User is created successfully, just email failed
      // This is expected in Resend testing mode
      console.log(
        "✅ Staff member created:",
        staffMember.name,
        "- Manual credentials provided (email in testing mode)",
      );

      return c.json({
        success: true,
        staff: staffMember,
        tempPassword,
        emailSent: false,
        isTestingMode: emailResult.isTestingMode || false,
      });
    }

    return c.json({
      success: true,
      staff: staffMember,
      tempPassword,
      emailSent: true,
    });
  } catch (error) {
    console.error("Error inviting staff:", error);
    return c.json(
      { error: "Failed to invite staff member" },
      500,
    );
  }
});

// Update staff member status (admin only) - MUST come before /staff/:id
app.put("/staff/:id/status", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin (from auth metadata)
    const supabase = getSupabaseAdmin();
    const {
      data: { user: adminUser },
    } = await supabase.auth.admin.getUserById(user.id);

    if (
      !adminUser ||
      adminUser.user_metadata?.role !== "admin"
    ) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const staffId = c.req.param("id");
    const { status } = await c.req.json();

    // Validate status
    if (!["active", "inactive"].includes(status)) {
      return c.json(
        {
          error:
            'Invalid status. Must be "active" or "inactive"',
        },
        400,
      );
    }

    // Get existing staff member from Auth
    const {
      data: { user: staffUser },
      error: getUserError,
    } = await supabase.auth.admin.getUserById(staffId);

    if (getUserError || !staffUser) {
      return c.json({ error: "Staff member not found" }, 404);
    }

    // Update user metadata in Supabase Auth
    const { data: updateData, error: updateError } =
      await supabase.auth.admin.updateUserById(staffId, {
        user_metadata: {
          ...staffUser.user_metadata,
          status: status,
        },
      });

    if (updateError) {
      console.error(
        "Error updating staff status in Auth:",
        updateError,
      );
      return c.json(
        { error: "Failed to update staff status" },
        500,
      );
    }

    // Return updated staff data from auth metadata
    const updatedStaff = {
      id: updateData.user.id,
      email: updateData.user.email,
      name: updateData.user.user_metadata.name,
      phone: updateData.user.user_metadata.phone,
      points: updateData.user.user_metadata.points || 0,
      level: updateData.user.user_metadata.level,
      status: updateData.user.user_metadata.status || "active",
      role: updateData.user.user_metadata.role || "staff",
      telegramChatId:
        updateData.user.user_metadata.telegramChatId,
      telegramUsername:
        updateData.user.user_metadata.telegramChatId, // For backward compatibility
      whatsappPhone:
        updateData.user.user_metadata.whatsappPhone || "",
      createdAt: updateData.user.created_at,
    };

    console.log(
      `✅ Staff status updated: ${updatedStaff.name} is now ${status}`,
    );

    return c.json({
      success: true,
      staff: updatedStaff,
    });
  } catch (error) {
    console.error("Error updating staff status:", error);
    return c.json(
      { error: "Failed to update staff status" },
      500,
    );
  }
});

// Update staff member (admin only)
app.put("/staff/:id", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin (from auth metadata)
    const supabase = getSupabaseAdmin();
    const {
      data: { user: adminUser },
    } = await supabase.auth.admin.getUserById(user.id);

    if (
      !adminUser ||
      adminUser.user_metadata?.role !== "admin"
    ) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const staffId = c.req.param("id");
    const { name, email, phone, level, telegramUsername } =
      await c.req.json();

    // Get existing staff member from Auth
    const {
      data: { user: staffUser },
      error: getUserError,
    } = await supabase.auth.admin.getUserById(staffId);

    if (getUserError || !staffUser) {
      return c.json({ error: "Staff member not found" }, 404);
    }

    // Update user metadata in Supabase Auth
    const { data: updateData, error: updateError } =
      await supabase.auth.admin.updateUserById(staffId, {
        email,
        user_metadata: {
          ...staffUser.user_metadata,
          name,
          phone: phone || "",
          level,
          telegramChatId: telegramUsername || "",
          telegramUsername: telegramUsername || "", // Keep for backwards compatibility
        },
      });

    if (updateError) {
      console.error(
        "Error updating staff in Auth:",
        updateError,
      );
      return c.json(
        { error: "Failed to update staff member" },
        500,
      );
    }

    // Return updated staff data from auth metadata
    const updatedStaff = {
      id: updateData.user.id,
      email: updateData.user.email,
      name: updateData.user.user_metadata.name,
      phone: updateData.user.user_metadata.phone,
      points: updateData.user.user_metadata.points || 0,
      level: updateData.user.user_metadata.level,
      status: updateData.user.user_metadata.status || "active",
      role: updateData.user.user_metadata.role || "staff",
      telegramChatId:
        updateData.user.user_metadata.telegramChatId,
      telegramUsername:
        updateData.user.user_metadata.telegramChatId, // For backward compatibility
      whatsappPhone:
        updateData.user.user_metadata.whatsappPhone || "",
      createdAt: updateData.user.created_at,
    };

    return c.json({
      success: true,
      staff: updatedStaff,
    });
  } catch (error) {
    console.error("Error updating staff:", error);
    return c.json(
      { error: "Failed to update staff member" },
      500,
    );
  }
});

// Delete staff member (admin only)
app.delete("/staff/:id", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin (from auth metadata)
    const supabase = getSupabaseAdmin();
    const {
      data: { user: adminUser },
    } = await supabase.auth.admin.getUserById(user.id);

    if (
      !adminUser ||
      adminUser.user_metadata?.role !== "admin"
    ) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const staffId = c.req.param("id");

    // Get staff member from Auth to verify they exist
    const {
      data: { user: staffUser },
      error: getUserError,
    } = await supabase.auth.admin.getUserById(staffId);

    if (getUserError || !staffUser) {
      return c.json({ error: "Staff member not found" }, 404);
    }

    // Prevent deleting admin users
    if (staffUser.user_metadata?.role === "admin") {
      return c.json(
        { error: "Cannot delete admin users" },
        403,
      );
    }

    // Remove staff from all events they're signed up for
    const events = await kv.getByPrefix("event:");
    for (const event of events) {
      if (
        event.signedUpStaff &&
        event.signedUpStaff.includes(staffId)
      ) {
        const updatedEvent = {
          ...event,
          signedUpStaff: event.signedUpStaff.filter(
            (id: string) => id !== staffId,
          ),
        };
        await kv.set(`event:${event.id}`, updatedEvent);
      }
    }

    // Delete user from Supabase Auth (this will cascade delete from user_roles due to foreign key)
    const { error: deleteAuthError } =
      await supabase.auth.admin.deleteUser(staffId);

    if (deleteAuthError) {
      console.error(
        "Error deleting user from Auth:",
        deleteAuthError,
      );
      return c.json(
        { error: "Failed to delete staff member" },
        500,
      );
    }

    return c.json({
      success: true,
      message: "Staff member deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting staff member:", error);
    return c.json(
      { error: "Failed to delete staff member" },
      500,
    );
  }
});

// Send password reset for staff member (admin only)
app.post("/staff/password-reset", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (!isAdmin) {
      return c.json(
        { error: adminError || "Admin access required" },
        403,
      );
    }

    const { staffId } = await c.req.json();

    // Get staff member from Auth
    const { error: staffError, staff } =
      await getStaffFromAuth(staffId);
    if (staffError || !staff) {
      return c.json({ error: "Staff member not found" }, 404);
    }

    // Generate temporary password
    const tempPassword = `reset${Math.random().toString(36).slice(2, 10)}`;

    const supabase = getSupabaseAdmin();

    // Update the user's password in Supabase Auth
    const { error: updateError } =
      await supabase.auth.admin.updateUserById(staffId, {
        password: tempPassword,
      });

    if (updateError) {
      console.error(
        "Error updating staff password:",
        updateError,
      );
      return c.json(
        { error: "Failed to generate temporary password" },
        500,
      );
    }

    // Send password reset email with temporary password (bilingual: Arabic + English)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background-color: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
          .credential-row { margin: 15px 0; }
          .credential-label { color: #6B7280; font-size: 14px; margin-bottom: 5px; }
          .credential-value { background-color: #F3F4F6; padding: 10px 15px; border-radius: 6px; font-family: monospace; font-size: 16px; color: #1F2937; border: 1px solid #E5E7EB; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .warning-box { background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; }
          .info-box { background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6; }
          .arabic-section { direction: rtl; text-align: right; }
          .divider { border-top: 2px solid #E5E7EB; margin: 40px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="text-align: center; margin-bottom: 10px;">
              <img src="https://img1.wsimg.com/isteam/ip/aead55c7-5dc3-4ad4-8132-6139ccf3e033/nahky.png/:/rs=w:132,h:104,cg:true,m/cr=w:132,h:104/qt=q:95" alt="Nahky Araby Logo" style="max-width: 200px; height: auto;" />
            </div>
            <h2 style="margin: 10px 0 20px 0; font-size: 24px; font-weight: 600; opacity: 1;">Nahky Araby Event Hub</h2>
            <h1>إعادة تعيين كلمة المرور</h1>
          </div>
          <div class="content arabic-section">
            <h2>مرحبًا ${staff.name}،</h2>
            <p>لقد قام أحد المشرفين بإعادة تعيين كلمة المرور الخاصة بك. تجد أدناه بيانات تسجيل الدخول المؤقتة الجديدة.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #F59E0B;">🔐 بيانات الدخول الجديدة</h3>
              <div class="credential-row">
                <div class="credential-label">اسم المستخدم (البريد الإلكتروني)</div>
                <div class="credential-value" style="direction: ltr; text-align: left;">${staff.email}</div>
              </div>
              <div class="credential-row">
                <div class="credential-label">كلمة المرور المؤقتة</div>
                <div class="credential-value" style="direction: ltr; text-align: left;">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ تنبيه مهم – أول تسجيل دخول</strong>
              <p style="margin: 10px 0 0 0;">عند تسجيل الدخول باستخدام كلمة المرور المؤقتة، سيُطلب منك إنشاء كلمة مرور جديدة وآمنة قبل الوصول إلى حسابك.</p>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">📋 الخطوات التالية</h3>
              <ol style="margin: 10px 0; padding-right: 20px;">
                <li>زيارة صفحة تسجيل الدخول لتطبيق إدارة الموظفين</li>
                <li>إدخال بريدك الإلكتروني وكلمة المرور المؤقتة</li>
                <li>إنشاء كلمة مرور جديدة وآمنة</li>
                <li>متابعة إدارة فعالياتك!</li>
              </ol>
            </div>
            
            <p>إذا لم تطلب أنت إعادة التعيين، يرجى التواصل مع المشرف فورًا.</p>
          </div>
          
          <div class="divider"></div>
          
          <div class="content">
            <h2>Hello ${staff.name},</h2>
            <p>Your password has been reset by an administrator. Below are your new temporary login credentials.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #F59E0B;">🔐 Your New Login Credentials</h3>
              <div class="credential-row">
                <div class="credential-label">Username (Email)</div>
                <div class="credential-value">${staff.email}</div>
              </div>
              <div class="credential-row">
                <div class="credential-label">Temporary Password</div>
                <div class="credential-value">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ Important - First Login</strong>
              <p style="margin: 10px 0 0 0;">When you log in with this temporary password, you will be required to set up a new secure password before accessing your account.</p>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">📋 Next Steps</h3>
              <ol style="margin: 10px 0; padding-left: 20px;">
                <li>Visit Nahky Araby Event Hub login page</li>
                <li>Enter your email and temporary password</li>
                <li>Create a new secure password</li>
                <li>Continue managing your events!</li>
              </ol>
            </div>
            
            <p>If you didn't request this password reset, please contact your administrator immediately.</p>
          </div>
          <div class="footer">
            <p>هذه رسالة آلية — يرجى عدم الرد على هذا البريد.<br>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Only send email if staff is active
    if (staff.status === "active") {
      const emailResult = await sendEmail(
        staff.email,
        "Password Reset - Nahky Araby Event Hub",
        emailHtml,
      );

      if (!emailResult.success) {
        // Password reset successful, just email failed
        // This is expected in Resend testing mode
        console.log(
          "🔑 Temporary password generated for:",
          staff.name,
          "- Manual credentials provided (email in testing mode)",
        );

        return c.json({
          success: true,
          message: `Temporary password generated for ${staff.name}`,
          emailSent: false,
          isTestingMode: emailResult.isTestingMode || false,
          tempPassword: tempPassword,
          staff: {
            id: staff.id,
            email: staff.email,
            name: staff.name,
          },
        });
      }

      return c.json({
        success: true,
        message: `Password reset email sent to ${staff.email}`,
        emailSent: true,
      });
    } else {
      console.log(
        `⏭️ Skipping password reset email for inactive staff: ${staff.name}`,
      );
      return c.json({
        success: true,
        message: `Temporary password generated for ${staff.name} (inactive - no email sent)`,
        emailSent: false,
        tempPassword: tempPassword,
        staff: {
          id: staff.id,
          email: staff.email,
          name: staff.name,
        },
      });
    }
  } catch (error) {
    console.error("Error sending password reset:", error);
    return c.json(
      { error: "Failed to send password reset" },
      500,
    );
  }
});

// Password setup endpoint for new staff members
app.post("/staff/setup-password", async (c) => {
  try {
    const { email, tempPassword, newPassword } =
      await c.req.json();

    if (!email || !tempPassword || !newPassword) {
      return c.json(
        {
          error:
            "Email, temporary password, and new password are required",
        },
        400,
      );
    }

    const supabase = getSupabaseClient();

    // First, sign in with the temporary password
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password: tempPassword,
      });

    if (signInError || !signInData.session) {
      console.error(
        "Error signing in with temp password:",
        signInError,
      );
      return c.json(
        { error: "Invalid temporary credentials" },
        401,
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Update the password AND status in user_metadata using admin client
    const { data: updateData, error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(
        signInData.user.id,
        {
          password: newPassword,
          user_metadata: {
            ...signInData.user.user_metadata,
            status: "active", // Activate user when they set password
          },
        },
      );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return c.json(
        { error: "Failed to update password" },
        500,
      );
    }

    // Sign in again with the new password to get a fresh session
    // (updating password invalidates existing sessions)
    const { data: newSignInData, error: newSignInError } =
      await supabase.auth.signInWithPassword({
        email,
        password: newPassword,
      });

    if (newSignInError || !newSignInData.session) {
      console.error(
        "Error signing in with new password:",
        newSignInError,
      );
      // Password was updated but sign-in failed - user can still login manually
      return c.json(
        {
          error:
            "Password updated but automatic sign-in failed. Please log in with your new password.",
        },
        500,
      );
    }

    // Return user data from auth metadata
    const userData = {
      id: newSignInData.user.id,
      email: newSignInData.user.email,
      name:
        newSignInData.user.user_metadata.name ||
        newSignInData.user.email,
      role: newSignInData.user.user_metadata.role || "staff",
      points: newSignInData.user.user_metadata.points || 0,
      level: newSignInData.user.user_metadata.level || "",
      status:
        newSignInData.user.user_metadata.status || "active",
      phone: newSignInData.user.user_metadata.phone || "",
      telegramChatId:
        newSignInData.user.user_metadata.telegramChatId || "",
    };

    return c.json({
      success: true,
      message: "Password updated successfully",
      accessToken: newSignInData.session.access_token,
      refreshToken: newSignInData.session.refresh_token,
      user: userData,
    });
  } catch (error) {
    console.error("Error setting up password:", error);
    return c.json({ error: "Failed to set up password" }, 500);
  }
});

// Admin change email/password endpoint
app.post("/admin/change-credentials", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Get admin user data from Auth
    const supabaseAdmin = getSupabaseAdmin();
    const {
      data: { user: adminUser },
      error: getUserError,
    } = await supabaseAdmin.auth.admin.getUserById(user.id);

    if (
      getUserError ||
      !adminUser ||
      adminUser.user_metadata?.role !== "admin"
    ) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { currentPassword, newUsername, newPassword } =
      await c.req.json();

    if (!currentPassword) {
      return c.json(
        { error: "Current password is required" },
        400,
      );
    }

    if (!newUsername && !newPassword) {
      return c.json(
        {
          error:
            "At least new username or new password must be provided",
        },
        400,
      );
    }

    const supabase = getSupabaseClient();

    // Verify current password by attempting to sign in
    const { error: verifyError } =
      await supabase.auth.signInWithPassword({
        email: adminUser.email,
        password: currentPassword,
      });

    if (verifyError) {
      return c.json(
        { error: "Current password is incorrect" },
        401,
      );
    }

    let updatedEmail = adminUser.email;

    // Update username if provided
    if (
      newUsername &&
      newUsername !== adminUser.user_metadata?.username
    ) {
      // Convert username to email format for Supabase Auth
      const newEmail = newUsername.includes("@")
        ? newUsername
        : `${newUsername}@company.local`;

      const { error: emailError } =
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          email: newEmail,
          email_confirm: true,
          user_metadata: {
            ...adminUser.user_metadata,
            username: newUsername,
          },
        });

      if (emailError) {
        console.error("Error updating username:", emailError);
        return c.json(
          { error: "Failed to update username" },
          500,
        );
      }

      updatedEmail = newEmail;
    }

    // Update password if provided
    if (newPassword) {
      const { error: passwordError } =
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: newPassword,
        });

      if (passwordError) {
        console.error(
          "Error updating password:",
          passwordError,
        );
        return c.json(
          { error: "Failed to update password" },
          500,
        );
      }
    }

    // Sign in with new credentials to get fresh session
    const loginPassword = newPassword || currentPassword;

    const { data: newSignInData, error: newSignInError } =
      await supabase.auth.signInWithPassword({
        email: updatedEmail,
        password: loginPassword,
      });

    if (newSignInError || !newSignInData.session) {
      console.error(
        "Error signing in with new credentials:",
        newSignInError,
      );
      return c.json(
        {
          error:
            "Credentials updated but automatic sign-in failed. Please log in with your new credentials.",
        },
        500,
      );
    }

    // Return user data from auth metadata
    const userData = {
      id: newSignInData.user.id,
      email: newSignInData.user.email,
      username:
        newSignInData.user.user_metadata.username ||
        newSignInData.user.email,
      name:
        newSignInData.user.user_metadata.name ||
        newSignInData.user.email,
      role: newSignInData.user.user_metadata.role || "admin",
      points: newSignInData.user.user_metadata.points || 0,
      level: newSignInData.user.user_metadata.level || "",
    };

    return c.json({
      success: true,
      message: "Credentials updated successfully",
      accessToken: newSignInData.session.access_token,
      user: userData,
    });
  } catch (error) {
    console.error("Error changing admin credentials:", error);
    return c.json(
      { error: "Failed to change credentials" },
      500,
    );
  }
});

// ==================== ADMIN SETTINGS ENDPOINTS ====================

// Get admin settings
app.get("/admin/settings", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get admin settings from Postgres
    const supabase = getSupabaseAdmin();
    const { data: settings, error } = await supabase
      .from("admin_settings2")
      .select("email, phone")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows
      console.error(
        "Error fetching admin settings from Postgres:",
        error,
      );
      return c.json(
        { error: "Failed to fetch admin settings" },
        500,
      );
    }

    return c.json(settings || { email: "", phone: "" });
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return c.json(
      { error: "Failed to fetch admin settings" },
      500,
    );
  }
});

// Save admin settings
app.post("/admin/settings", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { email, phone } = await c.req.json();

    // Save admin settings to Postgres
    const supabase = getSupabaseAdmin();

    // Check if settings exist
    const { data: existing } = await supabase
      .from("admin_settings2")
      .select("id")
      .limit(1)
      .single();

    let error;
    if (existing) {
      // Update existing settings
      const result = await supabase
        .from("admin_settings2")
        .update({
          email,
          phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      error = result.error;
    } else {
      // Insert new settings
      const result = await supabase
        .from("admin_settings2")
        .insert({ email, phone });
      error = result.error;
    }

    if (error) {
      console.error(
        "Error saving admin settings to Postgres:",
        error,
      );
      return c.json(
        { error: "Failed to save admin settings" },
        500,
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error saving admin settings:", error);
    return c.json(
      { error: "Failed to save admin settings" },
      500,
    );
  }
});

// ==================== WHATSAPP ENDPOINTS ====================

// Helper function to send WhatsApp message
const sendWhatsAppMessage = async (
  to: string,
  message: string,
) => {
  // Get WhatsApp settings from Postgres
  const supabase = getSupabaseAdmin();
  const { data: whatsAppSettings, error } = await supabase
    .from("integration_settings2")
    .select("*")
    .eq("integration_type", "whatsapp")
    .eq("connected", true)
    .single();

  if (
    error ||
    !whatsAppSettings ||
    !whatsAppSettings.phone_number_id ||
    !whatsAppSettings.access_token
  ) {
    console.error("WhatsApp not configured");
    return { success: false, error: "WhatsApp not configured" };
  }

  const {
    phone_number_id: phoneNumberId,
    access_token: accessToken,
  } = whatsAppSettings;

  // Remove any formatting from phone number (spaces, dashes, etc)
  const cleanPhone = to.replace(/[^\d+]/g, "");

  // Ensure phone has country code
  if (!cleanPhone.startsWith("+")) {
    console.error(
      "Phone number must include country code:",
      to,
    );
    return {
      success: false,
      error:
        "Phone number must include country code (e.g., +1234567890)",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: message },
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", result);
      return {
        success: false,
        error:
          result.error?.message ||
          "Failed to send WhatsApp message",
      };
    }

    console.log(
      "WhatsApp message sent successfully:",
      result.messages?.[0]?.id,
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    return { success: false, error: error.message };
  }
};

// Connect WhatsApp Business account
app.post("/whatsapp/connect", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { phoneNumberId, accessToken } = await c.req.json();

    if (!phoneNumberId || !accessToken) {
      return c.json(
        {
          error:
            "Phone Number ID and Access Token are required",
        },
        400,
      );
    }

    // Verify the credentials by making a test API call
    try {
      const testResponse = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!testResponse.ok) {
        const errorData = await testResponse.json();
        console.error(
          "WhatsApp verification failed:",
          errorData,
        );
        return c.json(
          {
            error:
              "Invalid WhatsApp credentials. Please check your Phone Number ID and Access Token.",
          },
          400,
        );
      }

      const phoneData = await testResponse.json();
      const displayPhoneNumber =
        phoneData.display_phone_number ||
        phoneData.verified_name ||
        "";

      // Save WhatsApp settings to Postgres
      const supabase = getSupabaseAdmin();

      // Check if WhatsApp settings already exist
      const { data: existing } = await supabase
        .from("integration_settings2")
        .select("id")
        .eq("integration_type", "whatsapp")
        .single();

      let saveError;
      if (existing) {
        // Update existing settings
        const result = await supabase
          .from("integration_settings2")
          .update({
            phone_number_id: phoneNumberId,
            access_token: accessToken,
            phone_number: displayPhoneNumber,
            connected: true,
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        saveError = result.error;
      } else {
        // Insert new settings
        const result = await supabase
          .from("integration_settings2")
          .insert({
            integration_type: "whatsapp",
            phone_number_id: phoneNumberId,
            access_token: accessToken,
            phone_number: displayPhoneNumber,
            connected: true,
            connected_at: new Date().toISOString(),
          });
        saveError = result.error;
      }

      if (saveError) {
        console.error(
          "Error saving WhatsApp settings to Postgres:",
          saveError,
        );
        return c.json(
          { error: "Failed to save WhatsApp settings" },
          500,
        );
      }

      return c.json({
        success: true,
        phoneNumber: displayPhoneNumber,
      });
    } catch (verifyError) {
      console.error(
        "Error verifying WhatsApp credentials:",
        verifyError,
      );
      return c.json(
        {
          error:
            "Failed to verify WhatsApp credentials. Please check your settings.",
        },
        400,
      );
    }
  } catch (error) {
    console.error("Error connecting WhatsApp:", error);
    return c.json({ error: "Failed to connect WhatsApp" }, 500);
  }
});

// Get WhatsApp connection status
app.get("/whatsapp/status", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    try {
      // Get WhatsApp settings from Postgres
      const supabase = getSupabaseAdmin();
      const { data: whatsAppSettings, error } = await supabase
        .from("integration_settings2")
        .select("*")
        .eq("integration_type", "whatsapp")
        .single();

      if (
        error ||
        !whatsAppSettings ||
        !whatsAppSettings.connected
      ) {
        return c.json({ connected: false });
      }

      return c.json({
        connected: true,
        phoneNumber: whatsAppSettings.phone_number || "",
      });
    } catch (dbError) {
      console.error(
        "Error accessing WhatsApp settings from Postgres:",
        dbError,
      );
      return c.json({ connected: false });
    }
  } catch (error) {
    console.error("Error checking WhatsApp status:", error);
    return c.json({ connected: false }, 500);
  }
});

// Helper function to send Telegram message
const sendTelegramMessage = async (
  chatId: string,
  message: string,
) => {
  // Validate that chatId is numeric
  if (!/^\d+$/.test(chatId)) {
    const isUsername =
      chatId.startsWith("@") || /^[a-zA-Z]/.test(chatId);
    console.error("Invalid Chat ID format:", chatId);
    return {
      success: false,
      error: isUsername
        ? `Invalid Chat ID: "${chatId}" is a username. You must use the numeric Chat ID (e.g., 123456789). Click "Fetch from Bot" to get the correct ID.`
        : `Invalid Chat ID format: "${chatId}". Chat ID must be numeric only.`,
    };
  }

  // Get Telegram settings from Postgres
  const supabase = getSupabaseAdmin();
  const { data: telegramSettings, error } = await supabase
    .from("integration_settings2")
    .select("*")
    .eq("integration_type", "telegram")
    .eq("connected", true)
    .single();

  if (
    error ||
    !telegramSettings ||
    !telegramSettings.bot_token
  ) {
    console.error("Telegram not configured");
    return { success: false, error: "Telegram not configured" };
  }

  const { bot_token: botToken } = telegramSettings;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        }),
      },
    );

    const result = await response.json();

    if (!result.ok) {
      console.error(
        "Telegram API error for Chat ID:",
        chatId,
        "Error:",
        result,
      );
      const errorDesc =
        result.description || "Failed to send Telegram message";

      // Provide more helpful error messages
      if (errorDesc.toLowerCase().includes("chat not found")) {
        return {
          success: false,
          error: `Chat not found for ID: ${chatId}. The user must start a conversation with your bot first.`,
        };
      } else if (
        errorDesc.toLowerCase().includes("bot was blocked")
      ) {
        return {
          success: false,
          error: `User has blocked the bot. Ask them to unblock it in Telegram.`,
        };
      } else if (
        errorDesc.toLowerCase().includes("user is deactivated")
      ) {
        return {
          success: false,
          error: `This Telegram account is deactivated.`,
        };
      }

      return { success: false, error: errorDesc };
    }

    console.log(
      "Telegram message sent successfully to Chat ID:",
      chatId,
      "Message ID:",
      result.result.message_id,
    );
    return { success: true, data: result };
  } catch (error) {
    console.error(
      "Error sending Telegram message to Chat ID:",
      chatId,
      "Error:",
      error,
    );
    return { success: false, error: error.message };
  }
};

// Connect Telegram Bot
app.post("/telegram/connect", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { botToken } = await c.req.json();

    if (!botToken) {
      return c.json({ error: "Bot Token is required" }, 400);
    }

    // Verify the bot token by making a test API call
    try {
      const testResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getMe`,
        {
          method: "GET",
        },
      );

      const botData = await testResponse.json();

      if (!botData.ok) {
        console.error("Telegram verification failed:", botData);
        return c.json(
          {
            error:
              "Invalid Telegram bot token. Please check your token.",
          },
          400,
        );
      }

      const botName =
        botData.result.username ||
        botData.result.first_name ||
        "";

      // Save Telegram settings to Postgres
      const supabase = getSupabaseAdmin();

      // Check if Telegram settings already exist
      const { data: existing } = await supabase
        .from("integration_settings2")
        .select("id")
        .eq("integration_type", "telegram")
        .single();

      let saveError;
      if (existing) {
        // Update existing settings
        const result = await supabase
          .from("integration_settings2")
          .update({
            bot_token: botToken,
            bot_name: botName,
            connected: true,
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        saveError = result.error;
      } else {
        // Insert new settings
        const result = await supabase
          .from("integration_settings2")
          .insert({
            integration_type: "telegram",
            bot_token: botToken,
            bot_name: botName,
            connected: true,
            connected_at: new Date().toISOString(),
          });
        saveError = result.error;
      }

      if (saveError) {
        console.error(
          "Error saving Telegram settings to Postgres:",
          saveError,
        );
        return c.json(
          { error: "Failed to save Telegram settings" },
          500,
        );
      }

      return c.json({
        success: true,
        botName,
      });
    } catch (verifyError) {
      console.error(
        "Error verifying Telegram bot token:",
        verifyError,
      );
      return c.json(
        {
          error:
            "Failed to verify Telegram bot token. Please check your settings.",
        },
        400,
      );
    }
  } catch (error) {
    console.error("Error connecting Telegram:", error);
    return c.json({ error: "Failed to connect Telegram" }, 500);
  }
});

// Get Telegram connection status
app.get("/telegram/status", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (adminError || !isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    try {
      // Get Telegram settings from Postgres
      const supabase = getSupabaseAdmin();
      const { data: telegramSettings, error } = await supabase
        .from("integration_settings2")
        .select("*")
        .eq("integration_type", "telegram")
        .single();

      if (
        error ||
        !telegramSettings ||
        !telegramSettings.connected
      ) {
        return c.json({ connected: false });
      }

      return c.json({
        connected: true,
        botName: telegramSettings.bot_name || "",
      });
    } catch (dbError) {
      console.error(
        "Error accessing Telegram settings from Postgres:",
        dbError,
      );
      return c.json({ connected: false });
    }
  } catch (error) {
    console.error("Error checking Telegram status:", error);
    return c.json({ connected: false }, 500);
  }
});

// Send Telegram test message to a staff member
app.post("/telegram/test", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin using verifyAdmin helper
    const adminCheck = await verifyAdmin(user.id);
    if (adminCheck.error || !adminCheck.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { staffId } = await c.req.json();

    if (!staffId) {
      return c.json({ error: "Staff ID is required" }, 400);
    }

    console.log("[DEBUG] Received staffId:", staffId);

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(staffId)) {
      console.error("[DEBUG] Invalid UUID format:", staffId);
      return c.json(
        {
          error: `Invalid staff ID format: ${staffId}. Expected UUID format.`,
        },
        400,
      );
    }

    // Get staff member from Supabase Auth
    const supabase = getSupabaseAdmin();
    const {
      data: { user: staffUser },
      error: staffError,
    } = await supabase.auth.admin.getUserById(staffId);

    if (staffError) {
      console.error(
        "[DEBUG] Error fetching staff user:",
        staffError,
      );
      return c.json(
        {
          error: `Failed to fetch staff member: ${staffError.message}`,
        },
        404,
      );
    }

    if (!staffUser) {
      console.error(
        "[DEBUG] Staff user not found for ID:",
        staffId,
      );
      return c.json({ error: "Staff member not found" }, 404);
    }

    // Check if staff has Telegram chat ID (check both fields)
    const chatId =
      staffUser.user_metadata?.telegramChatId ||
      staffUser.user_metadata?.telegramUsername;
    const staffName =
      staffUser.user_metadata?.name || staffUser.email;

    if (!chatId) {
      return c.json(
        {
          error:
            "Staff member does not have a Telegram Chat ID configured",
        },
        400,
      );
    }

    console.log(
      "[DEBUG] About to send Telegram test. ChatID:",
      chatId,
      "Staff:",
      staffName,
    );

    // Send test message
    const message = `🎉 *Test Message*\n\nHello ${staffName}!\n\nThis is a test message from the Staff Management App. Your Telegram account is successfully connected! 📱\n\n_You will receive event notifications on this account._`;

    const result = await sendTelegramMessage(chatId, message);
    console.log(
      "[DEBUG] sendTelegramMessage result:",
      JSON.stringify(result),
    );

    if (!result.success) {
      // Check if it's a chat not found error
      const errorMsg =
        result.error || "Failed to send test message";
      console.log("[DEBUG] Message send failed:", errorMsg);
      if (errorMsg.includes("chat not found")) {
        return c.json(
          {
            error:
              "Chat not found. Please verify the Chat ID is correct. The staff member must first start a conversation with your Telegram bot, then get their Chat ID from @userinfobot.",
          },
          400,
        );
      }
      return c.json({ error: errorMsg }, 500);
    }

    return c.json({
      success: true,
      message: "Test message sent successfully to " + staffName,
    });
  } catch (error) {
    console.error(
      "Error sending Telegram test message:",
      error,
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to send test message";
    console.error("Detailed error:", errorMessage, error);
    return c.json({ error: errorMessage }, 500);
  }
});

// Test a specific Chat ID
app.post("/telegram/test-chat-id", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const { error: adminError, isAdmin } = await verifyAdmin(
      user.id,
    );
    if (!isAdmin) {
      return c.json(
        { error: adminError || "Admin access required" },
        403,
      );
    }

    const { chatId, name } = await c.req.json();

    if (!chatId) {
      return c.json({ error: "Chat ID is required" }, 400);
    }

    // Send test message
    const message = `🎉 *Test Message*\\n\\nHello ${name || "there"}!\\n\\nThis is a test message from the Staff Management App. Your Telegram account is successfully connected! 📱\\n\\n_You will receive event notifications on this account._`;

    const result = await sendTelegramMessage(chatId, message);

    if (!result.success) {
      return c.json(
        {
          error: result.error || "Failed to send test message",
        },
        400,
      );
    }

    return c.json({
      success: true,
      message: `Test message sent successfully to Chat ID: ${chatId}`,
    });
  } catch (error) {
    console.error("Error testing Chat ID:", error);
    return c.json(
      { error: "Failed to send test message" },
      500,
    );
  }
});

// Clear old Telegram updates
app.post("/telegram/clear-updates", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get Telegram settings from Postgres
    const supabase = getSupabaseAdmin();
    const { data: telegramSettings, error } = await supabase
      .from("integration_settings2")
      .select("*")
      .eq("integration_type", "telegram")
      .eq("connected", true)
      .single();

    if (
      error ||
      !telegramSettings ||
      !telegramSettings.bot_token
    ) {
      return c.json({ error: "Telegram not configured" }, 400);
    }

    const { bot_token: botToken } = telegramSettings;

    // First, get all updates
    const getResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`,
      { method: "GET" },
    );

    const getResult = await getResponse.json();

    if (
      getResult.ok &&
      getResult.result &&
      getResult.result.length > 0
    ) {
      // Get the highest update_id
      const lastUpdateId =
        getResult.result[getResult.result.length - 1].update_id;

      // Clear all updates by setting offset to last update_id + 1
      await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}`,
        { method: "GET" },
      );

      console.log(
        `Cleared ${getResult.result.length} old Telegram updates`,
      );

      return c.json({
        success: true,
        message: `Cleared ${getResult.result.length} old updates. New messages will appear on next fetch.`,
      });
    }

    return c.json({
      success: true,
      message: "No updates to clear",
    });
  } catch (error) {
    console.error("Error clearing Telegram updates:", error);
    return c.json({ error: "Failed to clear updates" }, 500);
  }
});

// Get recent Telegram chat IDs from bot updates
app.post("/telegram/get-recent-chats", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get Telegram settings from Postgres
    const supabase = getSupabaseAdmin();
    const { data: telegramSettings, error } = await supabase
      .from("integration_settings2")
      .select("*")
      .eq("integration_type", "telegram")
      .eq("connected", true)
      .single();

    if (
      error ||
      !telegramSettings ||
      !telegramSettings.bot_token
    ) {
      return c.json({ error: "Telegram not configured" }, 400);
    }

    const { bot_token: botToken } = telegramSettings;

    // Fetch recent updates from Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`,
      {
        method: "GET",
      },
    );

    const result = await response.json();

    if (!result.ok) {
      console.error("Telegram API error:", result);
      return c.json(
        {
          error:
            result.description || "Failed to fetch updates",
        },
        500,
      );
    }

    // Extract unique chat IDs and user information
    const chats = new Map();

    if (result.result && Array.isArray(result.result)) {
      for (const update of result.result) {
        if (update.message && update.message.from) {
          const chatId = update.message.chat.id.toString();
          const from = update.message.from;

          if (!chats.has(chatId)) {
            chats.set(chatId, {
              chatId,
              firstName: from.first_name || "",
              lastName: from.last_name || "",
              username: from.username
                ? `@${from.username}`
                : "",
              lastMessage: update.message.text || "(media)",
              timestamp: update.message.date * 1000, // Convert to milliseconds
            });
          }
        }
      }
    }

    // Convert to array and sort by most recent
    const chatList = Array.from(chats.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );

    console.log(
      `Found ${chatList.length} recent Telegram chats:`,
      chatList.map((c) => ({
        chatId: c.chatId,
        name: `${c.firstName} ${c.lastName}`.trim(),
      })),
    );

    return c.json({
      success: true,
      chats: chatList,
      count: chatList.length,
    });
  } catch (error) {
    console.error("Error fetching Telegram updates:", error);
    return c.json(
      { error: "Failed to fetch recent chats" },
      500,
    );
  }
});

// Debug endpoint to check notification eligibility
app.get("/debug/notifications", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get all users
    const allUsers = await kv.getByPrefix("user:");

    console.log("=== DEBUG ENDPOINT DETAILED ANALYSIS ===");
    console.log(`Total users in database: ${allUsers.length}`);
    console.log(
      "All users:",
      allUsers.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
      })),
    );

    const staffMembers = allUsers.filter(
      (u) => u.role === "staff" || !u.role,
    );
    console.log(
      `After staff filter (role === 'staff' || !role): ${staffMembers.length} users`,
    );
    console.log(
      "Staff members:",
      staffMembers.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
      })),
    );

    const activeStaff = staffMembers.filter(
      (u) => u.status === "active",
    );

    // Get levels from Postgres
    const supabase = getSupabaseAdmin();

    // Get telegram settings from Postgres
    const { data: telegramSettings } = await supabase
      .from("integration_settings2")
      .select("*")
      .eq("integration_type", "telegram")
      .eq("connected", true)
      .single();
    const { data: pgLevels, error: levelsError } =
      await supabase
        .from("levels")
        .select("*")
        .order("order_index", { ascending: true });

    const sortedLevels = levelsError
      ? []
      : pgLevels.map((level) => ({
          id: level.id,
          name: level.name,
          minPoints: level.min_points,
          order: level.order_index,
        }));

    // Check only staff members (deduplicate by email first, exclude admins)
    const uniqueStaffMap = new Map();
    staffMembers.forEach((staff) => {
      console.log(
        `Processing user: ${staff.name}, role: ${staff.role}, is admin: ${staff.role === "admin"}`,
      );
      // Exclude admins from the debug display
      if (
        staff.role !== "admin" &&
        !uniqueStaffMap.has(staff.email)
      ) {
        uniqueStaffMap.set(staff.email, staff);
        console.log(`  -> Added to display: ${staff.name}`);
      } else if (staff.role === "admin") {
        console.log(`  -> Excluded (admin): ${staff.name}`);
      } else {
        console.log(
          `  -> Excluded (duplicate email): ${staff.name}`,
        );
      }
    });
    const uniqueStaff = Array.from(uniqueStaffMap.values());

    console.log(
      `Final unique staff count for display: ${uniqueStaff.length}`,
    );
    console.log(
      `Staff details:`,
      uniqueStaff.map((s) => ({
        name: s.name,
        email: s.email,
        role: s.role,
        status: s.status,
        level: s.level,
        telegramChatId:
          s.telegramChatId || s.telegramUsername
            ? "SET"
            : "NOT SET",
      })),
    );
    console.log("=== END DEBUG ANALYSIS ===");

    const staffStatus = uniqueStaff.map((staff) => {
      const issues = [];

      // Check eligibility for notifications (check both fields for backwards compatibility)
      const chatId =
        staff.telegramChatId || staff.telegramUsername;
      if (staff.status !== "active")
        issues.push(
          "Status is not active (status: " + staff.status + ")",
        );
      if (!staff.level) issues.push("No level assigned");
      if (!chatId || chatId.trim() === "")
        issues.push("No Telegram Chat ID");

      const staffLevel = sortedLevels.find(
        (l) => l.name === staff.level,
      );

      return {
        name: staff.name,
        email: staff.email,
        role: staff.role || "staff",
        status: staff.status || "unknown",
        level: staff.level || "NONE",
        levelOrder: staffLevel?.order ?? "N/A",
        telegramChatId: chatId || "NOT SET",
        eligible: issues.length === 0,
        issues: issues,
      };
    });

    return c.json({
      summary: {
        totalUsers: allUsers.length,
        staffMembers: staffMembers.length,
        activeStaff: activeStaff.length,
        telegramConnected: telegramSettings?.connected || false,
        telegramBotName: telegramSettings?.botName || "NOT SET",
        levelsConfigured: levels.length,
      },
      levels: sortedLevels.map((l) => ({
        name: l.name,
        minPoints: l.minPoints,
        order: l.order,
      })),
      staffStatus: staffStatus,
      debugInfo: {
        allUsersSnapshot: allUsers.map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
        })),
        staffMembersSnapshot: staffMembers.map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
        })),
        uniqueStaffSnapshot: uniqueStaff.map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
        })),
      },
    });
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    return c.json(
      { error: "Failed to generate debug info" },
      500,
    );
  }
});

// ==================== LEVELS ENDPOINTS ====================

// Get all levels
app.get("/levels", async (c) => {
  try {
    // Don't require auth for levels - they're needed during login
    const supabase = getSupabaseAdmin();

    // Fetch levels from Postgres
    const { data: pgLevels, error: pgError } = await supabase
      .from("levels")
      .select("*")
      .order("order_index", { ascending: true });

    if (pgError) {
      console.error(
        "Postgres error, falling back to KV:",
        pgError,
      );
      // Fallback to KV Store
      const levelsData = await kv.getByPrefix("level:");
      const levels = deduplicateLevels(levelsData);
      return c.json({ levels });
    }

    // Transform Postgres data to match expected format
    const levels = pgLevels.map((level) => ({
      id: level.id,
      name: level.name,
      minPoints: level.min_points,
      order: level.order_index,
      createdAt: level.created_at,
    }));

    return c.json({ levels });
  } catch (error) {
    console.error("Error fetching levels:", error);
    return c.json({ error: "Failed to fetch levels" }, 500);
  }
});

// Add new level (admin only)
app.post("/levels", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { name, minPoints } = await c.req.json();

    if (!name || minPoints === undefined) {
      return c.json(
        { error: "Name and minPoints are required" },
        400,
      );
    }

    const supabase = getSupabaseAdmin();

    // Get the next order_index by counting existing levels
    const { count, error: countError } = await supabase
      .from("levels")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("Error counting levels:", countError);
      return c.json(
        { error: "Failed to determine level order" },
        500,
      );
    }

    const nextOrder = count || 0;

    // Insert level into Postgres
    const { data: insertedLevel, error: insertError } =
      await supabase
        .from("levels")
        .insert({
          name,
          min_points: minPoints,
          order_index: nextOrder,
        })
        .select()
        .single();

    if (insertError) {
      console.error(
        "Error inserting level to Postgres:",
        insertError,
      );
      return c.json(
        {
          error: `Failed to create level: ${insertError.message}`,
        },
        500,
      );
    }

    // Transform back to frontend format
    const level = {
      id: insertedLevel.id,
      name: insertedLevel.name,
      minPoints: insertedLevel.min_points,
      order: insertedLevel.order_index,
      createdAt: insertedLevel.created_at,
    };

    return c.json({ success: true, level });
  } catch (error) {
    console.error("Error adding level:", error);
    return c.json({ error: "Failed to add level" }, 500);
  }
});

// Update level (admin only)
app.put("/levels/:id", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const levelId = c.req.param("id");
    const { name, minPoints } = await c.req.json();

    const supabase = getSupabaseAdmin();

    // Update level in Postgres
    const { data: updatedLevel, error: updateError } =
      await supabase
        .from("levels")
        .update({
          name,
          min_points: minPoints,
        })
        .eq("id", levelId)
        .select()
        .single();

    if (updateError) {
      console.error(
        "Error updating level in Postgres:",
        updateError,
      );
      return c.json(
        {
          error: `Failed to update level: ${updateError.message}`,
        },
        500,
      );
    }

    if (!updatedLevel) {
      return c.json({ error: "Level not found" }, 404);
    }

    // Transform back to frontend format
    const level = {
      id: updatedLevel.id,
      name: updatedLevel.name,
      minPoints: updatedLevel.min_points,
      order: updatedLevel.order_index,
      createdAt: updatedLevel.created_at,
    };

    return c.json({ success: true, level });
  } catch (error) {
    console.error("Error updating level:", error);
    return c.json({ error: "Failed to update level" }, 500);
  }
});

// Delete level (admin only)
app.delete("/levels/:id", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const levelId = c.req.param("id");

    const supabase = getSupabaseAdmin();

    // Delete level from Postgres
    const { error: deleteError } = await supabase
      .from("levels")
      .delete()
      .eq("id", levelId);

    if (deleteError) {
      console.error(
        "Error deleting level from Postgres:",
        deleteError,
      );
      return c.json(
        {
          error: `Failed to delete level: ${deleteError.message}`,
        },
        500,
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting level:", error);
    return c.json({ error: "Failed to delete level" }, 500);
  }
});

// Reorder levels (admin only)
app.post("/levels/reorder", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { levelId, direction } = await c.req.json();

    if (
      !levelId ||
      !direction ||
      (direction !== "up" && direction !== "down")
    ) {
      return c.json(
        {
          error:
            "Valid levelId and direction (up/down) are required",
        },
        400,
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch all levels from Postgres
    const { data: levels, error: fetchError } = await supabase
      .from("levels")
      .select("*")
      .order("order_index", { ascending: true });

    if (fetchError) {
      console.error("Error fetching levels:", fetchError);
      return c.json({ error: "Failed to fetch levels" }, 500);
    }

    const currentIndex = levels.findIndex(
      (l: any) => l.id.toString() === levelId.toString(),
    );
    if (currentIndex === -1) {
      return c.json({ error: "Level not found" }, 404);
    }

    // Can't move first item up or last item down
    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" &&
        currentIndex === levels.length - 1)
    ) {
      return c.json(
        { error: "Cannot move level in that direction" },
        400,
      );
    }

    // Swap orders
    const swapIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const tempOrder = levels[currentIndex].order_index;

    // Update both levels in Postgres
    const { error: update1Error } = await supabase
      .from("levels")
      .update({ order_index: levels[swapIndex].order_index })
      .eq("id", levels[currentIndex].id);

    const { error: update2Error } = await supabase
      .from("levels")
      .update({ order_index: tempOrder })
      .eq("id", levels[swapIndex].id);

    if (update1Error || update2Error) {
      console.error(
        "Error updating level order:",
        update1Error || update2Error,
      );
      return c.json({ error: "Failed to reorder levels" }, 500);
    }

    // Fetch updated levels
    const { data: updatedLevels, error: fetchUpdatedError } =
      await supabase
        .from("levels")
        .select("*")
        .order("order_index", { ascending: true });

    if (fetchUpdatedError) {
      console.error(
        "Error fetching updated levels:",
        fetchUpdatedError,
      );
      return c.json(
        { error: "Failed to fetch updated levels" },
        500,
      );
    }

    // Transform to frontend format
    const transformedLevels = updatedLevels.map((level) => ({
      id: level.id,
      name: level.name,
      minPoints: level.min_points,
      order: level.order_index,
      createdAt: level.created_at,
    }));

    return c.json({ success: true, levels: transformedLevels });
  } catch (error) {
    console.error("Error reordering levels:", error);
    return c.json({ error: "Failed to reorder levels" }, 500);
  }
});

// ==================== POINT ADJUSTMENT ENDPOINTS ====================

// Adjust staff points (admin only)
app.post("/points/adjust", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin (from auth metadata)
    const supabase = getSupabaseAdmin();
    const {
      data: { user: adminUser },
    } = await supabase.auth.admin.getUserById(user.id);

    if (
      !adminUser ||
      adminUser.user_metadata?.role !== "admin"
    ) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { staffId, points, reason } = await c.req.json();
    console.log("📝 Adjusting points:", {
      staffId,
      points,
      reason,
    });

    if (!staffId || points === undefined || !reason) {
      return c.json(
        { error: "Staff ID, points, and reason are required" },
        400,
      );
    }

    // Get staff member from Auth
    const {
      data: { user: staffUser },
      error: getUserError,
    } = await supabase.auth.admin.getUserById(staffId);

    if (getUserError || !staffUser) {
      return c.json({ error: "Staff member not found" }, 404);
    }

    // Calculate new points and level
    const oldLevel = staffUser.user_metadata?.level || "";
    const currentPoints = staffUser.user_metadata?.points || 0;
    const newPoints = Math.max(0, currentPoints + points);

    // Get levels from Postgres
    console.log("📊 Fetching levels from Postgres...");
    const { data: levelsData, error: levelsError } =
      await supabase
        .from("levels")
        .select("*")
        .order("min_points", { ascending: false });

    if (levelsError) {
      console.error("❌ Error fetching levels:", levelsError);
      return c.json({ error: "Failed to fetch levels" }, 500);
    }

    const levels = levelsData || [];
    console.log("📊 Levels fetched:", levels.length);
    const newLevelObj = levels.find(
      (l) => newPoints >= l.min_points,
    );
    const newLevel = newLevelObj?.name || "";
    console.log("🏆 Level calculated:", {
      oldLevel,
      newLevel,
      newPoints,
    });

    // Update staff member in Auth user_metadata
    console.log("💾 Updating staff in Auth...");
    const { data: updateData, error: updateError } =
      await supabase.auth.admin.updateUserById(staffId, {
        user_metadata: {
          ...staffUser.user_metadata,
          points: newPoints,
          level: newLevel,
        },
      });
    console.log("💾 Update result:", {
      success: !updateError,
      hasData: !!updateData,
    });

    if (updateError) {
      console.error(
        "Error updating staff points in Auth:",
        updateError,
      );
      return c.json({ error: "Failed to update points" }, 500);
    }

    if (!updateData || !updateData.user) {
      console.error("No user data returned from update");
      return c.json(
        { error: "Failed to update points - no data returned" },
        500,
      );
    }

    // Build updated staff object for response
    const updatedStaff = {
      id: updateData.user.id,
      email: updateData.user.email,
      name: updateData.user.user_metadata.name,
      points: newPoints,
      level: newLevel,
      status: updateData.user.user_metadata.status || "active",
      role: updateData.user.user_metadata.role || "staff",
      phone: updateData.user.user_metadata.phone || "",
      telegramChatId:
        updateData.user.user_metadata.telegramChatId || "",
    };

    // Record adjustment in Postgres
    console.log("📝 Recording adjustment in database...");
    console.log("📝 Adjustment data to insert:", {
      staff_id: staffId,
      points,
      reason,
      admin_id: user.id,
      event_id: null,
    });
    const { data: adjustmentData, error: adjustmentError } =
      await supabase
        .from("point_adjustments")
        .insert({
          staff_id: staffId,
          points,
          reason,
          admin_id: user.id,
          event_id: null,
        })
        .select()
        .single();

    if (adjustmentError) {
      console.error(
        "❌ Error recording adjustment:",
        adjustmentError,
      );
      console.error(
        "❌ Full error details:",
        JSON.stringify(adjustmentError, null, 2),
      );
      return c.json(
        {
          error: "Failed to record adjustment in database",
          details: adjustmentError.message,
          hint:
            adjustmentError.hint ||
            "Check RLS policies for point_adjustments table",
        },
        500,
      );
    } else {
      console.log("✅ Adjustment recorded successfully");
      console.log(
        "✅ Adjustment data returned:",
        adjustmentData,
      );
    }

    const adjustment = adjustmentData
      ? {
          id: adjustmentData.id,
          staffId: adjustmentData.staff_id,
          points: adjustmentData.points,
          reason: adjustmentData.reason,
          timestamp: adjustmentData.created_at,
          adminId: adjustmentData.admin_id,
        }
      : null;

    // Send email notification to staff member
    const pointsChange = points > 0 ? "added" : "subtracted";
    const pointsDisplay = Math.abs(points);
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${points > 0 ? "#10B981" : "#F59E0B"}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .section { margin-bottom: 30px; }
          .divider { border-top: 2px solid #E5E7EB; margin: 30px 0; }
          .points-box { background-color: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${points > 0 ? "#10B981" : "#F59E0B"}; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); text-align: center; }
          .points-value { font-size: 48px; font-weight: bold; color: ${points > 0 ? "#10B981" : "#F59E0B"}; margin: 10px 0; }
          .reason-box { background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
          .arabic { direction: rtl; text-align: right; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="text-align: center; margin-bottom: 10px;">
              <img src="https://img1.wsimg.com/isteam/ip/aead55c7-5dc3-4ad4-8132-6139ccf3e033/nahky.png/:/rs=w:132,h:104,cg:true,m/cr=w:132,h:104/qt=q:95" alt="Nahky Araby Logo" style="max-width: 200px; height: auto;" />
            </div>
            <h2 style="margin: 10px 0 20px 0; font-size: 24px; font-weight: 600; opacity: 1;">Nahky Araby Event Hub</h2>
            <h1>${points > 0 ? "🎉 تمت إضافة نقاط" : "📊 تم تعديل النقاط"}</h1>
          </div>
          <div class="content">
            <!-- Arabic Section -->
            <div class="section arabic">
              <p>مرحبًا ${updatedStaff.name}،</p>
              
              <p>${points > 0 ? "خبر رائع! تم إضافة ما يلي إلى حسابك:" : (points > 0 ? "تم تعديل نقاطك. تم إضافة ما يلي من حسابك:" : "تم تعديل نقاطك. تم خصم ما يلي من حسابك:")}</p>
              
              <div class="points-box">
                <div style="font-size: 16px; color: #6B7280; margin-bottom: 5px;">${points > 0 ? "النقاط المضافة" : "النقاط المخصومة"}</div>
                <div class="points-value">${points > 0 ? "+" : ""}${points}</div>
                <div style="font-size: 14px; color: #6B7280; margin-top: 10px;">المجموع الجديد: ${newPoints} نقطة</div>
                ${oldLevel !== newLevel ? `<div style="font-size: 16px; color: #10B981; margin-top: 15px; font-weight: bold;">🎊 ترقية المستوى! أنت الآن ${newLevel}!</div>` : ""}
              </div>
              
              <div class="reason-box">
                <h3 style="margin-top: 0; color: #3B82F6;">📝 السبب</h3>
                <p style="margin: 5px 0;">${reason}</p>
              </div>
              
              <p>يمكنك عرض نقاطك الحالية ومستواك عبر تسجيل الدخول إلى تطبيق إدارة الموظفين.</p>
              
              <p style="margin-top: 30px;">${points > 0 ? "تابع العمل الرائع!" : "شكرًا لك!"}</p>
            </div>

            <div class="divider"></div>

            <!-- English Section -->
            <div class="section">
              <p>Hello ${updatedStaff.name},</p>
              
              <p>${points > 0 ? "Great news! Your account has been added with the following:" : "Your points have been adjusted. Your account has been ${pointsChange} with the following:"}</p>
              
              <div class="points-box">
                <div style="font-size: 16px; color: #6B7280; margin-bottom: 5px;">Points ${points > 0 ? "Added" : "Subtracted"}</div>
                <div class="points-value">${points > 0 ? "+" : ""}${points}</div>
                <div style="font-size: 14px; color: #6B7280; margin-top: 10px;">New Total: ${newPoints} points</div>
                ${oldLevel !== newLevel ? `<div style="font-size: 16px; color: #10B981; margin-top: 15px; font-weight: bold;">🎊 Level Up! You are now ${newLevel}!</div>` : ""}
              </div>
              
              <div class="reason-box">
                <h3 style="margin-top: 0; color: #3B82F6;">📝 Reason</h3>
                <p style="margin: 5px 0;">${reason}</p>
              </div>
              
              <p>You can view your current points and level by logging into the Staff Management App.</p>
              
              <p style="margin-top: 30px;">${points > 0 ? "Keep up the great work!" : "Thank you!"}</p>
            </div>
          </div>
          <div class="footer">
            <p style="margin-bottom: 5px;">هذه رسالة آلية—يرجى عدم الرد على هذا البريد.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Only send email if staff is active
    if (updatedStaff.status === "active") {
      try {
        const emailResult = await sendEmail(
          updatedStaff.email,
          `${points > 0 ? "إضافة نقاط – Points Added" : "تعديل النقاط – Points Adjusted"}`,
          emailHtml,
        );

        if (emailResult.success) {
          console.log(
            `✅ Points adjustment email sent successfully`,
          );
          console.log(
            `   📧 To: ${updatedStaff.name} (${updatedStaff.email})`,
          );
          console.log(
            `   📝 Subject: Points ${points > 0 ? "Added" : "Adjusted"}: ${pointsDisplay} points`,
          );
        } else {
          console.log(`⚠️ Points adjustment email failed`);
          console.log(
            `   📧 Intended for: ${updatedStaff.name} (${updatedStaff.email})`,
          );
          console.log(`   ❌ Error: ${emailResult.error}`);
          if (emailResult.isTestingMode) {
            console.log(
              `   ℹ️ NOTE: In Resend test mode, check delivered@resend.dev for this email`,
            );
          }
        }
      } catch (emailError) {
        console.error(
          "❌ Error sending points adjustment email:",
          emailError,
        );
      }
    } else {
      console.log(
        `⏭️ Skipping email notification for inactive staff: ${updatedStaff.name}`,
      );
    }

    return c.json({
      success: true,
      staff: updatedStaff,
      adjustment,
      leveledUp: oldLevel !== newLevel,
    });
  } catch (error) {
    console.error("❌ Error adjusting points:", error);
    console.error("Error details:", {
      message:
        error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json(
      {
        error: "Failed to adjust points",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});

// Get point adjustments
app.get("/adjustments", async (c) => {
  console.log(
    "[Adjustments] Endpoint hit - v1.0.1 - Staff can view their own adjustments",
  );
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    const isAdmin = adminUser.isAdmin;

    console.log(
      "[Adjustments Endpoint] User:",
      user.id,
      "isAdmin:",
      isAdmin,
    );

    const supabase = getSupabaseAdmin();

    // Fetch point adjustments from Postgres
    // If staff user, filter to only their adjustments; if admin, get all
    console.log(
      "[getAdjustments] Fetching adjustments, isAdmin:",
      isAdmin,
      "userId:",
      user.id,
    );
    let adjustmentsQuery = supabase
      .from("point_adjustments")
      .select("*");

    if (!isAdmin) {
      console.log(
        "[getAdjustments] Filtering to staff_id:",
        user.id,
      );
      adjustmentsQuery = adjustmentsQuery.eq(
        "staff_id",
        user.id,
      );
    } else {
      console.log(
        "[getAdjustments] Admin - fetching ALL adjustments",
      );
    }

    const { data: pgAdjustments, error: adjustmentsError } =
      await adjustmentsQuery.order("created_at", {
        ascending: false,
      });

    console.log(
      "[getAdjustments] Adjustments query result:",
      pgAdjustments?.length || 0,
      "records Error:",
      adjustmentsError,
    );
    if (pgAdjustments && pgAdjustments.length > 0) {
      console.log(
        "[getAdjustments] Sample adjustment:",
        pgAdjustments[0],
      );
    }

    if (adjustmentsError) {
      console.error(
        "Error fetching adjustments from Postgres:",
        adjustmentsError,
      );
      return c.json(
        { error: "Failed to fetch adjustments" },
        500,
      );
    }

    // Fetch point transactions from Postgres
    // If staff user, filter to only their transactions; if admin, get all
    let transactionsQuery = supabase
      .from("point_transactions")
      .select("*");

    if (!isAdmin) {
      transactionsQuery = transactionsQuery.eq(
        "staff_id",
        user.id,
      );
    }

    const { data: pgTransactions, error: transactionsError } =
      await transactionsQuery.order("created_at", {
        ascending: false,
      });

    if (transactionsError) {
      console.error(
        "Error fetching transactions from Postgres:",
        transactionsError,
      );
      return c.json(
        { error: "Failed to fetch transactions" },
        500,
      );
    }

    // Get all auth users to map IDs to names
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();
    const userMap = new Map(
      authUsers.map((u) => [
        u.id,
        u.user_metadata?.name || u.email,
      ]),
    );

    // Convert Postgres adjustments to frontend format
    const adjustments = (pgAdjustments || []).map((adj) => ({
      id: adj.id,
      staffId: adj.staff_id,
      staffName: userMap.get(adj.staff_id) || "Unknown Staff",
      points: adj.points,
      reason: adj.reason,
      timestamp: adj.created_at,
      adminId: adj.admin_id,
      eventId: adj.event_id,
    }));

    // Convert Postgres transactions to frontend format
    const transactions = (pgTransactions || []).map((txn) => ({
      id: txn.id,
      staffId: txn.staff_id,
      staffName: userMap.get(txn.staff_id) || "Unknown Staff",
      points: txn.points,
      reason: txn.reason,
      timestamp: txn.created_at,
      adminId: txn.admin_id,
      eventId: txn.event_id,
      transactionType: txn.transaction_type,
    }));

    return c.json({ adjustments, transactions });
  } catch (error) {
    console.error("Error fetching adjustments:", error);
    return c.json(
      { error: "Failed to fetch adjustments" },
      500,
    );
  }
});

// ==================== EVENT SIGNUP ENDPOINTS ====================

// Sign up for event
app.post("/signups", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    const { eventId } = await c.req.json();

    if (!eventId) {
      return c.json({ error: "Event ID is required" }, 400);
    }

    const supabase = getSupabaseAdmin();
    const staffId = user.id;

    // Get event from Postgres
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      console.error("Error fetching event:", eventError);
      return c.json({ error: "Event not found" }, 404);
    }

    // Check if already signed up
    const { data: existingSignup } = await supabase
      .from("event_signups")
      .select("*")
      .eq("event_id", eventId)
      .eq("staff_id", staffId)
      .single();

    if (existingSignup) {
      return c.json(
        { error: "Already signed up for this event" },
        400,
      );
    }

    // Block signup on the event day or after (staff must sign up at least 1 day before)
    const eventDateStr = event.start_date || event.end_date;

    if (!eventDateStr) {
      console.error("Event has no date:", event);
      return c.json({ error: "Event date is missing" }, 500);
    }

    const [year, month, day] = eventDateStr
      .split("-")
      .map(Number);
    const eventDate = new Date(year, month - 1, day);
    eventDate.setHours(0, 0, 0, 0); // Start of event day

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    if (today >= eventDate) {
      return c.json(
        {
          error:
            "Cannot sign up on the event day. Please sign up at least 1 day before.",
        },
        400,
      );
    }

    // Add user to signups
    const signUpTimestamp = new Date().toISOString();
    console.log("Attempting to insert signup:", {
      event_id: eventId,
      staff_id: staffId,
      signed_up_at: signUpTimestamp,
    });

    const { error: signupError } = await supabase
      .from("event_signups")
      .insert({
        event_id: eventId,
        staff_id: staffId,
        signed_up_at: signUpTimestamp,
      });

    if (signupError) {
      console.error("Error creating signup:", signupError);
      console.error(
        "Signup error details:",
        JSON.stringify(signupError, null, 2),
      );
      return c.json(
        {
          error: `Failed to sign up for event: ${signupError.message || JSON.stringify(signupError)}`,
        },
        500,
      );
    }

    // Fetch updated event with all signups
    const { data: updatedEvent } = await supabase
      .from("events")
      .select(
        `
        *,
        event_signups (*)
      `,
      )
      .eq("id", eventId)
      .single();

    // Query point_adjustments to get who has received points for this event
    const { data: pointAdjustments } = await supabase
      .from("point_adjustments")
      .select("staff_id")
      .eq("event_id", eventId);

    const pointsAwarded = (pointAdjustments || []).map(
      (adj: any) => adj.staff_id,
    );

    // Fetch levels to map required_level back to level name
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");
    const level = (pgLevels || []).find(
      (l: any) => l.id === updatedEvent.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Transform event to match frontend format
    const transformedEvent = {
      id: updatedEvent.id,
      name: updatedEvent.name,
      date: updatedEvent.start_date || updatedEvent.end_date,
      endDate: updatedEvent.end_date || updatedEvent.start_date, // Default to start_date if end_date is null
      time: updatedEvent.start_time,
      duration: updatedEvent.duration,
      location: updatedEvent.location,
      description: updatedEvent.description || "",
      notes: updatedEvent.notes || "",
      points: updatedEvent.points,
      requiredLevel: requiredLevelName,
      signedUpStaff:
        updatedEvent.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [],
      signUpTimestamps:
        updatedEvent.event_signups?.reduce(
          (acc: any, s: any) => {
            const staffId = s.user_id || s.staff_id;
            acc[staffId] = s.signed_up_at;
            return acc;
          },
          {},
        ) || {},
      confirmedStaff: updatedEvent.confirmed_staff || [],
      pointsAwarded: pointsAwarded,
      hasBeenClosedBefore:
        updatedEvent.has_been_closed_before || false,
      createdAt: updatedEvent.created_at,
      status: updatedEvent.status,
    };

    return c.json({ success: true, event: transformedEvent });
  } catch (error) {
    console.error("Error signing up for event:", error);
    return c.json(
      { error: "Failed to sign up for event" },
      500,
    );
  }
});

// Cancel event signup
app.delete("/signups/:eventId", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    const eventId = c.req.param("eventId");
    const supabase = getSupabaseAdmin();
    const staffId = user.id;

    // Check if event exists
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      console.error("Error fetching event:", eventError);
      return c.json({ error: "Event not found" }, 404);
    }

    // Remove user from signups
    const { error: deleteError } = await supabase
      .from("event_signups")
      .delete()
      .eq("event_id", eventId)
      .eq("staff_id", staffId);

    if (deleteError) {
      console.error("Error deleting signup:", deleteError);
      return c.json({ error: "Failed to cancel signup" }, 500);
    }

    // Fetch updated event with all signups
    const { data: updatedEvent } = await supabase
      .from("events")
      .select(
        `
        *,
        event_signups (*)
      `,
      )
      .eq("id", eventId)
      .single();

    // Query point_adjustments to get who has received points for this event
    const { data: pointAdjustments } = await supabase
      .from("point_adjustments")
      .select("staff_id")
      .eq("event_id", eventId);

    const pointsAwarded = (pointAdjustments || []).map(
      (adj: any) => adj.staff_id,
    );

    // Fetch levels to map required_level back to level name
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");
    const level = (pgLevels || []).find(
      (l: any) => l.id === updatedEvent.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Transform event to match frontend format
    const transformedEvent = {
      id: updatedEvent.id,
      name: updatedEvent.name,
      date: updatedEvent.start_date || updatedEvent.end_date,
      endDate: updatedEvent.end_date || updatedEvent.start_date, // Default to start_date if end_date is null
      time: updatedEvent.start_time,
      duration: updatedEvent.duration,
      location: updatedEvent.location,
      description: updatedEvent.description || "",
      notes: updatedEvent.notes || "",
      points: updatedEvent.points,
      requiredLevel: requiredLevelName,
      signedUpStaff:
        updatedEvent.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [],
      signUpTimestamps:
        updatedEvent.event_signups?.reduce(
          (acc: any, s: any) => {
            const staffId = s.user_id || s.staff_id;
            acc[staffId] = s.signed_up_at;
            return acc;
          },
          {},
        ) || {},
      confirmedStaff: updatedEvent.confirmed_staff || [],
      pointsAwarded: pointsAwarded,
      hasBeenClosedBefore:
        updatedEvent.has_been_closed_before || false,
      createdAt: updatedEvent.created_at,
      status: updatedEvent.status,
    };

    return c.json({ success: true, event: transformedEvent });
  } catch (error) {
    console.error("Error cancelling signup:", error);
    return c.json({ error: "Failed to cancel signup" }, 500);
  }
});

// Admin manually sign up staff for event
app.post("/signups/admin", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const { eventId, staffIds } = await c.req.json();

    console.log("📋 Admin signup request - Event ID:", eventId);
    console.log(
      "📋 Admin signup request - Staff IDs:",
      JSON.stringify(staffIds, null, 2),
    );

    if (!eventId || !staffIds || !Array.isArray(staffIds)) {
      return c.json(
        { error: "Event ID and staff IDs are required" },
        400,
      );
    }

    const supabase = getSupabaseAdmin();

    // Get event from Postgres
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      console.error("❌ Error fetching event:", eventError);
      return c.json({ error: "Event not found" }, 404);
    }

    console.log(
      "✅ Event found:",
      event.name,
      "- Status:",
      event.status,
    );

    // Check if event is cancelled
    if (event.status === "cancelled") {
      console.log(
        "⚠️ Event is cancelled, cannot sign up staff",
      );
      return c.json(
        { error: "Cannot sign up staff for cancelled events" },
        400,
      );
    }

    // Get existing signups
    const { data: existingSignups, error: signupsError } =
      await supabase
        .from("event_signups")
        .select("staff_id")
        .eq("event_id", eventId);

    if (signupsError) {
      console.error(
        "⚠️ Error fetching existing signups:",
        signupsError,
      );
    }

    const currentSignedUp =
      existingSignups?.map(
        (s: any) => s.user_id || s.staff_id,
      ) || [];
    console.log(
      "📊 Current signed up staff:",
      currentSignedUp.length,
    );

    // Filter out staff who are already signed up
    const newStaffIds = staffIds.filter(
      (staffId: string) => !currentSignedUp.includes(staffId),
    );
    console.log("📊 New staff to sign up:", newStaffIds.length);

    if (newStaffIds.length === 0) {
      console.log(
        "⚠️ All selected staff are already signed up - returning current event state",
      );

      // Instead of returning an error, return success with the current event state
      // This allows the UI to update properly and show the already-signed-up staff
      const { data: updatedEvent, error: fetchError } =
        await supabase
          .from("events")
          .select(
            `
          *,
          event_signups (
            staff_id,
            signed_up_at
          ),
          levels (
            name
          )
        `,
          )
          .eq("id", eventId)
          .single();

      if (fetchError) {
        console.error("❌ Error fetching event:", fetchError);
        return c.json({ error: "Failed to fetch event" }, 500);
      }

      // Get point awards for this event
      const { data: pointAwards } = await supabase
        .from("point_adjustments")
        .select("staff_id")
        .eq("event_id", eventId);

      const pointsAwarded =
        pointAwards?.map((p: any) => p.staff_id) || [];
      const requiredLevelName =
        updatedEvent.levels?.[0]?.name ||
        updatedEvent.required_level ||
        "";

      const transformedEvent = {
        id: updatedEvent.id,
        name: updatedEvent.name,
        date: updatedEvent.start_date || updatedEvent.end_date,
        endDate:
          updatedEvent.end_date || updatedEvent.start_date,
        time: updatedEvent.start_time,
        duration: updatedEvent.duration,
        location: updatedEvent.location,
        description: updatedEvent.description || "",
        notes: updatedEvent.notes || "",
        points: updatedEvent.points,
        requiredLevel: requiredLevelName,
        signedUpStaff:
          updatedEvent.event_signups?.map(
            (s: any) => s.staff_id,
          ) || [],
        signUpTimestamps:
          updatedEvent.event_signups?.reduce(
            (acc: any, s: any) => {
              acc[s.staff_id] = s.signed_up_at;
              return acc;
            },
            {},
          ) || {},
        confirmedStaff: updatedEvent.confirmed_staff || [],
        pointsAwarded: pointsAwarded,
        hasBeenClosedBefore:
          updatedEvent.has_been_closed_before || false,
        createdAt: updatedEvent.created_at,
        status: updatedEvent.status,
      };

      console.log(
        "✅ Returning event with already signed-up staff:",
        transformedEvent.signedUpStaff.length,
      );

      return c.json({
        success: true,
        event: transformedEvent,
        addedCount: 0,
        message: "All selected staff are already signed up",
      });
    }

    // Verify all staff IDs exist in auth.users
    console.log("🔍 Verifying staff users exist in auth...");
    for (const staffId of newStaffIds) {
      const {
        data: { user: staffUser },
        error: userError,
      } = await supabase.auth.admin.getUserById(staffId);

      if (userError || !staffUser) {
        console.error(
          `❌ Staff user ${staffId} not found in auth:`,
          userError,
        );
        return c.json(
          { error: `Staff user ${staffId} not found` },
          404,
        );
      }
      console.log(`✅ Verified staff user: ${staffUser.email}`);
    }

    // Add staff to signups with timestamp
    const signUpTimestamp = new Date().toISOString();
    const signupsToInsert = newStaffIds.map(
      (staffId: string) => ({
        event_id: eventId,
        staff_id: staffId,
        signed_up_at: signUpTimestamp,
      }),
    );

    const { error: insertError } = await supabase
      .from("event_signups")
      .insert(signupsToInsert);

    if (insertError) {
      console.error("❌ Error inserting signups:", insertError);
      console.error(
        "❌ Full error details:",
        JSON.stringify(insertError, null, 2),
      );
      console.error("❌ Event ID:", eventId);
      console.error(
        "❌ Staff IDs to insert:",
        JSON.stringify(newStaffIds, null, 2),
      );
      console.error(
        "❌ Attempted to insert:",
        JSON.stringify(signupsToInsert, null, 2),
      );
      return c.json(
        {
          error: `Failed to sign up staff for event: ${insertError.message || insertError.code}`,
        },
        500,
      );
    }

    // Fetch updated event with all signups
    const { data: updatedEvent } = await supabase
      .from("events")
      .select(
        `
        *,
        event_signups (*)
      `,
      )
      .eq("id", eventId)
      .single();

    console.log(
      "📦 Fetched updated event:",
      updatedEvent?.name,
    );
    console.log(
      "📦 Event signups array:",
      updatedEvent?.event_signups,
    );
    console.log(
      "📦 Event signups length:",
      updatedEvent?.event_signups?.length,
    );
    if (
      updatedEvent?.event_signups &&
      updatedEvent.event_signups.length > 0
    ) {
      console.log(
        "📦 First signup structure:",
        JSON.stringify(updatedEvent.event_signups[0], null, 2),
      );
    }

    // Get level name for the event
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");
    const level = (pgLevels || []).find(
      (l: any) => l.id === updatedEvent.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Get confirmed staff from point_adjustments
    const { data: pointsData } = await supabase
      .from("point_adjustments")
      .select("staff_id")
      .eq("event_id", eventId);
    const pointsAwarded = (pointsData || []).map(
      (p: any) => p.staff_id,
    );

    // Transform event to match frontend format
    const transformedEvent = {
      id: updatedEvent.id,
      name: updatedEvent.name,
      date: updatedEvent.start_date || updatedEvent.end_date,
      endDate: updatedEvent.end_date || updatedEvent.start_date,
      time: updatedEvent.start_time,
      duration: updatedEvent.duration,
      location: updatedEvent.location,
      description: updatedEvent.description || "",
      notes: updatedEvent.notes || "",
      points: updatedEvent.points,
      requiredLevel: requiredLevelName,
      signedUpStaff:
        updatedEvent.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [],
      signUpTimestamps:
        updatedEvent.event_signups?.reduce(
          (acc: any, s: any) => {
            const staffId = s.user_id || s.staff_id;
            acc[staffId] = s.signed_up_at;
            return acc;
          },
          {},
        ) || {},
      confirmedStaff: updatedEvent.confirmed_staff || [],
      pointsAwarded: pointsAwarded,
      hasBeenClosedBefore:
        updatedEvent.has_been_closed_before || false,
      createdAt: updatedEvent.created_at,
      status: updatedEvent.status,
    };

    console.log(
      "✅ Transformed event signedUpStaff:",
      transformedEvent.signedUpStaff,
    );
    console.log(
      "✅ Transformed event signUpTimestamps:",
      transformedEvent.signUpTimestamps,
    );

    return c.json({
      success: true,
      event: transformedEvent,
      addedCount: newStaffIds.length,
    });
  } catch (error) {
    console.error(
      "Error admin signing up staff for event:",
      error,
    );
    return c.json(
      { error: "Failed to sign up staff for event" },
      500,
    );
  }
});

// Confirm participation and award points (admin only)
app.post("/participation/confirm", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const { eventId, staffId } = await c.req.json();
    console.log("🔍 Confirm participation request:", {
      eventId,
      staffId,
    });

    if (!eventId || !staffId) {
      return c.json(
        { error: "Event ID and staff ID are required" },
        400,
      );
    }

    // Get event from Postgres
    console.log("📊 Fetching event from Postgres...");
    const supabase = getSupabaseAdmin();
    const { data: eventData, error: eventError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*)
      `,
        )
        .eq("id", eventId)
        .single();

    if (eventError || !eventData) {
      console.error("❌ Event not found:", eventError);
      return c.json({ error: "Event not found" }, 404);
    }

    console.log("✅ Event found:", eventData.name);

    // Get staff member from Supabase Auth
    console.log("👤 Fetching staff from Supabase Auth...");
    const {
      data: { user: staffUser },
      error: staffError,
    } = await supabase.auth.admin.getUserById(staffId);

    if (staffError) {
      console.error("❌ Error fetching staff:", staffError);
      return c.json(
        {
          error: "Failed to fetch staff member",
          details: staffError.message,
        },
        500,
      );
    }

    if (!staffUser) {
      console.error("❌ Staff member not found");
      return c.json({ error: "Staff member not found" }, 404);
    }

    console.log("✅ Staff found:", staffUser.email);

    const staff = {
      id: staffUser.id,
      name: staffUser.user_metadata?.name || "",
      email: staffUser.email || "",
      points: staffUser.user_metadata?.points || 0,
      level: staffUser.user_metadata?.level || "",
      status: staffUser.user_metadata?.status || "active",
    };

    console.log("📊 Staff data:", {
      name: staff.name,
      points: staff.points,
      level: staff.level,
    });

    // Check if points have already been awarded by checking point_adjustments table
    console.log(
      "🔍 Checking if points already awarded in point_adjustments...",
    );
    const {
      data: existingAdjustment,
      error: adjustmentCheckError,
    } = await supabase
      .from("point_adjustments")
      .select("*")
      .eq("staff_id", staffId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (adjustmentCheckError) {
      console.error(
        "❌ Error checking point adjustments:",
        adjustmentCheckError,
      );
      return c.json(
        {
          error: "Failed to check point adjustments",
          details: adjustmentCheckError.message,
        },
        500,
      );
    }

    if (existingAdjustment) {
      console.log(
        "⚠️ Points already awarded to this staff member (found in point_adjustments table)",
      );
      return c.json(
        {
          error: "Points already awarded to this staff member",
        },
        400,
      );
    }

    // Check if staff is in the selected/confirmed list
    const confirmedStaff = eventData.confirmed_staff || [];
    console.log("🔍 Checking if staff is confirmed:", {
      confirmedStaff,
      staffId,
      isConfirmed: confirmedStaff.includes(staffId),
    });
    if (!confirmedStaff.includes(staffId)) {
      console.log(
        "⚠️ Staff member was not selected for this event",
      );
      return c.json(
        {
          error: "Staff member was not selected for this event",
        },
        400,
      );
    }

    console.log(
      "✅ Validation passed, proceeding with point award",
    );

    // Calculate new points and level
    const oldLevel = staff.level;
    const newPoints = staff.points + eventData.points;
    console.log("📈 Calculating new points:", {
      oldPoints: staff.points,
      eventPoints: eventData.points,
      newPoints,
    });

    // Get level from Postgres
    console.log("📊 Fetching levels from Postgres...");
    const { data: levelsData } = await supabase
      .from("levels")
      .select("*")
      .order("min_points", { ascending: false });

    const levels = levelsData || [];
    const newLevelObj = levels.find(
      (l) => newPoints >= l.min_points,
    );
    const newLevel = newLevelObj?.name || "";
    console.log("🏆 New level calculated:", {
      oldLevel,
      newLevel,
    });

    // Update staff member in Supabase Auth
    console.log("💾 Updating staff in Supabase Auth...");
    const { error: updateStaffError } =
      await supabase.auth.admin.updateUserById(staffId, {
        user_metadata: {
          ...staffUser.user_metadata,
          points: newPoints,
          level: newLevel,
        },
      });

    if (updateStaffError) {
      console.error(
        "❌ Error updating staff:",
        updateStaffError,
      );
      return c.json(
        { error: "Failed to update staff member" },
        500,
      );
    }
    console.log("✅ Staff updated successfully");

    const updatedStaff = {
      ...staff,
      points: newPoints,
      level: newLevel,
    };

    // Record adjustment in Postgres
    console.log("💾 Recording adjustment in Postgres...");
    const { data: adjustmentData, error: adjustmentError } =
      await supabase
        .from("point_adjustments")
        .insert({
          staff_id: staffId,
          points: eventData.points,
          reason: `Completed Event: ${eventData.name}`,
          admin_id: user.id,
          event_id: eventId,
        })
        .select()
        .single();

    if (adjustmentError) {
      console.error(
        "❌ Error recording adjustment:",
        adjustmentError,
      );
    } else {
      console.log("✅ Adjustment recorded successfully");
    }

    const adjustment = adjustmentData
      ? {
          id: adjustmentData.id,
          staffId: adjustmentData.staff_id,
          points: adjustmentData.points,
          reason: adjustmentData.reason,
          timestamp: adjustmentData.created_at,
          adminId: adjustmentData.admin_id,
          eventId: adjustmentData.event_id,
        }
      : null;

    // Query point_adjustments to get updated list of who has received points for this event
    const { data: allAdjustments } = await supabase
      .from("point_adjustments")
      .select("staff_id")
      .eq("event_id", eventId);

    const updatedPointsAwarded = (allAdjustments || []).map(
      (adj: any) => adj.staff_id,
    );

    // Fetch levels to map required_level back to level name
    const { data: pgLevels } = await supabase
      .from("levels")
      .select("*");
    const level = (pgLevels || []).find(
      (l: any) => l.id === eventData.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Build complete updated event object for frontend
    const updatedEvent = {
      id: eventData.id,
      name: eventData.name,
      date: eventData.start_date || eventData.end_date,
      endDate: eventData.end_date || eventData.start_date,
      time: eventData.start_time || "",
      duration: eventData.duration || "",
      location: eventData.location,
      description: eventData.description || "",
      notes: eventData.notes || "",
      requiredLevel: requiredLevelName,
      points: eventData.points,
      status: eventData.status,
      createdAt: eventData.created_at,
      signedUpStaff:
        eventData.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [],
      confirmedStaff: eventData.confirmed_staff || [],
      pointsAwarded: updatedPointsAwarded,
      hasBeenClosedBefore:
        eventData.has_been_closed_before || false,
      signUpTimestamps:
        eventData.event_signups?.reduce((acc: any, s: any) => {
          const staffId = s.user_id || s.staff_id;
          acc[staffId] = s.signed_up_at;
          return acc;
        }, {}) || {},
    };

    console.log(
      "🔍 [BACKEND] Built updatedEvent:",
      JSON.stringify(updatedEvent, null, 2),
    );
    console.log(
      "🔍 [BACKEND] updatedEvent.pointsAwarded:",
      updatedEvent.pointsAwarded,
    );

    // Send email notification to staff member
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .points-box { background-color: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); text-align: center; }
          .points-value { font-size: 48px; font-weight: bold; color: #10B981; margin: 10px 0; }
          .event-box { background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="text-align: center; margin-bottom: 10px;">
              <img src="https://img1.wsimg.com/isteam/ip/aead55c7-5dc3-4ad4-8132-6139ccf3e033/nahky.png/:/rs=w:132,h:104,cg:true,m/cr=w:132,h:104/qt=q:95" alt="Nahky Araby Logo" style="max-width: 200px; height: auto;" />
            </div>
            <h2 style="margin: 10px 0 20px 0; font-size: 24px; font-weight: 600; opacity: 1;">Nahky Araby Event Hub</h2>
            <h1>🎉 Event Completed - Points Earned!</h1>
          </div>
          <div class="content">
            <p>Hello ${staff.name},</p>
            
            <p>Congratulations! You have successfully completed an event and earned points!</p>
            
            <div class="points-box">
              <div style="font-size: 16px; color: #6B7280; margin-bottom: 5px;">Points Earned</div>
              <div class="points-value">+${eventData.points}</div>
              <div style="font-size: 14px; color: #6B7280; margin-top: 10px;">New Total: ${newPoints} points</div>
              ${oldLevel !== newLevel ? `<div style="font-size: 16px; color: #10B981; margin-top: 15px; font-weight: bold;">🎊 Level Up! You are now ${newLevel}!</div>` : ""}
            </div>
            
            <div class="event-box">
              <h3 style="margin-top: 0; color: #3B82F6;">📅 Event Details</h3>
              <p style="margin: 5px 0;"><strong>Event:</strong> ${eventData.name}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(eventData.start_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              <p style="margin: 5px 0;"><strong>Location:</strong> ${eventData.location}</p>
            </div>
            
            <p>Thank you for your participation and dedication! You can view your updated points and level by logging into Nahky Araby Event Hub.</p>
            
            <p style="margin-top: 30px;">Keep up the excellent work!</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Only send email if staff is active
    if (staff.status === "active") {
      try {
        const emailResult = await sendEmail(
          staff.email,
          `Event Completed: You earned ${eventData.points} points!`,
          emailHtml,
        );

        if (emailResult.success) {
          console.log(
            `✅ Event completion email sent successfully`,
          );
          console.log(
            `   📧 To: ${staff.name} (${staff.email})`,
          );
          console.log(
            `   📝 Subject: Event Completed: You earned ${eventData.points} points!`,
          );
        } else {
          console.log(`⚠️ Event completion email failed`);
          console.log(
            `   📧 Intended for: ${staff.name} (${staff.email})`,
          );
          console.log(`   ❌ Error: ${emailResult.error}`);
          if (emailResult.isTestingMode) {
            console.log(
              `   ℹ️ NOTE: In Resend test mode, check delivered@resend.dev for this email`,
            );
          }
        }
      } catch (emailError) {
        console.error(
          "❌ Error sending event completion email:",
          emailError,
        );
      }
    } else {
      console.log(
        `⏭️ Skipping email notification for inactive staff: ${staff.name}`,
      );
    }

    console.log("🔍 [BACKEND] About to return response...");
    console.log(
      "🔍 [BACKEND] updatedEvent object:",
      updatedEvent,
    );
    console.log(
      "🔍 [BACKEND] updatedEvent.pointsAwarded:",
      updatedEvent.pointsAwarded,
    );

    const response = {
      success: true,
      staff: updatedStaff,
      adjustment,
      event: updatedEvent,
      leveledUp: oldLevel !== newLevel,
    };

    console.log(
      "🔍 [BACKEND] Final response:",
      JSON.stringify(response, null, 2),
    );

    return c.json(response);
  } catch (error) {
    console.error("Error confirming participation:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return c.json(
      {
        error: "Failed to confirm participation",
        details: error?.message || "Unknown error",
      },
      500,
    );
  }
});

// Confirm all participants for an event at once (admin only)
app.post("/participation/confirm-all", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const { eventId } = await c.req.json();

    if (!eventId) {
      return c.json({ error: "Event ID is required" }, 400);
    }

    // Get event from Postgres
    const supabase = getSupabaseAdmin();
    const { data: eventData, error: eventError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*)
      `,
        )
        .eq("id", eventId)
        .single();

    if (eventError || !eventData) {
      return c.json({ error: "Event not found" }, 404);
    }

    const confirmedStaff = eventData.confirmed_staff || [];

    // Get all point adjustments for this event to see who already got points
    const {
      data: existingAdjustments,
      error: adjustmentsError,
    } = await supabase
      .from("point_adjustments")
      .select("staff_id")
      .eq("event_id", eventId);

    if (adjustmentsError) {
      console.error(
        "Error fetching point adjustments:",
        adjustmentsError,
      );
      return c.json(
        { error: "Failed to check point adjustments" },
        500,
      );
    }

    const staffWithPoints = (existingAdjustments || []).map(
      (adj: any) => adj.staff_id,
    );

    // Only award points to selected staff who haven't received points yet
    const staffToConfirm = confirmedStaff.filter(
      (staffId: string) => !staffWithPoints.includes(staffId),
    );

    if (staffToConfirm.length === 0) {
      return c.json(
        {
          error: "No staff members awaiting point confirmation",
        },
        400,
      );
    }

    const updatedStaffList = [];
    const adjustments = [];
    const levelUps = [];

    // Get level data from Postgres
    const { data: levelsData } = await supabase
      .from("levels")
      .select("*")
      .order("min_points", { ascending: false });

    const levels = levelsData || [];

    // Process each staff member who needs points
    for (const staffId of staffToConfirm) {
      // Get staff from Supabase Auth
      const {
        data: { user: staffUser },
        error: staffError,
      } = await supabase.auth.admin.getUserById(staffId);

      if (staffError || !staffUser) {
        console.warn(
          `Staff member ${staffId} not found, skipping`,
        );
        continue;
      }

      const staff = {
        id: staffUser.id,
        name: staffUser.user_metadata?.name || "",
        email: staffUser.email || "",
        points: staffUser.user_metadata?.points || 0,
        level: staffUser.user_metadata?.level || "",
      };

      // Calculate new points and level
      const oldLevel = staff.level;
      const newPoints = staff.points + eventData.points;
      const newLevelObj = levels.find(
        (l) => newPoints >= l.min_points,
      );
      const newLevel = newLevelObj?.name || "";

      // Update staff member in Supabase Auth
      await supabase.auth.admin.updateUserById(staffId, {
        user_metadata: {
          ...staffUser.user_metadata,
          points: newPoints,
          level: newLevel,
        },
      });

      const updatedStaff = {
        ...staff,
        points: newPoints,
        level: newLevel,
      };

      updatedStaffList.push(updatedStaff);

      // Record adjustment in Postgres
      const { data: adjustmentData } = await supabase
        .from("point_adjustments")
        .insert({
          staff_id: staffId,
          points: eventData.points,
          reason: `Completed Event: ${eventData.name}`,
          admin_id: user.id,
          event_id: eventId,
        })
        .select()
        .single();

      if (adjustmentData) {
        adjustments.push({
          id: adjustmentData.id,
          staffId: adjustmentData.staff_id,
          points: adjustmentData.points,
          reason: adjustmentData.reason,
          timestamp: adjustmentData.created_at,
          adminId: adjustmentData.admin_id,
          eventId: adjustmentData.event_id,
        });
      }

      // Track level ups
      if (oldLevel !== newLevel) {
        levelUps.push({
          staffId,
          name: staff.name,
          oldLevel,
          newLevel,
        });
      }
    }

    // Query point_adjustments to get updated list of who has received points for this event
    const { data: allAdjustments } = await supabase
      .from("point_adjustments")
      .select("staff_id")
      .eq("event_id", eventId);

    const updatedPointsAwarded = (allAdjustments || []).map(
      (adj: any) => adj.staff_id,
    );

    // Fetch levels to map required_level back to level name
    const level = levels.find(
      (l: any) => l.id === eventData.required_level,
    );
    const requiredLevelName = level ? level.name : "";

    // Build complete updated event object for frontend
    const updatedEvent = {
      id: eventData.id,
      name: eventData.name,
      date: eventData.start_date || eventData.end_date,
      endDate: eventData.end_date || eventData.start_date,
      time: eventData.start_time || "",
      duration: eventData.duration || "",
      location: eventData.location,
      description: eventData.description || "",
      notes: eventData.notes || "",
      requiredLevel: requiredLevelName,
      points: eventData.points,
      status: eventData.status,
      createdAt: eventData.created_at,
      signedUpStaff:
        eventData.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [],
      confirmedStaff: eventData.confirmed_staff || [],
      pointsAwarded: updatedPointsAwarded,
      hasBeenClosedBefore:
        eventData.has_been_closed_before || false,
      signUpTimestamps:
        eventData.event_signups?.reduce((acc: any, s: any) => {
          const staffId = s.user_id || s.staff_id;
          acc[staffId] = s.signed_up_at;
          return acc;
        }, {}) || {},
    };

    return c.json({
      success: true,
      confirmedCount: staffToConfirm.length,
      staffList: updatedStaffList,
      adjustments,
      event: updatedEvent,
      levelUps,
    });
  } catch (error) {
    console.error("Error confirming all participants:", error);
    return c.json(
      { error: "Failed to confirm all participants" },
      500,
    );
  }
});

// ==================== INITIALIZATION ENDPOINT ====================

// Initialize database with seed data (for first-time setup)
app.post("/init", async (c) => {
  try {
    console.log("=== Starting database initialization ===");

    // Check if already initialized
    const existingUsers = await kv.getByPrefix("user:");

    console.log("Existing users:", existingUsers.length);

    if (existingUsers.length > 0) {
      console.log("Database already initialized");
      return c.json({
        success: true,
        message: "Database already initialized",
        credentials: {
          admin: { username: "admin", password: "admin123" },
          staff: {
            email: "sarah.johnson@company.com",
            password: "password123",
          },
        },
      });
    }

    const supabase = getSupabaseAdmin();

    // Create default levels in Postgres
    console.log("Creating default levels in Postgres...");
    const defaultLevels = [
      { name: "Level 1", min_points: 0, order_index: 0 },
      { name: "Level 2", min_points: 1000, order_index: 1 },
    ];

    for (const level of defaultLevels) {
      const { error: levelError } = await supabase
        .from("levels")
        .insert(level);

      if (levelError) {
        console.error("Error creating level:", levelError);
      }
    }
    console.log("Default levels created in Postgres");

    console.log("Creating admin user...");

    // Create admin user with username "admin" (stored as admin@company.local in Supabase Auth)
    const { data: adminAuth, error: adminError } =
      await supabase.auth.admin.createUser({
        email: "admin@company.local",
        password: "admin123",
        user_metadata: {
          name: "Admin User",
          role: "admin",
          username: "admin",
        },
        email_confirm: true,
      });

    if (adminError) {
      console.error("Error creating admin user:", adminError);
    } else if (adminAuth) {
      console.log("Admin user created:", adminAuth.user.id);
      await kv.set(`user:${adminAuth.user.id}`, {
        id: adminAuth.user.id,
        email: "admin@company.local",
        username: "admin",
        name: "Admin User",
        role: "admin",
        status: "active",
        createdAt: new Date().toISOString(),
      });
      console.log("Admin user saved to KV store");
    }

    // Create sample staff members
    console.log("Creating staff members...");
    const staffData = [
      {
        email: "sarah.johnson@company.com",
        name: "Sarah Johnson",
        points: 850,
      },
      {
        email: "mike.chen@company.com",
        name: "Mike Chen",
        points: 1250,
      },
      {
        email: "emma.davis@company.com",
        name: "Emma Davis",
        points: 450,
      },
      {
        email: "hadi.abudayya@gmail.com",
        name: "Hadi Abudaya",
        points: 600,
      },
    ];

    for (const staff of staffData) {
      // Calculate level based on points
      const staffLevel = await calculateLevel(staff.points);

      const { data: staffAuth, error: staffError } =
        await supabase.auth.admin.createUser({
          email: staff.email,
          password: "password123",
          user_metadata: {
            name: staff.name,
            role: "staff",
            points: staff.points,
            level: staffLevel,
          },
          email_confirm: true,
        });

      if (staffError) {
        console.error(
          `Error creating staff ${staff.email}:`,
          staffError,
        );
      } else if (staffAuth) {
        console.log(
          `Staff created: ${staff.email} (${staffAuth.user.id})`,
        );
        await kv.set(`user:${staffAuth.user.id}`, {
          id: staffAuth.user.id,
          email: staff.email,
          name: staff.name,
          points: staff.points,
          level: staffLevel,
          role: "staff",
          status: "active",
          createdAt: new Date().toISOString(),
        });
      }
    }
    console.log("Staff members created");

    // Create sample events using the configured levels
    const level1 = defaultLevels[0].name; // First level (lowest)
    const level2 = defaultLevels[1].name; // Second level

    const events = [
      {
        id: `${Date.now()}-1`,
        name: "Summer Workshop Series",
        date: "2025-11-15",
        time: "09:00",
        location: "Main Campus - Room 101",
        points: 150,
        requiredLevel: level1,
        signedUpStaff: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: `${Date.now()}-2`,
        name: "Advanced Training Session",
        date: "2025-11-20",
        time: "14:00",
        location: "Training Center - Hall A",
        points: 250,
        requiredLevel: level2,
        signedUpStaff: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: `${Date.now()}-3`,
        name: "Community Outreach Event",
        date: "2025-11-22",
        time: "10:00",
        location: "Community Center",
        points: 200,
        requiredLevel: level1,
        signedUpStaff: [],
        createdAt: new Date().toISOString(),
      },
    ];

    console.log("Creating sample events...");
    for (const event of events) {
      await kv.set(`event:${event.id}`, event);
    }
    console.log("Sample events created");

    console.log("=== Database initialization complete ===");
    return c.json({
      success: true,
      message: "Database initialized with seed data",
      credentials: {
        admin: { username: "admin", password: "admin123" },
        staff: {
          email: "sarah.johnson@company.com",
          password: "password123",
        },
      },
    });
  } catch (error) {
    console.error("Initialization error:", error);
    return c.json(
      {
        error: `Failed to initialize database: ${error.message}`,
      },
      500,
    );
  }
});

// Migrate admin account from email to username format
app.post("/migrate-admin", async (c) => {
  try {
    console.log("=== Starting admin migration ===");

    const supabase = getSupabaseAdmin();

    // Get all users from Supabase Auth
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error("Error listing users:", listError);
      return c.json({ error: "Failed to list users" }, 500);
    }

    // Find admin user with old email
    const oldAdminUser = users?.find(
      (u) => u.email === "admin@company.com",
    );

    if (!oldAdminUser) {
      console.log("No admin user found with old email format");
      return c.json({
        success: true,
        message:
          "No migration needed - admin already using new format or not found",
      });
    }

    console.log(
      "Found admin user with old email, migrating to username format...",
    );

    // Update the admin user's email to new format
    const { error: updateError } =
      await supabase.auth.admin.updateUserById(
        oldAdminUser.id,
        {
          email: "admin@company.local",
          email_confirm: true,
          user_metadata: {
            ...oldAdminUser.user_metadata,
            username: "admin",
          },
        },
      );

    if (updateError) {
      console.error("Error updating admin user:", updateError);
      return c.json(
        { error: "Failed to update admin user" },
        500,
      );
    }

    // Update KV store
    const userData = await kv.get(`user:${oldAdminUser.id}`);
    if (userData) {
      userData.email = "admin@company.local";
      userData.username = "admin";
      await kv.set(`user:${oldAdminUser.id}`, userData);
      console.log("Updated admin user in KV store");
    }

    console.log("=== Admin migration complete ===");
    return c.json({
      success: true,
      message:
        'Admin account migrated successfully. You can now login with username "admin"',
      credentials: {
        username: "admin",
        password: "admin123",
      },
    });
  } catch (error) {
    console.error("Migration error:", error);
    return c.json(
      { error: `Failed to migrate admin: ${error.message}` },
      500,
    );
  }
});

// Force re-initialize database (clears all users and recreates)
app.post("/force-reinit", async (c) => {
  try {
    console.log("=== Starting FORCE re-initialization ===");

    const supabase = getSupabaseAdmin();

    // Delete all users from Supabase Auth
    console.log("Deleting all users from Supabase Auth...");
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (!listError && users) {
      for (const user of users) {
        await supabase.auth.admin.deleteUser(user.id);
        console.log(`Deleted user: ${user.email}`);
      }
    }

    // Clear all KV store data
    console.log("Clearing KV store...");
    const allKeys = [
      ...(await kv.getByPrefix("user:")),
      ...(await kv.getByPrefix("event:")),
      ...(await kv.getByPrefix("level:")),
      ...(await kv.getByPrefix("adjustment:")),
      ...(await kv.getByPrefix("setting:")),
    ];

    for (const item of allKeys) {
      await kv.del(item.key);
    }

    console.log("All data cleared. Running initialization...");

    // Now run the normal initialization
    // Delete all levels from Postgres
    console.log("Clearing Postgres levels table...");
    await supabase.from("levels").delete().neq("id", 0); // Delete all rows

    // Create default levels in Postgres
    console.log("Creating default levels in Postgres...");
    const defaultLevels = [
      { name: "Level 1", min_points: 0, order_index: 0 },
      { name: "Level 2", min_points: 1000, order_index: 1 },
    ];

    for (const level of defaultLevels) {
      const { error: levelError } = await supabase
        .from("levels")
        .insert(level);

      if (levelError) {
        console.error("Error creating level:", levelError);
      }
    }
    console.log("Default levels created in Postgres");

    console.log("Creating admin user...");

    // Create admin user with username "admin" (stored as admin@company.local in Supabase Auth)
    const { data: adminAuth, error: adminError } =
      await supabase.auth.admin.createUser({
        email: "admin@company.local",
        password: "admin123",
        user_metadata: {
          name: "Admin User",
          role: "admin",
          username: "admin",
        },
        email_confirm: true,
      });

    if (adminError) {
      console.error("Error creating admin user:", adminError);
      throw new Error(
        `Failed to create admin: ${adminError.message}`,
      );
    } else if (adminAuth) {
      console.log("Admin user created:", adminAuth.user.id);
      await kv.set(`user:${adminAuth.user.id}`, {
        id: adminAuth.user.id,
        email: "admin@company.local",
        username: "admin",
        name: "Admin User",
        role: "admin",
        status: "active",
        createdAt: new Date().toISOString(),
      });
      console.log("Admin user saved to KV store");
    }

    // Create sample staff members
    console.log("Creating staff members...");
    const staffData = [
      {
        email: "sarah.johnson@company.com",
        name: "Sarah Johnson",
        points: 850,
      },
      {
        email: "mike.chen@company.com",
        name: "Mike Chen",
        points: 1250,
      },
      {
        email: "emma.davis@company.com",
        name: "Emma Davis",
        points: 450,
      },
      {
        email: "hadi.abudayya@gmail.com",
        name: "Hadi Abudaya",
        points: 600,
      },
    ];

    for (const staff of staffData) {
      // Calculate level based on points
      const staffLevel = await calculateLevel(staff.points);

      const { data: staffAuth, error: staffError } =
        await supabase.auth.admin.createUser({
          email: staff.email,
          password: "password123",
          user_metadata: {
            name: staff.name,
            role: "staff",
            points: staff.points,
            level: staffLevel,
          },
          email_confirm: true,
        });

      if (staffError) {
        console.error(
          `Error creating staff ${staff.email}:`,
          staffError,
        );
      } else if (staffAuth) {
        console.log(
          `Staff created: ${staff.email} (${staffAuth.user.id})`,
        );
        await kv.set(`user:${staffAuth.user.id}`, {
          id: staffAuth.user.id,
          email: staff.email,
          name: staff.name,
          points: staff.points,
          level: staffLevel,
          role: "staff",
          status: "active",
          createdAt: new Date().toISOString(),
        });
      }
    }
    console.log("Staff members created");

    console.log("=== Force re-initialization complete ===");
    return c.json({
      success: true,
      message: "Database force re-initialized successfully",
      credentials: {
        admin: { username: "admin", password: "admin123" },
        staff: {
          email: "sarah.johnson@company.com",
          password: "password123",
        },
      },
    });
  } catch (error) {
    console.error("Force re-initialization error:", error);
    return c.json(
      {
        error: `Failed to force re-initialize: ${error.message}`,
      },
      500,
    );
  }
});

// Close event with approval selection (admin only)
app.post("/events/close", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const { eventId, approvedStaffIds } = await c.req.json();

    if (!eventId) {
      return c.json({ error: "Event ID is required" }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Get the event from Postgres
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select(
        `
        *,
        event_signups (*)
      `,
      )
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      console.error("Error fetching event:", eventError);
      return c.json({ error: "Event not found" }, 404);
    }

    // Get all signed up staff from event_signups
    const signedUpStaffIds =
      event.event_signups?.map(
        (s: any) => s.user_id || s.staff_id,
      ) || [];
    const rejectedStaffIds = signedUpStaffIds.filter(
      (id) => !approvedStaffIds.includes(id),
    );

    // Track previous selection state to determine who needs notifications
    const previouslyConfirmedStaff =
      event.confirmed_staff || [];
    // Check if event has EVER been closed before by reading the database column
    const wasClosedBefore =
      event.has_been_closed_before || false;

    console.log(
      `📋 Closing event "${event.name}": ${approvedStaffIds.length} approved, ${rejectedStaffIds.length} rejected`,
    );
    console.log(`  🔍 Event status: ${event.status}`);
    console.log(`  🔍 wasClosedBefore: ${wasClosedBefore}`);
    console.log(
      `  🔍 previouslyConfirmedStaff:`,
      previouslyConfirmedStaff,
    );
    console.log(`  🔍 signedUpStaffIds:`, signedUpStaffIds);
    console.log(`  🔍 approvedStaffIds:`, approvedStaffIds);
    if (wasClosedBefore) {
      console.log(
        `  ℹ️ Event was previously closed with ${previouslyConfirmedStaff.length} confirmed staff`,
      );
    } else {
      console.log(`  ℹ️ First time closing this event`);
    }

    // Update event in Postgres - replace confirmed_staff with only the approved staff
    console.log("Updating event with:", {
      eventId,
      confirmedStaffCount: approvedStaffIds.length,
      confirmedStaffType: Array.isArray(approvedStaffIds)
        ? "array"
        : typeof approvedStaffIds,
      sampleIds: approvedStaffIds.slice(0, 2),
    });

    const { error: updateError } = await supabase
      .from("events")
      .update({
        confirmed_staff: approvedStaffIds,
        status: "closed",
        has_been_closed_before: true,
      })
      .eq("id", eventId);

    if (updateError) {
      console.error("Error updating event:", updateError);
      console.error(
        "Full error details:",
        JSON.stringify(updateError, null, 2),
      );
      return c.json(
        {
          error: `Failed to close event: ${updateError.message || JSON.stringify(updateError)}`,
        },
        500,
      );
    }

    // Update event_signups table to reflect confirmed selections
    // Set is_selected = true and confirmed_at for approved staff
    if (approvedStaffIds.length > 0) {
      const { error: approvedError } = await supabase
        .from("event_signups")
        .update({
          is_selected: true,
          confirmed_at: new Date().toISOString(),
        })
        .eq("event_id", eventId)
        .in("staff_id", approvedStaffIds);

      if (approvedError) {
        console.error(
          "Error updating approved staff in event_signups:",
          approvedError,
        );
        // Don't fail the close operation, but log the error
      } else {
        console.log(
          `  ✓ Updated ${approvedStaffIds.length} approved staff in event_signups`,
        );
      }
    }

    // Set is_selected = false and confirmed_at = null for rejected staff
    if (rejectedStaffIds.length > 0) {
      const { error: rejectedError } = await supabase
        .from("event_signups")
        .update({
          is_selected: false,
          confirmed_at: null,
        })
        .eq("event_id", eventId)
        .in("staff_id", rejectedStaffIds);

      if (rejectedError) {
        console.error(
          "Error updating rejected staff in event_signups:",
          rejectedError,
        );
        // Don't fail the close operation, but log the error
      } else {
        console.log(
          `  ✓ Updated ${rejectedStaffIds.length} rejected staff in event_signups`,
        );
      }
    }

    // Verify the update was applied correctly
    const { data: verifyEvent } = await supabase
      .from("events")
      .select("status, has_been_closed_before")
      .eq("id", eventId)
      .single();

    console.log(
      `  ✓ Event "${event.name}" closed successfully`,
    );
    console.log(
      `  ✓ Marked ${approvedStaffIds.length} staff as selected`,
    );
    console.log(
      `  🔍 Verification - status: ${verifyEvent?.status}, has_been_closed_before: ${verifyEvent?.has_been_closed_before}`,
    );

    // Determine which staff members had their selection status changed
    let newlySelected = [];
    let newlyDeselected = [];

    if (wasClosedBefore) {
      // Event was previously closed - only notify staff whose status changed
      newlySelected = approvedStaffIds.filter(
        (id) => !previouslyConfirmedStaff.includes(id),
      );
      newlyDeselected = signedUpStaffIds.filter(
        (id) =>
          previouslyConfirmedStaff.includes(id) &&
          !approvedStaffIds.includes(id),
      );
      console.log(
        `  📊 Status changes: ${newlySelected.length} newly selected, ${newlyDeselected.length} newly deselected`,
      );
      console.log(`  📊 newlySelected IDs:`, newlySelected);
      console.log(`  📊 newlyDeselected IDs:`, newlyDeselected);
    } else {
      // Event was not previously closed - notify all staff
      newlySelected = approvedStaffIds;
      newlyDeselected = rejectedStaffIds;
      console.log(
        `  📊 First time closing: notifying all ${newlySelected.length + newlyDeselected.length} staff`,
      );
      console.log(
        `  📊 newlySelected (all approved):`,
        newlySelected,
      );
      console.log(
        `  📊 newlyDeselected (all rejected):`,
        newlyDeselected,
      );
    }

    // Send Telegram notifications only to staff whose status changed - Get settings from Postgres
    const { data: telegramSettings } = await supabase
      .from("integration_settings2")
      .select("*")
      .eq("integration_type", "telegram")
      .eq("connected", true)
      .single();

    console.log(
      `✈️ Telegram settings for event closure:`,
      telegramSettings
        ? {
            connected: telegramSettings.connected,
            botName: telegramSettings.bot_name,
          }
        : "NOT CONFIGURED",
    );

    if (telegramSettings && telegramSettings.connected) {
      const totalToNotify =
        newlySelected.length + newlyDeselected.length;
      console.log(
        `✈️ Telegram is connected, sending closure notifications to ${totalToNotify} staff members with status changes`,
      );

      let telegramSentCount = 0;

      // Send to newly selected staff
      for (let i = 0; i < newlySelected.length; i++) {
        const staffId = newlySelected[i];

        // Fetch staff from Supabase Auth
        const {
          data: { user: staffUser },
          error: staffError,
        } = await supabase.auth.admin.getUserById(staffId);

        if (staffError || !staffUser) {
          console.log(
            `  ⚠️ Staff ${staffId}: Not found, skipping`,
          );
          continue;
        }

        const staff = {
          id: staffUser.id,
          name: staffUser.user_metadata?.name || "",
          email: staffUser.email || "",
          telegramChatId:
            staffUser.user_metadata?.telegramChatId,
          telegramUsername:
            staffUser.user_metadata?.telegramUsername,
          status: staffUser.user_metadata?.status || "active",
        };

        // Skip inactive staff
        if (staff.status !== "active") {
          console.log(
            `  ⏭️ ${staff.name}: Inactive account, skipping Telegram notification`,
          );
          continue;
        }

        // Check if staff member has a Telegram chat ID
        const chatId =
          staff.telegramChatId || staff.telegramUsername;
        if (!chatId || chatId.trim() === "") {
          console.log(
            `  ⚠️ ${staff.name}: No Telegram chat ID on file, skipping Telegram`,
          );
          continue;
        }

        console.log(
          `  📤 Sending selection notification to ${staff.name} (${chatId})...`,
        );

        const telegramMessage = `مرحبا ${staff.name},

🎉 *تهانينا!* 🎉

لقد تم اختيارك للمشاركة في الفعالية التالية:

 📅 فعالية: *${event.name}*
 📍 الموقع: ${event.location}
 📆 التاريخ: ${new Date(event.start_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
 🕐 الوقت: ${event.start_time}
 ⏱️ المدّة: ${event.duration}
 ⭐️ النقاط: ${event.points} نقطة ${
   event.description
     ? `
 
 📝 الوصف: ${event.description}`
     : ""
 }${
   event.notes
     ? `
 
 💬 ملاحظات: ${event.notes}`
     : ""
 }

نتطلّع لرؤيتك هناك! ستحصل على نقاطك بعد انتهاء الفعالية.`;

        const telegramResult = await sendTelegramMessage(
          chatId,
          telegramMessage,
        );

        if (telegramResult.success) {
          console.log(
            `  ✓ Telegram sent successfully to ${staff.name} (${chatId})`,
          );
          telegramSentCount++;
        } else {
          console.log(
            `  ✗ Failed to send Telegram to ${staff.name} (${chatId}): ${telegramResult.error}`,
          );
        }

        // Rate limiting: Wait 600ms between messages
        if (i < newlySelected.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 600),
          );
        }
      }

      // Send to newly deselected staff
      for (let i = 0; i < newlyDeselected.length; i++) {
        const staffId = newlyDeselected[i];

        // Fetch staff from Supabase Auth
        const {
          data: { user: staffUser },
          error: staffError,
        } = await supabase.auth.admin.getUserById(staffId);

        if (staffError || !staffUser) {
          console.log(
            `  ⚠️ Staff ${staffId}: Not found, skipping`,
          );
          continue;
        }

        const staff = {
          id: staffUser.id,
          name: staffUser.user_metadata?.name || "",
          email: staffUser.email || "",
          telegramChatId:
            staffUser.user_metadata?.telegramChatId,
          telegramUsername:
            staffUser.user_metadata?.telegramUsername,
          status: staffUser.user_metadata?.status || "active",
        };

        // Skip inactive staff
        if (staff.status !== "active") {
          console.log(
            `  ⏭️ ${staff.name}: Inactive account, skipping Telegram notification`,
          );
          continue;
        }

        // Check if staff member has a Telegram chat ID
        const chatId =
          staff.telegramChatId || staff.telegramUsername;
        if (!chatId || chatId.trim() === "") {
          console.log(
            `  ⚠️ ${staff.name}: No Telegram chat ID on file, skipping Telegram`,
          );
          continue;
        }

        console.log(
          `  📤 Sending non-selection notification to ${staff.name} (${chatId})...`,
        );

        const telegramMessage = `مرحبا ${staff.name},

شكرًا لتسجيلك في الفعالية: *${event.name}*
للأسف، لم يتم اختيارك لهذه الفعالية يوم ${new Date(event.start_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

لا تقلق! ستكون هناك الكثير من الفرص القادمة للمشاركة. راقب التطبيق للفعاليات الجديدة واستمر بالتسجيل.
نقدّر حماسك ونتطلّع لرؤيتك في فعاليات قادمة!`;

        const telegramResult = await sendTelegramMessage(
          chatId,
          telegramMessage,
        );

        if (telegramResult.success) {
          console.log(
            `  ✓ Telegram sent successfully to ${staff.name} (${chatId})`,
          );
          telegramSentCount++;
        } else {
          console.log(
            `  ✗ Failed to send Telegram to ${staff.name} (${chatId}): ${telegramResult.error}`,
          );
        }

        // Rate limiting: Wait 600ms between messages
        if (i < newlyDeselected.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 600),
          );
        }
      }

      console.log(
        `✅ Sent ${telegramSentCount} Telegram notifications for event closure (${newlySelected.length} selected, ${newlyDeselected.length} deselected)`,
      );
    } else {
      console.log(
        `⚠️ Telegram not configured, skipping notifications`,
      );
    }

    // Fetch the updated event to return
    const { data: updatedEvent, error: fetchError } =
      await supabase
        .from("events")
        .select(
          `
        *,
        event_signups (*)
      `,
        )
        .eq("id", eventId)
        .single();

    if (fetchError || !updatedEvent) {
      console.error(
        "Error fetching updated event:",
        fetchError,
      );
      return c.json(
        {
          error:
            "Event closed but failed to fetch updated data",
        },
        500,
      );
    }

    console.log(
      "✅ Successfully fetched updated event, starting transformation...",
    );
    console.log(
      "Event data columns:",
      Object.keys(updatedEvent),
    );

    // Get the required level name from the levels table
    let requiredLevelName = null;
    try {
      if (updatedEvent.required_level) {
        console.log(
          "Fetching level name for ID:",
          updatedEvent.required_level,
        );
        const { data: levelData, error: levelError } =
          await supabase
            .from("levels")
            .select("name")
            .eq("id", updatedEvent.required_level)
            .single();

        if (levelError) {
          console.error("Error fetching level:", levelError);
          requiredLevelName = "Unknown";
        } else if (levelData) {
          requiredLevelName = levelData.name;
          console.log(
            "Level name resolved:",
            requiredLevelName,
          );
        } else {
          requiredLevelName = "Unknown";
        }
      }
    } catch (levelFetchError) {
      console.error(
        "Exception while fetching level:",
        levelFetchError,
      );
      requiredLevelName = "Unknown";
    }

    console.log("Creating transformed event object...");
    // Transform event to match frontend format
    const transformedEvent = {
      id: updatedEvent.id,
      name: updatedEvent.name,
      date: updatedEvent.start_date,
      endDate: updatedEvent.end_date,
      time: updatedEvent.start_time,
      duration: updatedEvent.duration,
      location: updatedEvent.location,
      description: updatedEvent.description || "",
      notes: updatedEvent.notes || "",
      points: updatedEvent.points,
      requiredLevel: requiredLevelName,
      signedUpStaff:
        updatedEvent.event_signups?.map(
          (s: any) => s.user_id || s.staff_id,
        ) || [],
      signUpTimestamps:
        updatedEvent.event_signups?.reduce(
          (acc: any, s: any) => {
            const staffId = s.user_id || s.staff_id;
            acc[staffId] = s.signed_up_at;
            return acc;
          },
          {},
        ) || {},
      confirmedStaff: updatedEvent.confirmed_staff || [],
      pointsAwarded: updatedEvent.points_awarded || [],
      createdAt: updatedEvent.created_at,
      status: updatedEvent.status,
    };

    console.log(
      "✅ Transformed event successfully:",
      transformedEvent.name,
    );
    console.log(
      "✅ Confirmed staff in response:",
      transformedEvent.confirmedStaff,
    );

    return c.json({
      success: true,
      event: transformedEvent,
    });
  } catch (error) {
    console.error("❌ CRITICAL ERROR closing event:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return c.json(
      {
        error: "Failed to close event",
        details: error?.message || "Unknown error",
      },
      500,
    );
  }
});

// Diagnostic endpoint to check staff data consistency
app.get("/diagnose-staff", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Get the user data to check if admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const supabase = getSupabaseAdmin();

    // Get all users from Supabase Auth
    const {
      data: { users: authUsers },
      error: authError2,
    } = await supabase.auth.admin.listUsers();

    if (authError2) {
      return c.json(
        { error: "Failed to fetch users from Supabase Auth" },
        500,
      );
    }

    // Get all users from KV store
    const allKVUsers = await kv.getByPrefix("user:");

    // Analyze duplicates in Supabase Auth
    const authUsersByEmail = new Map();
    for (const authUser of authUsers) {
      if (!authUsersByEmail.has(authUser.email)) {
        authUsersByEmail.set(authUser.email, []);
      }
      authUsersByEmail.get(authUser.email).push(authUser);
    }

    const authDuplicates = [];
    for (const [email, users] of authUsersByEmail.entries()) {
      if (users.length > 1) {
        authDuplicates.push({
          email,
          count: users.length,
          userIds: users.map((u) => u.id),
        });
      }
    }

    // Analyze duplicates in KV store
    const kvUsersByEmail = new Map();
    for (const kvUser of allKVUsers) {
      if (!kvUsersByEmail.has(kvUser.email)) {
        kvUsersByEmail.set(kvUser.email, []);
      }
      kvUsersByEmail.get(kvUser.email).push(kvUser);
    }

    const kvDuplicates = [];
    for (const [email, users] of kvUsersByEmail.entries()) {
      if (users.length > 1) {
        kvDuplicates.push({
          email,
          count: users.length,
          userIds: users.map((u) => u.id),
        });
      }
    }

    // Find orphaned records
    const authUserIds = new Set(authUsers.map((u) => u.id));
    const orphanedKVRecords = allKVUsers.filter(
      (kvUser) => !authUserIds.has(kvUser.id),
    );

    // Find missing KV records
    const kvUserIds = new Set(allKVUsers.map((u) => u.id));
    const missingKVRecords = authUsers.filter(
      (authUser) => !kvUserIds.has(authUser.id),
    );

    return c.json({
      summary: {
        totalAuthUsers: authUsers.length,
        totalKVUsers: allKVUsers.length,
        authDuplicates: authDuplicates.length,
        kvDuplicates: kvDuplicates.length,
        orphanedKVRecords: orphanedKVRecords.length,
        missingKVRecords: missingKVRecords.length,
      },
      details: {
        authDuplicates,
        kvDuplicates,
        orphanedKVRecords: orphanedKVRecords.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
        })),
        missingKVRecords: missingKVRecords.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.user_metadata?.name,
        })),
      },
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    return c.json(
      { error: `Failed to run diagnostics: ${error.message}` },
      500,
    );
  }
});

// Deduplicate staff members (removes duplicate users with same email)
app.post("/deduplicate-staff", async (c) => {
  try {
    console.log("=== Starting staff deduplication ===");

    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Get the user data to check if admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const supabase = getSupabaseAdmin();

    // STEP 1: Get all users from Supabase Auth
    console.log("Fetching users from Supabase Auth...");
    const {
      data: { users: authUsers },
      error: authError2,
    } = await supabase.auth.admin.listUsers();

    if (authError2) {
      console.error("Error fetching auth users:", authError2);
      return c.json(
        { error: "Failed to fetch users from Supabase Auth" },
        500,
      );
    }

    console.log(
      `Found ${authUsers.length} users in Supabase Auth`,
    );

    // STEP 2: Get all users from KV store
    const allKVUsers = await kv.getByPrefix("user:");
    console.log(`Found ${allKVUsers.length} users in KV store`);

    let duplicatesRemoved = 0;
    let orphansRemoved = 0;
    let authDuplicatesRemoved = 0;

    // Track which auth user IDs were deleted so we don't sync them later
    const deletedAuthUserIds = new Set();

    // STEP 3: Find and remove duplicates in Supabase Auth (by email)
    const authUsersByEmail = new Map();
    for (const authUser of authUsers) {
      if (!authUsersByEmail.has(authUser.email)) {
        authUsersByEmail.set(authUser.email, []);
      }
      authUsersByEmail.get(authUser.email).push(authUser);
    }

    for (const [email, users] of authUsersByEmail.entries()) {
      if (users.length > 1) {
        console.log(
          `Found ${users.length} duplicate auth accounts for email ${email}`,
        );

        // Sort by created_at (keep oldest)
        users.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        );

        const toKeep = users[0];
        const toDelete = users.slice(1);

        console.log(
          `Keeping auth user ${toKeep.id}, deleting ${toDelete.length} duplicates`,
        );

        for (const dupUser of toDelete) {
          try {
            await supabase.auth.admin.deleteUser(dupUser.id);
            console.log(
              `Deleted duplicate auth user: ${dupUser.id}`,
            );
            authDuplicatesRemoved++;
            deletedAuthUserIds.add(dupUser.id); // Track deleted user

            // Also remove from KV if exists
            await kv.del(`user:${dupUser.id}`);
          } catch (err) {
            console.error(
              `Failed to delete auth user ${dupUser.id}:`,
              err,
            );
          }
        }
      }
    }

    // STEP 4: Clean up KV store duplicates by email
    const staffUsers = allKVUsers.filter(
      (u) => u.role === "staff",
    );
    console.log(
      `Processing ${staffUsers.length} staff members in KV store`,
    );

    const kvUsersByEmail = new Map();
    for (const kvUser of staffUsers) {
      if (!kvUsersByEmail.has(kvUser.email)) {
        kvUsersByEmail.set(kvUser.email, []);
      }
      kvUsersByEmail.get(kvUser.email).push(kvUser);
    }

    for (const [email, users] of kvUsersByEmail.entries()) {
      if (users.length > 1) {
        console.log(
          `Found ${users.length} duplicate KV records for email ${email}`,
        );

        // Sort by createdAt (keep most recent)
        users.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });

        const toKeep = users[0];
        const toDelete = users.slice(1);

        console.log(
          `Keeping KV user ${toKeep.id}, deleting ${toDelete.length} duplicates`,
        );

        for (const dupUser of toDelete) {
          await kv.del(`user:${dupUser.id}`);
          duplicatesRemoved++;

          // Also try to delete from Supabase Auth if it exists
          try {
            await supabase.auth.admin.deleteUser(dupUser.id);
            console.log(
              `Deleted duplicate user from Supabase Auth: ${dupUser.id}`,
            );
            deletedAuthUserIds.add(dupUser.id); // Track deleted user
          } catch (err) {
            console.log(
              `User ${dupUser.id} not found in Supabase Auth (already deleted)`,
            );
          }
        }
      }
    }

    // STEP 5: Remove orphaned KV records (users in KV but not in Auth)
    const authUserIds = new Set(authUsers.map((u) => u.id));
    for (const kvUser of allKVUsers) {
      if (!authUserIds.has(kvUser.id)) {
        console.log(
          `User ${kvUser.id} (${kvUser.email}) is orphaned (not in Auth), removing from KV`,
        );
        await kv.del(`user:${kvUser.id}`);
        orphansRemoved++;
      }
    }

    // STEP 6: Sync any missing KV records for Auth users (skip users we just deleted)
    let syncedRecords = 0;
    for (const authUser of authUsers) {
      // Skip users that were deleted as duplicates
      if (deletedAuthUserIds.has(authUser.id)) {
        console.log(
          `Skipping sync for deleted duplicate user: ${authUser.id}`,
        );
        continue;
      }

      const kvUser = await kv.get(`user:${authUser.id}`);
      if (!kvUser) {
        // Auth user exists but not in KV - create the KV record
        const newKVUser = {
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.name || authUser.email,
          points: authUser.user_metadata?.points || 0,
          level: authUser.user_metadata?.level || "",
          status: authUser.user_metadata?.status || "active",
          role: authUser.user_metadata?.role || "staff",
          createdAt: authUser.created_at,
        };
        await kv.set(`user:${authUser.id}`, newKVUser);
        console.log(
          `Synced missing KV record for auth user: ${authUser.id} (${authUser.email})`,
        );
        syncedRecords++;
      }
    }

    console.log(`=== Deduplication complete ===`);
    console.log(
      `Auth duplicates removed: ${authDuplicatesRemoved}`,
    );
    console.log(`KV duplicates removed: ${duplicatesRemoved}`);
    console.log(`Orphaned records removed: ${orphansRemoved}`);
    console.log(`Records synced: ${syncedRecords}`);

    return c.json({
      success: true,
      message: `Cleanup complete! Removed ${authDuplicatesRemoved} duplicate auth accounts, ${duplicatesRemoved} duplicate KV records, ${orphansRemoved} orphaned records, and synced ${syncedRecords} missing records.`,
      authDuplicatesRemoved,
      duplicatesRemoved,
      orphansRemoved,
      syncedRecords,
    });
  } catch (error) {
    console.error("Deduplication error:", error);
    return c.json(
      { error: `Failed to deduplicate: ${error.message}` },
      500,
    );
  }
});

// Repair endpoint to ensure all staff names are in user_metadata
app.post("/repair-staff-names", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();

    let repaired = 0;
    let skipped = 0;
    const errors = [];

    console.log("=== Starting staff name repair ===");
    console.log(`Total auth users: ${authUsers.length}`);

    for (const authUser of authUsers) {
      console.log(`\nChecking user: ${authUser.email}`);
      console.log(
        `  Role: ${authUser.user_metadata?.role || "none"}`,
      );
      console.log(
        `  Current name in metadata: ${authUser.user_metadata?.name || "NONE"}`,
      );

      // Only process staff members (skip admins)
      if (authUser.user_metadata?.role === "admin") {
        console.log(`  ⏭️  Skipping admin user`);
        continue;
      }

      // Process staff or users without role
      if (
        authUser.user_metadata?.role === "staff" ||
        !authUser.user_metadata?.role
      ) {
        // Check if name exists in user_metadata
        if (
          !authUser.user_metadata?.name ||
          authUser.user_metadata.name === authUser.email
        ) {
          console.log(`  🔧 Needs repair!`);

          // Try to get name from KV store as fallback
          const kvUser = await kv.get(`user:${authUser.id}`);
          console.log(
            `  KV store data:`,
            kvUser ? JSON.stringify(kvUser) : "NOT FOUND",
          );

          const nameToSet =
            kvUser?.name ||
            authUser.email?.split("@")[0] ||
            "Staff Member";
          console.log(`  Will set name to: "${nameToSet}"`);

          try {
            // Update user_metadata with name
            const { data: updateData, error: updateError } =
              await supabase.auth.admin.updateUserById(
                authUser.id,
                {
                  user_metadata: {
                    ...authUser.user_metadata,
                    name: nameToSet,
                  },
                },
              );

            if (updateError) {
              errors.push(
                `${authUser.email}: ${updateError.message}`,
              );
              console.error(
                `  ❌ Failed to update:`,
                updateError,
              );
            } else {
              repaired++;
              console.log(
                `  ✅ Successfully updated to "${nameToSet}"`,
              );
              console.log(
                `  Verification - new metadata:`,
                updateData?.user?.user_metadata,
              );
            }
          } catch (err) {
            errors.push(`${authUser.email}: ${err.message}`);
            console.error(
              `Failed to update ${authUser.email}:`,
              err,
            );
          }
        } else {
          skipped++;
          console.log(
            `  ✅ Already has name: "${authUser.user_metadata.name}"`,
          );
        }
      }
    }

    console.log("\n=== Staff name repair complete ===");
    console.log(`Repaired: ${repaired}`);
    console.log(`Skipped (already had names): ${skipped}`);
    console.log(`Errors: ${errors.length}`);

    return c.json({
      success: true,
      message: `Repair complete! Fixed ${repaired} staff names, ${skipped} already had names.`,
      repaired,
      skipped,
      errors,
    });
  } catch (error) {
    console.error("Staff name repair error:", error);
    return c.json(
      {
        error: `Failed to repair staff names: ${error.message}`,
      },
      500,
    );
  }
});

// Verify staff names endpoint - shows what names are actually stored
app.get("/verify-staff-names", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json(
        { error: adminUser.error || "Admin access required" },
        403,
      );
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();

    // Filter for staff only
    const staffUsers = authUsers.filter(
      (u) =>
        u.user_metadata?.role === "staff" ||
        !u.user_metadata?.role,
    );

    const staffWithNames = staffUsers.filter(
      (u) =>
        u.user_metadata?.name &&
        u.user_metadata.name !== u.email,
    ).length;

    const details = staffUsers.map((u) => ({
      email: u.email,
      name: u.user_metadata?.name || null,
      hasName: !!(
        u.user_metadata?.name &&
        u.user_metadata.name !== u.email
      ),
    }));

    console.log("\n=== Staff Names Verification ===");
    console.log(`Total staff: ${staffUsers.length}`);
    console.log(`Staff with names: ${staffWithNames}`);
    console.log(
      `Staff without names: ${staffUsers.length - staffWithNames}`,
    );
    console.log("\nDetails:");
    details.forEach((d) => {
      console.log(
        `  ${d.email}: ${d.hasName ? `✓ "${d.name}"` : "✗ NO NAME"}`,
      );
    });
    console.log("================================\n");

    let message;
    if (staffWithNames === staffUsers.length) {
      message = `✓ All ${staffUsers.length} staff members have names set correctly!`;
    } else {
      message = `⚠️ ${staffUsers.length - staffWithNames} of ${staffUsers.length} staff members are missing names. See console for details.`;
    }

    return c.json({
      success: true,
      message,
      staffWithNames,
      staffWithoutNames: staffUsers.length - staffWithNames,
      details,
    });
  } catch (error) {
    console.error("Staff name verification error:", error);
    return c.json(
      {
        error: `Failed to verify staff names: ${error.message}`,
      },
      500,
    );
  }
});

// Diagnostic endpoint to check all events in database
app.get("/diagnose-events", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const eventSummary = events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      status: e.status,
      createdAt: e.created_at,
      signedUpCount: e.signed_up_staff?.length || 0,
      confirmedCount: e.confirmed_staff?.length || 0,
    }));

    console.log("\n=== ALL EVENTS IN DATABASE ===");
    console.log(`Total events: ${events.length}`);
    console.log("\nEvent details:");
    eventSummary.forEach((e) => {
      console.log(
        `  [${e.status || "NO STATUS"}] ${e.name} (${e.date})`,
      );
      console.log(`    ID: ${e.id}`);
      console.log(`    Created: ${e.createdAt}`);
      console.log(
        `    Signed up: ${e.signedUpCount}, Confirmed: ${e.confirmedCount}`,
      );
    });
    console.log("===============================\n");

    return c.json({
      success: true,
      totalEvents: events.length,
      events: eventSummary,
      fullEvents: events,
    });
  } catch (error) {
    console.error("Events diagnosis error:", error);
    return c.json(
      { error: `Failed to diagnose events: ${error.message}` },
      500,
    );
  }
});

// Diagnostic endpoint to check user_metadata
app.get("/diagnose-user-metadata", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();

    const staffUsers = authUsers
      .filter(
        (u) =>
          u.user_metadata?.role === "staff" ||
          !u.user_metadata?.role,
      )
      .map((u) => ({
        email: u.email,
        id: u.id,
        user_metadata: u.user_metadata,
        hasName: !!u.user_metadata?.name,
        nameValue: u.user_metadata?.name || "MISSING",
        raw_user_meta_data: u.raw_user_meta_data,
        app_metadata: u.app_metadata,
      }));

    return c.json({
      success: true,
      totalStaff: staffUsers.length,
      staffWithNames: staffUsers.filter((u) => u.hasName)
        .length,
      staffWithoutNames: staffUsers.filter((u) => !u.hasName)
        .length,
      staffUsers,
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    return c.json(
      { error: `Failed to diagnose: ${error.message}` },
      500,
    );
  }
});

// Diagnostic endpoint to check if new Postgres tables exist
app.get("/check-tables", async (c) => {
  try {
    // This is a diagnostic endpoint - no auth required for checking table structure
    const supabase = getSupabaseAdmin();

    const results = {
      tables: {},
      errors: [],
    };

    // Check levels table
    try {
      const { data: levels, error } = await supabase
        .from("levels")
        .select("*")
        .limit(1);
      results.tables.levels = {
        exists: !error,
        count: levels?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.levels = {
        exists: false,
        error: e.message,
      };
    }

    // Check staff_profiles table
    try {
      const { data: staff, error } = await supabase
        .from("staff_profiles")
        .select("*")
        .limit(1);
      results.tables.staff_profiles = {
        exists: !error,
        count: staff?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.staff_profiles = {
        exists: false,
        error: e.message,
      };
    }

    // Check events table
    try {
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .limit(1);
      results.tables.events = {
        exists: !error,
        count: events?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.events = {
        exists: false,
        error: e.message,
      };
    }

    // Check event_signups table
    try {
      const { data: signups, error } = await supabase
        .from("event_signups")
        .select("*")
        .limit(1);
      results.tables.event_signups = {
        exists: !error,
        count: signups?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.event_signups = {
        exists: false,
        error: e.message,
      };
    }

    // Check point_adjustments table
    try {
      const { data: adjustments, error } = await supabase
        .from("point_adjustments")
        .select("*")
        .limit(1);
      results.tables.point_adjustments = {
        exists: !error,
        count: adjustments?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.point_adjustments = {
        exists: false,
        error: e.message,
      };
    }

    // Check point_transactions table
    try {
      const { data: transactions, error } = await supabase
        .from("point_transactions")
        .select("*")
        .limit(1);
      results.tables.point_transactions = {
        exists: !error,
        count: transactions?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.point_transactions = {
        exists: false,
        error: e.message,
      };
    }

    // Check admin_settings table
    try {
      const { data: settings, error } = await supabase
        .from("admin_settings2")
        .select("*")
        .limit(1);
      results.tables.admin_settings = {
        exists: !error,
        count: settings?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.admin_settings = {
        exists: false,
        error: e.message,
      };
    }

    // Check integration_settings table
    try {
      const { data: integrations, error } = await supabase
        .from("integration_settings2")
        .select("*")
        .limit(1);
      results.tables.integration_settings = {
        exists: !error,
        count: integrations?.length || 0,
        error: error?.message,
      };
    } catch (e) {
      results.tables.integration_settings = {
        exists: false,
        error: e.message,
      };
    }

    // Summary
    const allTablesExist = Object.values(results.tables).every(
      (t) => t.exists,
    );

    return c.json({
      success: allTablesExist,
      message: allTablesExist
        ? "All tables exist and are accessible!"
        : "Some tables are missing or inaccessible",
      ...results,
    });
  } catch (error) {
    console.error("Table check error:", error);
    return c.json(
      { error: `Failed to check tables: ${error.message}` },
      500,
    );
  }
});

// Migration endpoint to move data from KV Store to Postgres
app.post("/migrate-to-postgres", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const supabase = getSupabaseAdmin();

    const migrationResults = {
      levels: { migrated: 0, skipped: 0, errors: [] },
      staff_profiles: { migrated: 0, skipped: 0, errors: [] },
      events: { migrated: 0, skipped: 0, errors: [] },
      event_signups: { migrated: 0, skipped: 0, errors: [] },
      point_adjustments: {
        migrated: 0,
        skipped: 0,
        errors: [],
      },
      point_transactions: {
        migrated: 0,
        skipped: 0,
        errors: [],
      },
      admin_settings: { migrated: 0, skipped: 0, errors: [] },
      integration_settings: {
        migrated: 0,
        skipped: 0,
        errors: [],
      },
    };

    console.log(
      "🚀 Starting migration from KV Store to Postgres...",
    );

    // 1. Migrate Levels
    console.log("📊 Migrating levels...");
    const kvLevels = await kv.getByPrefix("level:");
    for (const kvLevel of kvLevels) {
      try {
        const { data: existing } = await supabase
          .from("levels")
          .select("id")
          .eq("id", kvLevel.id)
          .single();

        if (existing) {
          migrationResults.levels.skipped++;
          continue;
        }

        const { error } = await supabase.from("levels").insert({
          id: kvLevel.id,
          name: kvLevel.name,
          min_points: kvLevel.minPoints || 0,
          order_index: kvLevel.order || 0,
          created_at: new Date().toISOString(),
        });

        if (error) {
          migrationResults.levels.errors.push(
            `${kvLevel.name}: ${error.message}`,
          );
        } else {
          migrationResults.levels.migrated++;
        }
      } catch (err) {
        migrationResults.levels.errors.push(
          `${kvLevel.name}: ${err.message}`,
        );
      }
    }

    // 2. Migrate Staff Profiles (from Supabase Auth user_metadata)
    console.log("👥 Migrating staff profiles...");
    const { data: authUsers } =
      await supabase.auth.admin.listUsers();

    for (const authUser of authUsers.users || []) {
      // Only migrate staff users (not admins)
      if (authUser.user_metadata?.role === "staff") {
        try {
          const { data: existing } = await supabase
            .from("staff_profiles")
            .select("id")
            .eq("id", authUser.id)
            .single();

          if (existing) {
            migrationResults.staff_profiles.skipped++;
            continue;
          }

          const { error } = await supabase
            .from("staff_profiles")
            .insert({
              id: authUser.id,
              name:
                authUser.user_metadata?.name ||
                authUser.email ||
                "Unknown",
              email: authUser.email || "",
              phone: authUser.user_metadata?.phone || "",
              telegram_chat_id:
                authUser.user_metadata?.telegramChatId ||
                authUser.user_metadata?.telegramUsername ||
                null,
              status:
                authUser.user_metadata?.status || "active",
              created_at: authUser.created_at,
            });

          if (error) {
            migrationResults.staff_profiles.errors.push(
              `${authUser.email}: ${error.message}`,
            );
          } else {
            migrationResults.staff_profiles.migrated++;
          }
        } catch (err) {
          migrationResults.staff_profiles.errors.push(
            `${authUser.email}: ${err.message}`,
          );
        }
      }
    }

    // 3. Migrate Events
    console.log("📅 Migrating events...");
    const kvEvents = await kv.getByPrefix("event:");

    for (const kvEvent of kvEvents) {
      try {
        const { data: existing } = await supabase
          .from("events")
          .select("id")
          .eq("id", kvEvent.id)
          .single();

        if (existing) {
          migrationResults.events.skipped++;
          continue;
        }

        const { error } = await supabase.from("events").insert({
          id: kvEvent.id,
          name: kvEvent.name,
          end_date: kvEvent.endDate || kvEvent.date,
          time: kvEvent.time,
          location: kvEvent.location,
          description: kvEvent.description || null,
          notes: kvEvent.notes || null,
          points: kvEvent.points,
          required_level: kvEvent.requiredLevel,
          status: kvEvent.status || "open",
          created_at:
            kvEvent.createdAt || new Date().toISOString(),
        });

        if (error) {
          migrationResults.events.errors.push(
            `${kvEvent.name}: ${error.message}`,
          );
        } else {
          migrationResults.events.migrated++;

          // 4. Migrate Event Signups for this event
          if (
            kvEvent.signedUpStaff &&
            kvEvent.signedUpStaff.length > 0
          ) {
            for (const staffId of kvEvent.signedUpStaff) {
              try {
                const signUpTimestamp =
                  kvEvent.signUpTimestamps?.[staffId] ||
                  kvEvent.createdAt ||
                  new Date().toISOString();
                const isConfirmed =
                  kvEvent.confirmedStaff?.includes(staffId) ||
                  false;
                const pointsAwarded =
                  kvEvent.pointsAwarded?.includes(staffId) ||
                  false;

                const { error: signupError } = await supabase
                  .from("event_signups")
                  .insert({
                    event_id: kvEvent.id,
                    user_id: staffId,
                    signed_up_at: signUpTimestamp,
                    confirmed_at: isConfirmed
                      ? new Date().toISOString()
                      : null,
                    points_awarded_at: pointsAwarded
                      ? new Date().toISOString()
                      : null,
                    is_admin_signup: false,
                  });

                if (signupError) {
                  migrationResults.event_signups.errors.push(
                    `Event ${kvEvent.name}, Staff ${staffId}: ${signupError.message}`,
                  );
                } else {
                  migrationResults.event_signups.migrated++;
                }
              } catch (err) {
                migrationResults.event_signups.errors.push(
                  `Event ${kvEvent.name}, Staff ${staffId}: ${err.message}`,
                );
              }
            }
          }
        }
      } catch (err) {
        migrationResults.events.errors.push(
          `${kvEvent.name}: ${err.message}`,
        );
      }
    }

    // 5. Migrate Point Adjustments
    console.log("🎯 Migrating point adjustments...");
    const kvAdjustments = await kv.getByPrefix(
      "point_adjustment:",
    );

    for (const kvAdj of kvAdjustments) {
      try {
        const { data: existing } = await supabase
          .from("point_adjustments")
          .select("id")
          .eq("id", kvAdj.id)
          .single();

        if (existing) {
          migrationResults.point_adjustments.skipped++;
          continue;
        }

        const { error } = await supabase
          .from("point_adjustments")
          .insert({
            id: kvAdj.id,
            user_id: kvAdj.staffId,
            points: kvAdj.points,
            reason: kvAdj.reason,
            created_at:
              kvAdj.timestamp || new Date().toISOString(),
            admin_user_id: kvAdj.adminId || null,
          });

        if (error) {
          migrationResults.point_adjustments.errors.push(
            `Adjustment ${kvAdj.id}: ${error.message}`,
          );
        } else {
          migrationResults.point_adjustments.migrated++;

          // Also create a point_transaction record
          try {
            await supabase.from("point_transactions").insert({
              user_id: kvAdj.staffId,
              points: kvAdj.points,
              reason: kvAdj.reason,
              transaction_type: "manual_adjustment",
              event_id: null,
              created_at:
                kvAdj.timestamp || new Date().toISOString(),
              admin_user_id: kvAdj.adminId || null,
            });
            migrationResults.point_transactions.migrated++;
          } catch (err) {
            migrationResults.point_transactions.errors.push(
              `Transaction for ${kvAdj.id}: ${err.message}`,
            );
          }
        }
      } catch (err) {
        migrationResults.point_adjustments.errors.push(
          `Adjustment ${kvAdj.id}: ${err.message}`,
        );
      }
    }

    // 6. Migrate Admin Settings
    console.log("⚙️ Migrating admin settings...");
    const adminSettings = await kv.get("settings:admin");
    if (adminSettings) {
      try {
        // Check if settings already exist
        const { data: existingEmail } = await supabase
          .from("admin_settings2")
          .select("id")
          .eq("key", "admin_email")
          .single();

        if (!existingEmail && adminSettings.email) {
          await supabase.from("admin_settings2").insert({
            key: "admin_email",
            value: adminSettings.email,
            updated_at: new Date().toISOString(),
          });
          migrationResults.admin_settings.migrated++;
        }

        const { data: existingPhone } = await supabase
          .from("admin_settings2")
          .select("id")
          .eq("key", "admin_phone")
          .single();

        if (!existingPhone && adminSettings.phone) {
          await supabase.from("admin_settings2").insert({
            key: "admin_phone",
            value: adminSettings.phone,
            updated_at: new Date().toISOString(),
          });
          migrationResults.admin_settings.migrated++;
        }
      } catch (err) {
        migrationResults.admin_settings.errors.push(
          `Admin settings: ${err.message}`,
        );
      }
    }

    // 7. Migrate WhatsApp Settings
    console.log("💬 Migrating WhatsApp settings...");
    const whatsappSettings = await kv.get("settings:whatsapp");
    if (whatsappSettings) {
      try {
        const { data: existing } = await supabase
          .from("integration_settings2")
          .select("id")
          .eq("platform", "whatsapp")
          .single();

        if (!existing) {
          await supabase.from("integration_settings2").insert({
            platform: "whatsapp",
            is_connected: whatsappSettings.connected || false,
            config: {
              phoneNumberId: whatsappSettings.phoneNumberId,
              accessToken: whatsappSettings.accessToken,
              phoneNumber: whatsappSettings.phoneNumber,
            },
            updated_at: new Date().toISOString(),
          });
          migrationResults.integration_settings.migrated++;
        }
      } catch (err) {
        migrationResults.integration_settings.errors.push(
          `WhatsApp: ${err.message}`,
        );
      }
    }

    // 8. Migrate Telegram Settings
    console.log("📱 Migrating Telegram settings...");
    const telegramSettings = await kv.get("settings:telegram");
    if (telegramSettings) {
      try {
        const { data: existing } = await supabase
          .from("integration_settings2")
          .select("id")
          .eq("platform", "telegram")
          .single();

        if (!existing) {
          await supabase.from("integration_settings2").insert({
            platform: "telegram",
            is_connected: telegramSettings.connected || false,
            config: {
              botToken: telegramSettings.botToken,
              botName: telegramSettings.botName,
            },
            updated_at: new Date().toISOString(),
          });
          migrationResults.integration_settings.migrated++;
        }
      } catch (err) {
        migrationResults.integration_settings.errors.push(
          `Telegram: ${err.message}`,
        );
      }
    }

    console.log("✅ Migration complete!");
    console.log(
      "Results:",
      JSON.stringify(migrationResults, null, 2),
    );

    return c.json({
      success: true,
      message: "Migration completed successfully",
      results: migrationResults,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return c.json(
      { error: `Migration failed: ${error.message}` },
      500,
    );
  }
});

// ==================== POSTGRES INITIALIZATION ENDPOINT ====================

// Verify and fix database schema
app.post("/verify-schema", async (c) => {
  try {
    console.log("🔍 Verifying database schema...");

    const supabase = getSupabaseAdmin();

    const results = {
      schema_fixes: [],
      errors: [],
      manual_sql_required: null,
    };

    // Check and fix events table schema
    try {
      console.log("Checking events table schema...");

      // Check for required_level column
      const { data: rlData, error: rlError } = await supabase
        .from("events")
        .select("required_level")
        .limit(1);

      if (
        rlError &&
        rlError.message.includes("required_level")
      ) {
        console.log("⚠️  required_level column missing");
        results.errors.push(
          'Required column "required_level" is missing from events table',
        );
        if (!results.manual_sql_required) {
          results.manual_sql_required = "";
        } else {
          results.manual_sql_required += "\n";
        }
        results.manual_sql_required +=
          "ALTER TABLE events ADD COLUMN IF NOT EXISTS required_level TEXT;";
        results.schema_fixes.push(
          "REQUIRED: Add required_level column to events table",
        );
      } else if (!rlError) {
        results.schema_fixes.push(
          "✅ events.required_level column exists",
        );
        console.log("✅ required_level column exists");
      } else {
        results.errors.push(
          `Events table check error (required_level): ${rlError.message}`,
        );
      }

      // Check for time column
      const { data: timeData, error: timeError } =
        await supabase.from("events").select("time").limit(1);

      if (timeError && timeError.message.includes("time")) {
        console.log("⚠️  time column missing");
        results.errors.push(
          'Required column "time" is missing from events table',
        );
        if (!results.manual_sql_required) {
          results.manual_sql_required = "";
        } else {
          results.manual_sql_required += "\n";
        }
        results.manual_sql_required +=
          "ALTER TABLE events ADD COLUMN IF NOT EXISTS time TEXT;";
        results.schema_fixes.push(
          "REQUIRED: Add time column to events table",
        );
      } else if (!timeError) {
        results.schema_fixes.push(
          "✅ events.time column exists",
        );
        console.log("✅ time column exists");
      } else {
        results.errors.push(
          `Events table check error (time): ${timeError.message}`,
        );
      }
    } catch (err) {
      results.errors.push(`Schema check error: ${err.message}`);
      console.error("Schema check error:", err);
    }

    console.log("Schema verification complete");

    return c.json({
      success: results.errors.length === 0,
      message:
        results.errors.length === 0
          ? "Schema verification complete - all required columns exist"
          : "Schema issues detected - manual SQL required",
      results,
      next_steps: results.manual_sql_required
        ? [
            "1. Open Supabase Dashboard → SQL Editor",
            "2. Run this SQL command: " +
              results.manual_sql_required,
            "3. Refresh this page and try creating an event again",
          ]
        : ["Schema is correct - you can create events"],
    });
  } catch (error) {
    console.error("Schema verification error:", error);
    return c.json(
      { error: `Schema verification failed: ${error.message}` },
      500,
    );
  }
});

// Initialize Postgres database directly with seed data
app.post("/init-postgres", async (c) => {
  try {
    console.log(
      "🚀 Starting Postgres database initialization...",
    );

    const supabase = getSupabaseAdmin();

    const initResults = {
      admin: { created: false, message: "" },
      levels: { created: 0, skipped: 0, errors: [] },
      staff: { created: 0, skipped: 0, errors: [] },
      events: { created: 0, skipped: 0, errors: [] },
    };

    // 1. Check and create admin user
    console.log("👨‍💼 Checking admin user...");
    try {
      // Check if admin exists with username "admin" (stored as admin@company.local)
      const { data: existingAdmin } =
        await supabase.auth.admin.listUsers();
      const adminExists = existingAdmin?.users?.find(
        (u) =>
          u.email === "admin@company.local" ||
          u.user_metadata?.username === "admin",
      );

      if (adminExists) {
        initResults.admin.message = "Admin already exists";
        console.log("Admin user already exists");
      } else {
        const { data: adminAuth, error: adminError } =
          await supabase.auth.admin.createUser({
            email: "admin@company.local",
            password: "admin123",
            user_metadata: {
              name: "Admin User",
              role: "admin",
              username: "admin",
            },
            email_confirm: true,
          });

        if (adminError) {
          initResults.admin.message = `Error: ${adminError.message}`;
          console.error("Error creating admin:", adminError);
        } else {
          initResults.admin.created = true;
          initResults.admin.message = "Created successfully";
          console.log("✅ Admin user created");
        }
      }
    } catch (err) {
      initResults.admin.message = `Error: ${err.message}`;
      console.error("Admin creation error:", err);
    }

    // 2. Create default levels in Postgres
    console.log("📊 Creating default levels...");
    const defaultLevels = [
      { name: "Level 1", min_points: 0, order_index: 0 },
      { name: "Level 2", min_points: 1000, order_index: 1 },
      { name: "Level 3", min_points: 2000, order_index: 2 },
    ];

    for (const level of defaultLevels) {
      try {
        const { data: existing } = await supabase
          .from("levels")
          .select("id")
          .eq("name", level.name)
          .single();

        if (existing) {
          initResults.levels.skipped++;
        } else {
          const { error } = await supabase
            .from("levels")
            .insert({
              name: level.name,
              min_points: level.min_points,
              order_index: level.order_index,
              created_at: new Date().toISOString(),
            });

          if (error) {
            initResults.levels.errors.push(
              `${level.name}: ${error.message}`,
            );
            console.error(
              `Error creating level ${level.name}:`,
              error,
            );
          } else {
            initResults.levels.created++;
            console.log(`✅ Created ${level.name}`);
          }
        }
      } catch (err) {
        initResults.levels.errors.push(
          `${level.name}: ${err.message}`,
        );
      }
    }

    // 3. Create demo staff members
    console.log("👥 Creating demo staff members...");
    const staffData = [
      {
        email: "sarah.johnson@company.com",
        name: "Sarah Johnson",
        points: 850,
        phone: "+1-555-0101",
      },
      {
        email: "mike.chen@company.com",
        name: "Mike Chen",
        points: 1250,
        phone: "+1-555-0102",
      },
      {
        email: "emma.davis@company.com",
        name: "Emma Davis",
        points: 450,
        phone: "+1-555-0103",
      },
    ];

    for (const staff of staffData) {
      try {
        // Check if user already exists in Auth
        const { data: existingUsers } =
          await supabase.auth.admin.listUsers();
        const userExists = existingUsers?.users?.find(
          (u) => u.email === staff.email,
        );

        if (userExists) {
          initResults.staff.skipped++;
          console.log(`Staff ${staff.email} already exists`);
        } else {
          // Calculate level based on points
          let staffLevel = "Level 1";
          if (staff.points >= 2000) staffLevel = "Level 3";
          else if (staff.points >= 1000) staffLevel = "Level 2";

          // Create in Auth
          const { data: staffAuth, error: staffError } =
            await supabase.auth.admin.createUser({
              email: staff.email,
              password: "password123",
              user_metadata: {
                name: staff.name,
                role: "staff",
                points: staff.points,
                level: staffLevel,
                phone: staff.phone,
              },
              email_confirm: true,
            });

          if (staffError) {
            initResults.staff.errors.push(
              `${staff.email}: ${staffError.message}`,
            );
            console.error(
              `Error creating staff ${staff.email}:`,
              staffError,
            );
          } else if (staffAuth) {
            // Create staff profile in Postgres
            const { error: profileError } = await supabase
              .from("staff_profiles")
              .insert({
                id: staffAuth.user.id,
                name:
                  staffAuth.user.user_metadata.name ||
                  staffAuth.user.email ||
                  "Unknown",
                email: staffAuth.user.email || "",
                phone: staff.phone,
                telegram_chat_id: null,
                status:
                  staffAuth.user.user_metadata.status ||
                  "pending",
                created_at: new Date().toISOString(),
              });

            if (profileError) {
              initResults.staff.errors.push(
                `${staff.email} profile: ${profileError.message}`,
              );
            } else {
              initResults.staff.created++;
              console.log(`✅ Created ${staff.email}`);
            }
          }
        }
      } catch (err) {
        initResults.staff.errors.push(
          `${staff.email}: ${err.message}`,
        );
      }
    }

    // 4. Create sample events in Postgres
    console.log("📅 Creating sample events...");
    const sampleEvents = [
      {
        id: crypto.randomUUID(),
        name: "Summer Workshop Series",
        end_date: "2025-11-20",
        time: "09:00",
        location: "Main Campus - Room 101",
        description: "Interactive workshop covering key topics",
        notes: "Bring your own laptop",
        points: 150,
        required_level: "Level 1",
        status: "open",
      },
      {
        id: crypto.randomUUID(),
        name: "Advanced Training Session",
        end_date: "2025-11-25",
        time: "14:00",
        location: "Training Center - Hall A",
        description:
          "Advanced techniques for experienced staff",
        notes: "Level 2+ only",
        points: 250,
        required_level: "Level 2",
        status: "open",
      },
      {
        id: crypto.randomUUID(),
        name: "Community Outreach Event",
        end_date: "2025-12-01",
        time: "10:00",
        location: "Community Center",
        description: "Help organize community activities",
        notes: "Transportation provided",
        points: 200,
        required_level: "Level 1",
        status: "open",
      },
    ];

    for (const event of sampleEvents) {
      try {
        const { data: existing } = await supabase
          .from("events")
          .select("id")
          .eq("id", event.id)
          .single();

        if (existing) {
          initResults.events.skipped++;
        } else {
          // Store time in description since time column may not exist
          let enhancedDescription = event.description || "";
          if (event.time) {
            enhancedDescription =
              `Time: ${event.time}\n${enhancedDescription}`.trim();
          }

          const { error } = await supabase
            .from("events")
            .insert({
              id: event.id,
              name: event.name,
              end_date: event.end_date,
              location: event.location,
              description: enhancedDescription,
              notes: event.notes,
              points: event.points,
              required_level: event.required_level,
              status: event.status,
              created_at: new Date().toISOString(),
            });

          if (error) {
            initResults.events.errors.push(
              `${event.name}: ${error.message}`,
            );
            console.error(
              `Error creating event ${event.name}:`,
              error,
            );
          } else {
            initResults.events.created++;
            console.log(`✅ Created event: ${event.name}`);
          }
        }
      } catch (err) {
        initResults.events.errors.push(
          `${event.name}: ${err.message}`,
        );
      }
    }

    console.log("✅ Postgres initialization complete!");
    console.log(
      "Results:",
      JSON.stringify(initResults, null, 2),
    );

    return c.json({
      success: true,
      message: "Database initialized successfully",
      results: initResults,
      credentials: {
        admin: { username: "admin", password: "admin123" },
        staff: [
          {
            email: "sarah.johnson@company.com",
            password: "password123",
            points: 850,
          },
          {
            email: "mike.chen@company.com",
            password: "password123",
            points: 1250,
          },
          {
            email: "emma.davis@company.com",
            password: "password123",
            points: 450,
          },
        ],
      },
    });
  } catch (error) {
    console.error("Initialization error:", error);
    return c.json(
      { error: `Initialization failed: ${error.message}` },
      500,
    );
  }
});

// ==================== COMPLETE KV TO POSTGRES MIGRATION ====================

// Complete migration endpoint
app.post("/complete-migration", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const supabase = getSupabaseAdmin();

    const migrationResults = {
      tables_created: [],
      integration_settings: { migrated: 0, errors: [] },
      admin_settings: { migrated: 0, errors: [] },
      summary: "",
    };

    console.log(
      "🚀 Starting complete KV to Postgres migration...",
    );

    // Step 1: Migrate Integration Settings
    console.log("📱 Migrating integration settings...");

    // Migrate WhatsApp settings
    try {
      const whatsappSettings = await kv.get(
        "whatsapp:settings",
      );
      if (whatsappSettings) {
        const { data: existing } = await supabase
          .from("integration_settings2")
          .select("id")
          .eq("integration_type", "whatsapp")
          .single();

        if (!existing) {
          const { error } = await supabase
            .from("integration_settings2")
            .insert({
              integration_type: "whatsapp",
              connected: whatsappSettings.connected || false,
              phone_number_id: whatsappSettings.phoneNumberId,
              access_token: whatsappSettings.accessToken,
              business_account_id:
                whatsappSettings.businessAccountId,
              connected_at: whatsappSettings.connectedAt,
            });

          if (error) {
            migrationResults.integration_settings.errors.push(
              `WhatsApp: ${error.message}`,
            );
            console.error(
              "Error migrating WhatsApp settings:",
              error,
            );
          } else {
            migrationResults.integration_settings.migrated++;
            console.log("✅ WhatsApp settings migrated");
          }
        } else {
          console.log(
            "⏭️  WhatsApp settings already in Postgres",
          );
        }
      } else {
        console.log("ℹ️  No WhatsApp settings in KV store");
      }
    } catch (err) {
      migrationResults.integration_settings.errors.push(
        `WhatsApp: ${err.message}`,
      );
      console.error("WhatsApp migration error:", err);
    }

    // Migrate Telegram settings
    try {
      const telegramSettings = await kv.get(
        "telegram:settings",
      );
      if (telegramSettings) {
        const { data: existing } = await supabase
          .from("integration_settings2")
          .select("id")
          .eq("integration_type", "telegram")
          .single();

        if (!existing) {
          const { error } = await supabase
            .from("integration_settings2")
            .insert({
              integration_type: "telegram",
              connected: telegramSettings.connected || false,
              bot_token: telegramSettings.botToken,
              bot_name: telegramSettings.botName,
              connected_at: telegramSettings.connectedAt,
            });

          if (error) {
            migrationResults.integration_settings.errors.push(
              `Telegram: ${error.message}`,
            );
            console.error(
              "Error migrating Telegram settings:",
              error,
            );
          } else {
            migrationResults.integration_settings.migrated++;
            console.log("✅ Telegram settings migrated");
          }
        } else {
          console.log(
            "⏭️  Telegram settings already in Postgres",
          );
        }
      } else {
        console.log("ℹ️  No Telegram settings in KV store");
      }
    } catch (err) {
      migrationResults.integration_settings.errors.push(
        `Telegram: ${err.message}`,
      );
      console.error("Telegram migration error:", err);
    }

    // Step 2: Migrate Admin Settings
    console.log("⚙️  Migrating admin settings...");
    try {
      const adminSettings = await kv.get("admin:settings");
      if (adminSettings) {
        const { data: existing } = await supabase
          .from("admin_settings2")
          .select("id")
          .limit(1)
          .single();

        if (!existing) {
          const { error } = await supabase
            .from("admin_settings2")
            .insert({
              email: adminSettings.email,
              phone: adminSettings.phone,
            });

          if (error) {
            migrationResults.admin_settings.errors.push(
              error.message,
            );
            console.error(
              "Error migrating admin settings:",
              error,
            );
          } else {
            migrationResults.admin_settings.migrated++;
            console.log("✅ Admin settings migrated");
          }
        } else {
          // Update existing settings
          const { error } = await supabase
            .from("admin_settings2")
            .update({
              email: adminSettings.email,
              phone: adminSettings.phone,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) {
            migrationResults.admin_settings.errors.push(
              error.message,
            );
            console.error(
              "Error updating admin settings:",
              error,
            );
          } else {
            migrationResults.admin_settings.migrated++;
            console.log("✅ Admin settings updated");
          }
        }
      } else {
        console.log("ℹ️  No admin settings in KV store");
      }
    } catch (err) {
      migrationResults.admin_settings.errors.push(err.message);
      console.error("Admin settings migration error:", err);
    }

    console.log("✅ Complete migration finished!");

    const totalMigrated =
      migrationResults.integration_settings.migrated +
      migrationResults.admin_settings.migrated;

    const totalErrors =
      migrationResults.integration_settings.errors.length +
      migrationResults.admin_settings.errors.length;

    migrationResults.summary = `Migrated ${totalMigrated} settings with ${totalErrors} errors`;

    return c.json({
      success: totalErrors === 0,
      message:
        totalErrors === 0
          ? "All settings migrated successfully!"
          : "Migration completed with some errors",
      results: migrationResults,
    });
  } catch (error) {
    console.error("Complete migration error:", error);
    return c.json(
      { error: `Migration failed: ${error.message}` },
      500,
    );
  }
});

// Check migration status endpoint
app.get("/check-migration-status", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const { error: authError, user } =
      await verifyAuth(authHeader);

    if (authError || !user) {
      return c.json(
        { error: authError || "Unauthorized" },
        401,
      );
    }

    // Check if user is admin
    const adminUser = await verifyAdmin(user.id);
    if (!adminUser.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const supabase = getSupabaseAdmin();

    console.log("🔍 Checking migration status...");

    // Check integration_settings2 table
    const { data: integrationSettings, error: intError } =
      await supabase.from("integration_settings2").select("*");

    // Check admin_settings2 table
    const { data: adminSettings, error: adminError } =
      await supabase.from("admin_settings2").select("*");

    console.log("Integration Settings:", integrationSettings);
    console.log("Admin Settings:", adminSettings);

    return c.json({
      success: true,
      integration_settings: {
        count: integrationSettings?.length || 0,
        data: integrationSettings || [],
        error: intError?.message || null,
      },
      admin_settings: {
        count: adminSettings?.length || 0,
        data: adminSettings || [],
        error: adminError?.message || null,
      },
      message: `Found ${(integrationSettings?.length || 0) + (adminSettings?.length || 0)} total settings in Postgres`,
    });
  } catch (error) {
    console.error("Migration check error:", error);
    return c.json(
      { error: `Check failed: ${error.message}` },
      500,
    );
  }
});

// Serve the app with custom request handler to strip /server prefix
Deno.serve(async (req) => {
  const url = new URL(req.url);

  console.log("🔍 INCOMING REQUEST:", req.method, url.pathname);

  // Strip /server prefix if present
  if (url.pathname.startsWith("/server")) {
    const originalPath = url.pathname;
    url.pathname = url.pathname.replace(/^\/server/, "") || "/";
    console.log(
      "✂️ STRIPPED PATH:",
      originalPath,
      "->",
      url.pathname,
    );

    // Clone the request with the new URL
    const modifiedReq = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? req.body
          : null,
    });

    return await app.fetch(modifiedReq);
  }

  console.log("➡️ PASSTHROUGH:", url.pathname);
  return await app.fetch(req);
});
