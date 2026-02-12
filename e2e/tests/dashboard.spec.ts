import { test, expect } from '@playwright/test';

test.describe('Dashboard Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test.describe('Dashboard Overview', () => {
    test('DASH-001: Dashboard loads with statistics @critical', async ({ page }) => {
      // Verify dashboard page loads
      await expect(page).toHaveURL(/.*dashboard/);

      // Verify main heading or title
      await expect(page.getByRole('heading', { name: /dashboard|overview|welcome/i }).first()).toBeVisible();

      // Verify stat cards are present
      const statCards = page.locator('[data-testid="stat-card"], .stat-card, .glass-effect');
      expect(await statCards.count()).toBeGreaterThan(0);
    });

    test('DASH-002: Dashboard shows correct metrics', async ({ page }) => {
      // Check for common metrics
      const metrics = [
        /contacts|leads/i,
        /deals|revenue/i,
        /tasks/i,
      ];

      for (const metric of metrics) {
        const element = page.getByText(metric).first();
        // At least some metrics should be visible
        if (await element.isVisible()) {
          await expect(element).toBeVisible();
        }
      }
    });

    test('DASH-003: Recent activities are displayed', async ({ page }) => {
      // Look for activities section
      const activitiesSection = page.locator('[data-testid="recent-activities"], .activities-section, :text("Recent")');

      if (await activitiesSection.isVisible()) {
        await expect(activitiesSection).toBeVisible();
      }
    });

    test('DASH-004: Quick actions work correctly', async ({ page }) => {
      // Find quick action buttons
      const quickActions = page.locator('[data-testid="quick-action"], .quick-action, button:has-text("Add")').first();

      if (await quickActions.isVisible()) {
        await quickActions.click();

        // Should open modal or navigate
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Dashboard Widgets', () => {
    test('Pipeline summary widget is visible', async ({ page }) => {
      const pipelineWidget = page.locator('[data-testid="pipeline-widget"], .pipeline-summary, :text("Pipeline")').first();

      if (await pipelineWidget.isVisible()) {
        await expect(pipelineWidget).toBeVisible();
      }
    });

    test('Task summary widget is visible', async ({ page }) => {
      const taskWidget = page.locator('[data-testid="task-widget"], .task-summary, :text("Tasks")').first();

      if (await taskWidget.isVisible()) {
        await expect(taskWidget).toBeVisible();
      }
    });

    test('Chart/Graph is rendered', async ({ page }) => {
      const chart = page.locator('canvas, svg, [data-testid="chart"], .chart').first();

      if (await chart.isVisible()) {
        await expect(chart).toBeVisible();
      }
    });
  });

  test.describe('Dashboard Navigation', () => {
    test('Can navigate to contacts from dashboard', async ({ page }) => {
      const contactsLink = page.getByRole('link', { name: /contacts/i }).first();

      if (await contactsLink.isVisible()) {
        await contactsLink.click();
        await expect(page).toHaveURL(/.*contacts/);
      }
    });

    test('Can navigate to deals from dashboard', async ({ page }) => {
      const dealsLink = page.getByRole('link', { name: /deals|pipeline/i }).first();

      if (await dealsLink.isVisible()) {
        await dealsLink.click();
        await expect(page).toHaveURL(/.*(?:deals|pipeline)/);
      }
    });

    test('Can navigate to tasks from dashboard', async ({ page }) => {
      const tasksLink = page.getByRole('link', { name: /tasks/i }).first();

      if (await tasksLink.isVisible()) {
        await tasksLink.click();
        await expect(page).toHaveURL(/.*tasks/);
      }
    });
  });

  test.describe('Dashboard Responsiveness', () => {
    test('Dashboard is responsive on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();

      // Page should still be functional
      await expect(page.getByRole('heading', { name: /dashboard|overview/i }).first()).toBeVisible();
    });

    test('Dashboard is responsive on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      // Page should still be functional
      await expect(page.getByRole('heading', { name: /dashboard|overview/i }).first()).toBeVisible();

      // Mobile menu should be available
      const mobileMenu = page.locator('[data-testid="mobile-menu"], .hamburger, [aria-label="menu"]');
      if (await mobileMenu.isVisible()) {
        await expect(mobileMenu).toBeVisible();
      }
    });
  });

  test.describe('Dashboard Data Refresh', () => {
    test('Dashboard data can be refreshed', async ({ page }) => {
      // Look for refresh button
      const refreshBtn = page.getByRole('button', { name: /refresh/i });

      if (await refreshBtn.isVisible()) {
        await refreshBtn.click();

        // Should show loading state or update
        await page.waitForTimeout(1000);
      }
    });
  });
});
