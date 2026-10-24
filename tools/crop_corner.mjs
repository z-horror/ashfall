import { chromium } from 'playwright-core';
import fs from 'fs';

async function cropCorners() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const imgBase64 = fs.readFileSync('screenshots/explore_door_inside.png').toString('base64');
  await page.setContent(`
    <html><body style="margin:0;background:black;">
      <canvas id="c_sw" width="500" height="500"></canvas>
      <canvas id="c_ne" width="500" height="500"></canvas>
      <script>
        const img = new Image();
        img.src = 'data:image/png;base64,${imgBase64}';
        img.onload = () => {
          // In explore_door_inside.png, the building is in the center
          // SW corner (bottom-left of building): x: 350..850, y: 350..850
          const c_sw = document.getElementById('c_sw');
          c_sw.getContext('2d').drawImage(img, 400, 350, 500, 500, 0, 0, 500, 500);

          // NE corner (top-right of building): x: 800..1300, y: 200..700
          const c_ne = document.getElementById('c_ne');
          c_ne.getContext('2d').drawImage(img, 850, 200, 500, 500, 0, 0, 500, 500);
          window.__done = true;
        };
      </script>
    </body></html>
  `);
  await page.waitForFunction(() => window.__done);
  const c1 = await page.$('#c_sw');
  await c1.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/corner_sw_debug.png' });
  const c2 = await page.$('#c_ne');
  await c2.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/corner_ne_debug.png' });
  await browser.close();
  console.log('Saved corner_sw_debug.png and corner_ne_debug.png');
}
cropCorners().catch(err => { console.error(err); process.exit(1); });
