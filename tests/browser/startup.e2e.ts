import { expect, test } from '@playwright/test';

test('boots the playable world and exposes the hotbar', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'ready', {
    timeout: 45_000,
  });
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveClass(/is-hidden/);
  await expect(page.locator('#hotbar .hotbar-slot')).toHaveCount(9);
  await expect(page.locator('#hotbar .hotbar-slot.is-selected')).toHaveCount(1);

  await page.keyboard.press('3');
  await expect(page.locator('#hotbar .hotbar-slot').nth(2)).toHaveClass(
    /is-selected/,
  );

  await page.keyboard.press('v');
  await expect(page.locator('#hud-view')).toContainText('第一人称');

  const canvasBounds = await page.locator('#game-canvas').boundingBox();
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(100);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(100);
  expect(runtimeErrors).toEqual([]);
});
