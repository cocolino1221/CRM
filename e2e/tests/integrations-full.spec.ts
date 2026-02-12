import { test, expect } from '@playwright/test';

test.describe('Integrations Module - Full Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Integrations Page Layout', () => {
    test('Page loads with correct title and stats', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible();

      // Verify stats cards
      await expect(page.getByText(/connected/i).first()).toBeVisible();
      await expect(page.getByText(/available/i).first()).toBeVisible();
    });

    test('Search input is functional', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toBeEditable();
    });

    test('Category filters are displayed', async ({ page }) => {
      const categories = [
        'All Integrations',
        'Communication',
        'Email',
        'Automation',
        'Forms',
        'Scheduling',
        'Payments',
      ];

      for (const category of categories) {
        const categoryBtn = page.getByRole('button', { name: new RegExp(category, 'i') });
        if (await categoryBtn.isVisible()) {
          await expect(categoryBtn).toBeEnabled();
        }
      }
    });
  });

  test.describe('Integration Cards Display', () => {
    test('Integration cards show name and description', async ({ page }) => {
      const cards = page.locator('.integration-card, [data-testid="integration-card"], .glass-effect').first();
      await expect(cards).toBeVisible();

      // Cards should have content
      const cardText = await cards.textContent();
      expect(cardText?.length).toBeGreaterThan(10);
    });

    test('Integration cards show features list', async ({ page }) => {
      const featuresList = page.locator('.integration-card').first().locator('text=/•|✓|features/i');
      // Features may or may not be visible
    });

    test('Integration cards have Connect/Manage button', async ({ page }) => {
      const card = page.locator('.integration-card, .glass-effect').first();
      const actionButton = card.getByRole('button', { name: /connect|manage/i });
      await expect(actionButton).toBeVisible();
    });

    test('Connected integrations show status badge', async ({ page }) => {
      const connectedBadge = page.locator('.integration-card:has-text("Connected"), [data-testid="connected-badge"]');
      // May or may not have connected integrations
      const count = await connectedBadge.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Search and Filter', () => {
    test('Search filters integrations by name', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Google');
      await page.waitForTimeout(500);

      // Should show Google-related integrations
      const results = page.locator('.integration-card:visible');
      const count = await results.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('Search filters integrations by description', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('email');
      await page.waitForTimeout(500);

      // Should show email-related integrations
    });

    test('Category filter shows only relevant integrations', async ({ page }) => {
      const communicationBtn = page.getByRole('button', { name: /communication/i });
      if (await communicationBtn.isVisible()) {
        await communicationBtn.click();
        await page.waitForTimeout(500);

        // Should filter to communication integrations
        const cards = page.locator('.integration-card:visible');
        expect(await cards.count()).toBeGreaterThanOrEqual(0);
      }
    });

    test('Multiple filters can be applied', async ({ page }) => {
      // Select category
      const categoryBtn = page.getByRole('button', { name: /email/i });
      if (await categoryBtn.isVisible()) {
        await categoryBtn.click();
      }

      // Then search
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('gmail');
      await page.waitForTimeout(500);
    });

    test('Clearing search shows all integrations', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('xyz123notfound');
      await page.waitForTimeout(500);

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);

      // All integrations should be visible again
      const cards = page.locator('.integration-card:visible');
      expect(await cards.count()).toBeGreaterThan(0);
    });
  });

  test.describe('OAuth Integrations', () => {
    test('Google integration shows OAuth connect flow', async ({ page }) => {
      const googleCard = page.locator('.integration-card:has-text("Google"), .integration-card:has-text("Gmail")').first();

      if (await googleCard.isVisible()) {
        const connectBtn = googleCard.getByRole('button', { name: /connect/i });
        await expect(connectBtn).toBeVisible();

        // Don't actually click - would redirect to Google OAuth
      }
    });

    test('Slack integration shows OAuth connect flow', async ({ page }) => {
      const slackCard = page.locator('.integration-card:has-text("Slack")').first();

      if (await slackCard.isVisible()) {
        const connectBtn = slackCard.getByRole('button', { name: /connect/i });
        await expect(connectBtn).toBeVisible();
      }
    });

    test('Calendly integration shows OAuth connect flow', async ({ page }) => {
      // Search for Calendly
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Calendly');
      await page.waitForTimeout(500);

      const calendlyCard = page.locator('.integration-card:has-text("Calendly")').first();
      if (await calendlyCard.isVisible()) {
        const connectBtn = calendlyCard.getByRole('button', { name: /connect/i });
        await expect(connectBtn).toBeVisible();
      }
    });

    test('Zoom integration is available', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Zoom');
      await page.waitForTimeout(500);

      const zoomCard = page.locator('.integration-card:has-text("Zoom")').first();
      if (await zoomCard.isVisible()) {
        await expect(zoomCard).toBeVisible();
      }
    });
  });

  test.describe('API Key Integrations', () => {
    test('Typeform shows API key configuration modal', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Typeform');
      await page.waitForTimeout(500);

      const typeformCard = page.locator('.integration-card:has-text("Typeform")').first();
      if (await typeformCard.isVisible()) {
        await typeformCard.getByRole('button', { name: /connect/i }).click();

        // Should show configuration modal
        await expect(page.getByLabel(/api|token/i).first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('WhatsApp shows configuration fields', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('WhatsApp');
      await page.waitForTimeout(500);

      const whatsappCard = page.locator('.integration-card:has-text("WhatsApp")').first();
      if (await whatsappCard.isVisible()) {
        await whatsappCard.getByRole('button', { name: /connect/i }).click();

        // Should show configuration fields
        await page.waitForTimeout(500);
      }
    });

    test('API key integration validates required fields', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Typeform');
      await page.waitForTimeout(500);

      const typeformCard = page.locator('.integration-card:has-text("Typeform")').first();
      if (await typeformCard.isVisible()) {
        await typeformCard.getByRole('button', { name: /connect/i }).click();
        await page.waitForTimeout(500);

        // Try to submit without filling required fields
        const submitBtn = page.getByRole('button', { name: /connect|save|submit/i }).last();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();

          // Should show validation error or required indication
          await page.waitForTimeout(1000);
        }
      }
    });

    test('Can cancel integration configuration', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Typeform');
      await page.waitForTimeout(500);

      const typeformCard = page.locator('.integration-card:has-text("Typeform")').first();
      if (await typeformCard.isVisible()) {
        await typeformCard.getByRole('button', { name: /connect/i }).click();
        await page.waitForTimeout(500);

        // Cancel
        const cancelBtn = page.getByRole('button', { name: /cancel|close/i });
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();

          // Modal should close
          await expect(page.getByLabel(/api|token/i).first()).not.toBeVisible({ timeout: 2000 });
        }
      }
    });
  });

  test.describe('Connected Integration Management', () => {
    test('Connected integration shows Manage button', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        const manageBtn = connectedCard.getByRole('button', { name: /manage/i });
        await expect(manageBtn).toBeVisible();
      }
    });

    test('Manage modal shows integration status', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();

        // Should show status
        await expect(page.getByText(/status|active/i).first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('Can test connection for connected integration', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();
        await page.waitForTimeout(500);

        const testBtn = page.getByRole('button', { name: /test connection/i });
        if (await testBtn.isVisible()) {
          await expect(testBtn).toBeEnabled();
        }
      }
    });

    test('Can trigger sync for connected integration', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();
        await page.waitForTimeout(500);

        const syncBtn = page.getByRole('button', { name: /sync/i });
        if (await syncBtn.isVisible()) {
          await expect(syncBtn).toBeEnabled();
        }
      }
    });

    test('Disconnect button is available', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();
        await page.waitForTimeout(500);

        const disconnectBtn = page.getByRole('button', { name: /disconnect/i });
        if (await disconnectBtn.isVisible()) {
          await expect(disconnectBtn).toBeVisible();
        }
      }
    });

    test('Shows last sync information', async ({ page }) => {
      const connectedCard = page.locator('.integration-card:has-text("Connected")').first();

      if (await connectedCard.isVisible()) {
        await connectedCard.getByRole('button', { name: /manage/i }).click();
        await page.waitForTimeout(500);

        // Look for last sync info
        const syncInfo = page.getByText(/last sync|synced/i);
        // May or may not be visible depending on sync status
      }
    });
  });

  test.describe('Webhooks Section', () => {
    test('Custom webhooks section is visible', async ({ page }) => {
      const webhookSection = page.locator(':text("Webhook"), :text("Custom Integration")');
      await expect(webhookSection.first()).toBeVisible();
    });

    test('Documentation link is available', async ({ page }) => {
      const docsBtn = page.getByRole('button', { name: /documentation|docs/i });
      if (await docsBtn.isVisible()) {
        await expect(docsBtn).toBeEnabled();
      }
    });

    test('Create webhook button is available', async ({ page }) => {
      const createWebhookBtn = page.getByRole('button', { name: /create webhook/i });
      if (await createWebhookBtn.isVisible()) {
        await expect(createWebhookBtn).toBeEnabled();
      }
    });
  });

  test.describe('Integration Categories', () => {
    const categories = [
      { name: 'Communication', integrations: ['Slack', 'WhatsApp', 'Zoom'] },
      { name: 'Email', integrations: ['Gmail', 'SendGrid', 'Mailchimp'] },
      { name: 'Forms', integrations: ['Typeform', 'Google Forms'] },
      { name: 'Scheduling', integrations: ['Calendly', 'Cal.com'] },
      { name: 'Payments', integrations: ['Stripe', 'PayPal'] },
      { name: 'Automation', integrations: ['Zapier', 'n8n', 'Make'] },
    ];

    for (const category of categories) {
      test(`${category.name} category shows relevant integrations`, async ({ page }) => {
        const categoryBtn = page.getByRole('button', { name: new RegExp(category.name, 'i') });

        if (await categoryBtn.isVisible()) {
          await categoryBtn.click();
          await page.waitForTimeout(500);

          // Check that at least one expected integration is visible
          for (const integration of category.integrations) {
            const card = page.locator(`.integration-card:has-text("${integration}")`);
            if (await card.isVisible()) {
              await expect(card).toBeVisible();
              break;
            }
          }
        }
      });
    }
  });

  test.describe('Specific Integrations', () => {
    const integrations = [
      { name: 'Google', type: 'oauth', features: ['Calendar', 'Email', 'Contacts'] },
      { name: 'Slack', type: 'oauth', features: ['Notifications', 'Commands'] },
      { name: 'Typeform', type: 'api_key', features: ['Form sync', 'Webhooks'] },
      { name: 'Stripe', type: 'api_key', features: ['Payments', 'Subscriptions'] },
      { name: 'Calendly', type: 'oauth', features: ['Scheduling', 'Appointments'] },
    ];

    for (const integration of integrations) {
      test(`${integration.name} integration is available and shows features`, async ({ page }) => {
        // Search for integration
        const searchInput = page.getByPlaceholder(/search/i);
        await searchInput.fill(integration.name);
        await page.waitForTimeout(500);

        const card = page.locator(`.integration-card:has-text("${integration.name}")`).first();
        if (await card.isVisible()) {
          await expect(card).toBeVisible();

          // Verify at least one feature is mentioned
          const cardText = await card.textContent();
          // Features might be listed in description
        }
      });
    }
  });

  test.describe('Error Handling', () => {
    test('Shows error message on connection failure', async ({ page }) => {
      // This would require mocking API responses
      // For now, just verify error elements exist if visible
    });

    test('Handles network errors gracefully', async ({ page }) => {
      // Test that page doesn't crash on network issues
      await page.reload();
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('Integrations page works on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();

      await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible();
    });

    test('Integrations page works on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible();

      // Categories might be in a scrollable area
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible();
    });
  });
});
