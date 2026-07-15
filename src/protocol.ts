/**
 * H3 Protocol Types — Zod schemas + TypeScript types matching the v1 JSON Schema.
 *
 * Generated from get-h3/protocol/schemas/v1/*.json.
 * All field names use snake_case per the wire JSON format (no translation).
 */

import { z } from "zod";

// ── Enums ───────────────────────────────────────────────────────────

export const DecisionTypeSchema = z.enum([
  "tool_call",
  "llm_call",
  "text",
  "wait",
  "delegate",
  "end",
] as const);
export type DecisionType = z.infer<typeof DecisionTypeSchema>;

export const EndReasonSchema = z.enum([
  "task_complete",
  "user_requested",
  "error",
  "timeout",
  "rate_limited",
  "cancelled",
] as const);
export type EndReason = z.infer<typeof EndReasonSchema>;

export const CancelReasonSchema = z.enum([
  "user_interrupt",
  "timeout",
  "system",
] as const);
export type CancelReason = z.infer<typeof CancelReasonSchema>;

export const ResultTypeSchema = z.enum([
  "tool_result",
  "llm_response",
  "text_sent",
  "delegate_result",
  "wait_timeout",
  "error",
] as const);
export type ResultType = z.infer<typeof ResultTypeSchema>;

export const SessionStatusSchema = z.enum([
  "active",
  "completed",
  "expired",
  "cancelled",
] as const);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const ErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "INVALID_DECISION",
  "UNKNOWN_TOOL",
  "UNKNOWN_MODEL",
  "SESSION_NOT_FOUND",
  "SESSION_EXPIRED",
  "HARNESS_TIMEOUT",
  "INTERNAL_ERROR",
] as const);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const HealthStatusSchema = z.enum(["ok", "degraded", "down"] as const);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const AttachmentTypeSchema = z.enum([
  "image",
  "file",
  "audio",
  "video",
] as const);
export type AttachmentType = z.infer<typeof AttachmentTypeSchema>;

export const MessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
] as const);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const CapabilitySchema = z.enum([
  "tool_call",
  "llm_call",
  "text",
  "wait",
  "delegate",
  "end",
] as const);
export type Capability = z.infer<typeof CapabilitySchema>;

// ── Common / Shared Types ───────────────────────────────────────────

export const AttachmentSchema = z.object({
  type: AttachmentTypeSchema,
  url: z.string(),
  mime_type: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const MessageSchema = z.object({
  role: z.string().default("user"),
  content: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
  timestamp: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const IdentitySchema = z.object({
  platform: z.string(),
  chat_id: z.string(),
  thread_id: z.string().optional(),
  user_name: z.string(),
  user_id: z.string(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const HistoryEntrySchema = z.object({
  role: z.string(),
  content: z.string(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
});
export type Tool = z.infer<typeof ToolSchema>;

export const ModelSchema = z.object({
  name: z.string(),
  provider: z.string(),
  cost_per_1k_input: z.number().optional(),
  cost_per_1k_output: z.number().optional(),
  context_window: z.number(),
  supports_vision: z.boolean().optional(),
  supports_tool_calling: z.boolean().optional(),
});
export type Model = z.infer<typeof ModelSchema>;

export const SessionStateSchema = z.object({
  turn_count: z.number().default(0),
  total_tool_calls: z.number().default(0),
  total_llm_calls: z.number().default(0),
  cost_so_far: z.number().default(0),
  started_at: z.string(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const ConfigSchema = z.object({
  max_iterations: z.number(),
  timeout_seconds: z.number(),
  project_dir: z.string().optional(),
  max_tool_calls_per_turn: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

export const ContextSchema = z.object({
  history: z.array(HistoryEntrySchema).default([]),
  tools: z.array(ToolSchema).default([]),
  models: z.array(ModelSchema).default([]),
  memory: z.string().optional(),
  skills: z.array(z.string()).optional(),
  config: ConfigSchema,
  session_state: SessionStateSchema,
});
export type Context = z.infer<typeof ContextSchema>;

// ── Decision Sub-Types ──────────────────────────────────────────────

export const ToolCallSchema = z.object({
  name: z.string(),
  params: z.record(z.unknown()),
  reasoning: z.string().optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const LLMMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
});
export type LLMMessage = z.infer<typeof LLMMessageSchema>;

export const LLMCallSchema = z.object({
  model: z.string(),
  messages: z.array(LLMMessageSchema),
  system_prompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
});
export type LLMCall = z.infer<typeof LLMCallSchema>;

export const TextResponseSchema = z.object({
  content: z.string(),
  finished: z.boolean(),
});
export type TextResponse = z.infer<typeof TextResponseSchema>;

export const WaitSchema = z.object({
  reason: z.string(),
  duration_seconds: z.number().int().min(1).optional(),
  poll_endpoint: z.string().url().optional(),
});
export type Wait = z.infer<typeof WaitSchema>;

export const DelegateSchema = z.object({
  agent: z.string().optional(),
  task: z.string(),
  context: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});
export type Delegate = z.infer<typeof DelegateSchema>;

export const EndSchema = z.object({
  reason: EndReasonSchema,
  summary: z.string().optional(),
});
export type End = z.infer<typeof EndSchema>;

// ── Request Schemas ─────────────────────────────────────────────────

export const ProcessRequestSchema = z.object({
  session_id: z.string(),
  message: MessageSchema,
  identity: IdentitySchema,
  context: ContextSchema,
});
export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;

export const ResultPayloadSchema = z.object({
  type: ResultTypeSchema,
  tool_name: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  duration_ms: z.number().min(0).optional(),
  success: z.boolean(),
});
export type ResultPayload = z.infer<typeof ResultPayloadSchema>;

export const ResultRequestSchema = z.object({
  session_id: z.string(),
  decision_id: z.string(),
  result: ResultPayloadSchema,
});
export type ResultRequest = z.infer<typeof ResultRequestSchema>;

export const CancelRequestSchema = z.object({
  session_id: z.string(),
  reason: CancelReasonSchema,
});
export type CancelRequest = z.infer<typeof CancelRequestSchema>;

// ── Response Schemas ────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  version: z.string(),
  transport: z.string().default("rest"),
  protocol_version: z.string().optional(),
  uptime_seconds: z.number().min(0).optional(),
  active_sessions: z.number().min(0).optional(),
  capabilities: z.array(CapabilitySchema).optional(),
  degraded_reason: z.string().optional(),
  error: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ErrorDetailSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ErrorResponseSchema = z.object({
  error: ErrorDetailSchema,
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const SessionResponseSchema = z.object({
  session_id: z.string(),
  started_at: z.string(),
  last_active: z.string(),
  turn_count: z.number().default(0),
  status: SessionStatusSchema,
  current_decision: z.string().optional(),
  current_decision_type: DecisionTypeSchema.optional(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ── Decision (top-level) ────────────────────────────────────────────

export const DecisionSchema = z.object({
  decision: DecisionTypeSchema,
  decision_id: z
    .string()
    .uuid()
    .default(() => crypto.randomUUID()),
  tool_call: ToolCallSchema.optional(),
  llm_call: LLMCallSchema.optional(),
  text: TextResponseSchema.optional(),
  wait: WaitSchema.optional(),
  delegate: DelegateSchema.optional(),
  end: EndSchema.optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;
