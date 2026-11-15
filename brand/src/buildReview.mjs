// Страница сравнения оптических поправок знака: node brand/src/buildReview.mjs
// Каждая поправка — набор переопределений PARAMS, рисунок строит тот же генератор, что и поставку
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './mark.mjs';
import { PARAMS } from './params.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../review/rune.html');
const SIZES = [240, 48, 32];

// Габарит знака по x сейчас 302…762 при центре холста 512: знак смещён вправо на (302 + 762) / 2 − 512 = 20
const GEOMETRIC_SHIFT = 512 - (PARAMS.stemX - PARAMS.strokeW / 2 + PARAMS.arcCx + PARAMS.arcR + PARAMS.strokeW / 2) / 2;

const VARIANTS = [
  { title: 'Как сейчас', note: `Знак правее центра холста на ${-GEOMETRIC_SHIFT}: петля шире ствола и тянет габарит вправо`, patch: {} },
  { title: 'Центр по габариту', note: `Весь знак сдвинут на ${GEOMETRIC_SHIFT} — габарит по центру холста`, patch: { offsetX: GEOMETRIC_SHIFT } },
  { title: 'Хаб меньше', note: 'Хаб r=46 вместо 56 — шире зазор, петля легче', patch: { hubR: 46 } },
  { title: 'Хаб крупнее', note: 'Хаб r=66 — точка заметнее на 48 и 32 px', patch: { hubR: 66 } },
  { title: 'Центр по габариту + хаб меньше', note: 'Сочетание второго и третьего', patch: { offsetX: GEOMETRIC_SHIFT, hubR: 46 } },
];

const row = (svg) =>
  SIZES.map((s) => `<div class="t"><img width="${s}" height="${s}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">${s}</div>`).join('');

const cards = VARIANTS.map((v) => {
  const svg = build(v.patch);
  return `<section><h2>${v.title}</h2><p>${v.note}</p>` +
    `<div class="pads"><div class="pad light">${row(svg)}</div><div class="pad dark">${row(svg)}</div></div></section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ThorHub — поправки знака</title>
<style>
  body { margin: 0; font: 15px/1.45 system-ui, -apple-system, sans-serif; background: #f4f4f6; color: #15171c }
  main { max-width: 1100px; margin: 0 auto; padding: 32px 16px }
  section { background: #fff; border: 1px solid #e3e4ea; border-radius: 16px; padding: 20px; margin-bottom: 20px }
  h2 { margin: 0 0 4px; font-size: 20px }
  p { margin: 0 0 14px; color: #6b7080 }
  .pads { display: flex; flex-wrap: wrap; gap: 16px }
  .pad { display: flex; gap: 16px; align-items: flex-end; padding: 16px; border-radius: 12px }
  .light { background: #fff; border: 1px solid #e3e4ea }
  .dark { background: #0d0e12; color: #9aa0ad }
  .t { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px }
</style></head>
<body><main><h1>Руна Þ — оптические поправки</h1>
<p>Геометрия у всех вариантов точная, отличается только восприятие. Выбранное станет значением по умолчанию в params.mjs.</p>
${cards}
</main></body></html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`записано: ${path.relative(process.cwd(), OUT)}`);
