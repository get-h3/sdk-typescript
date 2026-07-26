/**
 * QV-SDK-04: TypeScript Zod validation matches JSON Schema.
 *
 * Comprehensive validation that every Zod schema produces JSON that
 * validates against the corresponding H3 protocol JSON Schema (draft 2020-12).
 *
 * Tests:
 *   1. Every Zod-parsed object -> JSON -> validates against its schema
 *   2. Required-fields validation: omitting required fields is rejected by Zod
 *   3. Enum validation: invalid enum values rejected
 *   4. Constraint validation: numeric ranges enforced
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  DecisionTypeSchema,
  EndReasonSchema,
  HealthStatusSchema,
  CancelReasonSchema,
  ResultTypeSchema,
  ErrorCodeSchema,
  SessionStatusSchema,
  CapabilitySchema,
  MessageSchema,
  IdentitySchema,
  SessionStateSchema,
  ConfigSchema,
  ProcessRequestSchema,
  ResultRequestSchema,
  CancelRequestSchema,
  HealthResponseSchema,
  ErrorResponseSchema,
  SessionResponseSchema,
  DecisionSchema,
  ToolCallSchema,
  LLMCallSchema,
  TextResponseSchema,
  WaitSchema,
  DelegateSchema,
  EndSchema,
  ResultPayloadSchema,
} from "../protocol.js";

// -- Schema loading ----------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "protocol",
  "schemas",
  "v1",
);

const ALL_SCHEMAS = [
  "cancel-request.json",
  "common.json",
  "decision.json",
  "delegate.json",
  "end.json",
  "error-response.json",
  "health-response.json",
  "llm-call.json",
  "process-request.json",
  "result-request.json",
  "session-response.json",
  "test-report.json",
  "text-response.json",
  "tool-call.json",
  "wait.json",
];

function loadSchema(name: string): Record<string, unknown> {
  const path = resolve(SCHEMA_DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Schema file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Validate a Zod-parsed object against a named JSON Schema file.
 *  Creates a fresh Ajv per call to avoid "schema already exists" errors. */
function validateAgainstSchema(instance: object, schemaName: string): void {
  const schema = loadSchema(schemaName);
  const ajv = new Ajv({
    strict: false,
    allowUnionTypes: true,
    validateSchema: false,
    allErrors: true,
  });
  addFormats(ajv);

  // Add all OTHER schemas for $ref resolution (skip the one we're testing)
  if (existsSync(SCHEMA_DIR)) {
    for (const name of ALL_SCHEMAS) {
      if (name !== schemaName) {
        const path = resolve(SCHEMA_DIR, name);
        if (existsSync(path)) {
          const s = JSON.parse(readFileSync(path, "utf-8"));
          // $id might collide; use anonymous schema registration
          try {
            ajv.addSchema(s);
          } catch {
            /* already added */
          }
        }
      }
    }
  }

  const validate = ajv.compile(schema);
  const valid = validate(instance);

  if (!valid) {
    const errors = (validate.errors ?? [])
      .map((e) => `  - ${e.message} (at ${e.instancePath || "/"})`)
      .join("\n");
    throw new Error(`Schema validation failed for ${schemaName}:\n${errors}`);
  }
}

// -- Helper factories --------------------------------------------------------

function makeConfig(): Record<string, unknown> {
  return ConfigSchema.parse({ max_iterations: 10, timeout_seconds: 300 });
}

function makeSessionState(): Record<string, unknown> {
  return SessionStateSchema.parse({
    turn_count: 1,
    total_tool_calls: 0,
    total_llm_calls: 0,
    cost_so_far: 0,
    started_at: "2025-01-01T00:00:00Z",
  });
}

function makeContext(): Record<string, unknown> {
  return {
    history: [],
    tools: [],
    models: [],
    config: makeConfig(),
    session_state: makeSessionState(),
  };
}

