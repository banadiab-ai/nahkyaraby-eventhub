#!/bin/bash

# Nahky Araby Event Hub - Quick Deploy Script
# This script deploys the Edge Function to Supabase

PROJECT_REF="ojeewoebsidiiufvfwco"
FUNCTION_NAME="server"

echo "🚀 Nahky Araby Event Hub - Deployment Script"
echo "=============================================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null
then
    echo "❌ Supabase CLI not found!"
    echo "   Install it with: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if user is logged in
if ! supabase projects list &> /dev/null
then
    echo "❌ Not logged in to Supabase"
    echo "   Run: supabase login"
    exit 1
fi

echo "✅ Logged in to Supabase"
echo ""

# Link project (if not already linked)
echo "🔗 Linking to project: $PROJECT_REF"
supabase link --project-ref $PROJECT_REF

if [ $? -ne 0 ]; then
    echo "❌ Failed to link project"
    echo "   Make sure you have access to project $PROJECT_REF"
    exit 1
fi

echo "✅ Project linked"
echo ""

# Deploy the function
echo "📦 Deploying Edge Function: $FUNCTION_NAME"
supabase functions deploy $FUNCTION_NAME

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "✅ Deployment successful!"
echo ""
echo "🎉 Your function is now live at:"
echo "   https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION_NAME"
echo ""
echo "📋 Next steps:"
echo "   1. Test the health endpoint:"
echo "      curl https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION_NAME/health"
echo ""
echo "   2. Set environment variables (if needed):"
echo "      supabase secrets set RESEND_API_KEY=your_key_here"
echo ""
echo "   3. View logs:"
echo "      supabase functions logs $FUNCTION_NAME"
echo ""
echo "   4. Run the Connection Diagnostic tool in your app"
echo ""
