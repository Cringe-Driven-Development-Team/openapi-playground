# openapi-playground

Playground: [openapi-fetch](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-fetch) и [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) на контракте нашего проекта из Apidog.

Зачем: Денис пишет свой API-клиент, пакет `@my/openapi` ([frontend#12](https://github.com/Cringe-Driven-Development-Team/frontend/issues/12)). Здесь на нашем контракте видно, как это делают готовые библиотеки, поэтому репа служит эталоном поведения.

- Apidog-проект: https://app.apidog.com/project/1382426
- Опубликованная документация: https://vb78fyael1.apidog.io/

## Быстрый старт

```bash
bun install
bun run demo
```

Нужен bun >= 1.4.0. `demo` ходит в облачный мок Apidog: токен и локальный бэк не нужны.

## Шаги

`apidog` → `generate` → `demo` / `typecheck` / `test`

| Команда | Что делает |
| --- | --- |
| `bun run apidog` | Выгружает спеку из Apidog в `spec/openapi.json` и `spec/openapi.yaml`. Нужен `APIDOG_TOKEN` в `.env` (см. `.env.example`) |
| `bun run generate` | `openapi-typescript` строит `src/api/schema.d.ts` из `spec/openapi.json` |
| `bun run demo` | Логин, `GET /users/me`, список и создание блокнота, `GET /notebooks/{id}` против мока: статус и `data` или `error` каждого шага |
| `bun run typecheck` | `tsc --noEmit`, включая каталог ошибок типов |
| `bun test` | Тесты клиента с подменённым `fetch`, выгрузки и генерации |

Снимок спеки и `schema.d.ts` лежат в git, поэтому `generate`, `typecheck` и `test` работают без токена и без сети.

## Путь — что внутри

| Путь | Что внутри |
| --- | --- |
| `scripts/apidog.ts` | Выгрузка спеки из Apidog (JSON и YAML) |
| `spec/openapi.json`, `spec/openapi.yaml` | Снимок ветки `main` Apidog |
| `src/api/schema.d.ts` | Результат `bun run generate`, руками не правится |
| `src/api/client.ts` | `createApi`: клиент openapi-fetch и middleware авторизации |
| `src/demo.ts` | `bun run demo` |
| `src/type-errors.ts` | Каталог ошибок типов на `@ts-expect-error` |
| `tests/client.test.ts` | Как клиент собирает запрос и разбирает ответ |
| `tests/generate.test.ts` | JSON и YAML дают одинаковый `schema.d.ts` |
| `tests/apidog.test.ts` | Токен, ветка и разбор ответа выгрузки |
| `.github/workflows/ci.yml` | `bun install --frozen-lockfile`, `typecheck`, `test` |

## Клиент

`createApi()` берёт `baseUrl` из `API_BASE_URL`, а если он пуст, из облачного мока Apidog. Middleware запоминает токен из заголовка ответа `Authorization`, подставляет его как Bearer, а после `401` один раз вызывает `POST /auth/refresh` и повторяет запрос.

Локальный бэк: `API_BASE_URL=http://localhost:8080/api/v1` в `.env`.

### Ограничение bun

В браузере HttpOnly-cookie refresh-сессии шлёт сам браузер благодаря `credentials: "include"`. У `fetch` в bun нет хранилища cookie, поэтому против настоящего бэка повтор после `401` не восстановит сессию: `/auth/refresh` уйдёт без cookie и получит `401`. В тестах и против мока это не проявляется.

## Особенности мока

Облачный мок Apidog (Open Access) генерирует данные Faker'ом:

- не соблюдает `format`: `id` приходит как `"17"`, а не uuid, `updated_at` как `"2027-03-26"`, а не date-time;
- не проверяет тело: `POST /notebooks` с `{}` отвечает 201;
- заголовок `Authorization` в ответе `/auth/login` пустой, поэтому Bearer в demo не подставляется;
- выбрать конкретный ответ (например, `401`) документация не описывает, поэтому ветка `error` показана в тестах.

## Особенности контракта

У `POST /auth/refresh` и `POST /auth/logout` cookie `refresh_token` объявлена обязательным параметром (`in: cookie`, `required: true`), поэтому типизированный вызов требует `params.cookie.refresh_token`. HttpOnly-cookie из JS не передать, так что в контракте её лучше сделать необязательной или убрать из параметров.

## Каталог ошибок типов

`src/type-errors.ts` собирает то, что ловит компилятор: путь не из спеки, метод, которого у пути нет, `POST /notebooks` без `name`, `id` не строкой, вызов без `params.path`, `data.login` без проверки `error`. Если ошибка пропадёт, `@ts-expect-error` станет лишней и `typecheck` упадёт.

Пункт «лишнее поле в `body`» openapi-fetch 0.17.0 не ловит: `body` выводится через дженерик, и excess property check не срабатывает. В каталоге это задокументированная не-ошибка, а ориентир для `@my/openapi`: здесь пакет может быть строже.

## Браузер: CORS

Если клиент работает в браузере, чтение заголовка `Authorization` из ответа требует `Access-Control-Expose-Headers: Authorization` на бэке, а `credentials: "include"` — конкретный `Access-Control-Allow-Origin` (не `*`) и `Access-Control-Allow-Credentials: true`.

## Почему TypeScript 5.9

У `openapi-typescript` `peerDependencies: { typescript: "^5.x" }`, он строит типы через `ts.factory` и на TypeScript 7 падает ([openapi-typescript#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841)). Поэтому в репе закреплён `typescript` 5.9.3, а у фронта и у `@my/openapi` TypeScript 7.

В `tsconfig.json` включён `skipLibCheck: true` из-за типов `@redocly/openapi-core` внутри openapi-typescript; сгенерированный `schema.d.ts` проверяется отдельно (`tsconfig.schema.json`), без `skipLibCheck` — это приёмка генератора в ветке `my-openapi`.

## Ветка `my-openapi`

Когда пакет Дениса будет готов, ветка `my-openapi` заменит `openapi-fetch` и `openapi-typescript` на `@my/openapi`. `demo`, `type-errors.ts` и тесты остаются как есть и служат приёмкой пакета.
