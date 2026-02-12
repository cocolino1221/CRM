import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');
const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

/**
 * Helper function to register a test user via API
 * If user already exists, the registration will fail (409) which is fine
 */
async function ensureTestUserExists(
  request: any,
  userData: { email: string; password: string; firstName: string; lastName: string },
): Promise<void> {
  try {
    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        workspaceName: 'Test Workspace',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status() === 201) {
      console.log(`✅ Test user created: ${userData.email}`);
    } else if (response.status() === 409) {
      console.log(`ℹ️ Test user already exists: ${userData.email}`);
    } else {
      const body = await response.text();
      console.log(`⚠️ Registration response (${response.status()}): ${body}`);
    }
  } catch (error) {
    console.log(`⚠️ Could not register user ${userData.email}:`, error);
  }
}

/**
 * Authentication setup - runs before all tests
 * First creates test users via API, then logs in and saves authenticated state
 */
setup('authenticate', async ({ page, request }) => {
  const testUser = {
    email: process.env.TEST_USER_EMAIL || 'admin@test.com',
    password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
    firstName: 'Admin',
    lastName: 'User',
  };

  // Step 1: Ensure test user exists (register via API)
  await ensureTestUserExists(request, testUser);

  // Step 2: Navigate to login page
  await page.goto('/login');

  // Wait for page to load
  await expect(page.getByRole('heading', { name: /sign in|login|welcome back/i })).toBeVisible();

  // Fill in credentials
  await page.getByLabel(/email/i).fill(testUser.email);
  await page.getByLabel(/password/i).fill(testUser.password);

  // Click login button
  await page.getByRole('button', { name: /sign in|login/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Verify we're logged in
  await expect(page).toHaveURL(/.*dashboard/);

  // Save authentication state
  await page.context().storageState({ path: authFile });
});

setup('authenticate as manager', async ({ page, request }) => {
  const managerAuthFile = path.join(__dirname, '../.auth/manager.json');

  const managerUser = {
    email: process.env.TEST_MANAGER_EMAIL || 'manager@test.com',
    password: process.env.TEST_MANAGER_PASSWORD || 'Test123!@#',
    firstName: 'Manager',
    lastName: 'User',
  };

  // Step 1: Ensure manager user exists
  await ensureTestUserExists(request, managerUser);

  // Step 2: Login
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(managerUser.email);
  await page.getByLabel(/password/i).fill(managerUser.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.context().storageState({ path: managerAuthFile });
});
