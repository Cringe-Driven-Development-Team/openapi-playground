# openapi-playground — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Публичная репа `Cringe-Driven-Development-Team/openapi-playground`, где на нашем контракте видно, как openapi-typescript генерирует типы из JSON и YAML, как openapi-fetch ходит в облачный мок Apidog, что ловят типы и как клиент собирает запросы — эталон для пакета Дениса.

**Architecture:** Один bun-проект. `scripts/apidog.ts` выгружает спеку из Apidog в `spec/`; `bun run generate` делает `src/api/schema.d.ts`; `src/api/client.ts` — `createApi()` поверх `createClient<paths>` с middleware авторизации; `src/demo.ts` ходит в мок; `src/type-errors.ts` — каталог ошибок типов; тесты с подменённым `fetch` работают офлайн.

**Tech Stack:** bun ≥ 1.4 (`bun:test`, `Bun.write`), TypeScript 5.9.3, openapi-fetch 0.17.0, openapi-typescript 7.13.0, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-openapi-playground-design.md`

## Global Constraints

- Репа локально: `F:\Github\2026_H2\openapi-playground`, ветка `main`. На GitHub — только после согласия пользователя (Task 5).
- Версии закреплены точно: `openapi-fetch` `0.17.0` (dependencies); `openapi-typescript` `7.13.0`, `typescript` `5.9.3`, `@types/bun` `1.4.2` (devDependencies); `engines.bun` `>=1.4.0`.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noEmit`, `types: ["bun"]`, `module: "Preserve"`, `moduleResolution: "bundler"`, `target: "ESNext"`, `lib: ["ESNext", "DOM"]`, `include` — `scripts`, `src`, `tests`.
- Мок: `https://mock.apidog.com/m1/1382426-1388508-default`; бэк локально: `http://localhost:8080/api/v1`.
- Выгрузка: `https://api.apidog.com/v1/projects/1382426/export-openapi`, `X-Apidog-Api-Version: 2024-03-28`, `oasVersion: "3.1"`.
- Токен Apidog только в `.env` (в `.gitignore`); в git — `.env.example` с пустыми значениями.
- Сообщения скриптов и README — по-русски. Коммиты по-русски: `тип(область): что сделано`, в конце `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `.env` с настоящим токеном попадает в git — Task 1, Step 6: `git check-ignore .env` печатает `.env`.
2. После `401` на `POST` повтор уходит с пустым телом (исходное уже прочитано) — тест «повтор POST после 401 шлёт то же тело» в Task 3.
3. `/auth/refresh` сам отвечает `401` — клиент возвращает исходный `401` и не зацикливается — тест «refresh 401 → исходный 401, один вызов refresh» в Task 3.
4. `.env`, скопированный из `.env.example`, даёт `API_BASE_URL=` (пустая строка) — клиент идёт в мок, а не на относительный URL — тест «пустой API_BASE_URL → мок» в Task 3.
5. Повторный `bun run generate` меняет `schema.d.ts` (недетерминированный вывод ломает будущий Contract drift) — Task 2, Step 5: `git diff --exit-code src/api/schema.d.ts`.

---

### Task 1: Скелет репы и выгрузка спеки из Apidog

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- Create: `.github/workflows/ci.yml`, `.github/workflows/automation.yml`
- Create: `scripts/apidog.ts`
- Test: `tests/apidog.test.ts`
- Create (Step 7, выгрузкой): `spec/openapi.json`, `spec/openapi.yaml`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `export const EXPORT_URL = "https://api.apidog.com/v1/projects/1382426/export-openapi"`
  - `export type ExportFormat = "JSON" | "YAML"`
  - `export function requireToken(raw: string | undefined): string`
  - `export function parseBranchId(raw: string | undefined): number | undefined`
  - `export async function exportSpec(options: { token: string; format: ExportFormat; branchId?: number; fetch?: typeof fetch }): Promise<string>`
  - `package.json` scripts: `apidog` = `bun scripts/apidog.ts`, `generate` = `openapi-typescript spec/openapi.json -o src/api/schema.d.ts`, `demo` = `bun src/demo.ts`, `typecheck` = `tsc --noEmit`, `test` = `bun test`.

- [ ] **Step 1: Скелет**

`package.json` (`"name": "openapi-playground"`, `"private": true`, `"type": "module"`, скрипты и версии из Interfaces и Global Constraints), `tsconfig.json` по Global Constraints, `.gitignore` (`node_modules/`, `.env`, `*.log`), `.env.example`:

```dotenv
# Личный токен Apidog: Account Settings → API Access Token. Нужен только для bun run apidog.
APIDOG_TOKEN=
# ID sprint-ветки Apidog (серое число в Manage Sprint Branches). Пусто — ветка main.
APIDOG_BRANCH_ID=
# Куда ходит клиент. Пусто — облачный мок Apidog; локальный бэк — http://localhost:8080/api/v1
API_BASE_URL=
```

`.github/workflows/automation.yml` — дословная копия `F:\Github\2026_H2\react\.github\workflows\automation.yml`. `.github/workflows/ci.yml`: на `push` и `pull_request`, `ubuntu-latest`, `actions/checkout@v7`, `oven-sh/setup-bun@v2` с `bun-version: 1.4.2`, затем `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`.

Run: `bun install`
Expected: `bun.lock` создан, установлены 4 прямые зависимости.

- [ ] **Step 2: Падающие тесты `tests/apidog.test.ts`**

Заглушка `fetch`: запоминает `(url, init)`, отдаёт заданный `Response`. Тесты:

```ts
test("exportSpec: POST на export-openapi с токеном, версией API и телом для main", ...)
//   url === EXPORT_URL; init.method === "POST"
//   headers: Authorization "Bearer t", X-Apidog-Api-Version "2024-03-28", Content-Type "application/json"
//   JSON.parse(body) toEqual { scope: { type: "ALL" }, options: { includeApidogExtensionProperties: false, addFoldersToTags: false }, oasVersion: "3.1", exportFormat: "JSON" }
//   ключа branchId в теле нет
test("exportSpec: branchId sprint-ветки уходит в тело", ...)          // branchId: 1389936 → body.branchId === 1389936
test("exportSpec: YAML отдаётся как есть", ...)                       // ответ "openapi: 3.1.0\n..." → та же строка
test("exportSpec: 401 и 403 — ошибка про APIDOG_TOKEN", ...)          // rejects.toThrow(/APIDOG_TOKEN/) для обоих кодов
test("exportSpec: другой не-200 — код и начало тела в ошибке", ...)   // 500, тело "boom" → /500/ и /boom/
test("exportSpec: ответ не OpenAPI — ошибка", ...)                    // JSON {"error":1} → /не OpenAPI/; YAML "<html>" → /не OpenAPI/
test("parseBranchId: пусто — main, число — id, мусор — ошибка", ...)  // undefined и "" → undefined; "1389936" → 1389936; "abc", "0", "-3", "1.5" → toThrow(/APIDOG_BRANCH_ID/)
test("requireToken: без токена — подсказка, где его взять", ...)      // undefined и "" → toThrow(/Account Settings → API Access Token/); "t" → "t"
```

- [ ] **Step 3: Убедись, что тесты падают**

Run: `bun test tests/apidog.test.ts`
Expected: FAIL — модуля `../scripts/apidog.ts` нет.

- [ ] **Step 4: Реализуй `scripts/apidog.ts`**

Функции из Interfaces. JSON считается OpenAPI, если `JSON.parse` дал объект с полем `openapi`; YAML — если текст начинается с `openapi:`. Блок `if (import.meta.main)`: `requireToken(process.env.APIDOG_TOKEN)`, `parseBranchId(process.env.APIDOG_BRANCH_ID)`, две выгрузки → `Bun.write("spec/openapi.json", …)` и `Bun.write("spec/openapi.yaml", …)`, в stderr — `apidog: выгружена ветка main (или sprint-ветка {id}) → spec/openapi.json, spec/openapi.yaml`; ошибка → `console.error("apidog:", message)` и `process.exit(1)`.

- [ ] **Step 5: Тесты и типы зелёные**

Run: `bun test tests/apidog.test.ts && bun run typecheck`
Expected: 8 pass, `tsc` без ошибок.

- [ ] **Step 6: `.env` не попадает в git**

Run: `cp .env.example .env && git check-ignore .env`
Expected: `.env`.

- [ ] **Step 7: Настоящая выгрузка**

Попроси пользователя вписать личный `APIDOG_TOKEN` в `.env` этой репы (его токен уже лежит в `backend/.env`, но брать его оттуда без разрешения нельзя). Затем:

Run: `bun run apidog && head -c 200 spec/openapi.json && head -3 spec/openapi.yaml`
Expected: сообщение про ветку `main`; JSON начинается с объекта с `"openapi": "3.1.0"`, YAML — со строки `openapi: 3.1.0`; в `spec/openapi.json` 7 путей (`jq '.paths | keys | length' spec/openapi.json` → `7`).

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock tsconfig.json .gitignore .env.example .github scripts tests spec
git commit -m "feat(apidog): скелет репы и выгрузка спеки из Apidog в JSON и YAML

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Генерация `schema.d.ts` из JSON и YAML

**Files:**
- Create: `src/api/schema.d.ts` (генерацией)
- Test: `tests/generate.test.ts`

**Interfaces:**
- Consumes: `spec/openapi.json`, `spec/openapi.yaml`, скрипт `generate` из Task 1.
- Produces: `src/api/schema.d.ts` с `export interface paths`, `components`, `operations` — для Task 3 и 4.

- [ ] **Step 1: Тест `tests/generate.test.ts`**

```ts
import openapiTS, { astToString } from "openapi-typescript";
test("openapi-typescript: из JSON и из YAML получается один и тот же schema.d.ts", ...)
//   json = astToString(await openapiTS(await Bun.file("spec/openapi.json").text()))
//   yaml = astToString(await openapiTS(await Bun.file("spec/openapi.yaml").text()))
//   expect(yaml).toBe(json); expect(json).toContain('"/notebooks/{id}"')
test("bun run generate даёт то же, что Node API", ...)
//   Bun.file("src/api/schema.d.ts").text() содержит json (CLI добавляет только шапку-комментарий)
```

- [ ] **Step 2: Убедись, что второй тест падает**

Run: `bun test tests/generate.test.ts`
Expected: первый PASS, второй FAIL — `src/api/schema.d.ts` ещё нет.

- [ ] **Step 3: Сгенерируй**

Run: `bun run generate`
Expected: `src/api/schema.d.ts` создан, в нём `export interface paths` и 7 путей.

- [ ] **Step 4: Тесты зелёные**

Run: `bun test tests/generate.test.ts && bun run typecheck`
Expected: 2 pass, `tsc` без ошибок.

- [ ] **Step 5: Генерация детерминирована**

Run: `git add src/api/schema.d.ts && bun run generate && git diff --exit-code src/api/schema.d.ts`
Expected: код выхода 0, diff пуст.

- [ ] **Step 6: Commit**

```bash
git add src/api/schema.d.ts tests/generate.test.ts
git commit -m "feat(generate): schema.d.ts из спеки, JSON и YAML дают одно и то же

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Клиент с middleware авторизации