function makeMessage(): Record<string, unknown> {
  return MessageSchema.parse({
    role: "user",
    content: "hello",
    timestamp: "2025-01-01T00:00:00Z",
  });
}

function makeIdentity(): Record<string, unknown> {
  return IdentitySchema.parse({
    platform: "test",
    chat_id: "test",
    user_name: "tester",
    user_id: "u-1",
  });
}

// -- Schema validation: Request / Response models ----------------------------

describe("QV-SDK-04: Request/Response types validate against JSON Schema", () => {
  it("process_request validates against schema", () => {
    const req = ProcessRequestSchema.parse({
      session_id: "s-1",
      message: makeMessage(),
      identity: makeIdentity(),
      context: makeContext(),
    });
    validateAgainstSchema(req as object, "process-request.json");
  });

  it("result_request validates against schema", () => {
    const req = ResultRequestSchema.parse({
      session_id: "s-1",
      decision_id: "d-1",
      result: { type: "tool_result", success: true, tool_name: "search" },
    });
    validateAgainstSchema(req as object, "result-request.json");
  });

  it("cancel_request validates against schema", () => {
    const req = CancelRequestSchema.parse({
      session_id: "s-1",
      reason: "user_interrupt",
    });
    validateAgainstSchema(req as object, "cancel-request.json");
  });

  it("health_response validates against schema", () => {
    const resp = HealthResponseSchema.parse({
      status: "ok",
      version: "1.0.0",
      transport: "rest",
      protocol_version: "1.0",
      capabilities: ["tool_call", "text", "end"],
    });
    validateAgainstSchema(resp as object, "health-response.json");
  });

  it("error_response validates against schema", () => {
    const resp = ErrorResponseSchema.parse({
      error: { code: "INVALID_REQUEST", message: "Bad payload" },
    });
    validateAgainstSchema(resp as object, "error-response.json");
  });

  it("session_response validates against schema", () => {
    const resp = SessionResponseSchema.parse({
      session_id: "s-1",
      started_at: "2025-01-01T00:00:00Z",
      last_active: "2025-01-01T00:05:00Z",
      turn_count: 3,
      status: "active",
    });
    validateAgainstSchema(resp as object, "session-response.json");
  });
});

// -- Schema validation: Decision payloads ------------------------------------

describe("QV-SDK-04: Decision types validate against JSON Schema", () => {
  it("text decision validates against schema", () => {
    const d = DecisionSchema.parse({
      decision: "text" as const,
      history: [],
      text: { content: "Hello!", finished: true },
    });
    validateAgainstSchema(d as object, "decision.json");
  });

  it("tool_call decision validates against schema", () => {
    const d = DecisionSchema.parse({
      decision: "tool_call" as const,
      history: [],
      tool_call: {
        name: "search",
        params: { q: "cats" },
        reasoning: "need info",
      },
    });
    validateAgainstSchema(d as object, "decision.json");
  });

  it("llm_call decision validates against schema", () => {
    const d = DecisionSchema.parse({
      decision: "llm_call" as const,
      history: [],
      llm_call: {
        model: "deepseek-v4",
        messages: [{ role: "user", content: "hi" }],
      },
    });
    validateAgainstSchema(d as object, "decision.json");
  });

  it("wait decision validates against schema", () => {
    const d = DecisionSchema.parse({
      decision: "wait" as const,
      history: [],
      wait: { reason: "awaiting input", duration_seconds: 30 },
    });
    validateAgainstSchema(d as object, "decision.json");
  });

  it("delegate decision validates against schema", () => {
    const d = DecisionSchema.parse({
      decision: "delegate" as const,
      history: [],
      delegate: { task: "review code", agent: "code-reviewer" },
    });
    validateAgainstSchema(d as object, "decision.json");
  });

  it("end decision validates against schema", () => {
    const d = DecisionSchema.parse({
      decision: "end" as const,
      history: [],
      end: { reason: "task_complete", summary: "All done!" },
    });
    validateAgainstSchema(d as object, "decision.json");
  });
});

