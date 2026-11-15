// Проверка знака ThorHub по пикселям растра 2048 (масштаб 2 к холсту 1024).
// Код выхода 0 — все проверки прошли, 1 — хотя бы одна провалилась.

import { createRequire } from 'node:module';
import { build } from './mark.mjs';
import { PARAMS, COLORS } from './params.mjs';

// Растеризатор живёт вне проекта, путь задаётся переменной окружения THORHUB_TOOLS.
const req = createRequire((process.env.THORHUB_TOOLS ?? '/Volumes/Storage/Caches/ThorHub/tools') + '/');
const { Resvg } = req('@resvg/resvg-js');

// Масштаб растра: 2048 = 2 × 1024, поэтому все допуски в пикселях растра умножаем на 2.
const SCALE = 2;
// Допуск проверок: ±1 px в координатах холста = ±2 px в растре.
const TOL = 1;

// Разбор #rrggbb в тройку каналов.
function parseHex(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Цвета знака в виде троек каналов — дальше сравниваем только по RGB.
const C = {
  bg: parseHex(COLORS.bg),
  mark: parseHex(COLORS.mark),
  hub: parseHex(COLORS.hub),
};

// Пиксель растра в виде тройки RGB.
function pixel(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

// «Свой» цвет: евклидово расстояние в RGB строго меньше 40.
function isColor(img, x, y, target) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
  const p = pixel(img, x, y);
  const d = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
  return d < 40;
}

// Растеризация SVG в ширину 2048.
function raster(svg) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: PARAMS.size * SCALE } }).render();
  return { data: image.pixels, width: image.width, height: image.height };
}

// Длина сплошного отрезка своего цвета вокруг точки; шаг задаётся знаком dx/dy.
function runLength(img, x, y, dx, dy, target) {
  if (!isColor(img, x, y, target)) return 0;
  let n = 1;
  let cx = x + dx;
  let cy = y + dy;
  while (isColor(img, cx, cy, target)) {
    n += 1;
    cx += dx;
    cy += dy;
  }
  return n;
}

// Полная длина отрезка своего цвета, проходящего через точку.
function spanThrough(img, x, y, dx, dy, target) {
  return runLength(img, x, y, dx, dy, target) + runLength(img, x, y, -dx, -dy, target) - 1;
}

// Первый пиксель своего цвета на луче; null, если луч вышел за растр.
function firstOnRay(img, x, y, dx, dy, target) {
  let cx = x;
  let cy = y;
  while (cx >= 0 && cy >= 0 && cx < img.width && cy < img.height) {
    if (isColor(img, cx, cy, target)) return { x: cx, y: cy };
    cx += dx;
    cy += dy;
  }
  return null;
}

// Габарит всех пикселей, попавших в один из цветов набора.
function boundsOf(img, colors) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const hit = colors.some((c) => isColor(img, x, y, c));
      if (!hit) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

// Относительная яркость канала по WCAG 2.x.
function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

// Относительная яркость цвета по WCAG.
function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

