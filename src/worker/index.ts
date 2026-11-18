import { Hono } from "hono";
import { authRoutes } from "./auth";
import { dataRoutes } from "./data";
import type { Env } from "./env";
import { HttpError } from "./http";
import { aiEnabled, labelRoutes } from "./label";
import { placesRoutes } from "./places";
import { sharingRoutes } from "./sharing";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.code, message: err.message }, err.status);
  console.error(err);
  return c.json({ error: "server_error", message: "服务器出错了，请稍后再试" }, 500);
});

app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    version: c.env.APP_VERSION ?? "dev",
    environment: c.env.ENVIRONMENT ?? "test",
    ai: aiEnabled(c.env),
    photos: !!c.env.PHOTOS,
  }),
);
app.route("/api/auth", authRoutes);
app.route("/api", dataRoutes);
app.route("/api", labelRoutes);
app.route("/api", placesRoutes);
app.route("/api", sharingRoutes);
app.all("/api/*", (c) => c.json({ error: "not_found", message: "Not found" }, 404));

/**
 * Reached only when no file matches: a page address gets the app; anything that looks like a file
 * (a script gone after a release) gets a plain 404, so the browser never caches the app's HTML as one.
 */
app.get("*", async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(path)) return c.text("Not found", 404);
  const page = await c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
  return new Response(page.body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
});

export default app;
