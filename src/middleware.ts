/**
 * H3 Middleware — Logging, timing, and error handling for Hono apps.
 *
 * Usage:
 *   import { Hono } from "hono";
 *   import { addMiddleware } from "@get-h3/h3-harness-sdk";
 *
 *   const app = new Hono();
 *   addMiddleware(app);
 *   app.route("/", createH3Router(new MyHarness()));
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";

/**
 * Request logging + error handling middleware.
 * Logs method, path, status code, and duration in ms.
 * On exception, returns 500 JSON with ErrorResponse format.
 */
export const requestLogger = createMiddleware(
  async (c: Context, next: Next) => {
    const start = performance.now();
    try {
      await next();
      const elapsed = Math.round(performance.now() - start);
      console.info(
        `${c.req.method} ${c.req.path} → ${c.res.status} (${elapsed}ms)`,
      );
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `${c.req.method} ${c.req.path} → 500 (${elapsed}ms) — ${message}`,
      );
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR" as const,
            message,
          },
        },
        500,
      );
    }
  },
);

/**
 * Attach request-logging middleware to a Hono application.
 * IMPORTANT: Call BEFORE adding routes — middleware order matters.
 */
export function addMiddleware(app: Hono): void {
  app.use("*", requestLogger);
}
