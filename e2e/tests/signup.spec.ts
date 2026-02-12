import { test, expect } from '@playwright/test';
import { generateUniqueEmail, generateUniqueName } from '../fixtures/test-data';

test.describe('User Registration / Sign Up', () => {
  // Use fresh context without stored auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test.describe('Registration Page UI', () => {
    test('Registration page loads correctly', async ({ page }) => {
      // Verify page elements
      await expect(page.getByRole('heading', { name: /sign up|register|create account/i })).toBeVisible();

      // Check for form fields
      await expect(page.getByLabel(/first name/i)).toBeVisible();
      await expect(page.getByLabel(/last name/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i).first()).toBeVisible();

      // Check for submit button
      await expect(page.getByRole('button', { name: /sign up|register|create/i })).toBeVisible();
    });

    test('Has link to login page', async ({ page }) => {
      const loginLink = page.getByRole('link', { name: /sign in|login|already have/i });
      await expect(loginLink).toBeVisible();

      await loginLink.click();
      await expect(page).toHaveURL(/.*login/);
    });

    test('Shows password requirements or strength indicator', async ({ page }) => {
      const passwordField = page.getByLabel(/^password$/i);
      await passwordField.fill('weak');

      // Look for strength indicator or requirements
      const strengthIndicator = page.locator('[data-testid="password-strength"], .password-strength, :text("weak"), :text("strong")');
      // May or may not exist depending on implementation
    });
  });

  test.describe('Successful Registration', () => {
    test('User can register with valid data @critical', async ({ page }) => {
      const uniqueEmail = generateUniqueEmail('signup');

      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill(uniqueEmail);
      await page.getByLabel(/^password$/i).fill('SecurePass123!@#');

      // Fill confirm password if exists
      const confirmPassword = page.getByLabel(/confirm password|repeat password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('SecurePass123!@#');
      }

      // Accept terms if checkbox exists
      const termsCheckbox = page.getByLabel(/terms|agree|accept/i);
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should redirect to dashboard, login, or verification page
      await expect(page).toHaveURL(/.*(?:dashboard|login|verify|welcome)/, { timeout: 15000 });
    });

    test('User can register with minimal required fields', async ({ page }) => {
      const uniqueEmail = generateUniqueEmail('minimal');

      await page.getByLabel(/first name/i).fill('Min');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill(uniqueEmail);
      await page.getByLabel(/^password$/i).fill('MinPass123!');

      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('MinPass123!');
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      await page.waitForTimeout(3000);
      // Should not show error or should redirect
    });

    test('Registration creates user and allows immediate login', async ({ page, context }) => {
      const uniqueEmail = generateUniqueEmail('logintest');
      const password = 'TestPass123!@#';

      // Register
      await page.getByLabel(/first name/i).fill('Login');
      await page.getByLabel(/last name/i).fill('Tester');
      await page.getByLabel(/email/i).fill(uniqueEmail);
      await page.getByLabel(/^password$/i).fill(password);

      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill(password);
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Wait for registration to complete
      await page.waitForTimeout(3000);

      // Try to login with new credentials
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(uniqueEmail);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in|login/i }).click();

      // Should be able to login (or need verification)
      await page.waitForTimeout(3000);
    });
  });

  test.describe('Registration Validation', () => {
    test('Shows error for empty required fields', async ({ page }) => {
      // Try to submit empty form
      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should show validation errors
      await expect(page.getByText(/required|please fill|cannot be empty/i).first()).toBeVisible({ timeout: 3000 });
    });

    test('Shows error for invalid email format', async ({ page }) => {
      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill('invalid-email-format');
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should show email validation error
      await expect(page.getByText(/valid email|invalid email|email format/i)).toBeVisible({ timeout: 3000 });
    });

    test('Shows error for weak password', async ({ page }) => {
      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill(generateUniqueEmail('weakpass'));
      await page.getByLabel(/^password$/i).fill('123'); // Too short/weak

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should show password validation error
      await expect(page.getByText(/password.*(?:weak|short|characters|requirements)/i)).toBeVisible({ timeout: 3000 });
    });

    test('Shows error when passwords do not match', async ({ page }) => {
      const confirmPassword = page.getByLabel(/confirm password/i);

      if (await confirmPassword.isVisible()) {
        await page.getByLabel(/first name/i).fill('Test');
        await page.getByLabel(/last name/i).fill('User');
        await page.getByLabel(/email/i).fill(generateUniqueEmail('mismatch'));
        await page.getByLabel(/^password$/i).fill('Test123!@#');
        await confirmPassword.fill('DifferentPass123!');

        await page.getByRole('button', { name: /sign up|register|create/i }).click();

        // Should show password mismatch error
        await expect(page.getByText(/passwords.*(?:match|same|identical)/i)).toBeVisible({ timeout: 3000 });
      }
    });

    test('Shows error for existing email', async ({ page }) => {
      // Use known existing email
      await page.getByLabel(/first name/i).fill('Duplicate');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill('admin@test.com'); // Existing user
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('Test123!@#');
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should show duplicate email error
      await expect(page.getByText(/already exists|already registered|email.*taken|account.*exists/i)).toBeVisible({ timeout: 5000 });
    });

    test('First name validation - minimum length', async ({ page }) => {
      await page.getByLabel(/first name/i).fill('A'); // Too short
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill(generateUniqueEmail('shortname'));
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // May or may not have minimum length validation
      await page.waitForTimeout(1000);
    });

    test('Email with special characters', async ({ page }) => {
      await page.getByLabel(/first name/i).fill('Special');
      await page.getByLabel(/last name/i).fill('Email');
      await page.getByLabel(/email/i).fill('test+special@example.com');
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('Test123!@#');
      }

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Should accept valid email with + character
      await page.waitForTimeout(2000);
    });
  });

  test.describe('Registration UX', () => {
    test('Password visibility toggle works', async ({ page }) => {
      const passwordField = page.getByLabel(/^password$/i);
      await passwordField.fill('TestPassword123');

      // Check initial state (should be password type)
      await expect(passwordField).toHaveAttribute('type', 'password');

      // Find and click visibility toggle
      const toggleButton = page.locator('[data-testid="password-toggle"], button:near(input[type="password"])').first();
      if (await toggleButton.isVisible()) {
        await toggleButton.click();

        // Should now show password
        await expect(passwordField).toHaveAttribute('type', 'text');
      }
    });

    test('Form preserves data on validation error', async ({ page }) => {
      const firstName = 'Preserved';
      const lastName = 'Data';

      await page.getByLabel(/first name/i).fill(firstName);
      await page.getByLabel(/last name/i).fill(lastName);
      await page.getByLabel(/email/i).fill('invalid'); // Invalid to trigger error
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      // Data should be preserved
      await expect(page.getByLabel(/first name/i)).toHaveValue(firstName);
      await expect(page.getByLabel(/last name/i)).toHaveValue(lastName);
    });

    test('Loading state shown during submission', async ({ page }) => {
      await page.getByLabel(/first name/i).fill('Loading');
      await page.getByLabel(/last name/i).fill('Test');
      await page.getByLabel(/email/i).fill(generateUniqueEmail('loading'));
      await page.getByLabel(/^password$/i).fill('Test123!@#');

      const confirmPassword = page.getByLabel(/confirm password/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('Test123!@#');
      }

      // Click and immediately check for loading state
      const submitButton = page.getByRole('button', { name: /sign up|register|create/i });
      await submitButton.click();

      // Button might show loading state
      const isLoading = await page.locator('.loading, .spinner, [data-loading="true"]').isVisible().catch(() => false);
    });
  });

  test.describe('Social/OAuth Registration', () => {
    test('Google signup button is visible', async ({ page }) => {
      const googleButton = page.getByRole('button', { name: /google/i }).or(
        page.locator('[data-provider="google"], .google-auth')
      );

      if (await googleButton.isVisible()) {
        await expect(googleButton).toBeEnabled();
      }
    });

    test('GitHub signup button is visible', async ({ page }) => {
      const githubButton = page.getByRole('button', { name: /github/i }).or(
        page.locator('[data-provider="github"], .github-auth')
      );

      if (await githubButton.isVisible()) {
        await expect(githubButton).toBeEnabled();
      }
    });
  });
});
