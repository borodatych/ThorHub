// Сборка ассетов иконки ThorHub из готового генератора знака.
// Запуск без флагов — только сборка, с флагом --verify — сборка и проверка результата.

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { full, small, tiny, mono, foreground, background } from './mark.mjs';
import { PARAMS, COLORS } from './params.mjs';

// Каталог сборки: brand/dist рядом с brand/src, не зависит от текущей папки.
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
// Служебный список своих файлов: по нему чистим прошлую сборку.
const MANIFEST_NAME = 'build-manifest.json';
// Папка разметки адаптивной иконки.
const ANYDPI_DIR = 'android/res/mipmap-anydpi-v26';
// Растеризатор вне проекта, подключаем так же, как в verifyMark.mjs.
const req = createRequire((process.env.THORHUB_TOOLS ?? '/Volumes/Storage/Caches/ThorHub/tools') + '/');
const { Resvg } = req('@resvg/resvg-js');
const { PNG } = req('pngjs');

// Плотности Android и их множители к базовому dp.
const DENSITIES = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
// Слой адаптивной иконки — 108 dp, безопасный круг — 66/108 холста.
const ADAPTIVE_DP = 108;
const SAFE_RATIO = 66 / 108;
// Классическая иконка — 48 dp.
const LEGACY_DP = 48;
// Белый цвет монохромного слоя адаптивной иконки.
const MONO_WHITE = '#ffffff';
// Стиль favicon: светлой вкладке тёмный знак, тёмной — янтарный.
const FAVICON_STYLE = 'rect{fill:#14161c}@media (prefers-color-scheme: dark){rect{fill:#ffb020}}';
// Кадры ICO: размер и вариант знака для отрисовки.
const ICO_FRAMES = [[16, tiny], [32, small], [48, small]];
// Крупные растры: путь от dist и размер стороны.
const LARGE_PNGS = [
  ['android/playstore-512.png', 512],
  ['web/icon-192.png', 192],
  ['web/icon-512.png', 512],
  ['web/apple-touch-icon.png', 180],
];
// Текст обоих файлов разметки адаптивной иконки — они одинаковые.
const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;

// Порог альфы, ниже которого пиксель считается прозрачным.
const ALPHA_EDGE = 8;
// Порог альфы для проверки цвета монохромного слоя.
const ALPHA_SOLID = 128;
// Минимальный канал белого монохромного слоя.
const WHITE_MIN = 240;
// Допуск проверки безопасного круга в пикселях растра.
const CIRCLE_TOL = 1;
// Допуск совпадения пикселей кадра ICO.
const PIXEL_TOL = 2;
// Ширина углового блока, который у круглой иконки обязан быть прозрачным.
const CORNER_PX = 3;

// Рендер SVG в PNG заданной ширины.
function png(svgText, width) {
  return new Resvg(svgText, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

// Тот же рисунок, обрезанный кругом по центру холста.
function roundIcon(svgText) {
  const r = PARAMS.size / 2;
  const clip =
    `<defs><clipPath id="round"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath></defs>` +
    `<g clip-path="url(#round)">`;
  return svgText
    .replace('<title>ThorHub</title>', `<title>ThorHub</title>${clip}`)
    .replace('</svg>', '</g></svg>');
}

// Монохромный слой: рисунок без плашки, оба цвета знака заменены на белый.
function monochromeAdaptive() {
  return foreground().replaceAll(COLORS.mark, MONO_WHITE).replaceAll(COLORS.hub, MONO_WHITE);
}

// Ячейки сетки 16×16 берём из монохромного варианта и снимаем встроенный цвет.
function faviconCells() {
  return [...mono('tiny').matchAll(/<rect[^>]*\/>/g)].map((m) => m[0].replaceAll(' fill="currentColor"', ''));
}

// favicon в SVG: тот же рисунок ячеек, цвет переключает CSS по схеме браузера.
function faviconSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" ` +
    `shape-rendering="crispEdges"><title>ThorHub</title>` +
    `<style>${FAVICON_STYLE}</style>` +
    faviconCells().join('') +
    `</svg>`
  );
}

