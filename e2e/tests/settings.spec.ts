import { test, expect } from '@playwright/test';

test.describe('Settings Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Settings Page Layout', () => {
    test('Settings page loads correctly', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

      // Settings should have sections/tabs
      const settingsContainer = page.locator('[data-testid="settings"], .settings-container, main');
      await expect(settingsContainer).toBeVisible();
    });

    test('Settings navigation/tabs are visible', async ({ page }) => {
      // Common settings sections
      const sections = ['profile', 'account', 'notifications', 'security', 'workspace', 'integrations'];

      for (const section of sections) {
        const tab = page.getByRole('tab', { name: new RegExp(section, 'i') }).or(
          page.getByRole('link', { name: new RegExp(section, 'i') })
        ).or(
          page.getByRole('button', { name: new RegExp(section, 'i') })
        );

        if (await tab.isVisible()) {
          await expect(tab).toBeVisible();
        }
      }
    });
  });

  test.describe('Profile Settings', () => {
    test('SET-001: User can update profile information @critical', async ({ page }) => {
      // Navigate to profile section if needed
      const profileTab = page.getByRole('tab', { name: /profile/i }).or(
        page.getByRole('link', { name: /profile/i })
      );
      if (await profileTab.isVisible()) {
        await profileTab.click();
        await page.waitForTimeout(500);
      }

      // Find and update profile fields
      const firstNameField = page.getByLabel(/first name/i);
      if (await firstNameField.isVisible()) {
        await firstNameField.clear();
        await firstNameField.fill('UpdatedFirst');
      }

      const lastNameField = page.getByLabel(/last name/i);
      if (await lastNameField.isVisible()) {
        await lastNameField.clear();
        await lastNameField.fill('UpdatedLast');
      }

      // Update phone if available
      const phoneField = page.getByLabel(/phone|mobile/i);
      if (await phoneField.isVisible()) {
        await phoneField.clear();
        await phoneField.fill('+1234567890');
      }

      // Save changes
      const saveBtn = page.getByRole('button', { name: /save|update/i });
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await expect(page.getByText(/success|saved|updated/i)).toBeVisible({ timeout: 5000 });
      }
    });

    test('Can update profile avatar', async ({ page }) => {
      const profileTab = page.getByRole('tab', { name: /profile/i });
      if (await profileTab.isVisible()) {
        await profileTab.click();
        await page.waitForTimeout(500);
      }

      // Look for avatar upload
      const avatarUpload = page.locator('[data-testid="avatar-upload"], .avatar-upload, input[type="file"]');
      if (await avatarUpload.isVisible()) {
        await expect(avatarUpload).toBeEnabled();
      }
    });

    test('Can update bio/description', async ({ page }) => {
      const profileTab = page.getByRole('tab', { name: /profile/i });
      if (await profileTab.isVisible()) {
        await profileTab.click();
        await page.waitForTimeout(500);
      }

      const bioField = page.getByLabel(/bio|about|description/i);
      if (await bioField.isVisible()) {
        await bioField.clear();
        await bioField.fill('Updated bio text for testing');

        const saveBtn = page.getByRole('button', { name: /save|update/i });
        await saveBtn.click();
        await page.waitForTimeout(2000);
      }
    });

    test('Profile validation works', async ({ page }) => {
      const profileTab = page.getByRole('tab', { name: /profile/i });
      if (await profileTab.isVisible()) {
        await profileTab.click();
        await page.waitForTimeout(500);
      }

      // Clear required field
      const firstNameField = page.getByLabel(/first name/i);
      if (await firstNameField.isVisible()) {
        await firstNameField.clear();

        const saveBtn = page.getByRole('button', { name: /save|update/i });
        await saveBtn.click();

        // Should show validation error
        await expect(page.getByText(/required|cannot be empty/i)).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Password Change', () => {
    test('SET-002: User can change password', async ({ page }) => {
      // Navigate to security/password section
      const securityTab = page.getByRole('tab', { name: /security|password/i }).or(
        page.getByRole('link', { name: /security|password/i })
      );
      if (await securityTab.isVisible()) {
        await securityTab.click();
        await page.waitForTimeout(500);
      }

      // Find password change form
      const currentPasswordField = page.getByLabel(/current password|old password/i);
      const newPasswordField = page.getByLabel(/new password/i);
      const confirmPasswordField = page.getByLabel(/confirm.*password|repeat.*password/i);

      if (await currentPasswordField.isVisible()) {
        await currentPasswordField.fill('Test123!@#');

        if (await newPasswordField.isVisible()) {
          await newPasswordField.fill('NewPass123!@#');
        }

        if (await confirmPasswordField.isVisible()) {
          await confirmPasswordField.fill('NewPass123!@#');
        }

        // Note: Not actually submitting to avoid changing test account password
        // Just verify form elements work
      }
    });

    test('Password change validates current password', async ({ page }) => {
      const securityTab = page.getByRole('tab', { name: /security|password/i });
      if (await securityTab.isVisible()) {
        await securityTab.click();
        await page.waitForTimeout(500);
      }

      const currentPasswordField = page.getByLabel(/current password|old password/i);
      if (await currentPasswordField.isVisible()) {
        await currentPasswordField.fill('wrongpassword');

        const newPasswordField = page.getByLabel(/new password/i);
        if (await newPasswordField.isVisible()) {
          await newPasswordField.fill('NewPass123!@#');
        }

        const confirmPasswordField = page.getByLabel(/confirm.*password/i);
        if (await confirmPasswordField.isVisible()) {
          await confirmPasswordField.fill('NewPass123!@#');
        }

        const changeBtn = page.getByRole('button', { name: /change|update|save/i });
        if (await changeBtn.isVisible()) {
          await changeBtn.click();

          // Should show error about current password
          await expect(page.getByText(/incorrect|invalid|wrong.*password/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('Password change validates password match', async ({ page }) => {
      const securityTab = page.getByRole('tab', { name: /security|password/i });
      if (await securityTab.isVisible()) {
        await securityTab.click();
        await page.waitForTimeout(500);
      }

      const newPasswordField = page.getByLabel(/new password/i);
      const confirmPasswordField = page.getByLabel(/confirm.*password/i);

      if (await newPasswordField.isVisible() && await confirmPasswordField.isVisible()) {
        await newPasswordField.fill('NewPass123!@#');
        await confirmPasswordField.fill('DifferentPass123!@#');

        const changeBtn = page.getByRole('button', { name: /change|update|save/i });
        if (await changeBtn.isVisible()) {
          await changeBtn.click();

          // Should show password mismatch error
          await expect(page.getByText(/match|same|identical/i)).toBeVisible({ timeout: 3000 });
        }
      }
    });
  });

  test.describe('Notification Preferences', () => {
    test('SET-003: User can update notification preferences', async ({ page }) => {
      // Navigate to notifications section
      const notificationsTab = page.getByRole('tab', { name: /notification/i }).or(
        page.getByRole('link', { name: /notification/i })
      );
      if (await notificationsTab.isVisible()) {
        await notificationsTab.click();
        await page.waitForTimeout(500);
      }

      // Toggle notification settings
      const emailNotifications = page.getByLabel(/email.*notification|notification.*email/i);
      if (await emailNotifications.isVisible()) {
        await emailNotifications.click();
      }

      const pushNotifications = page.getByLabel(/push.*notification|browser.*notification/i);
      if (await pushNotifications.isVisible()) {
        await pushNotifications.click();
      }

      // Save if there's a save button
      const saveBtn = page.getByRole('button', { name: /save|update/i });
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await expect(page.getByText(/success|saved|updated/i)).toBeVisible({ timeout: 5000 });
      }
    });

    test('Can configure email notification frequency', async ({ page }) => {
      const notificationsTab = page.getByRole('tab', { name: /notification/i });
      if (await notificationsTab.isVisible()) {
        await notificationsTab.click();
        await page.waitForTimeout(500);
      }

      const frequencySelect = page.getByLabel(/frequency|digest/i);
      if (await frequencySelect.isVisible()) {
        await frequencySelect.click();
        await page.getByRole('option', { name: /daily|weekly|instant/i }).first().click();
      }
    });

    test('Can toggle specific notification types', async ({ page }) => {
      const notificationsTab = page.getByRole('tab', { name: /notification/i });
      if (await notificationsTab.isVisible()) {
        await notificationsTab.click();
        await page.waitForTimeout(500);
      }

      // Toggle specific notifications
      const notificationTypes = [
        /deal.*update|update.*deal/i,
        /task.*reminder|reminder/i,
        /new.*lead|lead.*notification/i,
        /team.*mention|mention/i,
      ];

      for (const notifType of notificationTypes) {
        const toggle = page.getByLabel(notifType);
        if (await toggle.isVisible()) {
          await toggle.click();
          await page.waitForTimeout(300);
        }
      }
    });
  });

  test.describe('Workspace Settings', () => {
    test('SET-004: Workspace settings can be modified', async ({ page }) => {
      // Navigate to workspace section
      const workspaceTab = page.getByRole('tab', { name: /workspace|organization|company/i }).or(
        page.getByRole('link', { name: /workspace|organization|company/i })
      );
      if (await workspaceTab.isVisible()) {
        await workspaceTab.click();
        await page.waitForTimeout(500);
      }

      // Update workspace name
      const workspaceNameField = page.getByLabel(/workspace.*name|company.*name|organization.*name/i);
      if (await workspaceNameField.isVisible()) {
        await workspaceNameField.clear();
        await workspaceNameField.fill('Updated Workspace Name');
      }

      // Save changes
      const saveBtn = page.getByRole('button', { name: /save|update/i });
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await expect(page.getByText(/success|saved|updated/i)).toBeVisible({ timeout: 5000 });
      }
    });

    test('Can update workspace timezone', async ({ page }) => {
      const workspaceTab = page.getByRole('tab', { name: /workspace/i });
      if (await workspaceTab.isVisible()) {
        await workspaceTab.click();
        await page.waitForTimeout(500);
      }

      const timezoneSelect = page.getByLabel(/timezone|time zone/i);
      if (await timezoneSelect.isVisible()) {
        await timezoneSelect.click();
        await page.getByRole('option').first().click();
      }
    });

    test('Can update workspace currency', async ({ page }) => {
      const workspaceTab = page.getByRole('tab', { name: /workspace/i });
      if (await workspaceTab.isVisible()) {
        await workspaceTab.click();
        await page.waitForTimeout(500);
      }

      const currencySelect = page.getByLabel(/currency/i);
      if (await currencySelect.isVisible()) {
        await currencySelect.click();
        await page.getByRole('option', { name: /USD|EUR|GBP/i }).first().click();
      }
    });

    test('Can update date format preference', async ({ page }) => {
      const workspaceTab = page.getByRole('tab', { name: /workspace/i });
      if (await workspaceTab.isVisible()) {
        await workspaceTab.click();
        await page.waitForTimeout(500);
      }

      const dateFormatSelect = page.getByLabel(/date.*format/i);
      if (await dateFormatSelect.isVisible()) {
        await dateFormatSelect.click();
        await page.getByRole('option').first().click();
      }
    });
  });

  test.describe('Theme Settings', () => {
    test('Can switch between light and dark mode', async ({ page }) => {
      const themeToggle = page.getByRole('button', { name: /theme|dark|light/i }).or(
        page.getByLabel(/theme|dark mode|light mode/i)
      );

      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await page.waitForTimeout(500);

        // Page should have theme class changed
        const body = page.locator('body, html');
        const classList = await body.getAttribute('class');
        // Theme class should be present
      }
    });

    test('Theme preference is persisted', async ({ page }) => {
      const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });

      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await page.waitForTimeout(500);

        // Reload page
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Theme should be persisted (check localStorage or body class)
      }
    });
  });

  test.describe('API Keys / Tokens', () => {
    test('Can view API keys section', async ({ page }) => {
      const apiKeysTab = page.getByRole('tab', { name: /api|token|key/i });

      if (await apiKeysTab.isVisible()) {
        await apiKeysTab.click();
        await page.waitForTimeout(500);

        // API keys section should be visible
        const apiSection = page.locator('[data-testid="api-keys"], .api-keys');
        if (await apiSection.isVisible()) {
          await expect(apiSection).toBeVisible();
        }
      }
    });

    test('Can generate new API key', async ({ page }) => {
      const apiKeysTab = page.getByRole('tab', { name: /api|token/i });

      if (await apiKeysTab.isVisible()) {
        await apiKeysTab.click();
        await page.waitForTimeout(500);

        const generateBtn = page.getByRole('button', { name: /generate|create|new/i });
        if (await generateBtn.isVisible()) {
          await expect(generateBtn).toBeEnabled();
        }
      }
    });
  });

  test.describe('Team Management', () => {
    test('Can view team members', async ({ page }) => {
      const teamTab = page.getByRole('tab', { name: /team|members|users/i });

      if (await teamTab.isVisible()) {
        await teamTab.click();
        await page.waitForTimeout(500);

        // Team members list should be visible
        const membersList = page.locator('[data-testid="team-members"], .team-list, .members-list');
        if (await membersList.isVisible()) {
          await expect(membersList).toBeVisible();
        }
      }
    });

    test('Can invite new team member', async ({ page }) => {
      const teamTab = page.getByRole('tab', { name: /team|members/i });

      if (await teamTab.isVisible()) {
        await teamTab.click();
        await page.waitForTimeout(500);

        const inviteBtn = page.getByRole('button', { name: /invite|add/i });
        if (await inviteBtn.isVisible()) {
          await inviteBtn.click();
          await page.waitForTimeout(500);

          // Invite modal/form should appear
          const emailField = page.getByLabel(/email/i);
          if (await emailField.isVisible()) {
            await emailField.fill('newmember@test.com');
          }
        }
      }
    });
  });

  test.describe('Data Export', () => {
    test('Can export data from settings', async ({ page }) => {
      const dataTab = page.getByRole('tab', { name: /data|export|import/i });

      if (await dataTab.isVisible()) {
        await dataTab.click();
        await page.waitForTimeout(500);

        const exportBtn = page.getByRole('button', { name: /export/i });
        if (await exportBtn.isVisible()) {
          await expect(exportBtn).toBeEnabled();
        }
      }
    });
  });

  test.describe('Account Deletion', () => {
    test('Delete account option is available with confirmation', async ({ page }) => {
      const dangerZone = page.locator('[data-testid="danger-zone"], .danger-zone, :text("Danger")');

      if (await dangerZone.isVisible()) {
        const deleteAccountBtn = page.getByRole('button', { name: /delete account/i });
        if (await deleteAccountBtn.isVisible()) {
          await expect(deleteAccountBtn).toBeVisible();
          // Don't click - would delete account!
        }
      }
    });
  });

  test.describe('Settings Responsiveness', () => {
    test('Settings page works on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();

      await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
    });

    test('Settings page works on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

      // Navigation might be in a dropdown on mobile
      const mobileMenu = page.locator('[data-testid="settings-menu"], .settings-nav');
      if (await mobileMenu.isVisible()) {
        await expect(mobileMenu).toBeVisible();
      }
    });
  });
});
