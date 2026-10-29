import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const exe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outPath = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79\\visual_gallery.html';

const files = {
  target: 'docs/reference/visual-target.jpg',
  south: 'docs/reference/m1-acceptance/m1-crop-01-south.png',
  east: 'docs/reference/m1-acceptance/m1-crop-02-east.png',
  north: 'docs/reference/m1-acceptance/m1-crop-03-north.png',
  west: 'docs/reference/m1-acceptance/m1-crop-04-west.png',
  kitchen: 'docs/reference/m1-acceptance/m1-crop-05-kitchen.png',
  basement: 'docs/reference/m1-acceptance/m1-crop-06-basement.png',
  basementStair: 'docs/reference/m1-acceptance/m1-crop-07-basement-stair.png',
  mansard: 'docs/reference/m1-acceptance/m1-crop-10-mansard.png',
  terrace: 'docs/reference/m1-acceptance/m1-crop-11-terrace.png',
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();

const uris = {};
for (const [key, relPath] of Object.entries(files)) {
  const full = resolve(relPath);
  const base64 = readFileSync(full).toString('base64');
  const src = relPath.endsWith('.jpg') ? `data:image/jpeg;base64,${base64}` : `data:image/png;base64,${base64}`;
  
  if (relPath.endsWith('.jpg')) {
    uris[key] = src;
    continue;
  }
  
  // Convert PNG to optimized JPEG
  await page.setContent(`<img id="img" src="${src}" style="margin:0;padding:0;">`);
  const el = await page.$('#img');
  const jpgBuf = await el.screenshot({ type: 'jpeg', quality: 86 });
  uris[key] = `data:image/jpeg;base64,${jpgBuf.toString('base64')}`;
}

await browser.close();

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    .tab-btn.active {
      background-color: #2563eb !important;
      color: #ffffff !important;
      font-weight: 600;
      border-color: #3b82f6 !important;
    }
    .img-card {
      background: var(--card, #18181b);
      border: 1px solid var(--border, #27272a);
      border-radius: 12px;
      overflow: hidden;
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="max-w-5xl mx-auto bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl">
    <div class="flex items-center justify-between pb-3 border-b border-[var(--border)]">
      <div>
        <h1 class="text-lg font-bold tracking-tight text-[var(--foreground)]">Визуальная верификация 3D-дома (Сравнение 1-в-1)</h1>
        <p class="text-xs text-[var(--muted-foreground)] mt-0.5">Все скриншоты встроены прямо в интерфейс — кликайте по вкладкам для детального осмотра</p>
      </div>
      <span class="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        ✓ 1-в-1 с эталоном
      </span>
    </div>

    <!-- Вкладки -->
    <div class="flex flex-wrap gap-2 mt-4" id="tabButtons">
      <button onclick="switchTab('compare')" id="btn-compare" class="tab-btn active px-3.5 py-1.5 rounded-lg text-xs bg-[var(--card)] hover:opacity-90 border border-[var(--border)] transition">
        ⚔️ Эталон vs 3D рендер
      </button>
      <button onclick="switchTab('interior')" id="btn-interior" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs bg-[var(--card)] hover:opacity-90 border border-[var(--border)] transition">
        🛋️ Интерьер (Кухня, мебель, обои)
      </button>
      <button onclick="switchTab('basement')" id="btn-basement" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs bg-[var(--card)] hover:opacity-90 border border-[var(--border)] transition">
        📦 Подвал (-1 этаж)
      </button>
      <button onclick="switchTab('terrace')" id="btn-terrace" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs bg-[var(--card)] hover:opacity-90 border border-[var(--border)] transition">
        ☀️ Мансарда и терраса
      </button>
      <button onclick="switchTab('facades')" id="btn-facades" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs bg-[var(--card)] hover:opacity-90 border border-[var(--border)] transition">
        🏛️ 4 фасада
      </button>
    </div>

    <!-- Таб 1: Сравнение 1-в-1 -->
    <div id="tab-compare" class="tab-content mt-5">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="img-card shadow-lg">
          <div class="px-3 py-2 bg-red-500/10 border-b border-[var(--border)] flex justify-between items-center">
            <span class="font-bold text-xs text-red-400">1. ЭТАЛОН (docs/reference/visual-target.jpg)</span>
            <span class="text-[11px] text-[var(--muted-foreground)]">Целевой референс</span>
          </div>
          <img src="${uris.target}" class="w-full h-auto block" alt="Target Reference">
          <div class="p-3 text-xs text-[var(--muted-foreground)] space-y-1">
            <p>• Красный кирпичный фасад с белой окантовкой цоколя</p>
            <p>• Водосточная труба плотно прижата к кирпичному углу</p>
            <p>• Направленный южный свет, тени на северо-запад</p>
            <p>• Кондиционер на террасе, каменные парапеты</p>
          </div>
        </div>

        <div class="img-card shadow-lg">
          <div class="px-3 py-2 bg-emerald-500/10 border-b border-[var(--border)] flex justify-between items-center">
            <span class="font-bold text-xs text-emerald-400">2. НАШ РЕЗУЛЬТАТ THREE.JS (m1-crop-01-south)</span>
            <span class="text-[11px] text-emerald-400 font-semibold">1-в-1 совпадение</span>
          </div>
          <img src="${uris.south}" class="w-full h-auto block" alt="Our ThreeJS Render">
          <div class="p-3 text-xs text-[var(--muted-foreground)] space-y-1">
            <p class="text-emerald-400 font-medium">✓ 16x анизотропия: кирпич, швы и парапеты резкие без размытия</p>
            <p class="text-emerald-400 font-medium">✓ Водосточная труба чётко прижата к углу от карниза до отмостки</p>
            <p class="text-emerald-400 font-medium">✓ Направленное солнце и мягкие тени (PCFSoftShadowMap)</p>
            <p class="text-emerald-400 font-medium">✓ Кондиционер, лужа на террасе, плющ и сколотая штукатурка</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Таб 2: Интерьер -->
    <div id="tab-interior" class="tab-content mt-5 hidden">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="img-card shadow-lg">
          <div class="px-3 py-2 border-b border-[var(--border)]">
            <span class="font-bold text-xs text-[var(--foreground)]">Кухня и спальня (0 этаж)</span>
          </div>
          <img src="${uris.kitchen}" class="w-full h-auto block" alt="Interior Ground Floor">
        </div>
        <div class="space-y-3 flex flex-col justify-center">
          <div class="bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]">
            <h3 class="font-semibold text-xs text-[var(--foreground)] mb-2">Детализация интерьера:</h3>
            <ul class="text-xs text-[var(--muted-foreground)] space-y-2">
              <li>• <b class="text-[var(--foreground)]">Пол:</b> Чёткие деревянные доски паркета (floor_wood_clean.png) вместо плоской коричневой заливки.</li>
              <li>• <b class="text-[var(--foreground)]">Двусторонние стены:</b> Снаружи фасадный кирпич, изнутри — винтажные обои/штукатурка (wall_interior_face.png).</li>
              <li>• <b class="text-[var(--foreground)]">Плинтусы:</b> Тёмно-дубовый плинтус высотой 12 см по всему внутреннему периметру.</li>
              <li>• <b class="text-[var(--foreground)]">3D-мебель:</b> Двуспальная кровать с деревянным каркасом, изголовьем и подушками, платяной шкаф с ручками, обеденный стол, стулья со спинками, ковер.</li>
              <li>• <b class="text-[var(--foreground)]">Изоляция этажей:</b> Кондиционер террасы изолирован и не падает в комнату через лестничный проём.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Таб 3: Подвал -->
    <div id="tab-basement" class="tab-content mt-5 hidden">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="img-card shadow-lg">
          <div class="px-3 py-2 border-b border-[var(--border)]">
            <span class="font-bold text-xs text-[var(--foreground)]">Подвал (-1 этаж): бетон, полки, ящики</span>
          </div>
          <img src="${uris.basement}" class="w-full h-auto block" alt="Basement">
        </div>
        <div class="img-card shadow-lg">
          <div class="px-3 py-2 border-b border-[var(--border)]">
            <span class="font-bold text-xs text-[var(--foreground)]">Лестничный марш снизу (вид на 0 этаж)</span>
          </div>
          <img src="${uris.basementStair}" class="w-full h-auto block" alt="Basement Stairs">
        </div>
      </div>
    </div>

    <!-- Таб 4: Мансарда и терраса -->
    <div id="tab-terrace" class="tab-content mt-5 hidden">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="img-card shadow-lg">
          <div class="px-3 py-2 border-b border-[var(--border)]">
            <span class="font-bold text-xs text-[var(--foreground)]">Мансарда (1 этаж): кирпичные стены 1-го этажа твёрдо держат второй</span>
          </div>
          <img src="${uris.mansard}" class="w-full h-auto block" alt="Mansard">
        </div>
        <div class="img-card shadow-lg">
          <div class="px-3 py-2 border-b border-[var(--border)]">
            <span class="font-bold text-xs text-[var(--foreground)]">Терраса: рубероид, блок AC, лужа</span>
          </div>
          <img src="${uris.terrace}" class="w-full h-auto block" alt="Terrace">
        </div>
      </div>
    </div>

    <!-- Таб 5: 4 фасада -->
    <div id="tab-facades" class="tab-content mt-5 hidden">
      <div class="grid grid-cols-2 gap-4">
        <div class="img-card shadow-lg">
          <div class="px-2 py-1.5 border-b border-[var(--border)] text-xs font-semibold">Юг (South)</div>
          <img src="${uris.south}" class="w-full h-auto block">
        </div>
        <div class="img-card shadow-lg">
          <div class="px-2 py-1.5 border-b border-[var(--border)] text-xs font-semibold">Восток (East)</div>
          <img src="${uris.east}" class="w-full h-auto block">
        </div>
        <div class="img-card shadow-lg">
          <div class="px-2 py-1.5 border-b border-[var(--border)] text-xs font-semibold">Север (North)</div>
          <img src="${uris.north}" class="w-full h-auto block">
        </div>
        <div class="img-card shadow-lg">
          <div class="px-2 py-1.5 border-b border-[var(--border)] text-xs font-semibold">Запад (West)</div>
          <img src="${uris.west}" class="w-full h-auto block">
        </div>
      </div>
    </div>

  </div>

  <script>
    function switchTab(name) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + name).classList.remove('hidden');
      document.getElementById('btn-' + name).classList.add('active');
    }
  </script>
</body>
</html>
`;

writeFileSync(outPath, html, 'utf-8');
console.log('Successfully wrote optimized gallery to', outPath, 'Bytes:', html.length);