**Files:**
- Create: `src/api/client.ts`
- Test: `tests/client.test.ts`

**Interfaces:**
- Consumes: `paths` из `src/api/schema.d.ts` (Task 2).
- Produces:
  - `export const MOCK_BASE_URL = "https://mock.apidog.com/m1/1382426-1388508-default"`
  - `export function createApi(options?: { baseUrl?: string; fetch?: typeof fetch }): Client<paths>` (`Client` из `openapi-fetch`)

- [ ] **Step 1: Падающие тесты `tests/client.test.ts`**

Заглушка `fetch` — очередь заданных `Response` и массив полученных `Request`. `createApi({ baseUrl: "https://api.test", fetch: stub })`, кроме теста про мок.

```ts
test("path-параметр кодируется", ...)                         // GET /notebooks/{id}, id "a/b" → url "https://api.test/notebooks/a%2Fb"
test("POST /notebooks: JSON-тело и Content-Type", ...)          // body { name: "Черновик" } → await req.json() toEqual то же; content-type "application/json"
test("200 → data без error, 404 → error без data", ...)         // 200 [{id,name,updated_at}] → data длиной 1, error undefined; 404 {code:"not_found",message:"x"} → error.code "not_found", data undefined
test("204 у /auth/logout → data нет, status 204", ...)          // Response(null,{status:204}) → data undefined, response.status 204
test("токен из Authorization ответа логина уходит Bearer'ом дальше", ...) // login → 200, заголовок Authorization "Bearer abc"; следующий GET /users/me → request.headers Authorization "Bearer abc"
test("пустой Authorization в ответе не затирает токен", ...)     // после "Bearer abc" ответ с Authorization "" → следующий запрос всё ещё "Bearer abc"
test("401 → refresh → повтор с новым токеном", ...)             // GET /users/me 401; POST /auth/refresh 204 с Authorization "Bearer new"; повтор 200 → data есть; порядок url: /users/me, /auth/refresh, /users/me; у повтора "Bearer new"
test("повтор POST после 401 шлёт то же тело", ...)              // POST /notebooks {name:"A"} → 401 → refresh 204 → повтор: await req.json() toEqual {name:"A"}
test("refresh 401 → исходный 401, один вызов refresh", ...)     // /users/me 401, /auth/refresh 401 → error есть, response.status 401; ровно один запрос к /auth/refresh, всего 2 запроса
test("401 у /auth/* не запускает refresh", ...)                 // POST /auth/login 401 → 1 запрос, error есть
test("пустой API_BASE_URL → мок", ...)                          // process.env.API_BASE_URL = ""; createApi({ fetch: stub }); GET /notebooks → url начинается с MOCK_BASE_URL; env восстановить в finally
```

