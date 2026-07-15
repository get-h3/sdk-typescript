import { describe, it, expect } from "vitest";
import {
  DecisionTypeSchema,
  EndReasonSchema,
  CancelReasonSchema,
  ResultTypeSchema,
  SessionStatusSchema,
  ErrorCodeSchema,
  HealthStatusSchema,
  AttachmentTypeSchema,
  MessageRoleSchema,
  CapabilitySchema,
  AttachmentSchema,
  MessageSchema,
  IdentitySchema,
  HistoryEntrySchema,
  ToolSchema,
  ModelSchema,
  SessionStateSchema,
  ConfigSchema,
  ContextSchema,
  ToolCallSchema,
  LLMMessageSchema,
  LLMCallSchema,
  TextResponseSchema,
  WaitSchema,
  DelegateSchema,
  EndSchema,
  ProcessRequestSchema,
  ResultPayloadSchema,
  ResultRequestSchema,
  CancelRequestSchema,
  HealthResponseSchema,
  ErrorDetailSchema,
  ErrorResponseSchema,
  SessionResponseSchema,
  DecisionSchema,
} from "../protocol.js";

// ── Enum Schemas ─────────────────────────────────────────────────────

describe("DecisionTypeSchema", () => {
  it("accepts valid decision types", () => {
    expect(DecisionTypeSchema.parse("tool_call")).toBe("tool_call");
    expect(DecisionTypeSchema.parse("llm_call")).toBe("llm_call");
    expect(DecisionTypeSchema.parse("text")).toBe("text");
    expect(DecisionTypeSchema.parse("wait")).toBe("wait");
    expect(DecisionTypeSchema.parse("delegate")).toBe("delegate");
    expect(DecisionTypeSchema.parse("end")).toBe("end");
  });

  it("rejects invalid decision types", () => {
    expect(() => DecisionTypeSchema.parse("invalid")).toThrow();
    expect(() => DecisionTypeSchema.parse("")).toThrow();
    expect(() => DecisionTypeSchema.parse(123)).toThrow();
  });
});

describe("EndReasonSchema", () => {
  it("accepts valid end reasons", () => {
    expect(EndReasonSchema.parse("task_complete")).toBe("task_complete");
    expect(EndReasonSchema.parse("user_requested")).toBe("user_requested");
    expect(EndReasonSchema.parse("error")).toBe("error");
    expect(EndReasonSchema.parse("timeout")).toBe("timeout");
    expect(EndReasonSchema.parse("rate_limited")).toBe("rate_limited");
    expect(EndReasonSchema.parse("cancelled")).toBe("cancelled");
  });

  it("rejects invalid end reasons", () => {
    expect(() => EndReasonSchema.parse("unknown")).toThrow();
  });
});

describe("CancelReasonSchema", () => {
  it("accepts valid cancel reasons", () => {
    expect(CancelReasonSchema.parse("user_interrupt")).toBe("user_interrupt");
    expect(CancelReasonSchema.parse("timeout")).toBe("timeout");
    expect(CancelReasonSchema.parse("system")).toBe("system");
  });

  it("rejects invalid cancel reasons", () => {
    expect(() => CancelReasonSchema.parse("nope")).toThrow();
  });
});

describe("SessionStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(SessionStatusSchema.parse("active")).toBe("active");
    expect(SessionStatusSchema.parse("completed")).toBe("completed");
    expect(SessionStatusSchema.parse("expired")).toBe("expired");
    expect(SessionStatusSchema.parse("cancelled")).toBe("cancelled");
  });
});

describe("ErrorCodeSchema", () => {
  it("accepts valid error codes", () => {
    expect(ErrorCodeSchema.parse("INVALID_REQUEST")).toBe("INVALID_REQUEST");
    expect(ErrorCodeSchema.parse("SESSION_NOT_FOUND")).toBe(
      "SESSION_NOT_FOUND",
    );
    expect(ErrorCodeSchema.parse("INTERNAL_ERROR")).toBe("INTERNAL_ERROR");
  });
});

describe("CapabilitySchema", () => {
  it("accepts valid capabilities", () => {
    expect(CapabilitySchema.parse("tool_call")).toBe("tool_call");
    expect(CapabilitySchema.parse("text")).toBe("text");
    expect(CapabilitySchema.parse("end")).toBe("end");
  });
});

// ── Message / Identity Schemas ───────────────────────────────────────

