import { expect, test } from '@playwright/test';

test('boots persisted survival, food, crafting, and camera controls', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

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
    slots[0] = { item: 'oak-log-block', count: 2, durability: null };
    slots[1] = { item: 'oak-planks-block', count: 4, durability: null };
    slots[2] = { item: 'stick', count: 4, durability: null };
    slots[3] = { item: 'stone-block', count: 8, durability: null };
    slots[4] = { item: 'coal', count: 3, durability: null };
    slots[5] = { item: 'raw-iron', count: 2, durability: null };
    slots[6] = { item: 'iron-ingot', count: 3, durability: null };
    slots[27] = { item: 'apple', count: 2, durability: null };
    slots[28] = { item: 'iron-pickaxe', count: 1, durability: 250 };
    slots[29] = { item: 'furnace-block', count: 1, durability: null };
    localStorage.setItem(
      'lost-in-cubes:inventory:world-fragment-01',
      JSON.stringify({ version: 3, selectedSlot: 0, slots }),
    );
    localStorage.setItem(
      'lost-in-cubes:survival:world-fragment-01',
      JSON.stringify({
        version: 1,
        health: 13,
        dayTime: 0.42,
        deathCount: 2,
      }),
    );
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-game-state',
    'ready',
    { timeout: 45_000 },
  );
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveClass(/is-hidden/);
  await expect(page.locator('#hotbar .hotbar-slot')).toHaveCount(9);
  await expect(page.locator('#hotbar .hotbar-slot').first()).toHaveAttribute(
    'aria-label',
    /苹果.*2/,
  );
  await expect(page.locator('#hotbar .hotbar-slot').nth(1)).toHaveAttribute(
    'aria-label',
    /铁镐.*耐久 250\/250/,
  );

  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'third-person');
  await expect(canvas).toHaveAttribute('data-held-item', 'apple');
  await expect(canvas).toHaveAttribute('data-player-health', '13');
  await expect(canvas).toHaveAttribute('data-death-count', '2');
  await expect(canvas).toHaveAttribute('data-enemy-count', '0');
  await expect(canvas).toHaveAttribute('data-furnace-count', '0');
  await expect(canvas).toHaveAttribute('data-inventory-open', 'false');
  await expect(page.locator('#hud-status')).toContainText('生命 13/20');
  await expect(page.locator('#hud-view')).toContainText('苹果');
  await expect(page.locator('#hud-view')).toContainText('重生 2');

  const startingDayTime = Number(await canvas.getAttribute('data-day-time'));
  expect(startingDayTime).toBeGreaterThanOrEqual(0.42);
  expect(startingDayTime).toBeLessThan(0.46);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-day-time')))
    .toBeGreaterThan(startingDayTime);

  await page.keyboard.press('e');
  const inventory = page.locator('#inventory-screen');
  await expect(inventory).toBeVisible();
  await expect(canvas).toHaveAttribute('data-inventory-open', 'true');
  await expect(
    page.locator('[data-inventory-storage] .inventory-slot'),
  ).toHaveCount(27);
  await expect(
    page.locator('[data-inventory-hotbar] .inventory-slot'),
  ).toHaveCount(9);
  await expect(page.locator('[data-crafting-recipes] .recipe-card')).toHaveCount(
    3,
  );
  await expect(page.locator('[data-inventory-index="4"]')).toHaveAttribute(
    'aria-label',
    /煤炭 × 3/,
  );
  await expect(page.locator('[data-inventory-index="5"]')).toHaveAttribute(
    'aria-label',
    /粗铁 × 2/,
  );
  await expect(page.locator('[data-inventory-index="6"]')).toHaveAttribute(
    'aria-label',
    /铁锭 × 3/,
  );
  await expect(page.locator('[data-inventory-index="27"]')).toHaveAttribute(
    'aria-label',
    /苹果 × 2/,
  );

  await page.locator('[data-recipe-id="oak-planks"]').click();
  await expect(page.locator('[data-inventory-cursor]')).toBeVisible();
  await page.locator('[data-inventory-index="7"]').click();
  await expect(page.locator('[data-inventory-index="7"]')).toHaveAttribute(
    'aria-label',
    /橡木木板 × 4/,
  );

  await page.keyboard.press('e');
  await expect(inventory).toBeHidden();
  await expect(canvas).toHaveAttribute('data-inventory-open', 'false');
  await expect(canvas).toHaveAttribute('data-held-item', 'apple');

  await page.keyboard.press('2');
  await expect(canvas).toHaveAttribute('data-held-item', 'iron-pickaxe');
  await expect(page.locator('#hud-view')).toContainText('铁镐');

  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(100);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(100);
  if (canvasBounds === null) {
    throw new Error('Canvas bounds were unavailable.');
  }

  const lookX = canvasBounds.x + canvasBounds.width * 0.5;
  const startY = canvasBounds.y + 20;
  const endY = canvasBounds.y + canvasBounds.height - 20;
  await page.mouse.move(lookX, startY);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(lookX, endY, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-player-pitch')))
    .toBeLessThan(-1.5);
  await expect(canvas).toHaveAttribute('data-has-target', 'true');

  await page.keyboard.press('v');
  await expect(page.locator('#hud-view')).toContainText('第一人称');
  await expect(page.locator('#hud-view')).toContainText('铁镐');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'first-person');
  await expect(canvas).toHaveAttribute('data-held-item', 'iron-pickaxe');
  await expect(page.locator('#crosshair')).toHaveCSS('opacity', '1');
  expect(runtimeErrors).toEqual([]);
});

test('falls back to synchronous terrain when module workers fail', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  const runtimeWarnings: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
    if (message.type() === 'warning') runtimeWarnings.push(message.text());
  });

  await page.addInitScript(() => {
    class RuntimeFailingWorker extends EventTarget {
      public postMessage(): void {
        queueMicrotask(() => {
          this.dispatchEvent(
            new ErrorEvent('error', {
              cancelable: true,
              message: 'Error',
            }),
          );
        });
      }

      public terminate(): void {
        // The fake worker has no external process to terminate.
      }
    }
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: RuntimeFailingWorker,
    });
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-game-state',
    'ready',
    { timeout: 45_000 },
  );
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveClass(/is-hidden/);
  await expect(page.locator('#hotbar .hotbar-slot')).toHaveCount(9);
  await expect(page.locator('#game-canvas')).toHaveAttribute(
    'data-player-health',
    '20',
  );
  await expect(page.locator('#game-canvas')).toHaveAttribute(
    'data-enemy-count',
    '0',
  );
  expect(
    runtimeWarnings.some((message) =>
      message.includes(
        'Chunk worker failed at runtime; continuing with synchronous generation.',
      ),
    ),
  ).toBe(true);
  expect(runtimeErrors).toEqual([]);
});
