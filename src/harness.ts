/**
 * H3 Harness — Interface + Hono router for one-line integration.
 *
 * Usage:
 *   import { Hono } from "hono";
 *   import { Harness, createH3Router } from "@get-h3/h3-harness-sdk";
 *
 *   class MyHarness implements Harness {
 *     async onProcess(req) { ... }
 *     async onResult(req) { ... }
 *     health() { ... }
 *   }
 *
 *   const app = new Hono();
 *   app.route("/", createH3Router(new MyHarness()));
 */

import { Hono } from "hono";
import type { Context } from "hono";

import {
  CancelRequestSchema,
  type CancelRequest,
  DecisionSchema,
  type Decision,
  DecisionTypeSchema,
  EndSchema,
  ErrorCodeSchema,
  ErrorDetailSchema,
  ErrorResponseSchema,
  type HealthResponse,
  ProcessRequestSchema,
  type ProcessRequest,
  ResultRequestSchema,
  type ResultRequest,
  SessionResponseSchema,
} from "./protocol.js";

// ── Harness Interface ───────────────────────────────────────────────

export interface Harness {
  onProcess(req: ProcessRequest): Promise<Decision>;
  onResult(req: ResultRequest): Promise<Decision>;
  onCancel?(req: CancelRequest): Promise<boolean>;
  onSessionTerminate?(sessionId: string): Promise<void>;
  health(): HealthResponse;
}

// ── Helpers ─────────────────────────────────────────────────────────

function errorResponse(
  c: Context,
  statusCode: 400 | 404 | 500,
  message: string,
): Response {
  const body = {
    error: {
      code: "INTERNAL_ERROR" as const,
      message,
    },
  };
  return c.json(body, statusCode);
}

// ── Router ──────────────────────────────────────────────────────────

export function createH3Router(harness: Harness): Hono {
  const app = new Hono();

  // GET /v1/health
  app.get("/v1/health", (c) => c.json(harness.health()));

  // POST /v1/process
  app.post("/v1/process", async (c) => {
    let req: ProcessRequest;
    try {
      const body = ProcessRequestSchema.parse(await c.req.json());
      req = body;
    } catch (err) {
      return errorResponse(
        c,
        400,
        `Invalid request: ${(err as Error).message}`,
      );
    }
    try {
      const decision = await harness.onProcess(req);
      return c.json(decision);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({
        decision: "end" as const,
        decision_id: crypto.randomUUID(),
        end: { reason: "error" as const, summary: message },
      });
    }
  });

  // POST /v1/result
  app.post("/v1/result", async (c) => {
    let req: ResultRequest;
    try {
      req = ResultRequestSchema.parse(await c.req.json());
    } catch (err) {
      return errorResponse(
        c,
        400,
        `Invalid request: ${(err as Error).message}`,
      );
    }
    try {
      const decision = await harness.onResult(req);
      return c.json(decision);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({
        decision: "end" as const,
        decision_id: crypto.randomUUID(),
        end: { reason: "error" as const, summary: message },
      });
    }
  });

  // POST /v1/cancel
  app.post("/v1/cancel", async (c) => {
    let req: CancelRequest;
    try {
      req = CancelRequestSchema.parse(await c.req.json());
    } catch (err) {
      return errorResponse(
        c,
        400,
        `Invalid request: ${(err as Error).message}`,
      );
    }
    if (harness.onCancel) {
      try {
        const cancelled = await harness.onCancel(req);
        return c.json({ session_id: req.session_id, cancelled });
      } catch (err) {
        return errorResponse(
          c,
          500,
          `onCancel failed: ${(err as Error).message}`,
        );
      }
    }
    return c.json({ session_id: req.session_id, cancelled: true });
  });

  // GET /v1/sessions/:session_id
  app.get("/v1/sessions/:session_id", (c) => {
    const sessionId = c.req.param("session_id");
    return c.json({
      session_id: sessionId,
      started_at: "",
      last_active: "",
      turn_count: 0,
      status: "active",
    });
  });

  // DELETE /v1/sessions/:session_id
  app.delete("/v1/sessions/:session_id", async (c) => {
    const sessionId = c.req.param("session_id");
    if (harness.onSessionTerminate) {
      try {
        await harness.onSessionTerminate(sessionId);
      } catch (err) {
        return errorResponse(
          c,
          500,
          `onSessionTerminate failed: ${(err as Error).message}`,
        );
      }
    }
    return c.json({ session_id: sessionId, terminated: true });
  });

  return app;
}

// Re-export protocol pieces used above for convenience
export {
  DecisionSchema,
  DecisionTypeSchema,
  EndSchema,
  ErrorCodeSchema,
  ErrorDetailSchema,
  ErrorResponseSchema,
  ProcessRequestSchema,
  ResultRequestSchema,
  CancelRequestSchema,
  SessionResponseSchema,
};
