import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createH3Router } from "../harness.js";
import type { Harness } from "../harness.js";
import type {
  Decision,
  ProcessRequest,
  ResultRequest,
  CancelRequest,
} from "../protocol.js";
import type { HealthResponse } from "../protocol.js";

function makeHarness(
  overrides?: Partial<{
    onProcess: (req: ProcessRequest) => Promise<Decision>;
    onResult: (req: ResultRequest) => Promise<Decision>;
    onCancel: (req: CancelRequest) => Promise<boolean>;
    onSessionTerminate: (sessionId: string) => Promise<void>;
  }>,
): Harness {
  return {
    health(): HealthResponse {
      return {
        status: "ok",
        version: "1.0.0",
        transport: "rest",
        protocol_version: "1.0",
        capabilities: ["text", "end"],
      };
    },
    async onProcess(req: ProcessRequest): Promise<Decision> {
      return (
        overrides?.onProcess?.(req) ?? {
          decision: "text",
          decision_id: crypto.randomUUID(),
          text: { content: `Got: ${req.message.content}`, finished: true },
        }
      );
    },
    async onResult(req: ResultRequest): Promise<Decision> {
      return (
        overrides?.onResult?.(req) ?? {
          decision: "end",
          decision_id: crypto.randomUUID(),
          end: { reason: "task_complete", summary: "Done" },
        }
      );
    },
    onCancel: overrides?.onCancel,
    onSessionTerminate: overrides?.onSessionTerminate,
  };
}

function makeApp(harness: Harness): Hono {
  const app = new Hono();
  app.route("/", createH3Router(harness));
  return app;
}

// ── GET /v1/health ───────────────────────────────────────────────────

describe("GET /v1/health", () => {
  it("returns health response from harness", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
    expect(body.transport).toBe("rest");
    expect(body.capabilities).toContain("text");
  });
});

// ── POST /v1/process ─────────────────────────────────────────────────

describe("POST /v1/process", () => {
  const validProcessBody = {
    session_id: "ses-abc",
    message: {
      role: "user",
      content: "Hello",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    identity: {
      platform: "test",
      chat_id: "test",
      user_name: "test",
      user_id: "test-user",
    },
    context: {
      history: [],
      tools: [],
      models: [],
      config: { max_iterations: 10, timeout_seconds: 300 },
      session_state: {
        turn_count: 0,
        total_tool_calls: 0,
        total_llm_calls: 0,
        cost_so_far: 0,
        started_at: "2026-01-01T00:00:00.000Z",
      },
    },
  };

  it("processes a valid request and returns a decision", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validProcessBody),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.decision).toBe("text");
    expect(body.decision_id).toBeDefined();
    expect(body.text.content).toContain("Hello");
  });

  it("returns 400 for invalid body", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("returns end decision on harness error", async () => {
    const app = makeApp(
      makeHarness({
        onProcess: async () => {
          throw new Error("Harness failure");
        },
      }),
    );

    const res = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validProcessBody),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.decision).toBe("end");
    expect(body.end.reason).toBe("error");
    expect(body.end.summary).toBe("Harness failure");
  });
});

// ── POST /v1/result ──────────────────────────────────────────────────

describe("POST /v1/result", () => {
  const validResultBody = {
    session_id: "ses-abc",
    decision_id: "dec-001",
    result: {
      type: "tool_result",
      tool_name: "search",
      data: { found: true },
      success: true,
    },
  };

  it("processes a valid result and returns a decision", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validResultBody),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.decision).toBe("end");
    expect(body.end.reason).toBe("task_complete");
  });

  it("returns 400 for invalid body", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bad: true }),
    });
    expect(res.status).toBe(400);
  });

  it("returns end on harness error", async () => {
    const app = makeApp(
      makeHarness({
        onResult: async () => {
          throw new Error("Result handler crash");
        },
      }),
    );

    const res = await app.request("/v1/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validResultBody),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.decision).toBe("end");
    expect(body.end.summary).toBe("Result handler crash");
  });
});

// ── POST /v1/cancel ──────────────────────────────────────────────────

describe("POST /v1/cancel", () => {
  const validCancelBody = {
    session_id: "ses-abc",
    reason: "user_interrupt",
  };

  it("cancels and returns session info", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCancelBody),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session_id).toBe("ses-abc");
    expect(body.cancelled).toBe(true);
  });

  it("returns 400 for invalid body", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when onCancel throws", async () => {
    const app = makeApp(
      makeHarness({
        onCancel: async () => {
          throw new Error("Cancel failed");
        },
      }),
    );

    const res = await app.request("/v1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCancelBody),
    });
    expect(res.status).toBe(500);
  });

  it("returns cancelled true when onCancel not defined", async () => {
    const app = makeApp(makeHarness({ onCancel: undefined as never }));

    const res = await app.request("/v1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCancelBody),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.cancelled).toBe(true);
  });
});

// ── GET /v1/sessions/:session_id ─────────────────────────────────────

describe("GET /v1/sessions/:session_id", () => {
  it("returns session info", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/sessions/ses-123");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session_id).toBe("ses-123");
    expect(body.status).toBe("active");
    expect(body.turn_count).toBe(0);
  });
});

// ── DELETE /v1/sessions/:session_id ──────────────────────────────────

describe("DELETE /v1/sessions/:session_id", () => {
  it("terminates session successfully", async () => {
    let terminated = "";
    const app = makeApp(
      makeHarness({
        onSessionTerminate: async (sid) => {
          terminated = sid;
        },
      }),
    );

    const res = await app.request("/v1/sessions/ses-abc", { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session_id).toBe("ses-abc");
    expect(body.terminated).toBe(true);
    expect(terminated).toBe("ses-abc");
  });

  it("returns terminated true when onSessionTerminate not defined", async () => {
    const app = makeApp(
      makeHarness({ onSessionTerminate: undefined as never }),
    );

    const res = await app.request("/v1/sessions/ses-xyz", { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.terminated).toBe(true);
  });

  it("returns 500 when onSessionTerminate throws", async () => {
    const app = makeApp(
      makeHarness({
        onSessionTerminate: async () => {
          throw new Error("Terminate failed");
        },
      }),
    );

    const res = await app.request("/v1/sessions/ses-fail", {
      method: "DELETE",
    });
    expect(res.status).toBe(500);
  });
});
