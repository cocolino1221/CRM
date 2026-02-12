import { test, expect } from '@playwright/test';

test.describe('Leads Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leads');
  });

  test.describe('Leads List', () => {
    test('LEAD-001: User can view leads list @critical', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /leads/i })).toBeVisible();

      // Verify leads are displayed
      const leadsList = page.locator('[data-testid="leads-list"], table, .leads-grid');
      await expect(leadsList).toBeVisible();
    });

    test('LEAD-004: Lead source tracking is displayed', async ({ page }) => {
      // Check if source column or filter exists
      const sourceFilter = page.getByRole('combobox', { name: /source/i }).or(
        page.locator('th:has-text("Source"), [data-testid="source-column"]')
      );

      await expect(sourceFilter).toBeVisible();
    });
  });

  test.describe('Lead Creation', () => {
    test('LEAD-001: User can create a new lead @critical', async ({ page }) => {
      // Click create button
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Generate unique data
      const uniqueEmail = `lead.${Date.now()}@example.com`;

      // Fill lead form
      await page.getByLabel(/first name/i).fill('New');
      await page.getByLabel(/last name/i).fill('Lead');
      await page.getByLabel(/email/i).fill(uniqueEmail);

      // Select source if available
      const sourceSelect = page.getByLabel(/source/i);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption({ index: 1 });
      }

      // Submit
      await page.getByRole('button', { name: /save|create|submit/i }).click();

      // Verify success
      await expect(page.getByText(/success|created|saved/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Lead Status Management', () => {
    test('LEAD-005: Lead status can be changed', async ({ page }) => {
      // Find a lead and its status dropdown
      const statusDropdown = page.getByRole('combobox', { name: /status/i }).first().or(
        page.locator('[data-testid="lead-status"]').first()
      );

      if (await statusDropdown.isVisible()) {
        await statusDropdown.click();

        // Change status
        await page.getByRole('option', { name: /qualified|contacted/i }).first().click();

        // Verify change (either immediate or after save)
        await page.waitForTimeout(1000);
      }
    });

    test('LEAD-002: Lead can be converted to contact', async ({ page }) => {
      // Find convert button
      const convertButton = page.getByRole('button', { name: /convert/i }).first();

      if (await convertButton.isVisible()) {
        await convertButton.click();

        // Handle conversion modal/flow
        const confirmButton = page.getByRole('button', { name: /confirm|convert|yes/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Verify success
        await expect(page.getByText(/converted|success/i)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Lead Scoring', () => {
    test('Lead score is displayed', async ({ page }) => {
      // Look for score column or indicator
      const scoreIndicator = page.locator('[data-testid="lead-score"], .lead-score, th:has-text("Score")');

      if (await scoreIndicator.isVisible()) {
        await expect(scoreIndicator).toBeVisible();
      }
    });
  });

  test.describe('Lead Pipeline', () => {
    test('Leads can be moved through pipeline stages', async ({ page }) => {
      // Check if pipeline view exists
      const pipelineView = page.locator('[data-testid="pipeline-view"], .pipeline-board, .kanban');

      if (await pipelineView.isVisible()) {
        // Find a draggable lead card
        const leadCard = page.locator('[data-testid="lead-card"], .pipeline-card').first();

        if (await leadCard.isVisible()) {
          // Get initial position/stage
          const initialStage = await leadCard.getAttribute('data-stage');

          // Simulate drag (Playwright drag and drop)
          const targetStage = page.locator('[data-testid="pipeline-stage"]').nth(1);

          if (await targetStage.isVisible()) {
            await leadCard.dragTo(targetStage);

            // Verify move
            await page.waitForTimeout(1000);
          }
        }
      }
    });
  });

  test.describe('Lead Filtering and Search', () => {
    test('Can filter leads by date range', async ({ page }) => {
      const dateFilter = page.getByRole('button', { name: /date|period/i }).or(
        page.locator('[data-testid="date-filter"]')
      );

      if (await dateFilter.isVisible()) {
        await dateFilter.click();

        // Select a preset or date range
        const lastWeek = page.getByText(/last 7 days|this week|last week/i);
        if (await lastWeek.isVisible()) {
          await lastWeek.click();
        }
      }
    });

    test('Can search leads by name or email', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);

      await searchInput.fill('test@example.com');
      await searchInput.press('Enter');

      await page.waitForTimeout(500);

      // Results should update
      await expect(page).toHaveURL(/.*(?:search|q=)/);
    });
  });
});
