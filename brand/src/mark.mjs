// Сборка SVG знака ThorHub.
// Каждая функция возвращает готовую строку SVG с viewBox и заголовком ThorHub.

import { PARAMS, COLORS, SMALL } from './params.mjs';

// Координаты округляем до тысячных: в SVG это неразличимо, зато нет длинных хвостов float.
const f = (v) => Number(v.toFixed(3));

// Слияние базовых параметров с переопределением — единственная точка настройки геометрии.
function resolve(overrides) {
  return { ...PARAMS, ...overrides };
}

// Ствол — «стадион»: два прямых бока и два полукруглых торца радиусом в половину штриха.
function stemPath(p) {
  const h = p.strokeW / 2;
  const x0 = f(p.stemX - h);
  const x1 = f(p.stemX + h);
  const y0 = f(p.stemTopY);
  const y1 = f(p.stemBottomY);
  return (
    `M${x0} ${y0} L${x0} ${y1} ` +
    // Нижний торец идёт слева направо через низ — против часовой, sweep 0, иначе полукруг уходит внутрь ствола
    `A${f(h)} ${f(h)} 0 0 0 ${x1} ${y1} ` +
    `L${x1} ${y0} ` +
    `A${f(h)} ${f(h)} 0 0 0 ${x0} ${y0} Z`
  );
}

// Петля — кольцо как разность контуров: внешний контур и дыра, заливка evenodd.
// Обводок нет: толщина задаётся геометрией, а не stroke.
function loopPath(p) {
  const R = p.arcR + p.strokeW / 2;
  const rIn = p.arcR - p.strokeW / 2;
  const left = f(p.stemX);
  const flat = f(p.stemX + p.strokeW / 2);
  const cx = f(p.arcCx);
  const top = f(p.arcCy - R);
  const bottom = f(p.arcCy + R);
  const inTop = f(p.arcCy - rIn);
  const inBottom = f(p.arcCy + rIn);
  const outer =
    `M${left} ${top} L${cx} ${top} ` +
    `A${f(R)} ${f(R)} 0 0 1 ${cx} ${bottom} ` +
    `L${left} ${bottom} Z`;
  const inner =
    `M${flat} ${inTop} L${cx} ${inTop} ` +
    `A${f(rIn)} ${f(rIn)} 0 0 1 ${cx} ${inBottom} ` +
    `L${flat} ${inBottom} Z`;
  return `${outer} ${inner}`;
}

// Знак без плашки: ствол, петля и хаб одним блоком, сдвинутым на offsetX.
function markGroup(p, colors) {
  const hubX = f(p.arcCx + p.hubDx);
  return (
    `<g transform="translate(${f(p.offsetX)} 0)">` +
    `<path d="${stemPath(p)}" fill="${colors.mark}"/>` +
    `<path d="${loopPath(p)}" fill="${colors.mark}" fill-rule="evenodd"/>` +
    `<circle cx="${hubX}" cy="${f(p.arcCy)}" r="${f(p.hubR)}" fill="${colors.hub}"/>` +
    `</g>`
  );
}

// Обёртка SVG: общая шапка с viewBox и заголовком.
function svg(size, body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}">` +
    `<title>ThorHub</title>` +
    body +
    `</svg>`
  );
}

// Плашка: квадрат со скруглением, цвет фона из палитры.
function plate(p, fill) {
  return `<rect x="0" y="0" width="${p.size}" height="${p.size}" rx="${p.radius}" fill="${fill}"/>`;
}

// Вариант 1: полный знак на плашке — исходник для крупных размеров.
export function full() {
  return build();
}

// Вариант 2: для размеров до 32 px — штрих толще, хаб крупнее, остальное как в full.
export function small() {
  const p = resolve(SMALL);
  return svg(
    p.size,
    plate(p, COLORS.bg) + markGroup(p, { mark: COLORS.mark, hub: COLORS.hub }),
  );
}