- [ ] **Step 2: Убедись, что тесты падают**

Run: `bun test tests/client.test.ts`
Expected: FAIL — модуля `../src/api/client.ts` нет.

- [ ] **Step 3: Реализуй `src/api/client.ts`**

`createClient<paths>({ baseUrl: options.baseUrl ?? (process.env.API_BASE_URL || MOCK_BASE_URL), fetch: fetchImpl, credentials: "include" })`, где `fetchImpl = options.fetch ?? globalThis.fetch`, и `client.use(middleware)`. Состояние в замыкании: `let token: string | undefined` и `const pending = new WeakMap<Request, Request>()`.

- `onRequest({ request })`: токен есть → `request.headers.set("Authorization", "Bearer " + token)`; `pending.set(request, request.clone())`; вернуть `request`.
- `onResponse({ request, response, schemaPath, options })`: непустой `Authorization` в ответе → `token = значение без префикса "Bearer "`. Если `response.status === 401` и `!schemaPath.startsWith("/auth/")`: `fetchImpl(new Request(options.baseUrl + "/auth/refresh", { method: "POST", credentials: "include" }))`; ответ не `ok` → вернуть исходный `response`; иначе взять токен из его `Authorization`, собрать повтор из `pending.get(request)` с новым `Authorization` и вернуть `fetchImpl(повтор)`.

