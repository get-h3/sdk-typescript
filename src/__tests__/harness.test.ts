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
    expect(body.error.code).toBe("INVALID_REQUEST");
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

  it("returns 500 INVALID_DECISION when harness returns an old-shape tool_call", async () => {
    // Old wire shape {tool_name, arguments, call_id} (docs/dogfood/2026-08-04 era)
    // must NOT pass through — GAP-033.
    const app = makeApp(
      makeHarness({
        onProcess: async () =>
          ({
            decision: "tool_call",
            decision_id: crypto.randomUUID(),
            tool_call: {
              tool_name: "read_file",
              arguments: {},
              call_id: "call-001",
            },
          }) as unknown as Decision,
      }),
    );

    const res = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validProcessBody),
    });
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error.code).toBe("INVALID_DECISION");
    expect(body.error.message).toContain("tool_call");
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

  it("returns 500 INVALID_DECISION when harness returns an invalid decision type", async () => {
    // A decision outside the DecisionTypeSchema enum must not pass through — GAP-033.
    const app = makeApp(
      makeHarness({
        onResult: async () =>
          ({
            decision: "bogus",
            decision_id: crypto.randomUUID(),
          }) as unknown as Decision,
      }),
    );

    const res = await app.request("/v1/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validResultBody),
    });
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error.code).toBe("INVALID_DECISION");
    expect(body.error.message).toContain("decision");
    expect(body.error.message).toContain("Invalid option");
  });
});

// ── POST /v1/cancel ──────────────────────────────────────────────────

