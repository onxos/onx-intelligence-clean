import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { serveStaticFiles } from "./lib/vite";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

process.stderr.write(`[boot] NODE_ENV=${process.env.NODE_ENV} isProduction=${env.isProduction} PORT=${process.env.PORT}\n`);

if (env.isProduction) {
  try {
    serveStaticFiles(app);
    const port = parseInt(process.env.PORT || "3000");
    process.stderr.write(`[boot] Starting server on port ${port}...\n`);
    serve({ fetch: app.fetch, port }, () => {
      process.stderr.write(`[boot] Server listening on http://localhost:${port}/\n`);
      console.log(`Server running on http://localhost:${port}/`);
    });
  } catch (err) {
    process.stderr.write(`[boot] FATAL: ${err}\n`);
    process.exit(1);
  }
}
