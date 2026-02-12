import { test, expect } from '@playwright/test';

/**
 * Smoke Tests - Critical path validation
 * These tests should be run on every deployment
 */
test.describe('Smoke Tests @critical', () => {
  test.describe('Application Health', () => {
    test('Frontend is accessible', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBeLessThan(400);
    });

    test('Backend API is accessible', async ({ request }) => {
      const apiUrl = process.env.API_URL || 'http://localhost:4000';
      const response = await request.get(`${apiUrl}/health`);
      expect(response.status()).toBe(200);
    });

    test('Login page is accessible', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /sign in|login/i })).toBeVisible();
    });
  });

  test.describe('Authentication', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('User can login successfully', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL || 'admin@test.com');
      await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD || 'Test123!@#');
      await page.getByRole('button', { name: /sign in|login/i }).click();

      await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });
    });
  });

  test.describe('Core Features', () => {
    test('Dashboard is accessible', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.locator('body')).not.toContainText(/error|500|404/i);
    });

    test('Contacts page is accessible', async ({ page }) => {
      await page.goto('/contacts');
      await expect(page).toHaveURL(/.*contacts/);
      await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible();
    });

    test('Pipeline page is accessible', async ({ page }) => {
      await page.goto('/pipeline');
      await expect(page).toHaveURL(/.*pipeline/);
    });

    test('Integrations page is accessible', async ({ page }) => {
      await page.goto('/integrations');
      await expect(page).toHaveURL(/.*integrations/);
    });

    test('Settings page is accessible', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/.*settings/);
    });
  });

  test.describe('API Endpoints', () => {
    test('Contacts API responds', async ({ request }) => {
      // Login first
      const apiUrl = process.env.API_URL || 'http://localhost:4000/api/v1';

      const loginResponse = await request.post(`${apiUrl}/auth/login`, {
        data: {
          email: process.env.TEST_USER_EMAIL || 'admin@test.com',
          password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
        },
      });

      const { accessToken } = await loginResponse.json();

      // Test contacts endpoint
      const response = await request.get(`${apiUrl}/contacts`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('Deals API responds', async ({ request }) => {
      const apiUrl = process.env.API_URL || 'http://localhost:4000/api/v1';

      const loginResponse = await request.post(`${apiUrl}/auth/login`, {
        data: {
          email: process.env.TEST_USER_EMAIL || 'admin@test.com',
          password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
        },
      });

      const { accessToken } = await loginResponse.json();

      const response = await request.get(`${apiUrl}/deals`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('Pipelines API responds', async ({ request }) => {
      const apiUrl = process.env.API_URL || 'http://localhost:4000/api/v1';

      const loginResponse = await request.post(`${apiUrl}/auth/login`, {
        data: {
          email: process.env.TEST_USER_EMAIL || 'admin@test.com',
          password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
        },
      });

      const { accessToken } = await loginResponse.json();

      const response = await request.get(`${apiUrl}/pipelines`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });
  });

  test.describe('Error Handling', () => {
    test('404 page is displayed for unknown routes', async ({ page }) => {
      await page.goto('/this-page-does-not-exist-12345');

      // Should show 404 or redirect to valid page
      const is404 = await page.getByText(/404|not found/i).isVisible();
      const isRedirected = page.url().includes('login') || page.url().includes('dashboard');

      expect(is404 || isRedirected).toBeTruthy();
    });

    test('API returns 401 for unauthenticated requests', async ({ request }) => {
      const apiUrl = process.env.API_URL || 'http://localhost:4000/api/v1';

      const response = await request.get(`${apiUrl}/contacts`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Performance', () => {
    test('Dashboard loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Should load within 10 seconds
      expect(loadTime).toBeLessThan(10000);
    });

    test('Contacts page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(10000);
    });
  });
});
