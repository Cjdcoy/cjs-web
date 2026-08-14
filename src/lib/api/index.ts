import { createJsonClient } from "./client";
import { createCjsApi } from "./endpoints";

export * from "./capabilities";
export * from "./client";
export * from "./domain";
export * from "./endpoints";
export * from "./errors";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "https://api.jump4life.org";

export const api = createCjsApi(createJsonClient({ baseUrl: API_BASE }));
