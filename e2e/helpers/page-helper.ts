import { Page, expect } from '@playwright/test';

/**
 * Page helper with common UI interactions
 */
export class PageHelper {
  constructor(private page: Page) {}

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill a form field by label
   */
  async fillField(label: string, value: string): Promise<void> {
    const field = this.page.getByLabel(new RegExp(label, 'i'));
    await field.clear();
    await field.fill(value);
  }

  /**
   * Click a button by text
   */
  async clickButton(text: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(text, 'i') }).click();
  }

  /**
   * Click a link by text
   */
  async clickLink(text: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(text, 'i') }).click();
  }

  /**
   * Select an option from dropdown
   */
  async selectOption(label: string, optionText: string): Promise<void> {
    const select = this.page.getByLabel(new RegExp(label, 'i'));
    await select.click();
    await this.page.getByRole('option', { name: new RegExp(optionText, 'i') }).click();
  }

  /**
   * Check if element is visible
   */
  async isVisible(text: string): Promise<boolean> {
    return this.page.getByText(new RegExp(text, 'i')).isVisible();
  }

  /**
   * Wait for toast/notification
   */
  async waitForToast(text?: string): Promise<void> {
    const toast = this.page.locator('[data-testid="toast"], .toast, [role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });

    if (text) {
      await expect(toast.first()).toContainText(new RegExp(text, 'i'));
    }
  }

  /**
   * Dismiss toast if visible
   */
  async dismissToast(): Promise<void> {
    const closeButton = this.page.locator('[data-testid="toast"] button, .toast button');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }

  /**
   * Navigate to a section via sidebar
   */
  async navigateTo(section: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(section, 'i') }).click();
    await this.waitForPageLoad();
  }

  /**
   * Open create modal
   */
  async openCreateModal(): Promise<void> {
    await this.page.getByRole('button', { name: /create|add|new/i }).first().click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Close modal
   */
  async closeModal(): Promise<void> {
    // Try various ways to close modal
    const closeButton = this.page
      .getByRole('button', { name: /close/i })
      .or(this.page.locator('[data-testid="modal-close"]'))
      .or(this.page.locator('.modal-close'));

    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      // Press Escape
      await this.page.keyboard.press('Escape');
    }
  }

  /**
   * Submit form
   */
  async submitForm(): Promise<void> {
    await this.page.getByRole('button', { name: /save|submit|create|confirm/i }).click();
  }

  /**
   * Get table row by text
   */
  getTableRow(text: string) {
    return this.page.locator(`tr:has-text("${text}")`);
  }

  /**
   * Get card by text
   */
  getCard(text: string) {
    return this.page.locator(`.card:has-text("${text}"), [data-testid*="card"]:has-text("${text}")`);
  }

  /**
   * Confirm dialog
   */
  async confirmDialog(): Promise<void> {
    const confirmBtn = this.page.getByRole('button', { name: /confirm|yes|delete|ok/i });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }
  }

  /**
   * Cancel dialog
   */
  async cancelDialog(): Promise<void> {
    const cancelBtn = this.page.getByRole('button', { name: /cancel|no|close/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  }

  /**
   * Search in list
   */
  async search(query: string): Promise<void> {
    const searchInput = this.page.getByPlaceholder(/search/i);
    await searchInput.clear();
    await searchInput.fill(query);
    await searchInput.press('Enter');
    await this.page.waitForTimeout(500);
  }

  /**
   * Check if empty state is shown
   */
  async hasEmptyState(): Promise<boolean> {
    const emptyState = this.page.locator('[data-testid="empty-state"], .empty-state, :text("No results")');
    return emptyState.isVisible();
  }

  /**
   * Get count from badge/stat
   */
  async getStatCount(label: string): Promise<number> {
    const stat = this.page.locator(`.stat:has-text("${label}"), [data-testid*="stat"]:has-text("${label}")`);
    const text = await stat.textContent();
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }
}