// Рисунок под сетку 16×16: ячейки [x, y, w, h], один источник для цветного и монохромного варианта
const TINY_CELLS = [
  // Ствол: две ячейки шириной, двенадцать высотой — торчит за петлю на два пикселя сверху и снизу,
  // Иначе на 16 px руна читается как «D»
  [5, 2, 2, 12],
  // Петля: верх и низ перекладины по три ячейки, чтобы не тоньше ствола
  [7, 4, 3, 2],
  [7, 10, 3, 2],
  // Правая колонна петли: две ячейки шириной, шесть высотой
  [10, 5, 2, 6],
  // Углы скругляем одиночными пикселями — иначе петля выглядит квадратной
  [10, 4, 1, 1],
  [10, 11, 1, 1],
];

function tinySvg(plateColor, markColor) {
  // Плашка: скругление 3 ячейки — предел, при котором углы ещё читаются пикселями
  const plateRect = plateColor ? `<rect x="0" y="0" width="16" height="16" rx="3" fill="${plateColor}"/>` : '';
  const cells = TINY_CELLS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${markColor}"/>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" ` +
    `shape-rendering="crispEdges"><title>ThorHub</title>` +
    plateRect +
    cells.join('') +
    `</svg>`
  );
}

// Вариант 3: рисунок под сетку 16×16, только прямоугольники и crispEdges, хаба нет — на 16 px он не читается
export function tiny() {
  return tinySvg(COLORS.bg, COLORS.mark);
}

// Вариант 4: монохром без плашки, всё currentColor — для тем и одноцветной печати
// variant: 'full' | 'small' | 'tiny'
export function mono(variant = 'full') {
  if (variant === 'tiny') return tinySvg(null, 'currentColor');
  const p = variant === 'small' ? resolve(SMALL) : resolve({});
  // Хаб остаётся отдельным кругом того же цвета: зазор вокруг него не нужен.
  return svg(p.size, markGroup(p, { mark: 'currentColor', hub: 'currentColor' }));
}

// Вариант 5: foreground адаптивной иконки Android.
// Знак без плашки вписан в безопасный круг диаметром 66/108 холста.
export function foreground() {
  const p = resolve({});
  const half = p.strokeW / 2;
  const R = p.arcR + half;
  // Габарит знака берём по крайним точкам ствола и внешнего кольца петли.
  const minX = p.stemX - half + p.offsetX;
  const maxX = p.arcCx + R + p.offsetX;
  const minY = Math.min(p.stemTopY - half, p.arcCy - R);
  const maxY = Math.max(p.stemBottomY + half, p.arcCy + R);
  const w = maxX - minX;
  const h = maxY - minY;
  const safe = (p.size * 66) / 108;
  // Масштаб по большей стороне габарита — знак целиком входит в безопасный круг.
  const s = safe / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = p.size / 2 - s * cx;
  const ty = p.size / 2 - s * cy;
  const body =
    `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(s)})">` +
    `<path d="${stemPath(p)}" fill="${COLORS.mark}"/>` +
    `<path d="${loopPath(p)}" fill="${COLORS.mark}" fill-rule="evenodd"/>` +
    `<circle cx="${f(p.arcCx + p.hubDx)}" cy="${f(p.arcCy)}" r="${f(p.hubR)}" fill="${COLORS.hub}"/>` +
    `</g>`;
  return svg(p.size, body);
}

// Вариант 6: фон адаптивной иконки — сплошной цвет без скругления.
export function background() {
  const p = resolve({});
  return svg(p.size, `<rect x="0" y="0" width="${p.size}" height="${p.size}" fill="${COLORS.bg}"/>`);
}

// build: полный знак с переопределением параметров — используется проверкой и selfTest.
export function build(overrides = {}) {
  const p = resolve(overrides);
  return svg(
    p.size,
    plate(p, COLORS.bg) + markGroup(p, { mark: COLORS.mark, hub: COLORS.hub }),
  );
}

export default { full, small, tiny, mono, foreground, background, build };
