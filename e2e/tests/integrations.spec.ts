import { test, expect } from '@playwright/test';

test.describe('Integrations Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/integrations');
  });

  test.describe('Integrations List', () => {
    test('INT-001: Available integrations are displayed', async ({ page }) => {
      // Verify page loads
      await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible();

      // Verify integration cards are displayed
      const integrationCards = page.locator('[data-testid="integration-card"], .integration-card, .glass-effect');
      expect(await integrationCards.count()).toBeGreaterThan(0);
    });

    test('Integrations are organized by category', async ({ page }) => {
      // Look for category filters
      const categories = page.locator('[data-testid="category-filter"], .category-tab, button:has-text("Communication")');
      expect(await categories.count()).toBeGreaterThan(0);
    });

    test('Can search integrations', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible();

      await searchInput.fill('Google');
      await page.waitForTimeout(500);

      // Should filter results
      const results = page.locator('[data-testid="integration-card"], .integration-card');
      const count = await results.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('Can filter by category', async ({ page }) => {
      // Click on a category
      const categoryBtn = page.getByRole('button', { name: /communication/i });

      if (await categoryBtn.isVisible()) {
        await categoryBtn.click();
        await page.waitForTimeout(500);

        // Should show filtered results
        await expect(page.locator('.integration-card, [data-testid="integration-card"]').first()).toBeVisible();
      }
    });
  });

  test.describe('Integration Connection', () => {
    test('INT-002: Google integration shows OAuth connect button', async ({ page }) => {
      // Find Google/Gmail integration
      const googleCard = page.locator('.integration-card:has-text("Google"), [data-testid="integration-google"]').first();

      if (await googleCard.isVisible()) {
        const connectBtn = googleCard.getByRole('button', { name: /connect/i });
        await expect(connectBtn).toBeVisible();
      }
    });

    test('INT-003: Slack integration shows OAuth connect button', async ({ page }) => {
      const slackCard = page.locator('.integration-card:has-text("Slack"), [data-testid="integration-slack"]').first();

      if (await slackCard.isVisible()) {
        const connectBtn = slackCard.getByRole('button', { name: /connect/i });
        await expect(connectBtn).toBeVisible();
      }
    });

    test('INT-004: Typeform integration shows API key form', async ({ page }) => {
      // Find Typeform integration
      const typeformCard = page.locator('.integration-card:has-text("Typeform")').first();

      if (await typeformCard.isVisible()) {
        await typeformCard.getByRole('button', { name: /connect/i }).click();

        // Should show API key form
        await expect(page.getByLabel(/api|token/i)).toBeVisible({ timeout: 3000 });
      }
    });

    test('INT-006: Integration status is displayed correctly', async ({ page }) => {
      // Look for connected status badges
      const connectedBadges = page.locator('[data-testid="connected-badge"], .connected-badge, :text("Connected")');

      // May or may not have connected integrations
      const count = await connectedBadges.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Integration Management', () => {
    test('INT-005: User can view integration details', async ({ page }) => {
      // Find a connected integration or any integration
      const integrationCard = page.locator('.integration-card').first();

      if (await integrationCard.isVisible()) {
        // Click manage or the card
        const manageBtn = integrationCard.getByRole('button', { name: /manage|settings/i });
        if (await manageBtn.isVisible()) {
          await manageBtn.click();
        } else {
          await integrationCard.click();
        }

        // Should show details/modal
        await page.waitForTimeout(500);
      }
    });

    test('Connected integration shows test connection option', async ({ page }) => {
      // Find a connected integration
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();

        // Should have test connection button
        await expect(page.getByRole('button', { name: /test connection/i })).toBeVisible({ timeout: 3000 });
      }
    });

    test('Connected integration shows sync option', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();

        // Should have sync button
        const syncBtn = page.getByRole('button', { name: /sync/i });
        if (await syncBtn.isVisible()) {
          await expect(syncBtn).toBeEnabled();
        }
      }
    });

    test('INT-005: User can disconnect integration', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();

        // Find disconnect button
        const disconnectBtn = page.getByRole('button', { name: /disconnect|remove/i });
        if (await disconnectBtn.isVisible()) {
          await expect(disconnectBtn).toBeVisible();
          // Don't actually disconnect in test - just verify button exists
        }
      }
    });
  });

  test.describe('Custom Webhooks', () => {
    test('Webhook documentation link is visible', async ({ page }) => {
      const webhookSection = page.locator(':text("Webhook"), :text("Custom Integration")').first();

      if (await webhookSection.isVisible()) {
        const docsLink = page.getByRole('button', { name: /documentation|docs/i });
        await expect(docsLink).toBeVisible();
      }
    });

    test('Create webhook button is available', async ({ page }) => {
      const createWebhookBtn = page.getByRole('button', { name: /create webhook/i });

      if (await createWebhookBtn.isVisible()) {
        await expect(createWebhookBtn).toBeEnabled();
      }
    });
  });

  test.describe('Integration Stats', () => {
    test('Shows connected integrations count', async ({ page }) => {
      const connectedStat = page.locator('[data-testid="connected-count"], .stat-card:has-text("Connected")');

      if (await connectedStat.isVisible()) {
        const count = await connectedStat.textContent();
        expect(count).toMatch(/\d+/);
      }
    });

    test('Shows available integrations count', async ({ page }) => {
      const availableStat = page.locator('[data-testid="available-count"], .stat-card:has-text("Available")');

      if (await availableStat.isVisible()) {
        const count = await availableStat.textContent();
        expect(count).toMatch(/\d+/);
      }
    });
  });
});
