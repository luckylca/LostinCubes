import { expect, test } from '@playwright/test';

test('creates a fresh world and starts its chunk renderer cleanly', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });

  const worldSelection = page.locator('#world-selection');
  await expect(worldSelection).toBeVisible();

  const createForm = worldSelection.locator('.world-create-form');
  await createForm.locator('input[name="name"]').fill('CI 新世界');
  await createForm.locator('input[name="seed"]').fill('ci-new-world-rendering');
  await createForm.locator('button[type="submit"]').click();

  await expect(page.locator('html')).toHaveAttribute(
    'data-game-state',
    'ready',
    { timeout: 45_000 },
  );
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveClass(/is-hidden/);

  const status = page.locator('#hud-status');
  await expect(status).toContainText('区块');
  await expect(status).toContainText('四边形');
  await expect
    .poll(async () => {
      const text = (await status.textContent()) ?? '';
      const match = /([0-9]+(?:\.[0-9]+)?)(k?) 四边形/.exec(text);
      if (match === null) return 0;
      const value = Number(match[1]);
      return match[2] === 'k' ? value * 1_000 : value;
    })
    .toBeGreaterThan(0);

  expect(runtimeErrors).toEqual([]);
});
