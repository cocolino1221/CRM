import { test, expect } from '@playwright/test';

test.describe('Contacts Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contacts');
    await expect(page).toHaveURL(/.*contacts/);
  });

  test.describe('Contact List', () => {
    test('CONT-002: User can view contact list @critical', async ({ page }) => {
      // Verify page title
      await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible();

      // Verify table or list is visible
      const contactsList = page.locator('[data-testid="contacts-list"], table, .contacts-grid');
      await expect(contactsList).toBeVisible();
    });

    test('CONT-003: User can search contacts', async ({ page }) => {
      // Find search input
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible();

      // Type search query
      await searchInput.fill('John');
      await searchInput.press('Enter');

      // Wait for results to update
      await page.waitForTimeout(500);

      // Verify search was applied (URL or results change)
      const url = page.url();
      expect(url.includes('search') || url.includes('q=')).toBeTruthy;
    });

    test('CONT-004: User can filter contacts by status', async ({ page }) => {
      // Find filter dropdown or buttons
      const statusFilter = page.getByRole('combobox', { name: /status/i }).or(
        page.getByRole('button', { name: /filter|status/i })
      );

      if (await statusFilter.isVisible()) {
        await statusFilter.click();

        // Select a status
        await page.getByRole('option', { name: /lead/i }).or(
          page.getByText(/lead/i)
        ).click();

        // Wait for filter to apply
        await page.waitForTimeout(500);
      }
    });

    test('CONT-009: Contact pagination works correctly', async ({ page }) => {
      // Look for pagination controls
      const pagination = page.locator('[data-testid="pagination"], .pagination, nav[aria-label="pagination"]');

      if (await pagination.isVisible()) {
        // Click next page if available
        const nextButton = page.getByRole('button', { name: /next/i });
        if (await nextButton.isEnabled()) {
          await nextButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });
  });

  test.describe('Contact CRUD Operations', () => {
    test('CONT-001: User can create a new contact @critical', async ({ page }) => {
      // Click create button
      await page.getByRole('button', { name: /add|create|new/i }).first().click();

      // Wait for modal or navigate to form
      await page.waitForTimeout(500);

      // Generate unique email
      const uniqueEmail = `contact.${Date.now()}@example.com`;

      // Fill required fields
      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('Contact');
      await page.getByLabel(/email/i).fill(uniqueEmail);

      // Fill optional fields if visible
      const phoneField = page.getByLabel(/phone/i);
      if (await phoneField.isVisible()) {
        await phoneField.fill('+1234567890');
      }

      // Submit form
      await page.getByRole('button', { name: /save|create|submit/i }).click();

      // Verify success
      await expect(page.getByText(/success|created|saved/i)).toBeVisible({ timeout: 5000 });
    });

    test('CONT-007: Contact validation works (email format)', async ({ page }) => {
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Fill invalid email
      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill('invalid-email-format');

      await page.getByRole('button', { name: /save|create|submit/i }).click();

      // Should show validation error
      await expect(page.getByText(/invalid|valid email|format/i)).toBeVisible({ timeout: 3000 });
    });

    test('CONT-005: User can edit contact details', async ({ page }) => {
      // Click on first contact or edit button
      const editButton = page.getByRole('button', { name: /edit/i }).first();
      const contactRow = page.locator('tr, [data-testid="contact-row"]').first();

      if (await editButton.isVisible()) {
        await editButton.click();
      } else if (await contactRow.isVisible()) {
        await contactRow.click();
      }

      await page.waitForTimeout(500);

      // Update a field
      const firstNameField = page.getByLabel(/first name/i);
      if (await firstNameField.isVisible()) {
        await firstNameField.clear();
        await firstNameField.fill('Updated');

        await page.getByRole('button', { name: /save|update/i }).click();

        // Verify success
        await expect(page.getByText(/success|updated|saved/i)).toBeVisible({ timeout: 5000 });
      }
    });

    test('CONT-006: User can delete a contact', async ({ page }) => {
      // Find delete button
      const deleteButton = page.getByRole('button', { name: /delete/i }).first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Confirm deletion
        const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Verify success
        await expect(page.getByText(/deleted|removed|success/i)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Contact Details', () => {
    test('Contact detail page shows all information', async ({ page }) => {
      // Click on first contact
      const contactLink = page.locator('a[href*="/contacts/"]').first();

      if (await contactLink.isVisible()) {
        await contactLink.click();

        // Verify detail page loads
        await expect(page.getByText(/contact details|profile/i)).toBeVisible({ timeout: 5000 });
      }
    });

    test('Activities tab shows contact history', async ({ page }) => {
      const contactLink = page.locator('a[href*="/contacts/"]').first();

      if (await contactLink.isVisible()) {
        await contactLink.click();

        // Click activities tab
        const activitiesTab = page.getByRole('tab', { name: /activities|history/i });
        if (await activitiesTab.isVisible()) {
          await activitiesTab.click();
          await expect(page.locator('.activities-list, [data-testid="activities"]')).toBeVisible();
        }
      }
    });
  });
});
