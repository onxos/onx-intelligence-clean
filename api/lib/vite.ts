import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "../dist/public");

  app.use("*", serveStatic({ root: "./dist/public" }));

  // SPA fallback (Wave 11-b): any GET/HEAD that missed the static files and
  // is neither an /api route nor an asset-like path (has a file extension)
  // gets index.html — regardless of the Accept header, so deep links like
  // /titan-conclave/pulse resolve for every client, not just browsers.
  // /api/* misses keep their JSON 404 (boot.ts also guards them upstream).
  app.notFound((c) => {
    const pathname = c.req.path;
    const method = c.req.method.toUpperCase();
    const isApi = pathname === "/api" || pathname.startsWith("/api/");
    const looksLikeFile = path.extname(pathname) !== "";
    if (isApi || looksLikeFile || (method !== "GET" && method !== "HEAD")) {
      return c.json({ error: "Not Found" }, 404);
    }
    try {
      const indexPath = path.resolve(distPath, "index.html");
      const content = fs.readFileSync(indexPath, "utf-8");
      return c.html(content);
    } catch {
      // dist not built — never crash the request path over the fallback.
      return c.json({ error: "Not Found" }, 404);
    }
  });
}
