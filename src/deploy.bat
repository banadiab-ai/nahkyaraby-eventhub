@echo off
REM Nahky Araby Event Hub - Quick Deploy Script (Windows)

set PROJECT_REF=ojeewoebsidiiufvfwco
set FUNCTION_NAME=server

echo.
echo 🚀 Nahky Araby Event Hub - Deployment Script
echo ==============================================
echo.

REM Check if Supabase CLI is installed
where supabase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Supabase CLI not found!
    echo    Install it with: npm install -g supabase
    exit /b 1
)

echo ✅ Supabase CLI found
echo.

REM Check if user is logged in
supabase projects list >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Not logged in to Supabase
    echo    Run: supabase login
    exit /b 1
)

echo ✅ Logged in to Supabase
echo.

REM Link project
echo 🔗 Linking to project: %PROJECT_REF%
supabase link --project-ref %PROJECT_REF%

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to link project
    echo    Make sure you have access to project %PROJECT_REF%
    exit /b 1
)

echo ✅ Project linked
echo.

REM Deploy the function
echo 📦 Deploying Edge Function: %FUNCTION_NAME%
supabase functions deploy %FUNCTION_NAME%

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Deployment failed
    exit /b 1
)

echo.
echo ✅ Deployment successful!
echo.
echo 🎉 Your function is now live at:
echo    https://%PROJECT_REF%.supabase.co/functions/v1/%FUNCTION_NAME%
echo.
echo 📋 Next steps:
echo    1. Test the health endpoint:
echo       curl https://%PROJECT_REF%.supabase.co/functions/v1/%FUNCTION_NAME%/health
echo.
echo    2. Set environment variables (if needed):
echo       supabase secrets set RESEND_API_KEY=your_key_here
echo.
echo    3. View logs:
echo       supabase functions logs %FUNCTION_NAME%
echo.
echo    4. Run the Connection Diagnostic tool in your app
echo.

pause
