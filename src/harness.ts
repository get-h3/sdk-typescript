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

const STATUS_TO_ERROR_CODE = {
  400: "INVALID_REQUEST",
  404: "SESSION_NOT_FOUND",
  500: "INTERNAL_ERROR",
} as const;

function errorResponse(
  c: Context,
  statusCode: 400 | 404 | 500,
  message: string,
): Response {
  const body = {
    error: {
      code: STATUS_TO_ERROR_CODE[statusCode],
      message,
    },
  };
  return c.json(body, statusCode);
}

// ── Router ──────────────────────────────────────────────────────────

export function createH3Router(harness: Harness): Hono {
  const app = new Hono();

  // Track per-session state seen via /v1/process
  const sessions = new Map<
    string,
    {
      started_at: string;
      last_active: string;
      turn_count: number;
      status: "active";
      current_decision: string;
      current_decision_type:
        "tool_call" | "llm_call" | "text" | "wait" | "delegate" | "end";
    }
  >();

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
    // Track the session: first process creates it, subsequent ones increment.
    // current_decision/current_decision_type always mirror the last decision
    // returned to the client (success or synthesized error decision).
    const recordSession = (
      decision: Pick<Decision, "decision" | "decision_id">,
    ) => {
      const now = new Date().toISOString();
      const existing = sessions.get(req.session_id);
      if (existing) {
        existing.turn_count += 1;
        existing.last_active = now;
        existing.current_decision = decision.decision_id;
        existing.current_decision_type = decision.decision;
      } else {
        sessions.set(req.session_id, {
          started_at: now,
          last_active: now,
          turn_count: 1,
          status: "active",
          current_decision: decision.decision_id,
          current_decision_type: decision.decision,
        });
      }
    };

    try {
      const decision = await harness.onProcess(req);
      recordSession(decision);
      // Echo back context per spec — test battery expects history at Decision level
      const resp = {
        ...decision,
        history: req.context.history,
      };
      return c.json(resp);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorDecision = {
        decision: "end" as const,
        decision_id: crypto.randomUUID(),
        end: { reason: "error" as const, summary: message },
      };
      recordSession(errorDecision);
      return c.json(errorDecision);
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
    if (!sessions.has(req.session_id)) {
      return errorResponse(c, 404, `Session ${req.session_id} not found`);
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
    const session = sessions.get(sessionId);
    if (!session) {
      return c.json(
        {
          error: {
            code: "SESSION_NOT_FOUND" as const,
            message: `Session ${sessionId} not found`,
          },
        },
        404,
      );
    }
    return c.json({
      session_id: sessionId,
      started_at: session.started_at,
      last_active: session.last_active,
      turn_count: session.turn_count,
      status: session.status,
      current_decision: session.current_decision,
      current_decision_type: session.current_decision_type,
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
