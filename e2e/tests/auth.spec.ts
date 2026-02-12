import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'test2@test.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass1@';

/**
 * Helper to ensure test user exists before login tests
 */
async function ensureTestUserExists(request: any): Promise<void> {
  try {
    await request.post(`${API_URL}/auth/register`, {
      data: {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
        workspaceName: 'Test Workspace',
      },
    });
  } catch {
    // User might already exist, that's fine
  }
}

test.describe('Authentication', () => {
  test.describe('Login Flow', () => {
    // Use fresh context without stored auth for login tests
    test.use({ storageState: { cookies: [], origins: [] } });

    test('AUTH-003: User can login with valid credentials @critical', async ({ page, request }) => {
      // Ensure user exists before attempting login
      await ensureTestUserExists(request);

      await page.goto('/login');

      // Verify login page elements
      await expect(page.getByRole('heading', { name: /sign in|login|welcome back/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();

      // Fill credentials
      await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
      await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

      // Submit
      await page.getByRole('button', { name: /sign in|login/i }).click();

      // Verify redirect to dashboard
      await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });
    });

    test('AUTH-004: User cannot login with invalid password', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
      await page.getByLabel(/password/i).fill('WrongPass99!');
      await page.getByRole('button', { name: /sign in|login/i }).click();

      // Verify error message
      await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 5000 });

      // Verify still on login page
      await expect(page).toHaveURL(/.*login/);
    });

    test('AUTH-004b: User cannot login with non-existent email', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill('nonexistent@test.com');
      await page.getByLabel(/password/i).fill('Test123!@#');
      await page.getByRole('button', { name: /sign in|login/i }).click();

      await expect(page.getByText(/invalid|not found|failed/i)).toBeVisible({ timeout: 5000 });
    });

    test('AUTH-009: Protected routes redirect unauthenticated users @critical', async ({ page }) => {
      // Try to access protected route
      await page.goto('/dashboard');

      // Should be redirected to login
      await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    });

    test('Login form validation works', async ({ page }) => {
      await page.goto('/login');

      // Try to submit empty form
      await page.getByRole('button', { name: /sign in|login/i }).click();

      // Check for validation messages
      await expect(page.getByLabel(/email/i)).toHaveAttribute('required', '');
    });

    test('Email format validation', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill('invalid-email');
      await page.getByLabel(/password/i).fill('Test123!@#');
      await page.getByRole('button', { name: /sign in|login/i }).click();

      // Should show validation error or stay on page
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Registration Flow', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('AUTH-001: User can register with valid credentials', async ({ page }) => {
      await page.goto('/register');

      // Generate unique email
      const uniqueEmail = `test.user.${Date.now()}@example.com`;

      // Fill registration form
      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill(uniqueEmail);
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      // Handle confirm password if exists
      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('Test123!@#');
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should redirect to dashboard or show success
      await expect(page).toHaveURL(/.*(?:dashboard|login|verify)/, { timeout: 15000 });
    });

    test('AUTH-002: User cannot register with existing email', async ({ page }) => {
      await page.goto('/register');

      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill('admin@test.com'); // Existing email
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('Test123!@#');
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should show error about existing email
      await expect(page.getByText(/already exists|already registered|taken/i)).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe('Logout Flow', () => {
    test('AUTH-006: User can logout successfully', async ({ page }) => {
      await page.goto('/dashboard');

      // Wait for page to load
      await expect(page).toHaveURL(/.*dashboard/);

      // Find and click logout (could be in dropdown menu)
      const userMenu = page.getByRole('button', { name: /profile|user|account/i });
      if (await userMenu.isVisible()) {
        await userMenu.click();
      }

      // Click logout
      await page.getByRole('button', { name: /logout|sign out/i }).click();

      // Should redirect to login
      await expect(page).toHaveURL(/.*login/, { timeout: 10000 });

      // Verify can't access protected routes
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Session Management', () => {
    test('AUTH-005: User is redirected when session expires', async ({ page, context }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*dashboard/);

      // Clear storage to simulate session expiry
      await context.clearCookies();
      await page.evaluate(() => localStorage.clear());

      // Try to navigate
      await page.goto('/contacts');

      // Should redirect to login
      await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    });
  });
});
