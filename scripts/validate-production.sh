#!/bin/bash

# Production Deployment Validation Script
# Validates all critical configuration and dependencies before deployment

set -e

echo "🚀 SlackCRM Production Validation Script"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
check_passed() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

check_failed() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

check_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Change to backend directory
cd "$(dirname "$0")/../backend" || exit 1

# 1. Environment File Check
echo -e "${BLUE}1. Environment Configuration${NC}"
echo "----------------------------"

if [ -f ".env" ]; then
    check_passed "Environment file exists"
else
    check_failed "Environment file (.env) not found"
fi

# 2. Critical Environment Variables
echo ""
echo -e "${BLUE}2. Critical Environment Variables${NC}"
echo "----------------------------------"

source .env 2>/dev/null || true

check_env_var() {
    local var_name=$1
    local var_value=${!var_name}
    local is_critical=${2:-true}

    if [ -n "$var_value" ]; then
        check_passed "$var_name is set"
    else
        if [ "$is_critical" = true ]; then
            check_failed "$var_name is NOT set (CRITICAL)"
        else
            check_warning "$var_name is NOT set (optional)"
        fi
    fi
}

# Database
check_env_var "DATABASE_URL" true
if [ -z "$DATABASE_URL" ]; then
    check_env_var "DB_HOST" true
    check_env_var "DB_PORT" true
    check_env_var "DB_USERNAME" true
    check_env_var "DB_PASSWORD" true
    check_env_var "DB_NAME" true
fi

# JWT
check_env_var "JWT_SECRET" true
check_env_var "JWT_REFRESH_SECRET" true

# Stack Auth
check_env_var "STACK_SECRET_SERVER_KEY" true
check_env_var "NEXT_PUBLIC_STACK_PROJECT_ID" true

# URLs
check_env_var "FRONTEND_URL" true
check_env_var "APP_URL" true

# Optional but recommended
echo ""
echo -e "${BLUE}3. Optional Services${NC}"
echo "--------------------"
check_env_var "REDIS_HOST" false
check_env_var "SENDGRID_API_KEY" false
check_env_var "SMTP_HOST" false

# 4. Node Modules
echo ""
echo -e "${BLUE}4. Dependencies${NC}"
echo "---------------"

if [ -d "node_modules" ]; then
    check_passed "node_modules directory exists"
else
    check_failed "node_modules not found - run 'npm install'"
fi

# 5. TypeScript Compilation
echo ""
echo -e "${BLUE}5. TypeScript Compilation${NC}"
echo "-------------------------"

if npm run build > /tmp/build-check.log 2>&1; then
    check_passed "TypeScript compilation successful"
else
    check_failed "TypeScript compilation failed - check /tmp/build-check.log"
    cat /tmp/build-check.log
fi

# 6. Database Migrations
echo ""
echo -e "${BLUE}6. Database Migrations${NC}"
echo "----------------------"

migration_count=$(find src/database/migrations -name "*.ts" | wc -l | tr -d ' ')
if [ "$migration_count" -gt 0 ]; then
    check_passed "Found $migration_count migration files"
else
    check_warning "No migration files found"
fi

# 7. Security Checks
echo ""
echo -e "${BLUE}7. Security Configuration${NC}"
echo "-------------------------"

# Check JWT secret length
if [ -n "$JWT_SECRET" ] && [ ${#JWT_SECRET} -ge 32 ]; then
    check_passed "JWT_SECRET length is sufficient (${#JWT_SECRET} characters)"
else
    check_failed "JWT_SECRET must be at least 32 characters"
fi

# Check NODE_ENV
if [ "$NODE_ENV" = "production" ]; then
    check_passed "NODE_ENV is set to production"

    # Production-specific checks
    if [ "$DB_SYNC" = "true" ]; then
        check_failed "DB_SYNC should be false in production"
    else
        check_passed "DB_SYNC is disabled"
    fi
else
    check_warning "NODE_ENV is not set to production (current: ${NODE_ENV:-development})"
fi

# 8. File Structure
echo ""
echo -e "${BLUE}8. Project Structure${NC}"
echo "--------------------"

required_dirs=("src" "src/database" "src/database/entities" "src/database/migrations" "src/auth" "src/users" "src/contacts" "src/deals" "src/tasks" "src/workflows")

for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        check_passed "Directory exists: $dir"
    else
        check_failed "Missing directory: $dir"
    fi
done

# 9. Integration Configuration
echo ""
echo -e "${BLUE}9. Integration Status${NC}"
echo "---------------------"

integrations=("OAUTH_GOOGLE" "OAUTH_SLACK" "OAUTH_MICROSOFT" "OAUTH_HUBSPOT")
for integration in "${integrations[@]}"; do
    client_id="${integration}_CLIENT_ID"
    client_secret="${integration}_CLIENT_SECRET"

    if [ -n "${!client_id}" ] && [ -n "${!client_secret}" ]; then
        check_passed "$integration configured"
    else
        check_warning "$integration not configured (optional)"
    fi
done

# 10. Health Check
echo ""
echo -e "${BLUE}10. Application Health${NC}"
echo "----------------------"

# Only check if app is running
if curl -s http://localhost:${PORT:-4000}/api/v1/health/readiness > /dev/null 2>&1; then
    check_passed "Application health check passed"
else
    check_warning "Application not running or health check failed (start with 'npm run start:dev')"
fi

# Summary
echo ""
echo "=========================================="
echo -e "${BLUE}Validation Summary${NC}"
echo "=========================================="
echo -e "${GREEN}Passed:${NC}   $PASSED"
echo -e "${RED}Failed:${NC}   $FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Production validation passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review any warnings above"
    echo "2. Run 'npm run migration:run' to apply database migrations"
    echo "3. Deploy to your production environment"
    exit 0
else
    echo -e "${RED}✗ Production validation failed!${NC}"
    echo ""
    echo "Please fix the failed checks before deploying."
    exit 1
fi
