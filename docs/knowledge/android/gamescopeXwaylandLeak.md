# УТЕЧКА ПАМЯТИ ПОД GAMESCOPE: XWAYLAND И TURNIP КОНТЕЙНЕРА

## Симптом

Игра под gamescope работает минуты две-три, потом Android убивает ThorHub
DMA-BUF в системе растёт примерно на 60 в секунду

---

## 1. Где течёт

Счёт дескрипторов показал виновника:
У Xwayland тысячи dmabuf-дескрипторов (758 → 3199 за 40 с)
У X-клиентов по 1–4 пиксмапа (утилита xres_count)
gamescope отпускает все wl_buffer: WAYLAND_DEBUG дал 2584 attach и 2581 release

Xwayland рисует через glamor на zink, а zink — через ICD-шим gamenative-drm
Шим грузит драйвер из ADRENOTOOLS_DRIVER_PATH, то есть Turnip контейнера
Импорт клиентских буферов в Turnip v26.2.0 R4 и R8 оставляет по dma-buf на каждый кадр

С драйвером из самого пакета gamescope у Xwayland 9–18 буферов, и число стоит

---

## 2. Почему не выключить adrenotools целиком

GN_VKSHIM_NO_ADRENOTOOLS=1 на весь контейнер переводит на драйвер пакета и игру
Лаунчеры гостя (Ubisoft) с ним перестают рисоваться
Поэтому правка точечная: в шиме Xwayland пропускает try_adrenotools, остальные процессы — как были

---

## 3. Как доставляется

Payload gamescope собирает CI GameNative, свой целиком собирать не нужно
Скрипт `app/tools/build-gamescope-overlay.sh` собирает шим из того же коммита gamenative-drm с патчами
из `app/tools/gamescope-overlay/patches/` и кладёт его в `assets/gamescope-overlay/`
`GamescopePayload` при установке кладёт файлы overlay поверх распакованного payload'а до правки путей
В метке установки стоит `+overlay:N`: смена файлов overlay — поднять OVERLAY_REVISION, и payload переставится

Overlay собран под одну версию payload'а и под другую не ставится
Сменили GamescopePayload.VERSION — пересобрать overlay и сверить коммит шима в скрипте

---

## 4. Как проверить

Найти Xwayland: `adb shell ps -A -o PID,ARGS | grep -i "[X]wayland"` (pidof его не видит: запуск через linker64)
Число буферов: `adb shell run-as app.thorhub ls -l /proc/<pid>/fd | grep -c dmabuf`
Норма — около десятка, и оно не растёт