describe("POST /v1/cancel", () => {
  const validCancelBody = {
    session_id: "ses-abc",
    reason: "user_interrupt",
  };

  // Battery test_5_9b: cancel of an unknown session 404s — sessions must be
  // created via /v1/process before cancel (mirrors sdk-go/sdk-python).
  async function createSession(app: Hono, sessionId: string) {
    const res = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message: {
          role: "user",
          content: "hello",
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
      }),
    });
    expect(res.status).toBe(200);
  }

  it("cancels and returns session info", async () => {
    const app = makeApp(makeHarness());
    await createSession(app, "ses-abc");
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

  it("returns 404 for unknown session", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "nope-unknown",
        reason: "user_interrupt",
      }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("returns 500 when onCancel throws", async () => {
    const app = makeApp(
      makeHarness({
        onCancel: async () => {
          throw new Error("Cancel failed");
        },
      }),
    );
    // Session must exist before cancel (battery test_5_9b: unknown session 404s)
    await createSession(app, "ses-abc");

    const res = await app.request("/v1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCancelBody),
    });
    expect(res.status).toBe(500);
  });

  it("returns cancelled true when onCancel not defined", async () => {
    const app = makeApp(makeHarness({ onCancel: undefined as never }));
    // Session must exist before cancel (battery test_5_9b: unknown session 404s)
    await createSession(app, "ses-abc");

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
  it("returns session info for an active session", async () => {
    const app = makeApp(makeHarness());

    // First create the session via /v1/process
    const processRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "ses-active",
        message: { role: "user", content: "Hello" },
        identity: { platform: "test", chat_id: "test" },
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
          },
        },
      }),
    });
    expect(processRes.status).toBe(200);
    const processBody = await processRes.json();

    const res = await app.request("/v1/sessions/ses-active");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session_id).toBe("ses-active");
    expect(body.status).toBe("active");
    expect(body.turn_count).toBe(1);
    expect(body.started_at).not.toBe("");
    expect(body.last_active).not.toBe("");
    expect(body.current_decision).toBe(processBody.decision_id);
    expect(body.current_decision_type).toBe("text");
  });

  it("increments turn_count and refreshes last_active across process calls", async () => {
    const app = makeApp(makeHarness());

    const processBody = {
      session_id: "ses-active",
      message: { role: "user", content: "Hello" },
      identity: { platform: "test", chat_id: "test" },
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
        },
      },
    };

    // First process call creates the session
    const firstRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(processBody),
    });
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();

    // Second process call increments the turn count
    const secondRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(processBody),
    });
    expect(secondRes.status).toBe(200);
    const secondBody = await secondRes.json();

    const res = await app.request("/v1/sessions/ses-active");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session_id).toBe("ses-active");
    expect(body.status).toBe("active");
    expect(body.turn_count).toBe(2);
    expect(body.started_at).not.toBe("");
    expect(body.last_active).not.toBe("");
    // Fields track the SECOND decision, not stale values from the first call
    expect(body.current_decision).toBe(secondBody.decision_id);
    expect(body.current_decision).not.toBe(firstBody.decision_id);
    expect(body.current_decision_type).toBe("text");
  });

  it("reflects the LAST decision type when two process calls differ in type", async () => {
    // First call returns "text", second returns "wait" — proves
    // current_decision_type tracks the last decision, not a stale first one.
    const decisionSequence: Decision[] = [
      {
        decision: "text",
        decision_id: crypto.randomUUID(),
        history: [],
        text: { content: "First turn", finished: true },
      },
      {
        decision: "wait",
        decision_id: crypto.randomUUID(),
        history: [],
        wait: { reason: "awaiting tool result", duration_seconds: 30 },
      },
    ];
    let processCalls = 0;
    const app = makeApp(
      makeHarness({
        onProcess: async () =>
          decisionSequence[processCalls++] ??
          decisionSequence[decisionSequence.length - 1],
      }),
    );

    const processBody = {
      session_id: "ses-types",
      message: { role: "user", content: "Hello" },
      identity: { platform: "test", chat_id: "test" },
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
        },
      },
    };

    const firstRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(processBody),
    });
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();

    const secondRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(processBody),
    });
    expect(secondRes.status).toBe(200);
    const secondBody = await secondRes.json();

    // Sanity: the two calls really did produce different decision types
    expect(firstBody.decision).toBe("text");
    expect(secondBody.decision).toBe("wait");
    expect(secondBody.decision_id).not.toBe(firstBody.decision_id);

    const res = await app.request("/v1/sessions/ses-types");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.turn_count).toBe(2);
    expect(body.current_decision).toBe(secondBody.decision_id);
    expect(body.current_decision).not.toBe(firstBody.decision_id);
    // current_decision_type mirrors the SECOND decision's type, not stale text
    expect(body.current_decision_type).toBe("wait");
  });

  it("records the synthesized end decision when onProcess throws", async () => {
    const app = makeApp(
      makeHarness({
        onProcess: async () => {
          throw new Error("Harness failure");
        },
      }),
    );

    const processRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "ses-error",
        message: { role: "user", content: "Hello" },
        identity: { platform: "test", chat_id: "test" },
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
          },
        },
      }),
    });
    expect(processRes.status).toBe(200);
    const processBody = await processRes.json();
    expect(processBody.decision).toBe("end");
    expect(processBody.end.reason).toBe("error");

    const res = await app.request("/v1/sessions/ses-error");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.current_decision).toBe(processBody.decision_id);
    expect(body.current_decision_type).toBe("end");
    expect(body.turn_count).toBe(1);
  });

  it("returns 404 for an unknown session", async () => {
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/sessions/unknown-session");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("transitions status to completed after an end decision via /v1/result (battery test_5_11)", async () => {
    const app = makeApp(makeHarness());

    // Create the session via /v1/process (text decision keeps it active).
    const processRes = await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "ses-completed",
        message: { role: "user", content: "Hello" },
        identity: { platform: "test", chat_id: "test" },
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
          },
        },
      }),
    });
    expect(processRes.status).toBe(200);
    const processBody = await processRes.json();
    expect(processBody.decision).toBe("text");

    // Drive the result round-trip; the default harness returns an end decision.
    const resultRes = await app.request("/v1/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "ses-completed",
        decision_id: processBody.decision_id,
        result: { type: "text_sent", data: { finished: true }, success: true },
      }),
    });
    expect(resultRes.status).toBe(200);
    const resultBody = await resultRes.json();
    expect(resultBody.decision).toBe("end");

    const res = await app.request("/v1/sessions/ses-completed");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.turn_count).toBe(2);
    expect(body.current_decision_type).toBe("end");
  });
});

// ── DELETE /v1/sessions/:session_id ──────────────────────────────────

describe("DELETE /v1/sessions/:session_id", () => {
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

  async function createSession(app: Hono): Promise<void> {
    await app.request("/v1/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validProcessBody),
    });
  }

  it("terminates session successfully", async () => {
    let terminated = "";
    const app = makeApp(
      makeHarness({
        onSessionTerminate: async (sid) => {
          terminated = sid;
        },
      }),
    );
    await createSession(app);

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
    await createSession(app);

    const res = await app.request("/v1/sessions/ses-abc", { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.terminated).toBe(true);
  });

  it("returns 404 SESSION_NOT_FOUND for an unknown session", async () => {
    // DELETE must be consistent with GET and /v1/cancel — GAP-037.
    const app = makeApp(makeHarness());
    const res = await app.request("/v1/sessions/never-created", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("returns 500 when onSessionTerminate throws", async () => {
    const app = makeApp(
      makeHarness({
        onSessionTerminate: async () => {
          throw new Error("Terminate failed");
        },
      }),
    );
    await createSession(app);

    const res = await app.request("/v1/sessions/ses-abc", {
      method: "DELETE",
    });
    expect(res.status).toBe(500);
  });
});
