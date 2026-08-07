# Peka RSM — Frontend (SPA)

Vite + React 18 + TypeScript + Ant Design 5 (ru) + TanStack Query + zustand.

## Разработка

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Dev-сервер проксирует `/api/*` на бэкенд (`http://localhost:8000` по
умолчанию; переопределить: `BACKEND_URL=http://host:port npm run dev`).
CORS в dev не нужен.

## Сборка / прод

```bash
npm run build          # dist/
```

Два варианта раздачи:

1. **За одним reverse-proxy с бэкендом (рекомендуется).** Статика `dist/`
   раздаётся nginx-ом, `/api/*` проксируется на uvicorn c обрезкой префикса.
   CORS не требуется. Пример nginx:

   ```nginx
   location /api/ {
       proxy_pass http://127.0.0.1:8000/;   # завершающий / срезает /api
       proxy_set_header Host $host;
   }
   location / {
       root /var/www/peka-rsm-frontend;
       try_files $uri /index.html;          # SPA fallback
   }
   ```

2. **Отдельный origin.** Собрать с `VITE_API_URL=https://api.example.com`,
   а в окружении бэкенда указать `CORS_ORIGINS=https://app.example.com`.

## Переменные сборки (`.env` в frontend/)

| Переменная | Назначение |
|---|---|
| `VITE_API_URL` | Origin API; пусто = same-origin `/api` |
| `VITE_CURRENCY` | Суффикс валюты у денежных сумм (например `₸` или `₽`) |

## Архитектура

- `src/api/client.ts` — axios: Bearer-токен + `X-Organization-Id` на каждый
  запрос, единый разбор ошибок `{code, message, details}`; 401 → logout.
- `src/auth/store.ts` — zustand: токен и активная организация в localStorage;
  профиль (`/auth/me`) и права (`/me/capabilities`) загружаются на старте.
- `src/layout/menu.ts` — вся навигация + требуемые capability; меню и дашборд
  фильтруются по правам активного участника.
- `src/pages/<module>/` — страницы модулей; каждый модуль регистрирует свои
  роуты в `routes.tsx` (см. `CONVENTIONS.md`).

## Приложенные файлы

Три раздела хранятся в GCS и живут на одном коде: `src/api/attachments.ts`
(провод) и `src/components/AttachmentsPanel.tsx` (список + загрузка + скачивание
+ переименование + удаление).

| Где | Что | Право на изменение |
|---|---|---|
| Сотрудники → «Личное дело» | договоры, удостоверения, заявления | `staff.manage` |
| Документ → «Фото накладной» (и окно «Провести») | снимок бумажной накладной | `receipt.post` / `inventory.manage` |
| Выписка → «Файлы выписки» | исходный xlsx (сохраняется сам) и pdf из банка | `payment.manage` |

Название спрашивается **при** загрузке: «IMG_2841.jpg» в личном деле бесполезен,
а дописывать подпись потом никто не возвращается. Пустое поле допустимо — тогда
подписью станет имя файла.

Файл скачивается **запросом, а не ссылкой**: у `/attachments/{id}/download` есть
авторизация (в отличие от `/media/…` для фото меню), и `<a href>` не пошлёт ни
токен, ни `X-Organization-Id`. Поэтому файл тянется axios-ом и отдаётся браузеру
как blob — тем же приёмом, что выгрузка зарплатной ведомости.