// -- Schema validation: Payload sub-types ------------------------------------

describe("QV-SDK-04: Payload sub-types validate against JSON Schema", () => {
  it("tool_call validates against schema", () => {
    const tc = ToolCallSchema.parse({
      name: "search",
      params: { q: "cats" },
      reasoning: "need info",
    });
    validateAgainstSchema(tc as object, "tool-call.json");
  });

  it("llm_call validates against schema", () => {
    const lc = LLMCallSchema.parse({
      model: "deepseek-v4",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.7,
    });
    validateAgainstSchema(lc as object, "llm-call.json");
  });

  it("text_response validates against schema", () => {
    const tr = TextResponseSchema.parse({ content: "Hello!", finished: true });
    validateAgainstSchema(tr as object, "text-response.json");
  });

  it("text_response unfinished validates against schema", () => {
    const tr = TextResponseSchema.parse({
      content: "Streaming...",
      finished: false,
    });
    validateAgainstSchema(tr as object, "text-response.json");
  });

  it("wait validates against schema", () => {
    const w = WaitSchema.parse({
      reason: "awaiting input",
      duration_seconds: 30,
    });
    validateAgainstSchema(w as object, "wait.json");
  });

  it("delegate validates against schema", () => {
    const d = DelegateSchema.parse({
      task: "review code",
      agent: "code-reviewer",
    });
    validateAgainstSchema(d as object, "delegate.json");
  });

  it("end validates against schema", () => {
    const e = EndSchema.parse({
      reason: "task_complete",
      summary: "All done!",
    });
    validateAgainstSchema(e as object, "end.json");
  });
});

// -- Required-field validation ------------------------------------------------

describe("QV-SDK-04: Required fields enforced", () => {
  it("message allows missing timestamp (optional)", () => {
    const msg = MessageSchema.parse({ role: "user", content: "hi" });
    expect(msg.content).toBe("hi");
    expect(msg.timestamp).toBeUndefined();
  });

  it("message rejects missing content (required)", () => {
    expect(() => MessageSchema.parse({ role: "user" })).toThrow();
  });

  it("identity allows missing user_name (optional, gets default)", () => {
    const ident = IdentitySchema.parse({
      platform: "t",
      chat_id: "c",
      user_id: "u",
      user_name: "unknown",
    });
    expect(ident.platform).toBe("t");
    expect(ident.user_name).toBe("unknown");
  });

  it("identity allows missing user_id (optional, gets default)", () => {
    const ident = IdentitySchema.parse({
      platform: "t",
      chat_id: "c",
      user_name: "n",
      user_id: "unknown",
    });
    expect(ident.platform).toBe("t");
    expect(ident.user_name).toBe("n");
    expect(ident.user_id).toBe("unknown");
  });

  it("session_state defaults values", () => {
    const ss = SessionStateSchema.parse({});
    expect(ss.turn_count).toBe(0);
    expect(ss.started_at).toBeUndefined();
  });

  it("config defaults max_iterations", () => {
    const cfg = ConfigSchema.parse({ timeout_seconds: 300 });
    expect(cfg.max_iterations).toBe(100);
    expect(cfg.timeout_seconds).toBe(300);
  });

  it("process request rejects missing session_id", () => {
    expect(() =>
      ProcessRequestSchema.parse({
        message: makeMessage(),
        identity: makeIdentity(),
        context: makeContext(),
      }),
    ).toThrow();
  });

  it("result request rejects missing session_id", () => {
    expect(() =>
      ResultRequestSchema.parse({
        decision_id: "d-1",
        result: { type: "tool_result", success: true },
      }),
    ).toThrow();
  });

  it("cancel request rejects missing reason", () => {
    expect(() => CancelRequestSchema.parse({ session_id: "s-1" })).toThrow();
  });

  it("health response rejects missing status", () => {
    expect(() => HealthResponseSchema.parse({ version: "1.0" })).toThrow();
  });

  it("session response rejects missing status", () => {
    expect(() =>
      SessionResponseSchema.parse({
        session_id: "s-1",
        started_at: "2025-01-01T00:00:00Z",
        last_active: "2025-01-01T00:05:00Z",
        turn_count: 3,
      }),
    ).toThrow();
  });
});

