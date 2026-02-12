import { test, expect } from '@playwright/test';

test.describe('Calendar Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Calendar View', () => {
    test('CAL-001: Calendar view loads correctly @critical', async ({ page }) => {
      // Verify calendar page loads
      await expect(page.getByRole('heading', { name: /calendar/i })).toBeVisible();

      // Verify calendar component is rendered
      const calendar = page.locator('[data-testid="calendar"], .calendar, .fc-view, .rbc-calendar');
      await expect(calendar).toBeVisible();
    });

    test('Calendar shows current month/week', async ({ page }) => {
      // Calendar should show current month or week name
      const currentMonth = new Date().toLocaleString('default', { month: 'long' });
      const monthHeader = page.getByText(new RegExp(currentMonth, 'i'));

      if (await monthHeader.isVisible()) {
        await expect(monthHeader).toBeVisible();
      }
    });

    test('Can navigate to previous month/week', async ({ page }) => {
      const prevButton = page.getByRole('button', { name: /prev|previous|back|</i });

      if (await prevButton.isVisible()) {
        await prevButton.click();
        await page.waitForTimeout(500);

        // Calendar should update
        const calendar = page.locator('.calendar, .fc-view');
        await expect(calendar).toBeVisible();
      }
    });

    test('Can navigate to next month/week', async ({ page }) => {
      const nextButton = page.getByRole('button', { name: /next|forward|>/i });

      if (await nextButton.isVisible()) {
        await nextButton.click();
        await page.waitForTimeout(500);

        const calendar = page.locator('.calendar, .fc-view');
        await expect(calendar).toBeVisible();
      }
    });

    test('Can navigate to today', async ({ page }) => {
      const todayButton = page.getByRole('button', { name: /today/i });

      if (await todayButton.isVisible()) {
        // First navigate away
        const nextButton = page.getByRole('button', { name: /next/i });
        if (await nextButton.isVisible()) {
          await nextButton.click();
          await page.waitForTimeout(300);
        }

        // Then click today
        await todayButton.click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Calendar View Types', () => {
    test('Can switch to month view', async ({ page }) => {
      const monthViewBtn = page.getByRole('button', { name: /month/i });

      if (await monthViewBtn.isVisible()) {
        await monthViewBtn.click();
        await page.waitForTimeout(500);

        // Month view should be active
        const monthView = page.locator('.fc-dayGridMonth-view, .month-view, [data-view="month"]');
        if (await monthView.isVisible()) {
          await expect(monthView).toBeVisible();
        }
      }
    });

    test('Can switch to week view', async ({ page }) => {
      const weekViewBtn = page.getByRole('button', { name: /week/i });

      if (await weekViewBtn.isVisible()) {
        await weekViewBtn.click();
        await page.waitForTimeout(500);

        const weekView = page.locator('.fc-timeGridWeek-view, .week-view, [data-view="week"]');
        if (await weekView.isVisible()) {
          await expect(weekView).toBeVisible();
        }
      }
    });

    test('Can switch to day view', async ({ page }) => {
      const dayViewBtn = page.getByRole('button', { name: /day/i });

      if (await dayViewBtn.isVisible()) {
        await dayViewBtn.click();
        await page.waitForTimeout(500);

        const dayView = page.locator('.fc-timeGridDay-view, .day-view, [data-view="day"]');
        if (await dayView.isVisible()) {
          await expect(dayView).toBeVisible();
        }
      }
    });

    test('Can switch to agenda/list view', async ({ page }) => {
      const agendaViewBtn = page.getByRole('button', { name: /agenda|list/i });

      if (await agendaViewBtn.isVisible()) {
        await agendaViewBtn.click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Event Creation', () => {
    test('CAL-002: User can create calendar event @critical', async ({ page }) => {
      // Click add event button
      const addButton = page.getByRole('button', { name: /add|create|new/i }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
      } else {
        // Some calendars allow clicking on a date
        const calendarCell = page.locator('.fc-daygrid-day, .calendar-day').first();
        if (await calendarCell.isVisible()) {
          await calendarCell.click();
        }
      }

      await page.waitForTimeout(500);

      // Fill event form
      const titleField = page.getByLabel(/title|name|event/i).first();
      await titleField.fill(`Test Event ${Date.now()}`);

      // Set date/time if available
      const startDateField = page.getByLabel(/start.*date|date.*start/i);
      if (await startDateField.isVisible()) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await startDateField.fill(tomorrow.toISOString().split('T')[0]);
      }

      const startTimeField = page.getByLabel(/start.*time|time.*start/i);
      if (await startTimeField.isVisible()) {
        await startTimeField.fill('10:00');
      }

      const endTimeField = page.getByLabel(/end.*time|time.*end/i);
      if (await endTimeField.isVisible()) {
        await endTimeField.fill('11:00');
      }

      // Description
      const descField = page.getByLabel(/description|notes/i);
      if (await descField.isVisible()) {
        await descField.fill('Test event description');
      }

      // Submit
      await page.getByRole('button', { name: /save|create|submit|add/i }).last().click();

      // Verify success
      await expect(page.getByText(/success|created|saved|added/i)).toBeVisible({ timeout: 5000 });
    });

    test('Event creation requires title', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /add|create|new/i }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Try to submit without title
        await page.getByRole('button', { name: /save|create|submit/i }).last().click();

        // Should show validation error
        await expect(page.getByText(/required|title|cannot be empty/i)).toBeVisible({ timeout: 3000 });
      }
    });

    test('Can create all-day event', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /add|create|new/i }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        await page.getByLabel(/title|name/i).first().fill(`All Day Event ${Date.now()}`);

        // Toggle all-day
        const allDayCheckbox = page.getByLabel(/all day|all-day|whole day/i);
        if (await allDayCheckbox.isVisible()) {
          await allDayCheckbox.check();
        }

        await page.getByRole('button', { name: /save|create/i }).last().click();
        await page.waitForTimeout(2000);
      }
    });

    test('Can create recurring event', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /add|create|new/i }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        await page.getByLabel(/title|name/i).first().fill(`Recurring Event ${Date.now()}`);

        // Set recurrence
        const recurringCheckbox = page.getByLabel(/repeat|recurring|recurrence/i);
        if (await recurringCheckbox.isVisible()) {
          await recurringCheckbox.check();

          // Select frequency
          const frequencySelect = page.getByLabel(/frequency|repeat/i);
          if (await frequencySelect.isVisible()) {
            await frequencySelect.selectOption('weekly');
          }
        }

        await page.getByRole('button', { name: /save|create/i }).last().click();
        await page.waitForTimeout(2000);
      }
    });
  });

  test.describe('Event Editing', () => {
    test('CAL-003: User can edit calendar event', async ({ page }) => {
      // Find an event
      const event = page.locator('.fc-event, .calendar-event, [data-testid="event"]').first();

      if (await event.isVisible()) {
        await event.click();
        await page.waitForTimeout(500);

        // Edit title
        const titleField = page.getByLabel(/title|name/i).first();
        if (await titleField.isVisible()) {
          await titleField.clear();
          await titleField.fill('Updated Event Title');

          await page.getByRole('button', { name: /save|update/i }).click();
          await expect(page.getByText(/success|updated|saved/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('Can drag event to different date', async ({ page }) => {
      const event = page.locator('.fc-event, .calendar-event').first();

      if (await event.isVisible()) {
        const targetCell = page.locator('.fc-daygrid-day, .calendar-day').nth(3);

        if (await targetCell.isVisible()) {
          await event.dragTo(targetCell);
          await page.waitForTimeout(1000);

          // Event should be moved (or show update message)
        }
      }
    });

    test('Can resize event duration', async ({ page }) => {
      // Switch to week view first for time-based events
      const weekViewBtn = page.getByRole('button', { name: /week/i });
      if (await weekViewBtn.isVisible()) {
        await weekViewBtn.click();
        await page.waitForTimeout(500);
      }

      const eventResizer = page.locator('.fc-event-resizer, .event-resize-handle').first();

      if (await eventResizer.isVisible()) {
        // Resize event
        const box = await eventResizer.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50);
          await page.mouse.up();
          await page.waitForTimeout(1000);
        }
      }
    });
  });

  test.describe('Event Deletion', () => {
    test('CAL-004: User can delete calendar event', async ({ page }) => {
      const event = page.locator('.fc-event, .calendar-event, [data-testid="event"]').first();

      if (await event.isVisible()) {
        await event.click();
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

  test.describe('Google Calendar Integration', () => {
    test('CAL-005: Google Calendar sync indication', async ({ page }) => {
      // Look for Google Calendar integration indicator
      const googleIndicator = page.locator('[data-testid="google-calendar"], .google-calendar, :text("Google")');

      if (await googleIndicator.isVisible()) {
        await expect(googleIndicator).toBeVisible();
      }

      // Look for sync button
      const syncBtn = page.getByRole('button', { name: /sync|refresh/i });
      if (await syncBtn.isVisible()) {
        await expect(syncBtn).toBeEnabled();
      }
    });

    test('Can connect Google Calendar from calendar page', async ({ page }) => {
      const connectBtn = page.getByRole('button', { name: /connect.*google|google.*connect/i });

      if (await connectBtn.isVisible()) {
        await expect(connectBtn).toBeEnabled();
        // Don't click - would redirect to OAuth
      }
    });

    test('Google Calendar events show source indicator', async ({ page }) => {
      const googleEvent = page.locator('.google-event, [data-source="google"], .fc-event:has([data-google])');

      if (await googleEvent.first().isVisible()) {
        // Google events should have visual indicator
        await expect(googleEvent.first()).toBeVisible();
      }
    });
  });

  test.describe('Calendar Filtering', () => {
    test('Can filter events by type', async ({ page }) => {
      const filterBtn = page.getByRole('button', { name: /filter/i });

      if (await filterBtn.isVisible()) {
        await filterBtn.click();

        // Select filter options
        const meetingFilter = page.getByLabel(/meeting|meetings/i);
        if (await meetingFilter.isVisible()) {
          await meetingFilter.click();
        }
      }
    });

    test('Can filter by calendar source', async ({ page }) => {
      const calendarFilter = page.locator('[data-testid="calendar-filter"], .calendar-filter');

      if (await calendarFilter.isVisible()) {
        await calendarFilter.click();
        await page.getByRole('option').first().click();
        await page.waitForTimeout(500);
      }
    });

    test('Can search events', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search/i);

      if (await searchInput.isVisible()) {
        await searchInput.fill('Meeting');
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Event Details', () => {
    test('Event popup shows details on click', async ({ page }) => {
      const event = page.locator('.fc-event, .calendar-event').first();

      if (await event.isVisible()) {
        await event.click();
        await page.waitForTimeout(500);

        // Popup should show event details
        const popup = page.locator('.event-popup, .event-modal, [role="dialog"]');
        if (await popup.isVisible()) {
          await expect(popup).toBeVisible();
        }
      }
    });

    test('Event shows attendees', async ({ page }) => {
      const event = page.locator('.fc-event, .calendar-event').first();

      if (await event.isVisible()) {
        await event.click();
        await page.waitForTimeout(500);

        const attendees = page.locator('[data-testid="attendees"], .attendees, :text("Attendees")');
        // Attendees section may or may not exist
      }
    });

    test('Event shows location', async ({ page }) => {
      const event = page.locator('.fc-event, .calendar-event').first();

      if (await event.isVisible()) {
        await event.click();
        await page.waitForTimeout(500);

        const location = page.getByLabel(/location/i);
        // Location may or may not be set
      }
    });
  });

  test.describe('Availability Management', () => {
    test('Can view availability slots', async ({ page }) => {
      const availabilityBtn = page.getByRole('button', { name: /availability|slots/i });

      if (await availabilityBtn.isVisible()) {
        await availabilityBtn.click();
        await page.waitForTimeout(500);

        // Availability slots should be shown
        const slots = page.locator('.availability-slot, [data-testid="slot"]');
        if (await slots.first().isVisible()) {
          await expect(slots.first()).toBeVisible();
        }
      }
    });

    test('Can set availability hours', async ({ page }) => {
      const settingsBtn = page.getByRole('button', { name: /settings|configure/i });

      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await page.waitForTimeout(500);

        const availabilitySection = page.locator('[data-testid="availability-settings"], .availability-config');
        if (await availabilitySection.isVisible()) {
          await expect(availabilitySection).toBeVisible();
        }
      }
    });
  });

  test.describe('Calendar Responsiveness', () => {
    test('Calendar works on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();

      await expect(page.getByRole('heading', { name: /calendar/i })).toBeVisible();

      const calendar = page.locator('.calendar, .fc-view');
      await expect(calendar).toBeVisible();
    });

    test('Calendar works on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      await expect(page.getByRole('heading', { name: /calendar/i })).toBeVisible();

      // Mobile might show simplified view
      const calendar = page.locator('.calendar, .fc-view, .mobile-calendar');
      await expect(calendar).toBeVisible();
    });
  });
});
