import { chromium } from 'playwright-core';
import fs from 'fs';

async function crop() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const imgBase64 = fs.readFileSync('screenshots/explore_door_inside.png').toString('base64');
  await page.setContent(`
    <html><body style="margin:0;background:black;">
      <canvas id="c" width="700" height="700"></canvas>
      <script>
        const img = new Image();
        img.src = 'data:image/png;base64,${imgBase64}';
        img.onload = () => {
          const c = document.getElementById('c');
          const ctx = c.getContext('2d');
          // Player is at (960, 540)
          // The building is between 600..1200 and 300..700
          ctx.drawImage(img, 300, 150, 800, 600, 0, 0, 800, 600);
          window.__done = true;
        };
      </script>
    </body></html>
  `);
  await page.waitForFunction(() => window.__done);
  const canvas = await page.$('#c');
  await canvas.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/corner_debug.png' });
  await browser.close();
  console.log('Saved corner_debug.png');
}
crop().catch(err => { console.error(err); process.exit(1); });
