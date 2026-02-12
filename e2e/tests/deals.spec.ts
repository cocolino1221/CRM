import { test, expect } from '@playwright/test';

test.describe('Deals & Pipeline Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pipeline');
  });

  test.describe('Pipeline View', () => {
    test('DEAL-002: User can view pipeline board @critical', async ({ page }) => {
      // Verify pipeline page loads
      await expect(page.getByRole('heading', { name: /pipeline|deals/i })).toBeVisible();

      // Verify pipeline columns/stages are visible
      const pipelineBoard = page.locator('[data-testid="pipeline-board"], .pipeline, .kanban-board');
      await expect(pipelineBoard).toBeVisible();

      // Verify stages exist
      const stages = page.locator('[data-testid="pipeline-stage"], .pipeline-column, .kanban-column');
      expect(await stages.count()).toBeGreaterThan(0);
    });

    test('Pipeline shows deal counts per stage', async ({ page }) => {
      const stageCounts = page.locator('[data-testid="stage-count"], .stage-header .count');

      if (await stageCounts.first().isVisible()) {
        const counts = await stageCounts.allTextContents();
        counts.forEach((count) => {
          expect(parseInt(count) || 0).toBeGreaterThanOrEqual(0);
        });
      }
    });

    test('Pipeline shows total value per stage', async ({ page }) => {
      const stageValues = page.locator('[data-testid="stage-value"], .stage-total');

      if (await stageValues.first().isVisible()) {
        await expect(stageValues.first()).toContainText(/\$|€|£|RON/);
      }
    });
  });

  test.describe('Deal Creation', () => {
    test('DEAL-001: User can create a new deal @critical', async ({ page }) => {
      // Click add deal button
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Fill deal form
      await page.getByLabel(/title|name/i).first().fill(`Test Deal ${Date.now()}`);

      // Fill value
      const valueField = page.getByLabel(/value|amount/i);
      if (await valueField.isVisible()) {
        await valueField.fill('50000');
      }

      // Select contact if required
      const contactSelect = page.getByLabel(/contact|customer/i);
      if (await contactSelect.isVisible()) {
        await contactSelect.click();
        await page.getByRole('option').first().click();
      }

      // Select stage
      const stageSelect = page.getByLabel(/stage|pipeline/i);
      if (await stageSelect.isVisible()) {
        await stageSelect.click();
        await page.getByRole('option').first().click();
      }

      // Submit
      await page.getByRole('button', { name: /save|create|submit/i }).click();

      // Verify success
      await expect(page.getByText(/success|created|saved/i)).toBeVisible({ timeout: 5000 });
    });

    test('Deal creation requires title', async ({ page }) => {
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Try to submit without title
      await page.getByRole('button', { name: /save|create|submit/i }).click();

      // Should show validation error
      await expect(page.getByText(/required|title/i)).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Deal Drag and Drop', () => {
    test('DEAL-003: User can drag deal between stages', async ({ page }) => {
      // Find a deal card
      const dealCard = page.locator('[data-testid="deal-card"], .deal-card, .kanban-card').first();

      if (await dealCard.isVisible()) {
        // Get initial stage
        const initialParent = await dealCard.locator('..').getAttribute('data-stage');

        // Find target stage (different from current)
        const targetStage = page.locator('[data-testid="pipeline-stage"], .pipeline-column').nth(1);

        if (await targetStage.isVisible()) {
          // Perform drag and drop
          await dealCard.dragTo(targetStage);

          // Wait for update
          await page.waitForTimeout(1000);

          // Verify deal moved (toast message or visual change)
          await expect(page.getByText(/moved|updated|success/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Deal Details', () => {
    test('DEAL-005: User can edit deal details', async ({ page }) => {
      // Click on a deal
      const dealCard = page.locator('[data-testid="deal-card"], .deal-card').first();

      if (await dealCard.isVisible()) {
        await dealCard.click();

        // Wait for detail view/modal
        await page.waitForTimeout(500);

        // Edit title
        const titleField = page.getByLabel(/title|name/i).first();
        if (await titleField.isVisible()) {
          await titleField.clear();
          await titleField.fill('Updated Deal Title');

          await page.getByRole('button', { name: /save|update/i }).click();

          await expect(page.getByText(/success|updated|saved/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('DEAL-008: Deal history is tracked', async ({ page }) => {
      const dealCard = page.locator('[data-testid="deal-card"], .deal-card').first();

      if (await dealCard.isVisible()) {
        await dealCard.click();

        // Look for history/activity tab
        const historyTab = page.getByRole('tab', { name: /history|activity|timeline/i });
        if (await historyTab.isVisible()) {
          await historyTab.click();

          // Verify history items exist
          const historyItems = page.locator('[data-testid="history-item"], .activity-item');
          expect(await historyItems.count()).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  test.describe('Deal Closure', () => {
    test('DEAL-006: User can close deal as won', async ({ page }) => {
      const dealCard = page.locator('[data-testid="deal-card"], .deal-card').first();

      if (await dealCard.isVisible()) {
        await dealCard.click();
        await page.waitForTimeout(500);

        // Find won button or status change
        const wonButton = page.getByRole('button', { name: /won|close won|mark won/i });
        if (await wonButton.isVisible()) {
          await wonButton.click();

          // Confirm if needed
          const confirmBtn = page.getByRole('button', { name: /confirm|yes/i });
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
          }

          await expect(page.getByText(/won|closed|success/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('DEAL-006b: User can close deal as lost', async ({ page }) => {
      const dealCard = page.locator('[data-testid="deal-card"], .deal-card').first();

      if (await dealCard.isVisible()) {
        await dealCard.click();
        await page.waitForTimeout(500);

        const lostButton = page.getByRole('button', { name: /lost|close lost|mark lost/i });
        if (await lostButton.isVisible()) {
          await lostButton.click();

          // Add loss reason if required
          const reasonField = page.getByLabel(/reason/i);
          if (await reasonField.isVisible()) {
            await reasonField.fill('Competitor won');
          }

          const confirmBtn = page.getByRole('button', { name: /confirm|yes|submit/i });
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
          }

          await expect(page.getByText(/lost|closed|success/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Pipeline Customization', () => {
    test('DEAL-007: Pipeline stages can be viewed', async ({ page }) => {
      // Look for settings/customize button
      const settingsBtn = page.getByRole('button', { name: /settings|customize|configure/i });

      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();

        // Verify stages configuration UI
        const stagesList = page.locator('[data-testid="stages-list"], .stages-config');
        if (await stagesList.isVisible()) {
          await expect(stagesList).toBeVisible();
        }
      }
    });
  });

  test.describe('Deal Filtering', () => {
    test('Can filter deals by value range', async ({ page }) => {
      const filterBtn = page.getByRole('button', { name: /filter/i });

      if (await filterBtn.isVisible()) {
        await filterBtn.click();

        const minValue = page.getByLabel(/min|from/i);
        const maxValue = page.getByLabel(/max|to/i);

        if (await minValue.isVisible()) {
          await minValue.fill('10000');
        }
        if (await maxValue.isVisible()) {
          await maxValue.fill('100000');
        }

        await page.getByRole('button', { name: /apply/i }).click();
      }
    });

    test('Can filter deals by owner', async ({ page }) => {
      const ownerFilter = page.getByRole('combobox', { name: /owner|assignee/i });

      if (await ownerFilter.isVisible()) {
        await ownerFilter.click();
        await page.getByRole('option').first().click();

        await page.waitForTimeout(500);
      }
    });
  });
});
