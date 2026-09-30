import { describe, expect, test } from "bun:test";
import { EXPORT_URL, exportSpec, parseBranchId, requireToken } from "../scripts/apidog";

function stub(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response.clone();
  }) as unknown as typeof fetch;
  return { calls, fetch: fetchStub };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("exportSpec", () => {
  test("POST на export-openapi с токеном, версией API и телом для main", async () => {
    const s = stub(json({ openapi: "3.1.0" }));
    await exportSpec({ token: "t", format: "JSON", fetch: s.fetch });
    expect(s.calls).toHaveLength(1);
    const { url, init } = s.calls[0]!;
    expect(url).toBe(EXPORT_URL);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer t");
    expect(headers.get("X-Apidog-Api-Version")).toBe("2024-03-28");
    expect(headers.get("Content-Type")).toBe("application/json");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      scope: { type: "ALL" },
      options: { includeApidogExtensionProperties: false, addFoldersToTags: false },
      oasVersion: "3.1",
      exportFormat: "JSON",
    });
    expect("branchId" in body).toBe(false);
  });

  test("branchId sprint-ветки уходит в тело", async () => {
    const s = stub(json({ openapi: "3.1.0" }));
    await exportSpec({ token: "t", format: "JSON", branchId: 1389936, fetch: s.fetch });
    expect(JSON.parse(String(s.calls[0]!.init.body)).branchId).toBe(1389936);
  });

  test("YAML отдаётся как есть", async () => {
    const yaml = "openapi: 3.1.0\ninfo:\n  title: x\n";
    const s = stub(new Response(yaml));
    expect(await exportSpec({ token: "t", format: "YAML", fetch: s.fetch })).toBe(yaml);
  });

  test("401 и 403 — ошибка про APIDOG_TOKEN", async () => {
    for (const status of [401, 403]) {
      const s = stub(new Response("no", { status }));
      await expect(exportSpec({ token: "t", format: "JSON", fetch: s.fetch })).rejects.toThrow(/APIDOG_TOKEN/);
    }
  });

  test("другой не-200 — код и начало тела в ошибке", async () => {
    const s = stub(new Response("boom", { status: 500 }));
    const result = exportSpec({ token: "t", format: "JSON", fetch: s.fetch });
    await expect(result).rejects.toThrow(/500/);
    await expect(result).rejects.toThrow(/boom/);
  });

  test("ответ не OpenAPI — ошибка", async () => {
    const notJson = stub(json({ error: 1 }));
    await expect(exportSpec({ token: "t", format: "JSON", fetch: notJson.fetch })).rejects.toThrow(/не OpenAPI/);
    const notYaml = stub(new Response("<html>"));
    await expect(exportSpec({ token: "t", format: "YAML", fetch: notYaml.fetch })).rejects.toThrow(/не OpenAPI/);
  });
});

test("parseBranchId: пусто — main, число — id, мусор — ошибка", () => {
  expect(parseBranchId(undefined)).toBeUndefined();
  expect(parseBranchId("")).toBeUndefined();
  expect(parseBranchId("1389936")).toBe(1389936);
  for (const bad of ["abc", "0", "-3", "1.5"]) {
    expect(() => parseBranchId(bad)).toThrow(/APIDOG_BRANCH_ID/);
  }
});

test("requireToken: без токена — подсказка, где его взять", () => {
  expect(() => requireToken(undefined)).toThrow(/Account Settings → API Access Token/);
  expect(() => requireToken("")).toThrow(/Account Settings → API Access Token/);
  expect(requireToken("t")).toBe("t");
});
