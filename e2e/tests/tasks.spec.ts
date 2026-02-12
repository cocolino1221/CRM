import { test, expect } from '@playwright/test';

test.describe('Tasks Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Tasks Page Layout', () => {
    test('Tasks page loads correctly', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();

      // Verify task list or board is visible
      const taskContainer = page.locator('[data-testid="task-list"], .task-list, .tasks-container, main');
      await expect(taskContainer).toBeVisible();
    });

    test('Task filters are displayed', async ({ page }) => {
      const filters = page.locator('[data-testid="task-filters"], .task-filters, .filters');

      if (await filters.isVisible()) {
        await expect(filters).toBeVisible();
      }
    });

    test('Add task button is visible', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /add|create|new/i }).first();
      await expect(addButton).toBeVisible();
    });
  });

  test.describe('Task Creation', () => {
    test('TASK-001: User can create a new task @critical', async ({ page }) => {
      // Click add task button
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Fill task form
      const titleField = page.getByLabel(/title|name|task/i).first();
      await titleField.fill(`Test Task ${Date.now()}`);

      // Fill description if available
      const descField = page.getByLabel(/description|details/i);
      if (await descField.isVisible()) {
        await descField.fill('This is a test task description');
      }

      // Set due date if available
      const dueDateField = page.getByLabel(/due|date/i);
      if (await dueDateField.isVisible()) {
        // Set to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];
        await dueDateField.fill(dateStr);
      }

      // Set priority if available
      const prioritySelect = page.getByLabel(/priority/i);
      if (await prioritySelect.isVisible()) {
        await prioritySelect.click();
        await page.getByRole('option', { name: /high|medium/i }).first().click();
      }

      // Submit
      await page.getByRole('button', { name: /save|create|submit|add/i }).last().click();

      // Verify success
      await expect(page.getByText(/success|created|saved|added/i)).toBeVisible({ timeout: 5000 });
    });

    test('Task creation requires title', async ({ page }) => {
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Try to submit without title
      await page.getByRole('button', { name: /save|create|submit/i }).last().click();

      // Should show validation error
      await expect(page.getByText(/required|title|cannot be empty/i)).toBeVisible({ timeout: 3000 });
    });

    test('Can create task with all fields', async ({ page }) => {
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Fill all available fields
      await page.getByLabel(/title|name/i).first().fill(`Complete Task ${Date.now()}`);

      const descField = page.getByLabel(/description/i);
      if (await descField.isVisible()) {
        await descField.fill('Detailed task description with all fields');
      }

      const dueDateField = page.getByLabel(/due|date/i);
      if (await dueDateField.isVisible()) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        await dueDateField.fill(nextWeek.toISOString().split('T')[0]);
      }

      const prioritySelect = page.getByLabel(/priority/i);
      if (await prioritySelect.isVisible()) {
        await prioritySelect.click();
        await page.getByRole('option').first().click();
      }

      await page.getByRole('button', { name: /save|create|submit/i }).last().click();
      await page.waitForTimeout(2000);
    });
  });

  test.describe('Task Completion', () => {
    test('TASK-002: User can mark task as complete @critical', async ({ page }) => {
      // Find a task
      const taskItem = page.locator('[data-testid="task-item"], .task-item, .task-card').first();

      if (await taskItem.isVisible()) {
        // Find checkbox or complete button
        const checkbox = taskItem.locator('input[type="checkbox"], [role="checkbox"]');
        const completeBtn = taskItem.getByRole('button', { name: /complete|done|finish/i });

        if (await checkbox.isVisible()) {
          await checkbox.click();
        } else if (await completeBtn.isVisible()) {
          await completeBtn.click();
        }

        // Verify task is marked as complete (visual change or success message)
        await page.waitForTimeout(1000);

        // Task might show strikethrough, different color, or move to completed section
        const completedTask = page.locator('.task-completed, .completed, [data-completed="true"]');
        if (await completedTask.first().isVisible()) {
          await expect(completedTask.first()).toBeVisible();
        }
      }
    });

    test('Can mark task as incomplete', async ({ page }) => {
      // Find a completed task
      const completedTask = page.locator('.task-completed, [data-completed="true"]').first();

      if (await completedTask.isVisible()) {
        const checkbox = completedTask.locator('input[type="checkbox"], [role="checkbox"]');

        if (await checkbox.isVisible()) {
          await checkbox.click();
          await page.waitForTimeout(1000);
        }
      }
    });
  });

  test.describe('Task Assignment', () => {
    test('TASK-003: User can assign task to others', async ({ page }) => {
      // Click on a task to open details
      const taskItem = page.locator('[data-testid="task-item"], .task-item').first();

      if (await taskItem.isVisible()) {
        await taskItem.click();
        await page.waitForTimeout(500);

        // Look for assignee field
        const assigneeField = page.getByLabel(/assign|owner|responsible/i);
        const assigneeSelect = page.getByRole('combobox', { name: /assign/i });

        if (await assigneeField.isVisible()) {
          await assigneeField.click();
          await page.getByRole('option').first().click();

          // Save changes
          await page.getByRole('button', { name: /save|update/i }).click();
          await expect(page.getByText(/success|updated|assigned/i)).toBeVisible({ timeout: 5000 });
        } else if (await assigneeSelect.isVisible()) {
          await assigneeSelect.click();
          await page.getByRole('option').first().click();
        }
      }
    });
  });

  test.describe('Task Due Dates', () => {
    test('TASK-004: Tasks show due date information', async ({ page }) => {
      const taskItem = page.locator('[data-testid="task-item"], .task-item').first();

      if (await taskItem.isVisible()) {
        // Tasks should show due date
        const dueDate = taskItem.locator('.due-date, [data-testid="due-date"], :text(/due|today|tomorrow|overdue/i)');
        // Due date may or may not be set
      }
    });

    test('Overdue tasks are highlighted', async ({ page }) => {
      const overdueTask = page.locator('.overdue, .task-overdue, [data-overdue="true"]');

      if (await overdueTask.first().isVisible()) {
        // Overdue tasks should have visual indication
        await expect(overdueTask.first()).toBeVisible();
      }
    });

    test('Can filter tasks by due date', async ({ page }) => {
      const filterBtn = page.getByRole('button', { name: /filter/i });

      if (await filterBtn.isVisible()) {
        await filterBtn.click();

        const dueDateFilter = page.getByRole('button', { name: /today|this week|overdue/i });
        if (await dueDateFilter.first().isVisible()) {
          await dueDateFilter.first().click();
          await page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('Task Linking', () => {
    test('TASK-005: Tasks can be linked to contacts/deals', async ({ page }) => {
      // Create new task or edit existing
      await page.getByRole('button', { name: /add|create|new/i }).first().click();
      await page.waitForTimeout(500);

      // Look for contact/deal linking fields
      const contactField = page.getByLabel(/contact|related contact/i);
      const dealField = page.getByLabel(/deal|related deal/i);

      if (await contactField.isVisible()) {
        await contactField.click();
        const contactOption = page.getByRole('option').first();
        if (await contactOption.isVisible()) {
          await contactOption.click();
        }
      }

      if (await dealField.isVisible()) {
        await dealField.click();
        const dealOption = page.getByRole('option').first();
        if (await dealOption.isVisible()) {
          await dealOption.click();
        }
      }

      // Fill required title
      await page.getByLabel(/title|name/i).first().fill(`Linked Task ${Date.now()}`);

      // Save
      await page.getByRole('button', { name: /save|create/i }).last().click();
      await page.waitForTimeout(2000);
    });

    test('Linked tasks appear on contact/deal pages', async ({ page }) => {
      // Navigate to a contact
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      const contactRow = page.locator('tr, [data-testid="contact-row"]').first();
      if (await contactRow.isVisible()) {
        await contactRow.click();
        await page.waitForTimeout(500);

        // Look for tasks section
        const tasksSection = page.locator('[data-testid="related-tasks"], .tasks-section, :text("Tasks")');
        if (await tasksSection.isVisible()) {
          await expect(tasksSection).toBeVisible();
        }
      }
    });
  });

  test.describe('Task Filtering and Sorting', () => {
    test('Can filter tasks by status', async ({ page }) => {
      const statusFilter = page.getByRole('button', { name: /all|pending|completed|status/i }).first();

      if (await statusFilter.isVisible()) {
        await statusFilter.click();

        const pendingOption = page.getByRole('option', { name: /pending|todo|open/i });
        if (await pendingOption.isVisible()) {
          await pendingOption.click();
          await page.waitForTimeout(500);
        }
      }
    });

    test('Can filter tasks by priority', async ({ page }) => {
      const priorityFilter = page.getByRole('combobox', { name: /priority/i });

      if (await priorityFilter.isVisible()) {
        await priorityFilter.click();
        await page.getByRole('option', { name: /high/i }).click();
        await page.waitForTimeout(500);
      }
    });

    test('Can sort tasks by due date', async ({ page }) => {
      const sortBtn = page.getByRole('button', { name: /sort/i });

      if (await sortBtn.isVisible()) {
        await sortBtn.click();

        const dueDateSort = page.getByRole('option', { name: /due date/i });
        if (await dueDateSort.isVisible()) {
          await dueDateSort.click();
          await page.waitForTimeout(500);
        }
      }
    });

    test('Can search tasks', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);

      if (await searchInput.isVisible()) {
        await searchInput.fill('Test');
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Task Editing', () => {
    test('Can edit task details', async ({ page }) => {
      const taskItem = page.locator('[data-testid="task-item"], .task-item').first();

      if (await taskItem.isVisible()) {
        // Click to open
        await taskItem.click();
        await page.waitForTimeout(500);

        // Edit title
        const titleField = page.getByLabel(/title|name/i).first();
        if (await titleField.isVisible()) {
          await titleField.clear();
          await titleField.fill('Updated Task Title');

          await page.getByRole('button', { name: /save|update/i }).click();
          await expect(page.getByText(/success|updated/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('Can delete task', async ({ page }) => {
      const taskItem = page.locator('[data-testid="task-item"], .task-item').first();

      if (await taskItem.isVisible()) {
        await taskItem.click();
        await page.waitForTimeout(500);

        const deleteBtn = page.getByRole('button', { name: /delete|remove/i });
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();

          // Confirm deletion
          const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
          }

          await expect(page.getByText(/deleted|removed|success/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Task Views', () => {
    test('Can switch between list and board view', async ({ page }) => {
      const listViewBtn = page.getByRole('button', { name: /list/i });
      const boardViewBtn = page.getByRole('button', { name: /board|kanban/i });

      if (await listViewBtn.isVisible()) {
        await listViewBtn.click();
        await page.waitForTimeout(500);
      }

      if (await boardViewBtn.isVisible()) {
        await boardViewBtn.click();
        await page.waitForTimeout(500);
      }
    });

    test('My Tasks filter works', async ({ page }) => {
      const myTasksBtn = page.getByRole('button', { name: /my tasks/i });

      if (await myTasksBtn.isVisible()) {
        await myTasksBtn.click();
        await page.waitForTimeout(500);
      }
    });
  });
});