// Сборка ICO из готовых PNG: заголовок, записи каталога и данные кадров.
function encodeIco(frames) {
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    header.writeUInt8(size, o);
    header.writeUInt8(size, o + 1);
    header.writeUInt8(0, o + 2);
    header.writeUInt8(0, o + 3);
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(data.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...frames.map((frame) => frame.data)]);
}

// Полный набор файлов сборки: путь от dist → содержимое.
function collect() {
  const files = new Map();
  const add = (rel, data) => files.set(rel, Buffer.isBuffer(data) ? data : Buffer.from(data));

  // Знаки в SVG.
  add('marks/full.svg', full());
  add('marks/small.svg', small());
  add('marks/tiny.svg', tiny());
  add('marks/mono.svg', mono('full'));
  add('marks/mono-tiny.svg', mono('tiny'));

  // Разметка адаптивной иконки: обычная и круглая версии одинаковы.
  add(`${ANYDPI_DIR}/ic_launcher.xml`, ADAPTIVE_XML);
  add(`${ANYDPI_DIR}/ic_launcher_round.xml`, ADAPTIVE_XML);

  // Слои адаптивной иконки и классические иконки по плотностям.
  for (const [density, mult] of DENSITIES) {
    const res = `android/res/mipmap-${density}`;
    const layer = Math.round(ADAPTIVE_DP * mult);
    add(`${res}/ic_launcher_foreground.png`, png(foreground(), layer));
    add(`${res}/ic_launcher_background.png`, png(background(), layer));
    add(`${res}/ic_launcher_monochrome.png`, png(monochromeAdaptive(), layer));
    // На mdpi знак мельче, поэтому берём вариант с толстым штрихом.
    const art = density === 'mdpi' ? small() : full();
    const legacy = Math.round(LEGACY_DP * mult);
    add(`${res}/ic_launcher.png`, png(art, legacy));
    add(`${res}/ic_launcher_round.png`, png(roundIcon(art), legacy));
  }

  // Крупные растры для магазина и веба.
  for (const [rel, size] of LARGE_PNGS) add(rel, png(full(), size));

  // favicon: вектор со сменой цвета по схеме и ICO из трёх PNG-кадров.
  add('web/favicon.svg', faviconSvg());
  add(
    'web/favicon.ico',
    encodeIco(ICO_FRAMES.map(([size, variant]) => ({ size, data: png(variant(), size) }))),
  );

  return files;
}

// Удаление пустых каталогов внутри dist; сам dist остаётся на месте.
function pruneEmpty(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(dir, entry.name);
    pruneEmpty(sub);
    if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
  }
}

// Чистим только свои файлы — по списку прошлой сборки, каталог целиком не трогаем.
function clean() {
  const manifest = path.join(DIST_DIR, MANIFEST_NAME);
  if (!fs.existsSync(manifest)) return;
  for (const rel of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
    fs.rmSync(path.join(DIST_DIR, rel), { force: true });
  }
  pruneEmpty(DIST_DIR);
}

// Запись файлов и списка своих файлов.
function writeFiles(files) {
  for (const [rel, data] of files) {
    const abs = path.join(DIST_DIR, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
  }
  const list = [...files.keys(), MANIFEST_NAME];
  fs.writeFileSync(path.join(DIST_DIR, MANIFEST_NAME), JSON.stringify(list, null, 2) + '\n');
  return list;
}

// Полная сборка: чистка прошлой, запись новой, список файлов.
function buildAll() {
  clean();
  return writeFiles(collect());
}

// Ожидаемые размеры PNG: путь от dist → [сторона, сторона].
function expectedSizes() {
  const map = new Map();
  for (const [density, mult] of DENSITIES) {
    const res = `android/res/mipmap-${density}`;
    const layer = Math.round(ADAPTIVE_DP * mult);
    const legacy = Math.round(LEGACY_DP * mult);
    for (const name of ['foreground', 'background', 'monochrome']) {
      map.set(`${res}/ic_launcher_${name}.png`, [layer, layer]);
    }
    map.set(`${res}/ic_launcher.png`, [legacy, legacy]);
    map.set(`${res}/ic_launcher_round.png`, [legacy, legacy]);
  }
  for (const [rel, size] of LARGE_PNGS) map.set(rel, [size, size]);
  return map;
}

// Размер из заголовка IHDR: сигнатура 8 байт, затем длина, тип, ширина, высота.
function ihdrSize(buf) {
  const pngOk =
    buf.length > 24 &&
    buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
    buf.subarray(12, 16).toString('ascii') === 'IHDR';
  return {
    png: pngOk,
    width: buf.length > 24 ? buf.readUInt32BE(16) : -1,
    height: buf.length > 24 ? buf.readUInt32BE(20) : -1,
  };
}

// Чтение файла сборки растром.
function readRaster(rel) {
  const abs = path.join(DIST_DIR, rel);
  if (!fs.existsSync(abs)) return null;
  return PNG.sync.read(fs.readFileSync(abs));
}

// Наибольшее расстояние непрозрачных пикселей от центра и число пикселей вне круга.
function circleStats(img, radius) {
  const c = img.width / 2;
  let far = 0;
  let outside = 0;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[(y * img.width + x) * 4 + 3] <= ALPHA_EDGE) continue;
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > far) far = d;
      if (d > radius + CIRCLE_TOL) outside += 1;
    }
  }
  return { far, outside };
}

