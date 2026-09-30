import { createApi, MOCK_BASE_URL } from "./api/client";

const api = createApi();

function show(step: number, method: string, path: string, response: Response, data: unknown, error: unknown) {
  console.log(`\n${step}. ${method} ${path} -> ${response.status}`);
  if (error !== undefined) console.log("error:", JSON.stringify(error, null, 2));
  else console.log("data:", JSON.stringify(data, null, 2));
}

console.log(`Base URL: ${process.env.API_BASE_URL || MOCK_BASE_URL}`);

const login = await api.POST("/auth/login", { body: { login: "denis", password: "password123" } });
show(1, "POST", "/auth/login", login.response, login.data, login.error);

const me = await api.GET("/users/me");
show(2, "GET", "/users/me", me.response, me.data, me.error);

const list = await api.GET("/notebooks");
show(3, "GET", "/notebooks", list.response, list.data, list.error);

const created = await api.POST("/notebooks", { body: { name: "Черновик" } });
show(4, "POST", "/notebooks", created.response, created.data, created.error);

if (created.data) {
  const one = await api.GET("/notebooks/{id}", { params: { path: { id: created.data.id } } });
  show(5, "GET", "/notebooks/{id}", one.response, one.data, one.error);
} else {
  console.log("\n5. GET /notebooks/{id} пропущен: нотбук не создан");
}

console.log("\nОсобенности мока:");
console.log("- format из спеки не соблюдается (id вида \"17\", даты вида \"2027-03-26\").");
console.log("- тело запроса не проверяется (мок примет и невалидное тело).");
