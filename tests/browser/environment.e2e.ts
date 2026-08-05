import { expect, test } from '@playwright/test';

test('presents biome, oxygen, sneak, and survival tutorial state', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-game-state',
    'ready',
    { timeout: 45_000 },
  );

  const canvas = page.locator('#game-canvas');
  const environment = page.locator('#survival-environment-status');
  await expect(canvas).toHaveAttribute('data-biome', '平原');
  await expect(canvas).toHaveAttribute('data-environment', '陆地');
  await expect(canvas).toHaveAttribute('data-player-air', '300');
  await expect(environment).toContainText('平原 · 陆地');

  await page.keyboard.down('ControlLeft');
  await expect(canvas).toHaveAttribute('data-environment', '潜行');
  await expect(environment).toContainText('潜行');
  await page.keyboard.up('ControlLeft');
  await expect(canvas).toHaveAttribute('data-environment', '陆地');

  const guide = page.locator('#survival-guide');
  await guide.locator('summary').click();
  await guide.locator('label[for="tutorial-page-4"]').click();
  const survivalPage = guide.locator('.tutorial-page-4');
  await expect(survivalPage).toBeVisible();
  await expect(survivalPage).toContainText('氧气');
  await expect(survivalPage).toContainText('岩浆');
  await expect(survivalPage).toContainText('树苗');

  await expect(page.locator('[data-action="sneak"]')).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});