// Число заметно непрозрачных пикселей не белого цвета.
function nonWhite(img) {
  let bad = 0;
  let solid = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] <= ALPHA_SOLID) continue;
    solid += 1;
    if (img.data[i] <= WHITE_MIN || img.data[i + 1] <= WHITE_MIN || img.data[i + 2] <= WHITE_MIN) bad += 1;
  }
  return { bad, solid };
}

// Число непрозрачных пикселей в угловых блоках CORNER_PX × CORNER_PX.
function cornerOpaque(img) {
  const span = img.width - CORNER_PX;
  const corners = [[0, 0], [span, 0], [0, span], [span, span]];
  let opaque = 0;
  for (const [cx, cy] of corners) {
    for (let dy = 0; dy < CORNER_PX; dy += 1) {
      for (let dx = 0; dx < CORNER_PX; dx += 1) {
        if (img.data[((cy + dy) * img.width + cx + dx) * 4 + 3] !== 0) opaque += 1;
      }
    }
  }
  return opaque;
}

// Наибольшее отклонение канала между двумя растрами.
function maxChannelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 1) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
  return diff;
}

// Хеши всех файлов сборки: путь от dist → sha256.
function hashList(list) {
  const map = new Map();
  for (const rel of list) {
    map.set(rel, createHash('sha256').update(fs.readFileSync(path.join(DIST_DIR, rel))).digest('hex'));
  }
  return map;
}

// Разбор ICO и сверка кадров с новой отрисовкой того же знака.
function verifyIco(add) {
  const buf = fs.readFileSync(path.join(DIST_DIR, 'web/favicon.ico'));
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  add(
    'ICO: заголовок',
    reserved === 0 && type === 1 && count === ICO_FRAMES.length,
    `reserved=${reserved}, type=${type}, кадров=${count}`,
  );

  for (let i = 0; i < Math.min(count, ICO_FRAMES.length); i += 1) {
    const o = 6 + 16 * i;
    const [want, variant] = ICO_FRAMES[i];
    const recordW = buf.readUInt8(o) || 256;
    const recordH = buf.readUInt8(o + 1) || 256;
    const length = buf.readUInt32LE(o + 8);
    const offset = buf.readUInt32LE(o + 12);
    const data = Buffer.from(buf.subarray(offset, offset + length));
    const head = ihdrSize(data);
    add(
      `ICO кадр ${want}: размер`,
      head.png && head.width === want && head.height === want && recordW === want && recordH === want,
      `запись ${recordW}×${recordH}, PNG ${head.width}×${head.height}`,
    );
    // Кадр обязан совпасть с отрисовкой того же знака прямо сейчас.
    const frame = PNG.sync.read(data);
    const fresh = PNG.sync.read(png(variant(), want));
    const diff = maxChannelDiff(frame, fresh);
    add(`ICO кадр ${want}: совпадает с отрисовкой`, diff <= PIXEL_TOL, `макс. отклонение канала ${diff}`);
  }
}