describe("MessageSchema", () => {
  it("parses a valid message", () => {
    const result = MessageSchema.parse({
      role: "user",
      content: "Hello",
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.role).toBe("user");
    expect(result.content).toBe("Hello");
  });

  it("parses message with attachments", () => {
    const result = MessageSchema.parse({
      role: "user",
      content: "Look at this",
      timestamp: "2026-01-01T00:00:00Z",
      attachments: [
        {
          type: "image",
          url: "https://example.com/img.png",
          mime_type: "image/png",
        },
      ],
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe("image");
  });

  it("rejects missing required fields", () => {
    expect(() => MessageSchema.parse({ role: "user" })).toThrow();
  });
});

describe("IdentitySchema", () => {
  it("parses a valid identity", () => {
    const result = IdentitySchema.parse({
      platform: "telegram",
      chat_id: "123",
      user_name: "test",
      user_id: "456",
    });
    expect(result.platform).toBe("telegram");
  });

  it("parses identity with optional thread_id", () => {
    const result = IdentitySchema.parse({
      platform: "telegram",
      chat_id: "123",
      thread_id: "789",
      user_name: "test",
      user_id: "456",
    });
    expect(result.thread_id).toBe("789");
  });
});

// ── Context / Config Schemas ─────────────────────────────────────────

describe("ConfigSchema", () => {
  it("parses valid config", () => {
    const result = ConfigSchema.parse({
      max_iterations: 10,
      timeout_seconds: 300,
    });
    expect(result.max_iterations).toBe(10);
    expect(result.timeout_seconds).toBe(300);
  });

  it("parses config with optional fields", () => {
    const result = ConfigSchema.parse({
      max_iterations: 20,
      timeout_seconds: 600,
      project_dir: "/tmp",
      max_tool_calls_per_turn: 5,
      temperature: 0.7,
    });
    expect(result.temperature).toBe(0.7);
    expect(result.max_tool_calls_per_turn).toBe(5);
  });

  it("rejects temperature out of range", () => {
    expect(() =>
      ConfigSchema.parse({
        max_iterations: 10,
        timeout_seconds: 300,
        temperature: 3,
      }),
    ).toThrow();
  });
});

describe("SessionStateSchema", () => {
  it("parses session state with defaults", () => {
    const result = SessionStateSchema.parse({
      started_at: "2026-01-01T00:00:00Z",
    });
    expect(result.turn_count).toBe(0);
    expect(result.total_tool_calls).toBe(0);
    expect(result.cost_so_far).toBe(0);
  });
});

describe("ContextSchema", () => {
  it("parses minimal context", () => {
    const result = ContextSchema.parse({
      config: { max_iterations: 10, timeout_seconds: 300 },
      session_state: { started_at: "2026-01-01T00:00:00Z" },
    });
    expect(result.history).toEqual([]);
    expect(result.tools).toEqual([]);
    expect(result.models).toEqual([]);
  });
});

// ── Decision Sub-Types ───────────────────────────────────────────────

describe("ToolCallSchema", () => {
  it("parses a tool call", () => {
    const result = ToolCallSchema.parse({
      name: "search",
      params: { query: "test" },
      reasoning: "Looking for information",
    });
    expect(result.name).toBe("search");
    expect(result.reasoning).toBe("Looking for information");
  });
});

describe("LLMCallSchema", () => {
  it("parses an LLM call", () => {
    const result = LLMCallSchema.parse({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.model).toBe("deepseek-v4-flash");
    expect(result.messages).toHaveLength(1);
  });

  it("parses with optional fields", () => {
    const result = LLMCallSchema.parse({
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: "You are helpful" }],
      system_prompt: "Be concise",
      temperature: 0.5,
      max_tokens: 4096,
    });
    expect(result.temperature).toBe(0.5);
    expect(result.max_tokens).toBe(4096);
  });
});

describe("TextResponseSchema", () => {
  it("parses text response", () => {
    const result = TextResponseSchema.parse({
      content: "Hello world",
      finished: true,
    });
    expect(result.content).toBe("Hello world");
    expect(result.finished).toBe(true);
  });
});

describe("WaitSchema", () => {
  it("parses a wait decision", () => {
    const result = WaitSchema.parse({
      reason: "Waiting for user input",
      duration_seconds: 30,
    });
    expect(result.reason).toBe("Waiting for user input");
    expect(result.duration_seconds).toBe(30);
  });

  it("rejects negative duration", () => {
    expect(() =>
      WaitSchema.parse({ reason: "wait", duration_seconds: -1 }),
    ).toThrow();
  });
});

describe("DelegateSchema", () => {
  it("parses a delegate decision", () => {
    const result = DelegateSchema.parse({
      task: "Build feature X",
      agent: "coder",
    });
    expect(result.task).toBe("Build feature X");
    expect(result.agent).toBe("coder");
  });
});

describe("EndSchema", () => {
  it("parses an end decision", () => {
    const result = EndSchema.parse({
      reason: "task_complete",
      summary: "All done",
    });
    expect(result.reason).toBe("task_complete");
    expect(result.summary).toBe("All done");
  });
});

// ── Request Schemas ──────────────────────────────────────────────────

describe("ProcessRequestSchema", () => {
  it("parses a valid process request", () => {
    const result = ProcessRequestSchema.parse({
      session_id: "ses-123",
      message: {
        role: "user",
        content: "Hello",
        timestamp: "2026-01-01T00:00:00Z",
      },
      identity: {
        platform: "telegram",
        chat_id: "123",
        user_name: "test",
        user_id: "456",
      },
      context: {
        config: { max_iterations: 10, timeout_seconds: 300 },
        session_state: { started_at: "2026-01-01T00:00:00Z" },
      },
    });
    expect(result.session_id).toBe("ses-123");
    expect(result.message.content).toBe("Hello");
  });
});

describe("ResultRequestSchema", () => {
  it("parses a valid result request", () => {
    const result = ResultRequestSchema.parse({
      session_id: "ses-123",
      decision_id: "dec-456",
      result: {
        type: "tool_result",
        tool_name: "search",
        data: { results: ["a", "b"] },
        success: true,
      },
    });
    expect(result.decision_id).toBe("dec-456");
    expect(result.result.type).toBe("tool_result");
    expect(result.result.success).toBe(true);
  });
});

describe("CancelRequestSchema", () => {
  it("parses a valid cancel request", () => {
    const result = CancelRequestSchema.parse({
      session_id: "ses-123",
      reason: "user_interrupt",
    });
    expect(result.session_id).toBe("ses-123");
    expect(result.reason).toBe("user_interrupt");
  });
});

// ── Response Schemas ─────────────────────────────────────────────────

describe("HealthResponseSchema", () => {
  it("parses minimal health response", () => {
    const result = HealthResponseSchema.parse({
      status: "ok",
      version: "1.0.0",
    });
    expect(result.status).toBe("ok");
    expect(result.transport).toBe("rest");
  });

  it("parses degraded health response", () => {
    const result = HealthResponseSchema.parse({
      status: "degraded",
      version: "1.0.0",
      degraded_reason: "High load",
    });
    expect(result.degraded_reason).toBe("High load");
  });
});

describe("ErrorResponseSchema", () => {
  it("parses an error response", () => {
    const result = ErrorResponseSchema.parse({
      error: {
        code: "INVALID_REQUEST",
        message: "Bad input",
      },
    });
    expect(result.error.code).toBe("INVALID_REQUEST");
    expect(result.error.message).toBe("Bad input");
  });
});

describe("SessionResponseSchema", () => {
  it("parses session response", () => {
    const result = SessionResponseSchema.parse({
      session_id: "ses-123",
      started_at: "2026-01-01T00:00:00Z",
      last_active: "2026-01-01T00:05:00Z",
      status: "active",
    });
    expect(result.session_id).toBe("ses-123");
    expect(result.turn_count).toBe(0);
    expect(result.status).toBe("active");
  });
});

// ── Decision (top-level) ─────────────────────────────────────────────

describe("DecisionSchema", () => {
  it("parses a text decision", () => {
    const result = DecisionSchema.parse({
      decision: "text",
      decision_id: "00000000-0000-0000-0000-000000000001",
      text: { content: "Hello!", finished: true },
    });
    expect(result.decision).toBe("text");
    expect(result.text?.content).toBe("Hello!");
  });

  it("parses a tool_call decision", () => {
    const result = DecisionSchema.parse({
      decision: "tool_call",
      decision_id: "00000000-0000-0000-0000-000000000002",
      tool_call: { name: "search", params: { q: "test" } },
    });
    expect(result.decision).toBe("tool_call");
    expect(result.tool_call?.name).toBe("search");
  });

  it("parses an end decision", () => {
    const result = DecisionSchema.parse({
      decision: "end",
      decision_id: "00000000-0000-0000-0000-000000000003",
      end: { reason: "task_complete" },
    });
    expect(result.decision).toBe("end");
    expect(result.end?.reason).toBe("task_complete");
  });

  it("parses a wait decision", () => {
    const result = DecisionSchema.parse({
      decision: "wait",
      decision_id: "00000000-0000-0000-0000-000000000004",
      wait: { reason: "polling", duration_seconds: 5 },
    });
    expect(result.decision).toBe("wait");
    expect(result.wait?.duration_seconds).toBe(5);
  });

  it("parses a delegate decision", () => {
    const result = DecisionSchema.parse({
      decision: "delegate",
      decision_id: "00000000-0000-0000-0000-000000000005",
      delegate: { task: "Do X" },
    });
    expect(result.decision).toBe("delegate");
    expect(result.delegate?.task).toBe("Do X");
  });

  it("parses an llm_call decision", () => {
    const result = DecisionSchema.parse({
      decision: "llm_call",
      decision_id: "00000000-0000-0000-0000-000000000006",
      llm_call: {
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(result.decision).toBe("llm_call");
    expect(result.llm_call?.model).toBe("test-model");
  });

  it("accepts minimal decision with defaults filled", () => {
    const result = DecisionSchema.parse({ decision: "text" });
    expect(result.decision).toBe("text");
    expect(result.decision_id).toBeDefined(); // UUID default
  });

  it("rejects invalid decision type", () => {
    expect(() => DecisionSchema.parse({ decision: "invalid" })).toThrow();
  });

  it("rejects invalid UUID decision_id", () => {
    expect(() =>
      DecisionSchema.parse({
        decision: "text",
        decision_id: "not-a-uuid",
        text: { content: "hi", finished: true },
      }),
    ).toThrow();
  });
});
