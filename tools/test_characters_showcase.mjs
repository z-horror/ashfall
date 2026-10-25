import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\e3c92ffc-34cb-4b34-9d32-aebadf56a8af';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  console.log('Navigating to game...');
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
  await page.waitForTimeout(2000);

  // Setup dev kit & godmode
  await page.evaluate(() => {
    const ash = window.__ashfall;
    if (ash?.net) {
      ash.net.action({ t: 'dev_action', action: 'godmode' });
      ash.net.action({ t: 'dev_action', action: 'heal' });
      ash.net.action({ t: 'dev_action', action: 'kit' });
    }
  });
  await page.waitForTimeout(800);

  // Equip spiked bat
  await page.evaluate(() => {
    const ash = window.__ashfall;
    const inv = ash?.scene?.inventory || [];
    const item = inv.find(i => i.key === 'spiked_bat');
    if (item) ash.net.action({ t: 'equip', id: item.id });
  });
  await page.waitForTimeout(600);

  // Teleport to an open clean street spot (e.g. 52, 46) away from spawn drop
  await page.evaluate(() => {
    const ash = window.__ashfall;
    ash?.net?.action({ t: 'dev_action', action: 'teleport', args: { x: 52.0, y: 46.0 } });
  });
  await page.waitForTimeout(1200);

  // Turn player to facingDir 2 (South), zoom in a bit for character showcase
  await page.evaluate(() => {
    const ash = window.__ashfall;
    if (ash?.scene) {
      ash.scene.cameras.main.setZoom(1.8);
      if (ash.scene.selfView) {
        ash.scene.selfView.aim = Math.PI / 4; // world angle aiming South
      }
    }
  });
  await page.waitForTimeout(500);

  const showcasePath = path.join(ARTIFACT_DIR, 'ashfall_character_showcase.png');
  await page.screenshot({ path: showcasePath });
  console.log('Saved showcase:', showcasePath);

  // Switch to pistol
  await page.evaluate(() => {
    const ash = window.__ashfall;
    const inv = ash?.scene?.inventory || [];
    const item = inv.find(i => i.key === 'pistol');
    if (item) ash.net.action({ t: 'equip', id: item.id });
  });
  await page.waitForTimeout(600);
  const pistolPath = path.join(ARTIFACT_DIR, 'ashfall_character_pistol.png');
  await page.screenshot({ path: pistolPath });
  console.log('Saved pistol:', pistolPath);

  // Switch back to spiked bat
  await page.evaluate(() => {
    const ash = window.__ashfall;
    const inv = ash?.scene?.inventory || [];
    const item = inv.find(i => i.key === 'spiked_bat');
    if (item) ash.net.action({ t: 'equip', id: item.id });
  });

  // Find zombies of each type (0: walker, 1: runner, 2: brute)
  const zombieInfo = await page.evaluate(() => {
    const ash = window.__ashfall;
    const scene = ash.scene;
    const list = [];
    for (const [id, zv] of scene.zombieViews.entries()) {
      list.push({ id, type: zv.type, x: zv.x, y: zv.y, sheet: zv.sheet });
    }
    return list;
  });

  console.log('Discovered zombies:', JSON.stringify(zombieInfo.slice(0, 8), null, 2));

  // Teleport near the closest zombie
  if (zombieInfo.length > 0) {
    const targetZ = zombieInfo[0];
    console.log(`Engaging zombie ${targetZ.id} (type ${targetZ.type}, sheet ${targetZ.sheet}) at (${targetZ.x}, ${targetZ.y})...`);
    await page.evaluate(({ zx, zy }) => {
      const ash = window.__ashfall;
      ash.scene.cameras.main.setZoom(1.6);
      ash.net.action({ t: 'dev_action', action: 'teleport', args: { x: zx - 1.8, y: zy - 0.8 } });
    }, { zx: targetZ.x, zy: targetZ.y });

    await page.waitForTimeout(1200);

    // Trigger attack animation
    await page.evaluate(() => {
      const ash = window.__ashfall;
      if (ash?.scene?.selfView) {
        ash.scene.selfView.playAttack();
      }
    });
    await page.waitForTimeout(100);

    const combatPath = path.join(ARTIFACT_DIR, 'ashfall_combat_action.png');
    await page.screenshot({ path: combatPath });
    console.log('Saved combat:', combatPath);
  }

  // Generate an in-engine comparative banner of all 3 zombie types + survivor side by side
  // by creating a temporary scene overlay display
  await page.evaluate(() => {
    const scene = window.__ashfall.scene;
    if (!scene) return;
    const cx = scene.cameras.main.midPoint.x;
    const cy = scene.cameras.main.midPoint.y;

    // Display container on top
    const trioContainer = scene.add.container(cx, cy - 60).setDepth(99999);
    const bg = scene.add.rectangle(0, 0, 520, 180, 0x121513, 0.88).setStrokeStyle(1, 0x4a5548);
    trioContainer.add(bg);

    const title = scene.add.text(0, -68, 'ASHFALL — ОБНОВЛЕННЫЕ ПЕРСОНАЖИ И ТИПЫ ЗОМБИ', {
      fontFamily: '"Consolas", monospace',
      fontSize: '13px',
      color: '#e2dbc8',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5);
    trioContainer.add(title);

    const lineup = [
      { sheet: 'char_p0', label: 'Выживший', sub: '(Survivor)' },
      { sheet: 'char_z0', label: 'Ходок', sub: '(Civilian Walker)' },
      { sheet: 'char_z1', label: 'Бегун', sub: '(Emaciated Runner)' },
      { sheet: 'char_z2', label: 'Громила', sub: '(Massive Brute)', scale: 1.15 },
    ];

    lineup.forEach((item, idx) => {
      const lx = -195 + idx * 130;
      const spr = scene.add.sprite(lx, 24, 'char_atlas', `${item.sheet.replace('char_', '')}:24`)
        .setOrigin(0.5, 0.932)
        .setScale(item.scale || 1.0);
      trioContainer.add(spr);

      const lbl = scene.add.text(lx, 36, item.label, {
        fontFamily: '"Consolas", monospace',
        fontSize: '11px',
        color: '#c9bfa8',
        stroke: '#000',
        strokeThickness: 2
      }).setOrigin(0.5);
      trioContainer.add(lbl);

      const subLbl = scene.add.text(lx, 50, item.sub, {
        fontFamily: '"Consolas", monospace',
        fontSize: '9px',
        color: '#7f887b',
        stroke: '#000',
        strokeThickness: 1
      }).setOrigin(0.5);
      trioContainer.add(subLbl);
    });
  });

  await page.waitForTimeout(600);
  const lineupPath = path.join(ARTIFACT_DIR, 'ashfall_zombies_lineup.png');
  await page.screenshot({ path: lineupPath });
  console.log('Saved lineup:', lineupPath);

  await browser.close();
  console.log('Showcase completed successfully!');
}

main().catch(console.error);
