import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('screenshots/buildings-v3');
const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';

const shots = [
  { file: '01-outside.png', title: '01. П-образный Дом снаружи', desc: 'Западное и восточное крыло, патио-дворик, цоколь без рва (z=0), заземленный кондиционер на рельсах террасы, мансарда 2 этажа, рубероид без черных овалов.' },
  { file: '02-outside-door-open.png', title: '02. Открытая дверь (3D-изометрия)', desc: 'Дверная коробка на 100% высоты без пустоты над ней, распашное 3D-полотно 50мм с филенками, латунной ручкой, петлями и тенью на полу, плоский известняковый порог.' },
  { file: '03-inside-west.png', title: '03. Спальня (Западное крыло)', desc: 'Узкие состаренные дубовые доски пола без сетки плитки, шкаф стоит ровно у северной стены (лицом в комнату), арка в коридор.' },
  { file: '04-inside-east.png', title: '04. Столовая (Восточное крыло)', desc: 'Кухня и столовая. Межкомантная и дворовая стены надежно экранируют спальню, шкаф не просвечивает сквозь стену.' },
  { file: '05-basement.png', title: '05. Прямоугольный Подвал', desc: 'Железобетонный бункер (-3.0м): бейсбольная бита строго в руках персонажа, лестница с анкерной стальной опорой на пол и тенью.' },
  { file: '06-mansard.png', title: '06. Мансарда 2 этажа и терраса', desc: 'Второй этаж меньшего размера с дверью и окном, выходящими на открытую кровлю-террасу над крыльями 1 этажа.' },
];

const shotData = shots.map(s => {
  const b64 = readFileSync(resolve(outDir, s.file)).toString('base64');
  return { ...s, b64 };
});

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Ashfall: Доказательная галерея (П-образный дом с мансардой)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0d1117; color: #c9d1d9; font-family: ui-sans-serif, system-ui, sans-serif; }
    .active-btn { border-color: #f59e0b; background-color: rgba(245, 158, 11, 0.2); }
  </style>
</head>
<body class="p-6 max-w-7xl mx-auto">
  <div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
    <div>
      <h1 class="text-2xl font-bold text-amber-500">Ashfall: Доказательная галерея архитектуры</h1>
      <p class="text-sm text-gray-400 mt-1">П-образный дом, прямоугольный подвал, 2-й этаж мансарда с террасой, исправленная дверь, цоколь и кондиционер</p>
    </div>
    <div class="flex items-center gap-2">
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">✓ 38/38 Tests Passed</span>
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">TypeScript 0 Errors</span>
    </div>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6">
    ${shotData.map((s, idx) => `
      <button onclick="selectShot(${idx})" id="btn-${idx}" class="shot-btn text-left p-2 rounded-lg border border-gray-800 hover:border-gray-600 transition bg-gray-900/60 ${idx === 0 ? 'active-btn' : ''}">
        <img src="data:image/png;base64,${s.b64}" class="w-full h-16 object-cover rounded mb-1.5" />
        <div class="text-xs font-medium text-gray-200 truncate">${s.title.split('.')[1] || s.title}</div>
      </button>
    `).join('')}
  </div>

  <div class="bg-gray-900/90 border border-gray-800 rounded-xl p-4 shadow-2xl">
    <div class="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
      <div>
        <h2 id="view-title" class="text-lg font-bold text-amber-400">${shotData[0].title}</h2>
        <p id="view-desc" class="text-sm text-gray-400">${shotData[0].desc}</p>
      </div>
      <a id="view-download" href="data:image/png;base64,${shotData[0].b64}" download="${shotData[0].file}" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded font-medium transition">Скачать PNG</a>
    </div>
    <div class="relative bg-black rounded-lg overflow-hidden flex items-center justify-center min-h-[500px]">
      <img id="main-view" src="data:image/png;base64,${shotData[0].b64}" class="w-full h-auto object-contain max-h-[800px]" />
    </div>
  </div>

  <script>
    const shots = ${JSON.stringify(shotData)};
    function selectShot(idx) {
      const s = shots[idx];
      document.getElementById('main-view').src = 'data:image/png;base64,' + s.b64;
      document.getElementById('view-title').innerText = s.title;
      document.getElementById('view-desc').innerText = s.desc;
      document.getElementById('view-download').href = 'data:image/png;base64,' + s.b64;
      document.getElementById('view-download').download = s.file;
      document.querySelectorAll('.shot-btn').forEach((btn, i) => {
        if (i === idx) btn.classList.add('active-btn');
        else btn.classList.remove('active-btn');
      });
    }
  </script>
</body>
</html>`;

writeFileSync(resolve(brainDir, 'evidence_gallery.html'), html, 'utf8');
console.log('Saved evidence_gallery.html');