// Проверка собранного: размеры, безопасный круг, монохром, круглые углы, ICO, разметка, детерминизм.
function verify(list) {
  const rows = [];
  const add = (name, ok, detail = '') => rows.push({ name, ok, detail });

  // 1. Размер в заголовке IHDR каждого PNG.
  for (const [rel, [w, h]] of expectedSizes()) {
    const abs = path.join(DIST_DIR, rel);
    if (!fs.existsSync(abs)) {
      add(`PNG ${rel} ${w}×${h}`, false, 'файл не найден');
      continue;
    }
    const head = ihdrSize(fs.readFileSync(abs));
    add(`PNG ${rel} ${w}×${h}`, head.png && head.width === w && head.height === h, `IHDR ${head.width}×${head.height}`);
  }

  for (const [density] of DENSITIES) {
    // 2. Знак foreground целиком внутри безопасного круга адаптивной иконки.
    const fg = readRaster(`android/res/mipmap-${density}/ic_launcher_foreground.png`);
    if (fg) {
      const radius = (fg.width * SAFE_RATIO) / 2;
      const stats = circleStats(fg, radius);
      add(
        `foreground ${density}: знак в круге r=${radius.toFixed(1)}`,
        stats.outside === 0,
        `дальний пиксель ${stats.far.toFixed(1)} px, вне круга ${stats.outside}`,
      );
    } else {
      add(`foreground ${density}: знак в безопасном круге`, false, 'файл не найден');
    }

    // 3. Монохромный слой — только белые пиксели на прозрачном фоне.
    const monoLayer = readRaster(`android/res/mipmap-${density}/ic_launcher_monochrome.png`);
    if (monoLayer) {
      const stats = nonWhite(monoLayer);
      add(
        `monochrome ${density}: только белое`,
        stats.bad === 0 && stats.solid > 0,
        `непрозрачных ${stats.solid}, не белых ${stats.bad}`,
      );
    } else {
      add(`monochrome ${density}: только белое`, false, 'файл не найден');
    }

    // 4. Углы круглой иконки прозрачные.
    const round = readRaster(`android/res/mipmap-${density}/ic_launcher_round.png`);
    if (round) {
      const opaque = cornerOpaque(round);
      add(`round ${density}: углы прозрачные`, opaque === 0, `непрозрачных в углах ${opaque}`);
    } else {
      add(`round ${density}: углы прозрачные`, false, 'файл не найден');
    }
  }

  // 5. ICO: заголовок, три кадра, совпадение с отрисовкой.
  if (fs.existsSync(path.join(DIST_DIR, 'web/favicon.ico'))) {
    verifyIco(add);
  } else {
    add('ICO: файл', false, 'файл не найден');
  }

  // 6. favicon.svg: сетка 16×16 и переключение цвета по схеме.
  const faviconPath = path.join(DIST_DIR, 'web/favicon.svg');
  if (fs.existsSync(faviconPath)) {
    const text = fs.readFileSync(faviconPath, 'utf8');
    add('favicon.svg: сетка viewBox="0 0 16 16"', text.includes('viewBox="0 0 16 16"'));
    add('favicon.svg: prefers-color-scheme', text.includes('prefers-color-scheme'));
  } else {
    add('favicon.svg: файл', false, 'файл не найден');
  }

  // 7. Разметка адаптивной иконки объявляет слой monochrome.
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const abs = path.join(DIST_DIR, ANYDPI_DIR, name);
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    add(`XML ${name}: слой monochrome`, text.includes('monochrome'), text ? '' : 'файл не найден');
  }

  // 8. Детерминизм: повторная сборка даёт те же байты.
  const first = hashList(list);
  buildAll();
  const second = hashList(list);
  let mismatched = 0;
  for (const rel of list) if (first.get(rel) !== second.get(rel)) mismatched += 1;
  add('сборка детерминирована', mismatched === 0, `файлов ${list.length}, расходятся ${mismatched}`);

  return rows;
}

// Точка входа: сборка и, по флагу, проверка с построчным отчётом.
function main() {
  const list = buildAll();
  console.log(`Собрано файлов: ${list.length}`);
  if (!process.argv.includes('--verify')) {
    for (const rel of list) console.log(`  brand/dist/${rel}`);
    return;
  }

  const rows = verify(list);
  let failed = 0;
  for (const row of rows) {
    if (!row.ok) failed += 1;
    console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
  }
  console.log(`Итог: ${rows.length - failed} из ${rows.length} проверок пройдено`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
