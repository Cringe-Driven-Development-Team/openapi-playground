# openapi-playground: openapi-fetch и openapi-typescript на нашем контракте

Дата: 2026-09-30. Статус: утверждено в чате, ждёт ревью спеки.

## 1. Цель и рамки

Денис пишет свой API-клиент — пакет `@my/openapi`: генератор типов строками и
типизированный `fetch`-клиент
([frontend#12](https://github.com/Cringe-Driven-Development-Team/frontend/issues/12)).
Playground показывает на нашем контракте, как это делают готовые библиотеки, и служит
эталоном поведения:

- выгрузка спеки из Apidog в JSON и YAML;
- кодогенерация `schema.d.ts` из обоих форматов (openapi-typescript);
- запросы openapi-fetch в облачный мок Apidog;
- что ловят типы: каталог ошибок на `@ts-expect-error`;
- как клиент собирает запрос и разбирает ответ: тесты с подменённым `fetch`;
- всё в bun.

Критерий успеха: Денис клонирует репу, `bun install`, `bun run generate`,
`bun run demo` — видит типизированные ответы мока; `bun run typecheck` и `bun test`
зелёные без токена и без сети.

В рамках: новая публичная репа `Cringe-Driven-Development-Team/openapi-playground`,
README, CI.

Вне рамок:

- пакет `@my/openapi` и ветка `my-openapi` с ним — это работа Дениса; здесь только
  соглашение о ветке в README (§7);
- слой запросов в духе TanStack Query
  ([frontend#15](https://github.com/Cringe-Driven-Development-Team/frontend/issues/15));
- страница в браузере;
- ошибочные ответы на живом мок-запросе: как выбрать у облачного мока конкретный ответ
  (например, `401`), документация Apidog не описывает; ветка `error` показана в тестах.

## 2. Проверенные факты

Apidog, проект `1382426`:

- Облачный мок включён 2026-09-30, доступ Open Access:
  `https://mock.apidog.com/m1/1382426-1388508-default`. Пути — как в спеке, без
  `/api/v1`: `GET /notebooks` → 200 и массив, `GET /notebooks/{id}` → 200,
  `POST /notebooks` → 201, `GET /users/me` → 200, `POST /auth/login` → 200.
- Мок генерирует данные Faker'ом и не соблюдает `format`: `id` приходит как `"17"`, а
  не uuid, `updated_at` — `"2027-03-26"`, а не date-time. Тело запроса не проверяет:
  `POST /notebooks` с `{}` → 201. Заголовок `Authorization` в ответе `/auth/login`
  пустой.
- Выгрузка спеки — как в `cmd/apidog/main.go` репы бэка
  (`go-park-mail-ru/2026_2_Cringe_Driven_Development`, `main` на `ba54992`):
  `POST https://api.apidog.com/v1/projects/1382426/export-openapi`, заголовки
  `Authorization: Bearer {APIDOG_TOKEN}`, `X-Apidog-Api-Version: 2024-03-28`,
  `Content-Type: application/json`; тело `{ "scope": { "type": "ALL" }, "options":
  { "includeApidogExtensionProperties": false, "addFoldersToTags": false },
  "oasVersion": "3.1", "exportFormat": "JSON" | "YAML", "branchId": … }`; без
  `branchId` — ветка `main`. 401/403 — неверный токен.

Контракт (встроенная спека бэка, `api.GetSwagger()`): OAS `3.1.0`, 7 путей, 6 схем,
`bearerAuth` (JWT).

| Операция | Коды | Тело | Авторизация |
| --- | --- | --- | --- |
| `POST /auth/login` | 200, 400, 401, 500 | `Credentials` | нет |
| `POST /auth/register` | 201, 400, 409, 500 | `Credentials` | нет |
| `POST /auth/refresh` | 204, 401, 500 | — | нет |
| `POST /auth/logout` | 204, 401, 500 | — | нет |
| `GET /notebooks`, `POST /notebooks` | 200 / 201, 400, 401, 500 | `CreateNotebookRequest` у POST | Bearer |
| `GET /notebooks/{id}` | 200, 401, 404, 500 | — | Bearer |
| `GET /users/me` | 200, 401, 500 | — | Bearer |

Access-токен бэк отдаёт в заголовке ответа `Authorization` у `/auth/login`,
`/auth/register` и `/auth/refresh` (204); refresh-сессия — в cookie (`Set-Cookie`).
Базовый путь настоящего Go API — `/api/v1`.

Библиотеки (npm, 2026-09-30):

- `openapi-typescript` 7.13.0, `peerDependencies: { typescript: "^5.x" }`; строит типы
  через `ts.factory`, на TypeScript 7 падает
  ([openapi-typescript#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841)).
- `openapi-fetch` 0.17.0, peer-зависимостей нет, рантайм-зависимость
  `openapi-typescript-helpers`.
- TypeScript: последняя 5.x — 5.9.3.

Окружение и соглашения:

- bun 1.4.2 сам читает `.env` в `process.env` (проверено).
- Playground'ы пользователя (`YarikMix/WebGL-playground`): README на русском, bun,
  `strict` + `noUncheckedIndexedAccess`, реализации для сравнения — в ветках.
- Общий workflow организации `.github/workflows/automation.yml` (доска задач и
  Telegram) есть во всех репах; его секреты `ADD_TO_PROJECT_PAT` и
  `TELEGRAM_BOT_TOKEN` заданы на уровне организации для всех реп.

## 3. Принятые решения

| Решение | Почему | Отвергнуто |
| --- | --- | --- |
| TypeScript 5.9.3 во всей репе | peer-диапазон openapi-typescript `^5.x` выполняется честно, без алиасов | TS 7 + алиас `@typescript/typescript6` для генератора; TS 6 |
| Один bun-проект со скриптами по шагам | каждый шаг запускается отдельно и читается по `package.json` | ветки на каждую тему; страница на Vite |
| Облачный мок Apidog, Open Access | живые ответы по актуальному контракту без бэка; прятать нечего, контракт публичный | Token Required; свой мок на `Bun.serve`; Prism |
| Снимок спеки и `schema.d.ts` в git | генерация, typecheck и тесты работают без токена и сети, в том числе в CI | выгружать при каждом запуске |
| Ветка `error` — в тестах | детерминированно; выбор ответа у мока не документирован | подбирать параметры мока наугад |
| Ветка `my-openapi` — соглашение в README | потом playground становится стендом приёмки пакета Дениса | заводить ветку сейчас |

## 4. Состав репы

| Путь | Что внутри |
| --- | --- |
| `package.json` | скрипты `apidog`, `generate`, `demo`, `typecheck`, `test`; `engines.bun >= 1.4.0` |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `noEmit`, `types: ["bun"]`, `module: "Preserve"`, `moduleResolution: "bundler"` |
| `.env.example` | `APIDOG_TOKEN=`, `APIDOG_BRANCH_ID=`, `API_BASE_URL=` с комментариями |
| `.gitignore` | `node_modules/`, `.env`, `*.log` |
| `scripts/apidog.ts` | выгрузка спеки (§5) |
| `spec/openapi.json`, `spec/openapi.yaml` | снимок `main` Apidog |
| `src/api/schema.d.ts` | результат `bun run generate`, руками не правится |
| `src/api/client.ts` | клиент и middleware авторизации (§6) |
| `src/demo.ts` | `bun run demo` (§6) |
| `src/type-errors.ts` | каталог ошибок типов (§6) |
| `tests/client.test.ts`, `tests/generate.test.ts` | тесты (§6) |
| `.github/workflows/ci.yml` | `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` |
| `.github/workflows/automation.yml` | копия из репы `react` |
| `README.md` | §7 |

Зависимости: `openapi-fetch` 0.17.0 (dependencies); `openapi-typescript` 7.13.0,
`typescript` 5.9.3, `@types/bun` (devDependencies). Версии закреплены точно.

## 5. Выгрузка и генерация

`bun run apidog` → `bun scripts/apidog.ts`:

- `APIDOG_TOKEN` обязателен: без него — сообщение, где взять личный токен (Apidog →
  Account Settings → API Access Token) и что положить его в `.env`, код выхода 1.
- `APIDOG_BRANCH_ID` необязателен: положительное целое → `branchId` (sprint-ветка),
  иначе ошибка; пусто — `main`.
- Два запроса `export-openapi`: `exportFormat: "JSON"` → `spec/openapi.json`,
  `"YAML"` → `spec/openapi.yaml`. Ответ не 200 → ошибка с кодом и началом тела; 401/403
  → «проверь APIDOG_TOKEN». JSON-ответ проверяется: объект с полем `openapi`.
- В stderr — какая ветка выгружена и куда.

`bun run generate` → `openapi-typescript spec/openapi.json -o src/api/schema.d.ts`.

`tests/generate.test.ts` через Node API (`openapiTS`, `astToString`) генерирует типы из
`spec/openapi.json` и `spec/openapi.yaml` и проверяет, что строки равны: формат входа
на результат не влияет.

## 6. Клиент, демо, каталог ошибок, тесты

`src/api/client.ts`:

- `export const MOCK_BASE_URL = "https://mock.apidog.com/m1/1382426-1388508-default"`.
- `export function createApi(options?: { baseUrl?: string; fetch?: typeof fetch })`
  → `createClient<paths>({ baseUrl: options.baseUrl ?? process.env.API_BASE_URL ||
  MOCK_BASE_URL, fetch, credentials: "include" })` с подключённым middleware;
  `credentials: "include"` — чтобы cookie refresh-сессии уходили на бэк; для бэка
  `API_BASE_URL=http://localhost:8080/api/v1`.
- Ограничение bun: в браузере HttpOnly-cookie refresh-сессии шлёт сам браузер
  благодаря `credentials: "include"`, а у `fetch` в bun нет хранилища cookie. Поэтому
  против настоящего бэка в bun повтор после `401` не восстановит сессию: `/auth/refresh`
  уйдёт без cookie и получит `401`. В тестах и против мока это не проявляется; README
  (Task 5) объясняет это ограничение.
- Middleware авторизации (замыкание на хранилище токена):
  - `onResponse`: непустой заголовок `Authorization` в ответе → запомнить токен;
  - `onRequest`: токен есть → `Authorization: Bearer {token}`;
  - `onResponse`: `401` не у `/auth/*` → один раз `POST /auth/refresh`; успешно →
    повторить исходный запрос с новым токеном, иначе вернуть исходный `401`. Тело
    исходного запроса к этому моменту прочитано, поэтому `onRequest` сохраняет его
    клон (`request.clone()`), повтор идёт с клона.

`src/demo.ts` (`bun run demo`), по шагам с выводом в консоль: `POST /auth/login`,
`GET /users/me`, `GET /notebooks`, `POST /notebooks`, `GET /notebooks/{id}` по `id`
созданного. Для каждого — статус, `data` или `error`. В конце — напоминание, что мок не
соблюдает `format` и не проверяет тело.

`src/type-errors.ts` — каждая строка под `// @ts-expect-error` с комментарием, что не
так: путь не из спеки; метод, которого у пути нет; `POST /notebooks` без `name`;
лишнее поле в `body`; `params.path.id` не строкой; `GET /notebooks/{id}` без
`params.path`; обращение к `data.name` без проверки `error`. Файл входит в `typecheck`;
если ошибка типов пропадёт, `@ts-expect-error` станет лишней и `typecheck` упадёт.

`tests/client.test.ts` — `createApi({ baseUrl: "https://api.test", fetch: stub })`,
`stub` запоминает `Request` и отдаёт заданный `Response`:

- путь и path-параметр с `encodeURIComponent` (`/notebooks/a%2Fb`);
- JSON-тело и `Content-Type: application/json` у `POST /notebooks`;
- `200` → `data`, `error` нет; `404` → `error` с `code: "not_found"`, `data` нет;
- `204` у `/auth/logout` → `data` пустая, `response.status === 204`;
- токен из `Authorization` ответа логина уходит в следующий запрос как Bearer;
- `401` → `POST /auth/refresh` → повтор с новым токеном; повторный `401` не зацикливает
  refresh (ровно один вызов `/auth/refresh`).

## 7. README

- Зачем репа и связь с frontend#12.
- Быстрый старт: `bun install`, `bun run demo`; `.env` из `.env.example` для `apidog`.
- Шаги: `apidog` → `generate` → `demo` / `typecheck` / `test`, что показывает каждый.
- Почему TypeScript 5.9, а у фронта и у `@my/openapi` — 7.
- Особенности мока из §2.
- Как ходить в локальный бэк: `API_BASE_URL=http://localhost:8080/api/v1`.
- Соглашение: ветка `my-openapi` заменяет `openapi-fetch` и `openapi-typescript`
  пакетом Дениса; `demo`, `type-errors.ts` и тесты остаются и служат приёмкой.

## 8. Проверка

- `bun run typecheck`, `bun test` зелёные локально и в CI.
- `bun run apidog` с токеном пользователя выгружает оба файла; `bun run generate`
  даёт `schema.d.ts`, `git diff` после повторного запуска пуст.
- `bun run demo` проходит все шаги против облачного мока.
- Репа на GitHub создаётся только после согласия пользователя. Она пустая, поэтому
  первые коммиты уходят push'ем прямо в `main`, без PR.