// Коэффициент контраста двух цветов по WCAG.
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Набор проверок знака: каждая возвращает {name, ok, detail}.
function runChecks(p) {
  const img = raster(build(p));
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });

  // Зона ствола выше петли: торцы ствола — центры полукругов, петля начинается ниже.
  const loopTop = p.arcCy - (p.arcR + p.strokeW / 2);
  // Эталон толщины берём из базовых параметров: иначе подмена W спрячет сама себя.
  const expected = PARAMS.strokeW * SCALE;

  // 1. Толщина ствола: три уровня внутри свободного участка выше петли.
  for (const frac of [0.35, 0.5, 0.65]) {
    const yMark = p.stemTopY + frac * (loopTop - p.stemTopY);
    const y = Math.round(yMark * SCALE);
    const x = Math.round((p.stemX + p.offsetX) * SCALE);
    const len = spanThrough(img, x, y, 1, 0, C.mark);
    add(
      `ствол W на y=${Math.round(yMark)} (${frac} свободной зоны)`,
      Math.abs(len - expected) <= TOL,
      `${len} px, ожидалось ${expected} ±${TOL}`,
    );
  }

  // 2. Толщина петли на горизонтали через центр дуги, справа от хаба.
  if (true) {
    const y = Math.round(p.arcCy * SCALE);
    const start = firstOnRay(img, img.width - 1, y, -1, 0, C.mark);
    const len = start ? runLength(img, start.x, start.y, -1, 0, C.mark) : 0;
    add('петля W на y=512 справа от хаба', Math.abs(len - expected) <= TOL, `${len} px, ожидалось ${expected} ±${TOL}`);
  }

  // 3. Толщина петли на вертикали через центр дуги: верх и низ отдельно.
  {
    const x = Math.round((p.arcCx + p.offsetX) * SCALE);
    const top = firstOnRay(img, x, 0, 0, 1, C.mark);
    const topLen = top ? runLength(img, top.x, top.y, 0, 1, C.mark) : 0;
    const bottom = firstOnRay(img, x, img.height - 1, 0, -1, C.mark);
    const bottomLen = bottom ? runLength(img, bottom.x, bottom.y, 0, -1, C.mark) : 0;
    add('петля W на x=532 сверху', Math.abs(topLen - expected) <= TOL, `${topLen} px, ожидалось ${expected} ±${TOL}`);
    add('петля W на x=532 снизу', Math.abs(bottomLen - expected) <= TOL, `${bottomLen} px, ожидалось ${expected} ±${TOL}`);
  }

  // 4. Хаб: диаметр по обеим осям и совпадение центра с центром дуги.
  const hub = boundsOf(img, [C.hub]);
  const hubW = hub.maxX - hub.minX + 1;
  const hubH = hub.maxY - hub.minY + 1;
  const hubCx = (hub.minX + hub.maxX) / 2;
  const hubCy = (hub.minY + hub.maxY) / 2;
  const wantD = 2 * PARAMS.hubR * SCALE;
  // Центр хаба ждём в центре дуги со сдвигом offsetX; hubDx — уже поломка.
  const wantCx = (PARAMS.arcCx + p.offsetX) * SCALE;
  const wantCy = p.arcCy * SCALE;
  add('хаб: диаметр по x', Math.abs(hubW - wantD) <= 2 * TOL, `${hubW} px, ожидалось ${wantD} ±${2 * TOL}`);
  add('хаб: диаметр по y', Math.abs(hubH - wantD) <= 2 * TOL, `${hubH} px, ожидалось ${wantD} ±${2 * TOL}`);
  add(
    'хаб: центр в центре дуги',
    Math.abs(hubCx - wantCx) <= 2 * TOL && Math.abs(hubCy - wantCy) <= 2 * TOL,
    `центр (${(hubCx / SCALE).toFixed(1)}, ${(hubCy / SCALE).toFixed(1)}), ожидалось (${wantCx / SCALE}, ${wantCy / SCALE})`,
  );

  // 5. Поля: габарит знака не ближе 15 % холста к краю плашки.
  const mark = boundsOf(img, [C.mark, C.hub]);
  const need = p.marginRatio * img.width;
  const margins = {
    left: mark.minX,
    top: mark.minY,
    right: img.width - 1 - mark.maxX,
    bottom: img.height - 1 - mark.maxY,
  };
  for (const [side, value] of Object.entries(margins)) {
    add(
      `поле ${side} ≥ 15 % холста`,
      value >= need,
      `${(value / SCALE).toFixed(1)} px, нужно ≥ ${(need / SCALE).toFixed(1)}`,
    );
  }

  // 5б. Ствол симметричен относительно 512, значит поля сверху и снизу равны
  //     Ловит вывернутый торец ствола: поле при нём остаётся больше 15 %, но ствол короче
  add(
    'поля сверху и снизу равны',
    Math.abs(margins.top - margins.bottom) <= SCALE,
    `top=${(margins.top / SCALE).toFixed(1)}, bottom=${(margins.bottom / SCALE).toFixed(1)}, допуск 1 px`,
  );

  // 6. Зазор между хабом и внутренним краем петли одинаков со всех сторон.
  //    Слева зазор меряется до правого края ствола, по остальным сторонам — до дыры петли.
  const gap = {};
  {
    const y = Math.round(hubCy);
    const x = Math.round(hubCx);
    const leftHit = firstOnRay(img, hub.minX - 1, y, -1, 0, C.mark);
    const rightHit = firstOnRay(img, hub.maxX + 1, y, 1, 0, C.mark);
    const upHit = firstOnRay(img, x, hub.minY - 1, 0, -1, C.mark);
    const downHit = firstOnRay(img, x, hub.maxY + 1, 0, 1, C.mark);
    gap.left = leftHit ? hub.minX - leftHit.x - 1 : NaN;
    gap.right = rightHit ? rightHit.x - hub.maxX - 1 : NaN;
    gap.top = upHit ? hub.minY - upHit.y - 1 : NaN;
    gap.bottom = downHit ? downHit.y - hub.maxY - 1 : NaN;
  }
  const gapValues = Object.values(gap);
  const gapKnown = gapValues.every((v) => Number.isFinite(v));
  const gapSpread = gapKnown ? Math.max(...gapValues) - Math.min(...gapValues) : Infinity;
  const gapText = gapKnown
    ? Object.entries(gap).map(([k, v]) => `${k}=${(v / SCALE).toFixed(1)}`).join(', ')
    : 'зазор не измерен — хаб не окружён петлёй';
  add('зазор хаб–петля одинаков с четырёх сторон', gapSpread <= 2 * TOL, `${gapText}; разброс ${(gapSpread / SCALE).toFixed(1)} px`);

  // 7. Контраст цветов знака к плашке по формуле WCAG, без растра.
  const markContrast = contrast(C.mark, C.bg);
  const hubContrast = contrast(C.hub, C.bg);
  add('контраст #ffb020 к #14161c ≥ 3:1', markContrast >= 3, `${markContrast.toFixed(2)}:1`);
  add('контраст #3fd0ff к #14161c ≥ 3:1', hubContrast >= 3, `${hubContrast.toFixed(2)}:1`);

  return results;
}