- [ ] **Step 4: Тесты и типы зелёные**

Run: `bun test && bun run typecheck`
Expected: все тесты репы PASS (apidog 8, generate 2, client 11), `tsc` без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/client.test.ts
git commit -m "feat(client): createApi на openapi-fetch, Bearer и повтор после 401 через refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Демо против мока и каталог ошибок типов

**Files:**
- Create: `src/demo.ts`, `src/type-errors.ts`

**Interfaces:**
- Consumes: `createApi`, `MOCK_BASE_URL` (Task 3); `paths` (Task 2).
- Produces: `bun run demo`; `src/type-errors.ts` проверяется `typecheck`.

- [ ] **Step 1: Каталог ошибок `src/type-errors.ts`**

`const api = createApi();` и функция `async function catalog()` (не вызывается). Каждый вызов — под `// @ts-expect-error <что не так>`:
1. `api.GET("/notebook")` — пути нет в спеке;
2. `api.DELETE("/notebooks/{id}", …)` — у пути нет DELETE;
3. `api.POST("/notebooks", { body: {} })` — нет обязательного `name`;
4. `api.POST("/notebooks", { body: { name: "A", color: "red" } })` — лишнее поле;
5. `api.GET("/notebooks/{id}", { params: { path: { id: 42 } } })` — `id` не строка;
6. `api.GET("/notebooks/{id}")` — нет `params.path`;
7. `const { data } = await api.GET("/users/me"); data.login` — `data` может быть `undefined`, пока не проверен `error`.

