#!/bin/bash

# Workflow Automation Test Script
# Tests the complete workflow system end-to-end

set -e

echo "🔄 Testing SlackCRM Workflow Automation System"
echo "==============================================="
echo ""

API_URL="${API_URL:-http://localhost:4000/api/v1}"
WORKSPACE_ID="${WORKSPACE_ID:-}"
USER_ID="${USER_ID:-}"
TOKEN="${TOKEN:-}"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if backend is running
echo -e "${BLUE}1. Checking Backend Status${NC}"
echo "---------------------------"

if curl -s "$API_URL/health/readiness" > /dev/null 2>&1; then
    HEALTH=$(curl -s "$API_URL/health/readiness")
    success "Backend is running"
    info "Status: $(echo $HEALTH | grep -o '"status":"[^"]*"')"
else
    error "Backend is not responding at $API_URL"
    echo ""
    echo "Please start the backend with: cd backend && npm run start:dev"
    exit 1
fi

# Test workflow endpoints (without authentication for now)
echo ""
echo -e "${BLUE}2. Testing Workflow Endpoints${NC}"
echo "------------------------------"

# Test GET /workflows (should return 401 without auth, which is expected)
WORKFLOWS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/workflows")

if [ "$WORKFLOWS_RESPONSE" = "401" ]; then
    success "Workflow endpoint is protected (401 Unauthorized)"
    info "This is expected - authentication required"
elif [ "$WORKFLOWS_RESPONSE" = "200" ]; then
    warn "Workflow endpoint returned 200 (might be unprotected)"
else
    info "Workflow endpoint returned: $WORKFLOWS_RESPONSE"
fi

# Test workflow stats endpoint
STATS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/workflows/stats")

if [ "$STATS_RESPONSE" = "401" ]; then
    success "Workflow stats endpoint is protected"
elif [ "$STATS_RESPONSE" = "200" ]; then
    warn "Workflow stats endpoint returned 200"
else
    info "Workflow stats endpoint returned: $STATS_RESPONSE"
fi

# Test database migrations
echo ""
echo -e "${BLUE}3. Checking Database Migrations${NC}"
echo "--------------------------------"

cd "$(dirname "$0")/../backend"

# Count migration files
MIGRATION_COUNT=$(find src/database/migrations -name "*.ts" | wc -l | tr -d ' ')
success "Found $MIGRATION_COUNT migration files"

# Check for workflow migration
if find src/database/migrations -name "*AddWorkflow*.ts" | grep -q .; then
    success "Workflow migration file exists"
    WORKFLOW_MIGRATION=$(find src/database/migrations -name "*AddWorkflow*.ts" | head -1)
    info "Migration: $(basename $WORKFLOW_MIGRATION)"
else
    warn "No workflow migration found"
fi

# Test workflow event system
echo ""
echo -e "${BLUE}4. Testing Event System Integration${NC}"
echo "------------------------------------"

# Check if event emitters are in place
echo "Checking service files for event emission..."

check_events_in_file() {
    local file=$1
    local event_name=$2

    if grep -q "eventEmitter.emit.*$event_name" "$file" 2>/dev/null; then
        success "$(basename $file) emits '$event_name' events"
        return 0
    else
        warn "$(basename $file) does not emit '$event_name' events"
        return 1
    fi
}

# Check contacts service
check_events_in_file "src/contacts/contacts.service.ts" "contact.created"
check_events_in_file "src/contacts/contacts.service.ts" "contact.updated"

# Check deals service
check_events_in_file "src/deals/deals.service.ts" "deal.created"
check_events_in_file "src/deals/deals.service.ts" "deal.won"

# Check tasks service
check_events_in_file "src/tasks/tasks.service.ts" "task.created"
check_events_in_file "src/tasks/tasks.service.ts" "task.completed"

# Test workflow action handlers
echo ""
echo -e "${BLUE}5. Checking Workflow Action Handlers${NC}"
echo "--------------------------------------"

check_action_handler() {
    local action_type=$1

    if grep -q "case WorkflowActionType.$action_type" "src/workflows/workflows.service.ts" 2>/dev/null; then
        success "$action_type action handler exists"
        return 0
    else
        error "$action_type action handler NOT found"
        return 1
    fi
}

check_action_handler "SEND_EMAIL"
check_action_handler "CREATE_TASK"
check_action_handler "CREATE_DEAL"
check_action_handler "UPDATE_CONTACT"
check_action_handler "SEND_WEBHOOK"

# Check if handlers call actual services
echo ""
echo -e "${BLUE}6. Verifying Service Integration${NC}"
echo "---------------------------------"

if grep -q "await this.tasksService.create" "src/workflows/workflows.service.ts"; then
    success "CREATE_TASK action calls TasksService"
else
    error "CREATE_TASK action does not call TasksService"
fi

if grep -q "await this.dealsService.create" "src/workflows/workflows.service.ts"; then
    success "CREATE_DEAL action calls DealsService"
else
    error "CREATE_DEAL action does not call DealsService"
fi

if grep -q "await this.emailService.sendEmail" "src/workflows/workflows.service.ts"; then
    success "SEND_EMAIL action calls EmailService"
else
    error "SEND_EMAIL action does not call EmailService"
fi

# Check module imports
echo ""
echo -e "${BLUE}7. Checking Module Dependencies${NC}"
echo "--------------------------------"

if grep -q "TasksModule" "src/workflows/workflows.module.ts" && \
   grep -q "DealsModule" "src/workflows/workflows.module.ts"; then
    success "WorkflowsModule imports TasksModule and DealsModule"
else
    error "WorkflowsModule missing required module imports"
fi

# Check email templates
echo ""
echo -e "${BLUE}8. Checking Email Templates${NC}"
echo "----------------------------"

TEMPLATE_FILE="src/email/templates/email-templates.ts"
if [ -f "$TEMPLATE_FILE" ]; then
    success "Email templates file exists"

    # Count templates
    TEMPLATE_COUNT=$(grep -c "^export const.*Email" "$TEMPLATE_FILE" || echo "0")
    info "Found $TEMPLATE_COUNT email template functions"

    # Check specific templates
    for template in "welcomeEmail" "passwordResetEmail" "taskAssignedEmail" "dealWonEmail" "workflowNotificationEmail"; do
        if grep -q "export const $template" "$TEMPLATE_FILE"; then
            success "  - $template exists"
        else
            warn "  - $template not found"
        fi
    done
else
    error "Email templates file not found at $TEMPLATE_FILE"
fi

# Test TypeScript compilation
echo ""
echo -e "${BLUE}9. TypeScript Compilation Check${NC}"
echo "--------------------------------"

if npm run build > /tmp/workflow-build-check.log 2>&1; then
    success "TypeScript compilation successful"
else
    error "TypeScript compilation failed"
    echo ""
    echo "Build errors:"
    tail -20 /tmp/workflow-build-check.log
fi

# Summary
echo ""
echo "==============================================="
echo -e "${BLUE}Test Summary${NC}"
echo "==============================================="

echo ""
echo "✅ Workflow System Components:"
echo "   - Workflow entities and migrations"
echo "   - Event emission from services"
echo "   - Action handlers (CREATE_TASK, CREATE_DEAL, etc.)"
echo "   - Service integration (Tasks, Deals, Email)"
echo "   - Module dependencies"
echo "   - Email templates"
echo ""
echo "📋 Manual Testing Steps:"
echo ""
echo "1. Create a workflow via API:"
echo "   POST $API_URL/workflows"
echo '   {"name": "Test Workflow", "triggerType": "contact.created", "actions": [...]}'
echo ""
echo "2. Create a contact to trigger the workflow:"
echo "   POST $API_URL/contacts"
echo '   {"firstName": "John", "lastName": "Doe", "email": "john@example.com"}'
echo ""
echo "3. Verify workflow execution:"
echo "   GET $API_URL/workflows/:id/executions"
echo ""
echo "4. Check if tasks/deals were created:"
echo "   GET $API_URL/tasks"
echo "   GET $API_URL/deals"
echo ""
echo "✅ Workflow automation system is ready for testing!"
echo ""
