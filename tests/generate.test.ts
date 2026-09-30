import { expect, test } from "bun:test";
import openapiTS, { astToString } from "openapi-typescript";

async function generate(path: string): Promise<string> {
  return astToString(await openapiTS(await Bun.file(path).text()));
}

test("openapi-typescript: из JSON и из YAML получается один и тот же schema.d.ts", async () => {
  const json = await generate("spec/openapi.json");
  const yaml = await generate("spec/openapi.yaml");
  expect(yaml).toBe(json);
  expect(json).toContain('"/notebooks/{id}"');
});

test("bun run generate даёт то же, что Node API", async () => {
  const json = await generate("spec/openapi.json");
  const cli = await Bun.file("src/api/schema.d.ts").text();
  expect(cli).toContain(json);
});