Последним — правильный вызов без директивы: `const { data, error } = await api.GET("/users/me"); if (!error) data.login;`.

- [ ] **Step 2: Каталог действительно ловит ошибки**

Run: `bun run typecheck`
Expected: без ошибок. Затем удали директиву у пункта 3 → `tsc` падает с ошибкой про `name`; верни директиву → снова без ошибок.

- [ ] **Step 3: Демо `src/demo.ts`**

`const api = createApi()`; в stdout — базовый URL, затем шаги по порядку: `POST /auth/login` (`{ login: "denis", password: "password123" }`), `GET /users/me`, `GET /notebooks`, `POST /notebooks` (`{ name: "Черновик" }`), `GET /notebooks/{id}` по `id` созданного. У каждого шага: метод, путь, `response.status`, затем `data` или `error` (`JSON.stringify(…, null, 2)`). В конце — две строки про особенности мока: `format` не соблюдается, тело запроса не проверяется.

- [ ] **Step 4: Прогон против облачного мока**

Run: `bun run demo`
Expected: 5 шагов, статусы 200, 200, 200, 201, 200; у каждого `data`.

- [ ] **Step 5: Commit**

```bash
git add src/demo.ts src/type-errors.ts
git commit -m "feat(demo): запросы в облачный мок Apidog и каталог ошибок типов

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: README и публикация

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: всё из Task 1–4.
- Produces: репа на GitHub, зелёный CI.

- [ ] **Step 1: README**

Разделы по спеке §7: зачем репа (ссылка на frontend#12); быстрый старт (`bun install`, `bun run demo`); шаги `apidog` → `generate` → `demo` / `typecheck` / `test` и что показывает каждый; таблица «Путь — что внутри» по спеке §4; почему TypeScript 5.9 (peer `^5.x`, openapi-typescript#2841), а у фронта и `@my/openapi` — 7; особенности мока из спеки §2; `API_BASE_URL=http://localhost:8080/api/v1` для локального бэка; соглашение о ветке `my-openapi`.

- [ ] **Step 2: Полная проверка**

Run: `bun install --frozen-lockfile && bun run typecheck && bun test`
Expected: всё зелёное, 21 тест.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README playground

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Репа на GitHub (только с согласия пользователя)**

Спроси пользователя. После согласия:

Run: `gh repo create Cringe-Driven-Development-Team/openapi-playground --public --source . --remote origin --description "Playground: openapi-fetch и openapi-typescript на контракте из Apidog" --push`
Expected: ссылка на репу; `git status -sb` → `## main...origin/main`.

- [ ] **Step 5: CI зелёный**

Run: `gh run watch $(gh run list --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status`
Expected: run `CI` завершился `success`.
