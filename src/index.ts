/**
 * @get-h3/h3-harness-sdk
 * TypeScript SDK for building H3-compliant agent harnesses.
 * Works with Node, Bun, Deno.
 */

// ── Protocol: all types and schemas ─────────────────────────────────
export {
  // Enums
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
  // Common types
  AttachmentSchema,
  MessageSchema,
  IdentitySchema,
  HistoryEntrySchema,
  ToolSchema,
  ModelSchema,
  SessionStateSchema,
  ConfigSchema,
  ContextSchema,
  // Decision sub-types
  ToolCallSchema,
  LLMMessageSchema,
  LLMCallSchema,
  TextResponseSchema,
  WaitSchema,
  DelegateSchema,
  EndSchema,
  // Requests
  ProcessRequestSchema,
  ResultPayloadSchema,
  ResultRequestSchema,
  CancelRequestSchema,
  // Responses
  HealthResponseSchema,
  ErrorDetailSchema,
  ErrorResponseSchema,
  SessionResponseSchema,
  // Decision
  DecisionSchema,
} from "./protocol.js";

export type {
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
} from "./protocol.js";

// ── Harness ─────────────────────────────────────────────────────────
export { createH3Router } from "./harness.js";
export type { Harness } from "./harness.js";

// ── Middleware ──────────────────────────────────────────────────────
export { addMiddleware, requestLogger } from "./middleware.js";

// ── Testbed ─────────────────────────────────────────────────────────
export { MockHermes } from "./testbed.js";

// ── Version ─────────────────────────────────────────────────────────
export const SDK_VERSION = "0.1.0";
