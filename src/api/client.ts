import createClient, { type Client, type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

export const MOCK_BASE_URL = "https://mock.apidog.com/m1/1382426-1388508-default";

const BEARER = "Bearer ";

// Бэкенд отдаёт access-токен в заголовке ответа Authorization ("Bearer <token>").
// Пустое значение (так отвечает мок Apidog) токен не затирает.
function tokenFrom(response: Response): string | undefined {
  const header = response.headers.get("Authorization");
  if (!header) return undefined;
  return header.startsWith(BEARER) ? header.slice(BEARER.length) : header;
}

export function createApi(options: { baseUrl?: string; fetch?: typeof fetch } = {}): Client<paths> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? (process.env.API_BASE_URL || MOCK_BASE_URL),
    fetch: fetchImpl,
    // В браузере cookie refresh-сессии (HttpOnly) шлёт сам браузер благодаря credentials: "include".
    // У fetch в bun нет хранилища cookie, поэтому против настоящего бэка в bun повтор после 401
    // не восстановит сессию: refresh уйдёт без cookie и получит 401. В тестах и против мока это не проявляется.
    credentials: "include",
  });

  let token: string | undefined;
  // Копия каждого исходящего запроса: тело Request читается один раз,
  // а после 401 запрос нужно повторить с тем же телом.
  const pending = new WeakMap<Request, Request>();

  const auth: Middleware = {
    onRequest({ request }) {
      if (token) request.headers.set("Authorization", BEARER + token);
      pending.set(request, request.clone());
      return request;
    },

    async onResponse({ request, response, schemaPath, options }) {
      const original = pending.get(request);
      pending.delete(request);

      const fresh = tokenFrom(response);
      if (fresh) token = fresh;

      if (response.status !== 401 || schemaPath.startsWith("/auth/") || !original) return response;

      const refreshed = await fetchImpl(
        new Request(options.baseUrl + "/auth/refresh", { method: "POST", credentials: "include" }),
      );
      if (!refreshed.ok) return response;

      const renewed = tokenFrom(refreshed);
      if (renewed) token = renewed;
      if (token) original.headers.set("Authorization", BEARER + token);
      return fetchImpl(original);
    },
  };

  client.use(auth);
  return client;
}
