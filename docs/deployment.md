# Развёртывание Forma на Vercel

Используйте отдельный проект Forma и отдельную облачную PostgreSQL-базу. Локальный `localhost` из `server/.env` недоступен Vercel. Базы других проектов не используются.

1. Импортируйте `Sait5/Ai-presentation`, ветку `main`. Root Directory — корень репозитория, Framework Preset — Other, Node.js — 24.x.
2. `vercel.json` задаёт установку двух пакетов, `npm run build`, каталог `ai-create/client/dist` и Express Function `api/index.js`.
3. Создайте отдельную PostgreSQL-базу, например Neon через Vercel Marketplace, на бесплатном плане. Владелец самостоятельно подтверждает условия сервиса, если это требуется.
4. Задайте серверные Environment Variables: `DATABASE_URL`, новый случайный `JWT_SECRET` длиной от 48 символов, `NODE_ENV=production`, `CLIENT_ORIGIN=https://<канонический-домен>`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite`. Секреты не должны иметь префикс `VITE_`, попадать в Git или клиентскую сборку.
5. Облачная сборка выполняет `prisma migrate deploy` перед компиляцией. Миграции применяются только один раз благодаря журналу Prisma. `DATABASE_URL` должна указывать на отдельную базу Forma. Для Preview требуется отдельная база/ветка БД; production-подключение не распространяется на Preview. Локальный `.env` не перезаписывайте.
6. Выполните Deploy/Redeploy. Проверьте `/health`, `/health/ready`, регистрацию, вход, создание и повторное открытие документа, AI и экспорт.
7. После регистрации и проверки аккаунта владельца назначьте администратора через `server/scripts/set-admin.mjs`, используя облачную базу. Локальная роль автоматически не переносится.

Канонический домен должен точно совпадать с `CLIENT_ORIGIN`, иначе CSRF отклонит запись. Preview-домены не получают автоматического доверия.

PDF использует `@sparticuz/chromium` в Vercel, локально — Playwright Chromium. Бинарные файлы и Noto Sans включаются в Function. Данные сохраняются в PostgreSQL, а не в эфемерной файловой системе.

Проверяйте фактический размер Function и лимиты HTTP-полезной нагрузки. Большие изображения и экспорты потребуют объектного хранилища. Ограничение запросов в памяти действует на один экземпляр; PostgreSQL-лимит восьми созданий общий для всех экземпляров.

Документация: [конфигурация Vercel](https://vercel.com/docs/project-configuration/vercel-json), [ограничения Functions](https://vercel.com/docs/functions/limitations).
