import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function explore() {
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

  const doorsAndBuildings = await page.evaluate(() => {
    const ash = window.__ashfall;
    if (!ash) return null;
    const scene = ash.scene;
    const p = scene.predicted || { x: 48.5, y: 48.5 };
    const list = [];
    for (const d of scene.world.doors.values()) {
      const b = scene.world.buildingAt(d.x + 0.5, d.y + 0.5);
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      list.push({
        door: { id: d.id, x: d.x, y: d.y, facing: d.facing, open: d.open },
        building: b ? { id: b.id, name: b.name, style: b.style, x: b.x, y: b.y, w: b.w, h: b.h } : null,
        dist: Math.round(dist)
      });
    }
    list.sort((a, b) => a.dist - b.dist);
    return { player: { x: p.x, y: p.y }, nearest: list };
  });

  console.log('Nearest doors and buildings:', JSON.stringify(doorsAndBuildings, null, 2));

  if (doorsAndBuildings && doorsAndBuildings.nearest.length > 0) {
    // Specifically target the building from the user's screenshot: b:65:87:23 Усадьба (door at 69, 90)
    let target = doorsAndBuildings.nearest.find(n => n.door.id === 'd:69:90') || doorsAndBuildings.nearest[0];
    const door = target.door;
    console.log(`Teleporting near door of ${target.building?.name} at (${door.x}, ${door.y})...`);

    // Position player just outside the door
    const outsideX = door.facing === 'east' ? door.x + 2 : door.x + 0.5;
    const outsideY = door.facing === 'east' ? door.y + 0.5 : door.y + 2;

    await page.evaluate(({ ox, oy }) => {
      const ash = window.__ashfall;
      if (ash && ash.net) {
        ash.net.action({ t: 'dev_action', action: 'teleport', args: { x: ox, y: oy } });
      }
    }, { ox: outsideX, oy: outsideY });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/explore_door_outside.png' });
    console.log('Saved screenshots/explore_door_outside.png');

    // Step through the door into the building
    const insideX = door.facing === 'east' ? door.x - 1 : door.x + 0.5;
    const insideY = door.facing === 'east' ? door.y + 0.5 : door.y - 1;

    // Open door if closed
    await page.evaluate((d) => {
      const ash = window.__ashfall;
      if (ash && ash.net) {
        ash.net.action({ t: 'dev_action', action: 'open_door', args: { id: d.id } });
        ash.net.action({ t: 'dev_action', action: 'teleport', args: { x: d.ix, y: d.iy } });
      }
    }, { id: door.id, ix: insideX, iy: insideY });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/explore_door_inside.png' });
    console.log('Saved screenshots/explore_door_inside.png');
  }

  await browser.close();
}

explore().catch(console.error);
