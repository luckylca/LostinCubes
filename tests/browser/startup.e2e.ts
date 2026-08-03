import { expect, test } from '@playwright/test';

test('boots the forest, crafts in inventory, and preserves camera controls', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
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
    slots[3] = { item: 'stone-block', count: 3, durability: null };
    slots[27] = { item: 'stone-axe', count: 1, durability: 131 };
    slots[28] = { item: 'crafting-table-block', count: 1, durability: null };
    localStorage.setItem(
      'lost-in-cubes:inventory:world-fragment-01',
      JSON.stringify({ version: 3, selectedSlot: 0, slots }),
    );
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'ready', {
    timeout: 45_000,
  });
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveClass(/is-hidden/);
  await expect(page.locator('#hotbar .hotbar-slot')).toHaveCount(9);
  await expect(page.locator('#hotbar .hotbar-slot').first()).toHaveAttribute(
    'aria-label',
    /石斧.*耐久 131\/131/,
  );

  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'third-person');
  await expect(canvas).toHaveAttribute('data-held-item', 'stone-axe');
  await expect(canvas).toHaveAttribute('data-inventory-open', 'false');

  await page.keyboard.press('e');
  const inventory = page.locator('#inventory-screen');
  await expect(inventory).toBeVisible();
  await expect(canvas).toHaveAttribute('data-inventory-open', 'true');
  await expect(page.locator('[data-inventory-storage] .inventory-slot')).toHaveCount(
    27,
  );
  await expect(page.locator('[data-inventory-hotbar] .inventory-slot')).toHaveCount(
    9,
  );
  await expect(page.locator('[data-crafting-recipes] .recipe-card')).toHaveCount(3);

  await page.locator('[data-recipe-id="oak-planks"]').click();
  await expect(page.locator('[data-inventory-cursor]')).toBeVisible();
  await page.locator('[data-inventory-index="4"]').click();
  await expect(page.locator('[data-inventory-index="4"]')).toHaveAttribute(
    'aria-label',
    /橡木木板 × 4/,
  );

  await page.keyboard.press('e');
  await expect(inventory).toBeHidden();
  await expect(canvas).toHaveAttribute('data-inventory-open', 'false');
  await expect(canvas).toHaveAttribute('data-held-item', 'stone-axe');

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
  await expect(page.locator('#hud-view')).toContainText('石斧');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'first-person');
  await expect(canvas).toHaveAttribute('data-held-item', 'stone-axe');
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
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
    if (message.type() === 'warning') {
      runtimeWarnings.push(message.text());
    }
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
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'ready', {
    timeout: 45_000,
  });
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveClass(/is-hidden/);
  await expect(page.locator('#hotbar .hotbar-slot')).toHaveCount(9);
  expect(
    runtimeWarnings.some((message) =>
      message.includes(
        'Chunk worker failed at runtime; continuing with synchronous generation.',
      ),
    ),
  ).toBe(true);
  expect(runtimeErrors).toEqual([]);
});
