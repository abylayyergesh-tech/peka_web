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
