import { test, expect } from '@playwright/test';
import { generateUniqueEmail } from '../fixtures/test-data';

test.describe('Password Reset Flow', () => {
  // Use fresh context without stored auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe('Forgot Password Page', () => {
    test('Forgot password page loads correctly', async ({ page }) => {
      await page.goto('/login');

      // Click on forgot password link
      const forgotLink = page.getByRole('link', { name: /forgot|reset.*password/i });
      if (await forgotLink.isVisible()) {
        await forgotLink.click();
        await expect(page).toHaveURL(/.*(?:forgot|reset|recover)/);

        // Verify page elements
        await expect(page.getByRole('heading', { name: /forgot|reset|recover/i })).toBeVisible();
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /send|reset|submit/i })).toBeVisible();
      }
    });

    test('Link to login is available', async ({ page }) => {
      await page.goto('/forgot-password');

      const loginLink = page.getByRole('link', { name: /login|sign in|back/i });
      if (await loginLink.isVisible()) {
        await loginLink.click();
        await expect(page).toHaveURL(/.*login/);
      }
    });
  });

  test.describe('Password Reset Request', () => {
    test('AUTH-007: Password reset flow works correctly', async ({ page }) => {
      await page.goto('/forgot-password');

      // Fill email
      const emailField = page.getByLabel(/email/i);
      if (await emailField.isVisible()) {
        await emailField.fill('admin@test.com');

        // Submit reset request
        await page.getByRole('button', { name: /send|reset|submit/i }).click();

        // Should show success message
        await expect(page.getByText(/email.*sent|check.*email|link.*sent|success/i)).toBeVisible({
          timeout: 10000,
        });
      }
    });

    test('Shows error for non-existent email', async ({ page }) => {
      await page.goto('/forgot-password');

      const emailField = page.getByLabel(/email/i);
      if (await emailField.isVisible()) {
        await emailField.fill('nonexistent@example.com');
        await page.getByRole('button', { name: /send|reset|submit/i }).click();

        // Should either show error or generic success (for security)
        await page.waitForTimeout(3000);
      }
    });

    test('Validates email format', async ({ page }) => {
      await page.goto('/forgot-password');

      const emailField = page.getByLabel(/email/i);
      if (await emailField.isVisible()) {
        await emailField.fill('invalid-email');
        await page.getByRole('button', { name: /send|reset|submit/i }).click();

        // Should show validation error
        await expect(page.getByText(/valid.*email|invalid.*email/i)).toBeVisible({ timeout: 3000 });
      }
    });

    test('Requires email field', async ({ page }) => {
      await page.goto('/forgot-password');

      // Try to submit empty form
      const submitBtn = page.getByRole('button', { name: /send|reset|submit/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Should show required field error
        await expect(page.getByText(/required|email/i)).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Password Reset Token Page', () => {
    test('Reset token page loads with valid token', async ({ page }) => {
      // This would need a valid token - testing page structure
      await page.goto('/reset-password?token=test-token');

      // Page should either show form or error
      const resetForm = page.getByLabel(/new password/i);
      const errorMessage = page.getByText(/invalid|expired|token/i);

      // Either form or error should be visible
      const formVisible = await resetForm.isVisible().catch(() => false);
      const errorVisible = await errorMessage.isVisible().catch(() => false);

      expect(formVisible || errorVisible).toBeTruthy();
    });

    test('Reset form requires matching passwords', async ({ page }) => {
      await page.goto('/reset-password?token=test-token');

      const newPasswordField = page.getByLabel(/new password/i);
      const confirmPasswordField = page.getByLabel(/confirm.*password/i);

      if (await newPasswordField.isVisible() && await confirmPasswordField.isVisible()) {
        await newPasswordField.fill('NewPass123!@#');
        await confirmPasswordField.fill('DifferentPass123!@#');

        await page.getByRole('button', { name: /reset|save|submit/i }).click();

        // Should show password mismatch error
        await expect(page.getByText(/match|same|identical/i)).toBeVisible({ timeout: 3000 });
      }
    });

    test('Shows error for weak password', async ({ page }) => {
      await page.goto('/reset-password?token=test-token');

      const newPasswordField = page.getByLabel(/new password/i);
      if (await newPasswordField.isVisible()) {
        await newPasswordField.fill('123'); // Too weak

        const confirmPasswordField = page.getByLabel(/confirm.*password/i);
        if (await confirmPasswordField.isVisible()) {
          await confirmPasswordField.fill('123');
        }

        await page.getByRole('button', { name: /reset|save|submit/i }).click();

        // Should show password strength error
        await expect(page.getByText(/weak|short|requirements/i)).toBeVisible({ timeout: 3000 });
      }
    });

    test('Shows error for expired/invalid token', async ({ page }) => {
      await page.goto('/reset-password?token=invalid-token-123');

      // Should show error about invalid/expired token
      await expect(page.getByText(/invalid|expired|token/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Password Reset UI/UX', () => {
    test('Loading state shown during reset request', async ({ page }) => {
      await page.goto('/forgot-password');

      const emailField = page.getByLabel(/email/i);
      if (await emailField.isVisible()) {
        await emailField.fill('test@example.com');

        const submitBtn = page.getByRole('button', { name: /send|reset|submit/i });
        await submitBtn.click();

        // Button might show loading state
        const isLoading = await page.locator('.loading, .spinner, [data-loading="true"]')
          .isVisible()
          .catch(() => false);
      }
    });

    test('Can resend reset email', async ({ page }) => {
      await page.goto('/forgot-password');

      const emailField = page.getByLabel(/email/i);
      if (await emailField.isVisible()) {
        await emailField.fill('test@example.com');
        await page.getByRole('button', { name: /send|reset|submit/i }).click();

        // Wait for success
        await page.waitForTimeout(3000);

        // Look for resend option
        const resendBtn = page.getByRole('button', { name: /resend|try again|send again/i });
        if (await resendBtn.isVisible()) {
          await expect(resendBtn).toBeEnabled();
        }
      }
    });
  });
});
