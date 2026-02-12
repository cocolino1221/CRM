# SlackCRM Test Plan

## 1. Overview

This document outlines the comprehensive test strategy for SlackCRM, a full-stack CRM application built with NestJS (backend) and Next.js (frontend).

### 1.1 Scope
- **In Scope:** All user-facing features, API endpoints, integrations, authentication flows
- **Out of Scope:** Third-party service internals, infrastructure testing

### 1.2 Test Types
- **E2E Tests:** User journey testing with Playwright
- **API Tests:** Backend endpoint validation
- **Integration Tests:** Third-party integration flows
- **Smoke Tests:** Critical path validation for deployments

### 1.3 Current Progress: ~90%

| Module | Status | Test File |
|--------|--------|-----------|
| Authentication | ✅ Complete | auth.spec.ts, signup.spec.ts, password-reset.spec.ts |
| Dashboard | ✅ Complete | dashboard.spec.ts |
| Contacts | ✅ Complete | contacts.spec.ts |
| Leads | ✅ Complete | leads.spec.ts |
| Deals/Pipeline | ✅ Complete | deals.spec.ts |
| Tasks | ✅ Complete | tasks.spec.ts |
| Calendar | ✅ Complete | calendar.spec.ts |
| Forms | ✅ Complete | forms.spec.ts |
| Integrations | ✅ Complete | integrations.spec.ts, integrations-full.spec.ts |
| Settings | ✅ Complete | settings.spec.ts |
| API Tests | ✅ Complete | api.spec.ts |
| Smoke Tests | ✅ Complete | smoke.spec.ts |

---

## 2. Test Environment

### 2.1 URLs
| Environment | Frontend | Backend API |
|-------------|----------|-------------|
| Local | http://localhost:4001 | http://localhost:4000/api/v1 |
| Staging | TBD | TBD |
| Production | TBD | TBD |

### 2.2 Test Accounts
| Role | Email | Purpose |
|------|-------|---------|
| Admin | admin@test.com | Full access testing |
| Manager | manager@test.com | Manager role testing |
| Sales Rep | sales@test.com | Limited access testing |

---

## 3. Test Scenarios

### 3.1 Authentication Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| AUTH-001 | User can register with valid credentials | High | E2E |
| AUTH-002 | User cannot register with existing email | High | E2E |
| AUTH-003 | User can login with valid credentials | Critical | E2E |
| AUTH-004 | User cannot login with invalid password | High | E2E |
| AUTH-005 | User is redirected to login when session expires | High | E2E |
| AUTH-006 | User can logout successfully | High | E2E |
| AUTH-007 | Password reset flow works correctly | Medium | E2E |
| AUTH-008 | JWT token refresh works correctly | High | API |
| AUTH-009 | Protected routes redirect unauthenticated users | Critical | E2E |

### 3.2 Dashboard Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| DASH-001 | Dashboard loads with statistics | High | E2E |
| DASH-002 | Dashboard shows correct metrics | Medium | E2E |
| DASH-003 | Recent activities are displayed | Medium | E2E |
| DASH-004 | Quick actions work correctly | Medium | E2E |

### 3.3 Contacts Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| CONT-001 | User can create a new contact | Critical | E2E |
| CONT-002 | User can view contact list | Critical | E2E |
| CONT-003 | User can search contacts | High | E2E |
| CONT-004 | User can filter contacts by status | Medium | E2E |
| CONT-005 | User can edit contact details | High | E2E |
| CONT-006 | User can delete a contact | High | E2E |
| CONT-007 | Contact validation works (email format) | High | E2E |
| CONT-008 | Duplicate email prevention works | High | API |
| CONT-009 | Contact pagination works correctly | Medium | E2E |
| CONT-010 | Contact export to CSV works | Low | E2E |

### 3.4 Leads Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| LEAD-001 | User can create a new lead | Critical | E2E |
| LEAD-002 | Lead can be converted to contact | High | E2E |
| LEAD-003 | Lead scoring is calculated correctly | Medium | API |
| LEAD-004 | Lead source tracking works | Medium | E2E |
| LEAD-005 | Lead status transitions work | High | E2E |

### 3.5 Deals/Pipeline Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| DEAL-001 | User can create a new deal | Critical | E2E |
| DEAL-002 | User can view pipeline board | Critical | E2E |
| DEAL-003 | User can drag deal between stages | High | E2E |
| DEAL-004 | Deal value calculations are correct | High | API |
| DEAL-005 | User can edit deal details | High | E2E |
| DEAL-006 | User can close deal (won/lost) | High | E2E |
| DEAL-007 | Pipeline stages can be customized | Medium | E2E |
| DEAL-008 | Deal history is tracked | Medium | E2E |

### 3.6 Tasks Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| TASK-001 | User can create a new task | High | E2E |
| TASK-002 | User can mark task as complete | High | E2E |
| TASK-003 | User can assign task to others | Medium | E2E |
| TASK-004 | Task due date notifications work | Medium | E2E |
| TASK-005 | Tasks can be linked to contacts/deals | High | E2E |

### 3.7 Calendar Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| CAL-001 | Calendar view loads correctly | High | E2E |
| CAL-002 | User can create calendar event | High | E2E |
| CAL-003 | User can edit calendar event | Medium | E2E |
| CAL-004 | User can delete calendar event | Medium | E2E |
| CAL-005 | Google Calendar sync works | High | Integration |

