import { describe, it, expect } from "vitest";
import {
  // Enums (schemas)
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
  // Common schemas
  AttachmentSchema,
  MessageSchema,
  IdentitySchema,
  HistoryEntrySchema,
  ToolSchema,
  ModelSchema,
  SessionStateSchema,
  ConfigSchema,
  ContextSchema,
  // Decision sub-type schemas
  ToolCallSchema,
  LLMMessageSchema,
  LLMCallSchema,
  TextResponseSchema,
  WaitSchema,
  DelegateSchema,
  EndSchema,
  // Request schemas
  ProcessRequestSchema,
  ResultPayloadSchema,
  ResultRequestSchema,
  CancelRequestSchema,
  // Response schemas
  HealthResponseSchema,
  ErrorDetailSchema,
  ErrorResponseSchema,
  SessionResponseSchema,
  // Decision schema
  DecisionSchema,
  // Harness
  createH3Router,
  // Middleware
  addMiddleware,
  requestLogger,
  // Testbed
  MockHermes,
  // Version
  SDK_VERSION,
} from "../index.js";
import type {
  DecisionType,
  EndReason,
  CancelReason,
  ResultType,
  SessionStatus,
  ErrorCode,
  HealthStatus,
  AttachmentType,
  MessageRole,
  Capability,
  Attachment,
  Message,
  Identity,
  HistoryEntry,
  Tool,
  Model,
  SessionState,
  Config,
  Context,
  ToolCall,
  LLMMessage,
  LLMCall,
  TextResponse,
  Wait,
  Delegate,
  End,
  ProcessRequest,
  ResultPayload,
  ResultRequest,
  CancelRequest,
  HealthResponse,
  ErrorDetail,
  ErrorResponse,
  SessionResponse,
  Decision,
  Harness,
} from "../index.js";

describe("SDK_VERSION", () => {
  it("is defined and has correct value", () => {
    expect(SDK_VERSION).toBe("0.1.0");
  });
});

describe("Schema exports", () => {
  it("exports DecisionTypeSchema", () => {
    expect(DecisionTypeSchema).toBeDefined();
    expect(DecisionTypeSchema.parse("text")).toBe("text");
  });

  it("exports EndReasonSchema", () => {
    expect(EndReasonSchema).toBeDefined();
    expect(EndReasonSchema.parse("task_complete")).toBe("task_complete");
  });

  it("exports CancelReasonSchema", () => {
    expect(CancelReasonSchema).toBeDefined();
  });

  it("exports ResultTypeSchema", () => {
    expect(ResultTypeSchema).toBeDefined();
  });

  it("exports SessionStatusSchema", () => {
    expect(SessionStatusSchema).toBeDefined();
  });

  it("exports ErrorCodeSchema", () => {
    expect(ErrorCodeSchema).toBeDefined();
  });

  it("exports HealthStatusSchema", () => {
    expect(HealthStatusSchema).toBeDefined();
  });

  it("exports AttachmentTypeSchema", () => {
    expect(AttachmentTypeSchema).toBeDefined();
  });

  it("exports MessageRoleSchema", () => {
    expect(MessageRoleSchema).toBeDefined();
  });

  it("exports CapabilitySchema", () => {
    expect(CapabilitySchema).toBeDefined();
  });

  it("exports all common type schemas", () => {
    expect(AttachmentSchema).toBeDefined();
    expect(MessageSchema).toBeDefined();
    expect(IdentitySchema).toBeDefined();
    expect(HistoryEntrySchema).toBeDefined();
    expect(ToolSchema).toBeDefined();
    expect(ModelSchema).toBeDefined();
    expect(SessionStateSchema).toBeDefined();
    expect(ConfigSchema).toBeDefined();
    expect(ContextSchema).toBeDefined();
  });

  it("exports all decision sub-type schemas", () => {
    expect(ToolCallSchema).toBeDefined();
    expect(LLMMessageSchema).toBeDefined();
    expect(LLMCallSchema).toBeDefined();
    expect(TextResponseSchema).toBeDefined();
    expect(WaitSchema).toBeDefined();
    expect(DelegateSchema).toBeDefined();
    expect(EndSchema).toBeDefined();
  });

  it("exports all request schemas", () => {
    expect(ProcessRequestSchema).toBeDefined();
    expect(ResultPayloadSchema).toBeDefined();
    expect(ResultRequestSchema).toBeDefined();
    expect(CancelRequestSchema).toBeDefined();
  });

  it("exports all response schemas", () => {
    expect(HealthResponseSchema).toBeDefined();
    expect(ErrorDetailSchema).toBeDefined();
    expect(ErrorResponseSchema).toBeDefined();
    expect(SessionResponseSchema).toBeDefined();
  });

  it("exports DecisionSchema", () => {
    expect(DecisionSchema).toBeDefined();
  });
});

describe("Harness exports", () => {
  it("exports createH3Router", () => {
    expect(createH3Router).toBeDefined();
    expect(typeof createH3Router).toBe("function");
  });
});

describe("Middleware exports", () => {
  it("exports addMiddleware", () => {
    expect(addMiddleware).toBeDefined();
    expect(typeof addMiddleware).toBe("function");
  });

  it("exports requestLogger", () => {
    expect(requestLogger).toBeDefined();
    expect(typeof requestLogger).toBe("function");
  });
});

describe("Testbed exports", () => {
  it("exports MockHermes as a class", () => {
    expect(MockHermes).toBeDefined();
    expect(typeof MockHermes).toBe("function");
    // Verify it is a class constructor
    expect(MockHermes.prototype).toBeDefined();
  });
});

describe("Type exports", () => {
  it("type exports exist (compile-time check — value at runtime)", () => {
    // Type-only exports are erased at runtime, but we check that
    // the module loaded successfully and the constants exist.
    expect(true).toBe(true);
  });
});
