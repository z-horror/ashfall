import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
    ? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

const targetDir = resolve('docs/reference/art-target-assets');
const clientPropsDir = resolve('client/public/assets/props');
const clientBuildingsDir = resolve('client/public/assets/buildings');
mkdirSync(targetDir, { recursive: true });

const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';

const assetsToProcess = [
  {
    src: join(brainDir, 'weathered_cracked_asphalt_tile_iso2to1_1793206668088.jpg'),
    dest: join(targetDir, 'asphalt_tile_iso2to1.png'),
    type: 'tile_diamond'
  },
  {
    src: join(brainDir, 'weathered_concrete_sidewalk_isometric_2to1_wide_1793206684094.jpg'),
    dest: join(targetDir, 'sidewalk_slab_iso2to1.png'),
    type: 'tile_diamond'
  },
  {
    src: join(brainDir, 'downspout_pipe_isometric_1793206671472.jpg'),
    dest: join(targetDir, 'downspout_pipe.png'),
    type: 'prop'
  },
  {
    src: join(brainDir, 'rooftop_wooden_pallet_isometric_1793206690961.jpg'),
    dest: join(targetDir, 'rooftop_pallet.png'),
    type: 'prop'
  },
  {
    src: join(brainDir, 'isometric_climbing_ivy_decals_sheet_1793206663416.jpg'),
    dest: join(targetDir, 'ivy_decals_sheet.png'),
    type: 'prop'
  }
];

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

for (const asset of assetsToProcess) {
  if (!existsSync(asset.src)) {
    console.log(`Skipping missing ${asset.src}`);
    continue;
  }
  const base64 = readFileSync(asset.src).toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  const pngBase64 = await page.evaluate(async ({ dataUri, type }) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];

          // Magenta chroma key detection: high red & blue, low green
          // Pure magenta is (255, 0, 255)
          const magentaScore = (r + b) / 2 - g;
          if (magentaScore > 60 && (r > 120 || b > 120)) {
            if (magentaScore > 80) {
              d[i + 3] = 0;
            } else {
              // Smooth fringe transition
              const alpha = (80 - magentaScore) / 20;
              d[i + 3] = Math.floor(d[i + 3] * Math.max(0, Math.min(1, alpha)));
            }
          }
          // De-spill: if there is residual excess magenta in visible pixels
          if (d[i + 3] > 0) {
            const excess = ((d[i] + d[i + 2]) / 2) - d[i + 1];
            if (excess > 15) {
              const maxC = d[i + 1] + 15;
              if (d[i] > maxC) d[i] = maxC;
              if (d[i + 2] > maxC) d[i + 2] = maxC;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.src = dataUri;
    });
  }, { dataUri, type: asset.type });

  const buffer = Buffer.from(pngBase64, 'base64');
  writeFileSync(asset.dest, buffer);
  console.log(`Processed and saved: ${asset.dest} (${buffer.length} bytes)`);
}

await browser.close();
console.log('All assets processed successfully.');