// Печать набора проверок; возвращает число провалов.
function print(results, prefix = '') {
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${prefix}${r.name}: ${r.detail}`);
  }
  return failed;
}

// Основной прогон: проверяем полный знак и печатаем построчный отчёт.
function main() {
  console.log('Проверка знака ThorHub (растр 2048, масштаб 2)');
  const results = runChecks(PARAMS);
  const failed = print(results);
  console.log(`Итог: ${results.length - failed} из ${results.length} проверок пройдено`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// selfTest: базовый знак должен проходить, каждый сломанный — обязан провалиться.
function selfTest() {
  console.log('Self-test: проверка чувствительности проверок');
  let broken = 0;

  // Базовый знак: если он не проходит, все «провалы» сломанных вариантов ничего не доказывают.
  const base = runChecks(PARAMS);
  const baseFailed = base.filter((r) => !r.ok).length;
  if (baseFailed > 0) broken += 1;
  console.log(`\n[базовый знак] ${baseFailed === 0 ? 'прошёл' : 'провалился'}`);
  print(base, '  ');

  const half = PARAMS.strokeW / 2;
  // Сдвиг, при котором левое поле гарантированно становится меньше 15 % холста.
  const tightOffset =
    PARAMS.marginRatio * PARAMS.size - (PARAMS.stemX - half) - 8;

  const cases = [
    { name: 'ствол W + 20', patch: { strokeW: PARAMS.strokeW + 20 } },
    { name: 'радиус петли r + 20', patch: { arcR: PARAMS.arcR + 20 } },
    { name: 'хаб сдвинут на 10', patch: { hubDx: 10 } },
    { name: 'offsetX ломает поле 15 %', patch: { offsetX: tightOffset } },
    { name: 'нижний торец ствола выше на 30', patch: { stemBottomY: PARAMS.stemBottomY - 30 } },
  ];

  for (const c of cases) {
    const results = runChecks({ ...PARAMS, ...c.patch });
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      broken += 1;
      console.log(`\n[${c.name}] ПРОШЁЛ — так нельзя, сломанный знак обязан провалиться`);
      print(results, '  ');
    } else {
      console.log(`\n[${c.name}] отклонён, провалов: ${failed.length}`);
      for (const r of failed) console.log(`  FAIL ${r.name}: ${r.detail}`);
    }
  }

  console.log(`\nИтог self-test: ${broken === 0 ? 'все проверки ловят поломки' : `проблем: ${broken}`}`);
  process.exitCode = broken === 0 ? 0 : 1;
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  main();
}
