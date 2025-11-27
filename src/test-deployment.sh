#!/bin/bash

# Nahky Araby Event Hub - Test Deployment Script
# This script tests the deployed Edge Function endpoints

PROJECT_REF="ojeewoebsidiiufvfwco"
FUNCTION_NAME="server"
BASE_URL="https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION_NAME"

echo "🧪 Testing Nahky Araby Event Hub Deployment"
echo "==========================================="
echo ""
echo "Testing function at: $BASE_URL"
echo ""

# Test 1: Health Check
echo "1️⃣  Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Health check passed"
    echo "   Response: $RESPONSE_BODY"
else
    echo "   ❌ Health check failed (HTTP $HTTP_CODE)"
    echo "   Response: $RESPONSE_BODY"
fi
echo ""

# Test 2: Status Check
echo "2️⃣  Testing /status endpoint..."
STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/status")
HTTP_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$STATUS_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Status check passed"
    echo "   Response: $RESPONSE_BODY"
else
    echo "   ❌ Status check failed (HTTP $HTTP_CODE)"
    echo "   Response: $RESPONSE_BODY"
fi
echo ""

# Test 3: Email Config
echo "3️⃣  Testing /email-config endpoint..."
EMAIL_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/email-config")
HTTP_CODE=$(echo "$EMAIL_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$EMAIL_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Email config check passed"
    echo "   Response: $RESPONSE_BODY"
else
    echo "   ❌ Email config check failed (HTTP $HTTP_CODE)"
    echo "   Response: $RESPONSE_BODY"
fi
echo ""

# Summary
echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo ""
echo "If all tests passed, your Edge Function is working!"
echo ""
echo "🔍 To view logs:"
echo "   supabase functions logs $FUNCTION_NAME"
echo ""
echo "🌐 Function URL:"
echo "   $BASE_URL"
echo ""
echo "📱 Next: Test the app's Connection Diagnostic tool"
echo ""
