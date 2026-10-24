import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function verify() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(1000);

  const savedVisible = await page.evaluate(() => !document.getElementById('auth-saved-box')?.classList.contains('hidden'));
  if (savedVisible) {
    await page.click('#auth-new-guest');
  } else {
    await page.click('#auth-guest');
  }

  await page.waitForFunction(
    () => document.getElementById('loading-screen')?.classList.contains('hidden'),
    null,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(3000);

  // 1. Walk towards cars
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(2200);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/verify_cars_scaled.png' });
  console.log('Saved screenshots/verify_cars_scaled.png');

  // 2. Find Pharmacy building (b:23:36:8) and check outside and inside
  const res = await page.evaluate(() => {
    const ash = window.__ashfall;
    const scene = ash.scene;
    const b = [...scene.world.buildings.values()].find(b => b.name === 'Аптека');
    if (!b) return null;
    return { id: b.id, name: b.name, x: b.x, y: b.y, w: b.w, h: b.h, doors: b.doorTiles };
  });

  if (res && res.doors.length > 0) {
    const door = res.doors[0]; // (29, 39)
    console.log('Teleporting outside door of', res.name, 'at', door.x, door.y);

    // Outside door (y = 41)
    await page.evaluate((d) => {
      const ash = window.__ashfall;
      ash.net.action({ t: 'dev_action', action: 'teleport', args: { x: d.x + 0.5, y: d.y + 2.0 } });
    }, door);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'screenshots/verify_building_outside.png' });
    console.log('Saved screenshots/verify_building_outside.png');

    // Step inside (y = 37.5)
    await page.evaluate((d) => {
      const ash = window.__ashfall;
      // Open door
      ash.net.action({ t: 'interact' });
      // Teleport inside the room
      ash.net.action({ t: 'dev_action', action: 'teleport', args: { x: d.x + 0.5, y: d.y - 1.5 } });
    }, door);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'screenshots/verify_building_inside.png' });
    console.log('Saved screenshots/verify_building_inside.png');
  }

  await browser.close();
}

verify().catch(console.error);
