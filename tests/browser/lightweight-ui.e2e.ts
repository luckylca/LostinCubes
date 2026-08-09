import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function enterDefaultWorld(page: Page): Promise<void> {
  const worldSelection = page.locator('#world-selection');
  await expect(worldSelection).toBeVisible();
  const defaultWorld = worldSelection.locator(
    '[data-world-id="world-fragment-01"]',
  );
  await defaultWorld.locator('[data-action="play"]').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-game-state',
    'ready',
    { timeout: 45_000 },
  );
}

async function seedArmor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface SeedSlot {
      item: string | null;
      count: number;
      durability: number | null;
    }
    const slots: SeedSlot[] = Array.from({ length: 36 }, () => ({
      item: null,
      count: 0,
      durability: null,
    }));
    slots[0] = { item: 'iron-helmet', count: 1, durability: null };
    slots[1] = { item: 'iron-chestplate', count: 1, durability: null };
    slots[2] = { item: 'iron-leggings', count: 1, durability: null };
    slots[3] = { item: 'iron-boots', count: 1, durability: null };
    slots[27] = { item: 'iron-pickaxe', count: 1, durability: 250 };
    localStorage.setItem(
      'lost-in-cubes:inventory:world-fragment-01',
      JSON.stringify({ version: 3, selectedSlot: 0, slots }),
    );
  });
}

test('restores lightweight inventory presentation and pause menu', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await seedArmor(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await enterDefaultWorld(page);

  const canvas = page.locator('#game-canvas');
  await page.keyboard.press('e');
  const inventory = page.locator('#inventory-screen');
  await expect(inventory).toBeVisible();
  await expect(page.locator('.player-equipment-panel')).toBeVisible();
  await expect(page.locator('.equipment-slot')).toHaveCount(4);
  await expect(page.locator('[data-player-preview]')).toHaveClass(/wearing-head/);
  await expect(page.locator('[data-player-preview]')).toHaveClass(/wearing-chest/);
  await expect(page.locator('[data-player-preview]')).toHaveClass(/wearing-legs/);
  await expect(page.locator('[data-player-preview]')).toHaveClass(/wearing-feet/);

  const recipeDrawer = page.locator('.recipe-drawer');
  await expect(recipeDrawer).toBeVisible();
  await expect(recipeDrawer).not.toHaveAttribute('open', '');
  await recipeDrawer.locator('summary').click();
  await expect(recipeDrawer).toHaveAttribute('open', '');
  await expect(page.locator('.recipe-card')).not.toHaveCount(0);

  await page.keyboard.press('e');
  await expect(inventory).toBeHidden();

  await page.keyboard.press('Escape');
  const pause = page.locator('#pause-screen');
  await expect(pause).toBeVisible();
  await expect(pause.locator('[data-runtime-loading]')).toBeVisible();
  await expect(pause.locator('[data-render-quality]')).toHaveCount(0);

  const pausedTime = Number(await canvas.getAttribute('data-day-time'));
  await page.waitForTimeout(250);
  expect(Number(await canvas.getAttribute('data-day-time'))).toBe(pausedTime);

  await page.keyboard.press('e');
  await expect(inventory).toBeHidden();
  await expect(pause).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(pause).toBeHidden();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-day-time')))
    .toBeGreaterThan(pausedTime);

  expect(runtimeErrors).toEqual([]);
});
