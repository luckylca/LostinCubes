import { expect, test } from '@playwright/test';

test('boots the playable world and exposes blocks and tools', async ({ page }) => {
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
  await expect(page.locator('#hotbar .hotbar-slot').nth(4)).toHaveAttribute(
    'aria-label',
    /木铲.*耐久 48\/48/,
  );
  await expect(page.locator('#hotbar .hotbar-slot').nth(5)).toHaveAttribute(
    'aria-label',
    /木镐.*耐久 64\/64/,
  );
  await expect(page.locator('#target-reticle')).toHaveCount(1);
  await expect(page.locator('#game-canvas')).toHaveAttribute(
    'data-camera-mode',
    'third-person',
  );
  await expect(page.locator('body')).toHaveClass(/camera-third-person/);
  await expect(page.locator('#crosshair')).toHaveCSS('opacity', '0');

  await page.keyboard.press('5');
  await expect(page.locator('#hotbar .hotbar-slot').nth(4)).toHaveClass(
    /is-selected/,
  );
  await expect(page.locator('#hud-view')).toContainText('木铲');

  await page.keyboard.press('v');
  await expect(page.locator('#hud-view')).toContainText('第一人称');
  await expect(page.locator('#game-canvas')).toHaveAttribute(
    'data-camera-mode',
    'first-person',
  );
  await expect(page.locator('body')).not.toHaveClass(/camera-third-person/);
  await expect(page.locator('#crosshair')).toHaveCSS('opacity', '1');

  const canvasBounds = await page.locator('#game-canvas').boundingBox();
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(100);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(100);
  expect(runtimeErrors).toEqual([]);
});