### 3.8 Forms Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| FORM-001 | User can create a new form | High | E2E |
| FORM-002 | Form builder adds fields correctly | High | E2E |
| FORM-003 | Form can be published | High | E2E |
| FORM-004 | Public form submission works | Critical | E2E |
| FORM-005 | Form submission creates contact | High | E2E |
| FORM-006 | Form analytics are tracked | Medium | E2E |

### 3.9 Integrations Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| INT-001 | Available integrations are displayed | High | E2E |
| INT-002 | User can connect Google integration | High | Integration |
| INT-003 | User can connect Slack integration | High | Integration |
| INT-004 | User can connect Typeform integration | Medium | Integration |
| INT-005 | User can disconnect integration | High | E2E |
| INT-006 | Integration status is displayed correctly | Medium | E2E |
| INT-007 | Webhook endpoints receive data | High | API |
| INT-008 | Integration sync triggers correctly | Medium | Integration |

### 3.10 Settings Module

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| SET-001 | User can update profile information | Medium | E2E |
| SET-002 | User can change password | Medium | E2E |
| SET-003 | User can update notification preferences | Low | E2E |
| SET-004 | Workspace settings can be modified | Medium | E2E |

### 3.11 API Tests

| ID | Test Case | Priority | Type |
|----|-----------|----------|------|
| API-001 | Health endpoint returns 200 | Critical | API |
| API-002 | Unauthenticated requests return 401 | Critical | API |
| API-003 | Invalid data returns 400 | High | API |
| API-004 | Rate limiting works correctly | Medium | API |
| API-005 | CORS headers are set correctly | High | API |
| API-006 | Pagination parameters work | Medium | API |

---

## 4. Test Data

### 4.1 Test Contacts
```json
{
  "validContact": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "+1234567890",
    "status": "lead"
  },
  "invalidContact": {
    "firstName": "",
    "email": "invalid-email"
  }
}
```

### 4.2 Test Deals
```json
{
  "validDeal": {
    "title": "Enterprise Contract",
    "value": 50000,
    "currency": "USD",
    "stage": "qualification"
  }
}
```

---

## 5. Execution Strategy

### 5.1 Test Execution Order
1. **Smoke Tests** - Run on every commit
2. **API Tests** - Run on PR creation
3. **E2E Tests** - Run on PR merge to main
4. **Full Regression** - Run before releases

### 5.2 CI/CD Integration
```yaml
# Suggested GitHub Actions workflow
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci
      - name: Run Playwright tests
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: e2e/reports/
```

---

## 6. Success Criteria

### 6.1 Test Coverage Goals
| Category | Target |
|----------|--------|
| Critical paths | 100% |
| High priority | 90% |
| Medium priority | 70% |
| Low priority | 50% |

### 6.2 Quality Gates
- All Critical tests must pass
- No more than 2 High priority failures
- Test execution time < 15 minutes

---

## 7. Reporting

### 7.1 Test Reports
- **HTML Report:** `e2e/reports/html/index.html`
- **JSON Report:** `e2e/reports/results.json`
- **Screenshots:** `e2e/reports/screenshots/`
- **Videos:** `e2e/reports/videos/`

### 7.2 Defect Classification
| Severity | Description |
|----------|-------------|
| Critical | System crash, data loss, security breach |
| High | Major feature broken, no workaround |
| Medium | Feature impaired, workaround exists |
| Low | Minor issue, cosmetic defect |

---

## 8. Test Commands

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/auth.spec.ts

# Run tests with specific tag
npx playwright test --grep @critical

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug

# Run API tests only
npx playwright test --project=api

# Generate HTML report
npx playwright show-report
```

---

## 9. Maintenance

### 9.1 Review Schedule
- Weekly: Review failed tests
- Bi-weekly: Update test data
- Monthly: Review and update test plan
- Quarterly: Full test audit

### 9.2 Ownership
| Area | Owner |
|------|-------|
| Authentication | TBD |
| Contacts/Leads | TBD |
| Deals/Pipeline | TBD |
| Integrations | TBD |

---

## 10. Test Files Summary

### E2E Test Files (14 files, ~350+ test cases)

| File | Tests | Coverage |
|------|-------|----------|
| auth.spec.ts | 12 | Login, Registration, Logout, Session |
| signup.spec.ts | 20 | Registration validation, UX, OAuth |
| password-reset.spec.ts | 10 | Forgot password, Reset token |
| dashboard.spec.ts | 15 | Stats, Widgets, Navigation, Responsive |
| contacts.spec.ts | 18 | CRUD, Search, Filter, Export |
| leads.spec.ts | 15 | Create, Convert, Score, Status |
| deals.spec.ts | 20 | Pipeline, Drag-drop, Close, Filter |
| tasks.spec.ts | 25 | CRUD, Complete, Assign, Link, Filter |
| calendar.spec.ts | 25 | View, Events, Drag, Google sync |
| forms.spec.ts | 15 | Builder, Publish, Submit, Analytics |
| integrations.spec.ts | 12 | List, OAuth, API key, Webhooks |
| integrations-full.spec.ts | 40 | All categories, Responsive |
| settings.spec.ts | 25 | Profile, Password, Notifications, Workspace |
| api.spec.ts | 35 | Health, Auth, CRUD, Security, Search |
| smoke.spec.ts | 10 | Critical paths |

### Running Tests

```bash
# Start servers first
# Terminal 1: cd backend && npm run start:dev  (port 4000)
# Terminal 2: cd frontend && npm run dev       (port 4001)

# Run all tests
cd e2e && npx playwright test

# Run with UI
npx playwright test --headed

# Run specific file
npx playwright test tests/tasks.spec.ts

# Run by tag
npx playwright test --grep @critical

# Generate report
npx playwright show-report
```
