// Каталог ошибок типов: каждая строка под @ts-expect-error — это то, что
// openapi-fetch ловит на этапе компиляции. Файл проверяется `typecheck`,
// но никогда не выполняется.
import { createApi } from "./api/client";

const api = createApi();

async function catalog() {
  // @ts-expect-error пути нет в спеке
  await api.GET("/notebook");

  // @ts-expect-error у пути /notebooks/{id} нет метода DELETE
  await api.DELETE("/notebooks/{id}", { params: { path: { id: "1" } } });

  // @ts-expect-error нет обязательного поля name
  await api.POST("/notebooks", { body: {} });

  // НЕ ошибка типов (проверено tsc 5.9.3): лишнее поле color проходит, потому что
  // тип body выводится через generic-параметр и excess property check не срабатывает.
  // Директива здесь дала бы TS2578 (unused), поэтому строка без неё.
  await api.POST("/notebooks", { body: { name: "A", color: "red" } });

  // @ts-expect-error id должен быть строкой, а не числом
  await api.GET("/notebooks/{id}", { params: { path: { id: 42 } } });

  // @ts-expect-error нет обязательного params.path
  await api.GET("/notebooks/{id}");

  {
    const { data } = await api.GET("/users/me");
    // @ts-expect-error data может быть undefined, пока не проверен error
    data.login;
  }

  // Правильный вызов: после проверки error data сужается до объекта.
  const { data, error } = await api.GET("/users/me");
  if (!error) data.login;
}

void catalog;
