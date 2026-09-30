import { expect, test } from "bun:test";
import { MOCK_BASE_URL, createApi } from "../src/api/client";

const BASE = "https://api.test";

// Заглушка fetch: отдаёт заданные Response по очереди и запоминает полученные Request.
function stubFetch(...responses: Response[]) {
  const requests: Request[] = [];
  const queue = [...responses];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    const response = queue.shift();
    if (!response) throw new Error(`нет ответа в очереди для ${request.method} ${request.url}`);
    return response;
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

function withAuth(token: string, init: ResponseInit = {}, body: BodyInit | null = null): Response {
  return new Response(body, { ...init, headers: { Authorization: token } });
}

const user = { id: "00000000-0000-0000-0000-000000000001", login: "neo" };
const summary = { id: "00000000-0000-0000-0000-000000000002", name: "Черновик", updated_at: "2026-09-30T00:00:00Z" };
const notebook = { ...summary, data: {}, created_at: "2026-09-30T00:00:00Z" };
const creds = { login: "neo", password: "secret" };

test("path-параметр кодируется", async () => {
  const stub = stubFetch(Response.json({}));
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  await api.GET("/notebooks/{id}", { params: { path: { id: "a/b" } } });

  expect(stub.requests[0]?.url).toBe("https://api.test/notebooks/a%2Fb");
});

test("POST /notebooks: JSON-тело и Content-Type", async () => {
  const stub = stubFetch(Response.json(notebook, { status: 201 }));
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  await api.POST("/notebooks", { body: { name: "Черновик" } });

  const req = stub.requests[0]!;
  expect(req.method).toBe("POST");
  expect(req.headers.get("content-type")).toBe("application/json");
  expect(await req.json()).toEqual({ name: "Черновик" });
});

test("200 → data без error, 404 → error без data", async () => {
  const stub = stubFetch(
    Response.json([summary]),
    Response.json({ code: "not_found", message: "x" }, { status: 404 }),
  );
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  const ok = await api.GET("/notebooks");
  expect(ok.data).toHaveLength(1);
  expect(ok.error).toBeUndefined();

  const missing = await api.GET("/notebooks/{id}", { params: { path: { id: "nope" } } });
  expect(missing.error?.code).toBe("not_found");
  expect(missing.data).toBeUndefined();
});

test("204 у /auth/logout → data нет, status 204", async () => {
  const stub = stubFetch(new Response(null, { status: 204 }));
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  // В спеке refresh_token — обязательный cookie-параметр, поэтому типы требуют его передать.
  // openapi-fetch cookie-параметры не сериализует: в браузере cookie шлёт сам fetch (credentials: "include").
  const { data, response } = await api.POST("/auth/logout", { params: { cookie: { refresh_token: "" } } });

  expect(data).toBeUndefined();
  expect(response.status).toBe(204);
});

test("токен из Authorization ответа логина уходит Bearer'ом дальше", async () => {
  const stub = stubFetch(withAuth("Bearer abc", { status: 200 }, JSON.stringify(user)), Response.json(user));
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  await api.POST("/auth/login", { body: creds });
  await api.GET("/users/me");

  expect(stub.requests[0]?.headers.get("Authorization")).toBeNull();
  expect(stub.requests[1]?.headers.get("Authorization")).toBe("Bearer abc");
});

test("пустой Authorization в ответе не затирает токен", async () => {
  const stub = stubFetch(
    withAuth("Bearer abc", { status: 200 }, JSON.stringify(user)),
    withAuth("", { status: 200 }, JSON.stringify(user)),
    Response.json(user),
  );
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  await api.POST("/auth/login", { body: creds });
  await api.POST("/auth/login", { body: creds });
  await api.GET("/users/me");

  expect(stub.requests[2]?.headers.get("Authorization")).toBe("Bearer abc");
});

test("401 → refresh → повтор с новым токеном", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    withAuth("Bearer new", { status: 204 }),
    Response.json(user),
  );
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  const { data, error } = await api.GET("/users/me");

  expect(error).toBeUndefined();
  expect(data).toEqual(user);
  expect(stub.requests.map((r) => new URL(r.url).pathname)).toEqual(["/users/me", "/auth/refresh", "/users/me"]);
  expect(stub.requests[1]?.method).toBe("POST");
  expect(stub.requests[2]?.headers.get("Authorization")).toBe("Bearer new");
});

test("повтор POST после 401 шлёт то же тело", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    withAuth("Bearer new", { status: 204 }),
    Response.json(notebook, { status: 201 }),
  );
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  const { data } = await api.POST("/notebooks", { body: { name: "A" } });

  expect(data).toEqual(notebook);
  const retry = stub.requests[2]!;
  expect(retry.method).toBe("POST");
  expect(retry.headers.get("Authorization")).toBe("Bearer new");
  expect(await retry.json()).toEqual({ name: "A" });
});

test("refresh 401 → исходный 401, один вызов refresh", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    Response.json({ code: "unauthorized", message: "no session" }, { status: 401 }),
  );
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  const { error, response } = await api.GET("/users/me");

  expect(error).toBeDefined();
  expect(error?.message).toBe("expired");
  expect(response.status).toBe(401);
  expect(stub.requests).toHaveLength(2);
  expect(stub.requests.filter((r) => new URL(r.url).pathname === "/auth/refresh")).toHaveLength(1);
});

test("повтор снова 401 → исходный ответ повтора, ровно один refresh", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    withAuth("Bearer new", { status: 204 }),
    Response.json({ code: "unauthorized", message: "still no" }, { status: 401 }),
  );
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  const { error, response } = await api.GET("/users/me");

  expect(error?.message).toBe("still no");
  expect(response.status).toBe(401);
  expect(stub.requests).toHaveLength(3);
  expect(stub.requests.filter((r) => new URL(r.url).pathname === "/auth/refresh")).toHaveLength(1);
});

test("401 у /auth/* не запускает refresh", async () => {
  const stub = stubFetch(Response.json({ code: "invalid_credentials", message: "nope" }, { status: 401 }));
  const api = createApi({ baseUrl: BASE, fetch: stub.fetch });

  const { error } = await api.POST("/auth/login", { body: creds });

  expect(error).toBeDefined();
  expect(stub.requests).toHaveLength(1);
});

test("пустой API_BASE_URL → мок", async () => {
  const saved = process.env.API_BASE_URL;
  try {
    process.env.API_BASE_URL = "";
    const stub = stubFetch(Response.json([]));
    const api = createApi({ fetch: stub.fetch });

    await api.GET("/notebooks");

    expect(stub.requests[0]?.url.startsWith(MOCK_BASE_URL)).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = saved;
  }
});