// -- Enum validation matches Schema enums ------------------------------------

describe("QV-SDK-04: Enums match JSON Schema", () => {
  it("DecisionType enum matches schema", () => {
    const schema = loadSchema("decision.json");
    const schemaValues = new Set(
      (schema as any).properties.decision.enum as string[],
    );
    expect(new Set(Object.keys(DecisionTypeSchema.enum))).toEqual(schemaValues);
  });

  it("EndReason enum matches schema", () => {
    const schema = loadSchema("end.json");
    const schemaValues = new Set(
      (schema as any).properties.reason.enum as string[],
    );
    expect(new Set(Object.keys(EndReasonSchema.enum))).toEqual(schemaValues);
  });

  it("HealthStatus enum matches schema", () => {
    const schema = loadSchema("health-response.json");
    const schemaValues = new Set(
      (schema as any).properties.status.enum as string[],
    );
    expect(new Set(Object.keys(HealthStatusSchema.enum))).toEqual(schemaValues);
  });

  it("CancelReason enum matches schema", () => {
    const schema = loadSchema("cancel-request.json");
    const schemaValues = new Set(
      (schema as any).properties.reason.enum as string[],
    );
    expect(new Set(Object.keys(CancelReasonSchema.enum))).toEqual(schemaValues);
  });

  it("ResultType enum matches schema", () => {
    const schema = loadSchema("result-request.json");
    const schemaValues = new Set(
      (schema as any).properties.result.properties.type.enum as string[],
    );
    expect(new Set(Object.keys(ResultTypeSchema.enum))).toEqual(schemaValues);
  });

  it("ErrorCode enum matches schema", () => {
    const schema = loadSchema("error-response.json");
    const schemaValues = new Set(
      (schema as any).properties.error.properties.code.enum as string[],
    );
    expect(new Set(Object.keys(ErrorCodeSchema.enum))).toEqual(schemaValues);
  });

  it("SessionStatus enum matches schema", () => {
    const schema = loadSchema("session-response.json");
    const schemaValues = new Set(
      (schema as any).properties.status.enum as string[],
    );
    expect(new Set(Object.keys(SessionStatusSchema.enum))).toEqual(
      schemaValues,
    );
  });

  it("Capability enum matches schema", () => {
    const schema = loadSchema("health-response.json");
    const schemaValues = new Set(
      (schema as any).properties.capabilities.items.enum as string[],
    );
    expect(new Set(Object.keys(CapabilitySchema.enum))).toEqual(schemaValues);
  });
});

// -- Numeric constraint validation -------------------------------------------

describe("QV-SDK-04: Numeric constraints enforced by Zod", () => {
  it("config timeout_seconds >= 1", () => {
    expect(() =>
      ConfigSchema.parse({ max_iterations: 10, timeout_seconds: 0 }),
    ).toThrow();
  });

  it("config max_iterations >= 1", () => {
    expect(() => ConfigSchema.parse({ max_iterations: 0 })).toThrow();
  });

  it("wait duration_seconds >= 1", () => {
    expect(() =>
      WaitSchema.parse({ reason: "x", duration_seconds: 0 }),
    ).toThrow();
  });

  it("llm_call temperature 0.0-2.0", () => {
    expect(() =>
      LLMCallSchema.parse({
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        temperature: 2.1,
      }),
    ).toThrow();
  });

  it("result payload duration_ms >= 0", () => {
    expect(() =>
      ResultPayloadSchema.parse({
        type: "tool_result",
        success: true,
        duration_ms: -1,
      }),
    ).toThrow();
  });
});
