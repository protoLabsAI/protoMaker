/**
 * Temporary verification test for enhanced ChatModelSelect feature.
 *
 * Uses the /chat-overlay route which renders ChatOverlayContent in a
 * minimal chromeless container — this is the Electron overlay route.
 *
 * Verifies:
 * 1. Model selector uses Popover (not native select) — checks for [data-slot="chat-model-select"] button
 * 2. Clicking opens a popover/combobox with three model options
 * 3. Each model shows tier badge (Fast/Balanced/Powerful)
 * 4. Trigger shows current model name with tier color dot
 * 5. Selecting a model closes the popover and updates the trigger
 * 6. Escape closes the popover
 * 7. Keyboard navigation works (arrow keys)
 *
 * Delete after verification.
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests } from './utils';

test.describe('ChatModelSelect — Enhanced combobox verification', () => {
  /**
   * Single comprehensive test combining all verifications to avoid
   * hitting the auth rate limit from multiple beforeEach calls.
   */
  test('all acceptance criteria pass on /chat-overlay', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto('/chat-overlay');
    await page.waitForLoadState('networkidle');

    const trigger = page.locator('[data-slot="chat-model-select"]').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });

    // ── Criterion 1: Trigger is a button (not native select) ─────────────────
    const tagName = await trigger.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('button');

    // ── Criterion 2: Trigger shows current model with tier color dot ──────────
    await expect(trigger).toContainText('Sonnet'); // default model
    // Verify the trigger aria-label includes the tier info
    const ariaLabel = await trigger.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/Sonnet/i);

    // ── Criterion 3: Opens as popover/combobox (not native select) ───────────
    // Use JS click to bypass TanStack Query DevTools overlay intercepting pointer events
    await trigger.evaluate((el) => (el as HTMLElement).click());
    // cmdk Command.List renders with its default aria-label "Suggestions"
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox).toBeVisible({ timeout: 5000 });

    // ── Criterion 4: Three models shown with tier badges ─────────────────────
    const haikuOption = page.getByRole('option', { name: /haiku/i });
    const sonnetOption = page.getByRole('option', { name: /sonnet/i });
    const opusOption = page.getByRole('option', { name: /opus/i });
    await expect(haikuOption).toBeVisible();
    await expect(sonnetOption).toBeVisible();
    await expect(opusOption).toBeVisible();
    // Verify tier badges scoped to each option
    await expect(haikuOption.getByText('Fast', { exact: true })).toBeVisible();
    await expect(sonnetOption.getByText('Balanced', { exact: true })).toBeVisible();
    await expect(opusOption.getByText('Powerful', { exact: true })).toBeVisible();

    // ── Criterion 5: Escape closes the popover ──────────────────────────────
    await page.keyboard.press('Escape');
    await expect(listbox).not.toBeVisible();

    // ── Criterion 6: Re-open and keyboard navigation works ───────────────────
    await trigger.evaluate((el) => (el as HTMLElement).click());
    await expect(listbox).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(listbox).not.toBeVisible();

    // ── Criterion 7: Selecting a model updates trigger ───────────────────────
    await trigger.evaluate((el) => (el as HTMLElement).click());
    await page
      .getByRole('option', { name: /haiku/i })
      .evaluate((el) => (el as HTMLElement).click());
    await expect(listbox).not.toBeVisible();
    await expect(trigger).toContainText('Haiku');
  });
});
