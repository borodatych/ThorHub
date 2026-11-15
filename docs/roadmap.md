# ROADMAP THORHUB

## Айдентика

- [x] **Направления иконки** — ✅ (15.11.2026, next) три эскиза на `identity/iconDirections.html`, выбрана руна Þ
- [x] **Генератор знака** — ✅ (15.11.2026, next) `brand/src/params.mjs` и `mark.mjs`: полный, малый (до 32 px), 16 px на сетке, монохром, слои адаптивной иконки
  Проверка `node brand/src/verifyMark.mjs` и `--self-test` (17 замеров на растре 2048, пять нарочных поломок обязаны падать)
- [x] **Ассеты иконки** — ✅ (15.11.2026, next) `node brand/src/buildAssets.mjs --verify` собирает `brand/dist/`:
  адаптивная иконка Android с монохромным слоем, legacy и круглые mipmap, Play 512, favicon svg и ico, PWA, apple-touch, 56 проверок
- [ ] **Оптические поправки знака** — страница `brand/review/rune.html` (`node brand/src/buildReview.mjs`), ждёт выбора владельца
- [ ] **Знак крупнее на адаптивной иконке** — сейчас вписан в безопасный круг по диагонали габарита, со скруглёнными углами это с запасом
- [ ] **Проверка названия ThorHub** — товарные знаки, домен, Google Play
