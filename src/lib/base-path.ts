/**
 * Base path prefix per asset statici e chiamate API.
 * Fonte unica: Next inietta __NEXT_ROUTER_BASEPATH (client + server runtime)
 * a partire da next.config.basePath; BASE_PATH copre il custom server (server.ts).
 * Default vuoto = montato sulla radice del dominio.
 */
export const BASE_PATH =
  process.env.__NEXT_ROUTER_BASEPATH || process.env.BASE_PATH || "";

/** Prepend del basePath a un path assoluto (es. "/logo.png" → "/demo/logo.png"). */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH || path.startsWith(BASE_PATH + "/")) return path;
  return `${BASE_PATH}${path}`;
}
