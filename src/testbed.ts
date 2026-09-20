/**
 * H3 Testbed — MockHermes for testing harnesses without a running Hermes Core.
 *
 * Usage:
 *   import { MockHermes } from "@get-h3/h3-harness-sdk";
 *
 *   const mock = new MockHermes(myHarness);
 *   const decision = await mock.sendMessage("Hello!");
 *   assert(decision.decision === "text");
 *   assert(mock.session("session-id")?.turn_count === 1);
 */

import type { Harness } from "./harness.js";
import type {
  CancelReason,
  Decision,
  DecisionType,
  Identity,
  ProcessRequest,
  ResultPayload,
  ResultRequest,
  SessionResponse,
} from "./protocol.js";

function nowIso(): string {
  return new Date().toISOString();
}

function defaultIdentity(): Identity {
  return {
    platform: "test",
    chat_id: "test",
    user_name: "test",
    user_id: "test-user",
  };
}

function defaultConfig() {
  return {
    max_iterations: 10,
    timeout_seconds: 300,
  };
}

function defaultSessionState() {
  return {
    turn_count: 0,
    total_tool_calls: 0,
    total_llm_calls: 0,
    cost_so_far: 0,
    started_at: nowIso(),
  };
}

function defaultContext() {
  return {
    history: [],
    tools: [],
    models: [],
    config: defaultConfig(),
    session_state: defaultSessionState(),
  };
}

/**
 * The per-session state MockHermes tracks, shaped like the router's session
 * record (src/harness.ts) and the HTTP session view returned by
 * `GET /v1/sessions/:session_id`. It narrows `SessionResponse` to the
 * lifecycle vocabulary the router actually writes — "active" | "completed" |
 * "cancelled" — and makes the decision fields non-optional, because the mock
 * (like the router) only creates a record when it has a decision to store.
 */
export interface MockSessionState extends SessionResponse {
  status: "active" | "completed" | "cancelled";
  current_decision: string;
  current_decision_type: DecisionType;
}

export class MockHermes {
  readonly harness: Harness;

  // Per-session state, keyed by session_id, with the router's lifecycle rules
  // (src/harness.ts:112-134, 205-212): the first sendMessage for an id creates
  // the record at turn_count 1, later sends on that id increment turn_count and
  // refresh last_active, an `end` decision completes the session, and a
  // cancelled session is terminal.
  private readonly sessions = new Map<string, MockSessionState>();

  constructor(harness: Harness) {
    this.harness = harness;
  }

  /**
   * Apply one returned decision to the tracked session — the mock's copy of the
   * router's recordSession() and its /v1/result recording.
   *
   * `create` is false for result round-trips: the router never auto-vivifies a
   * session on /v1/result (it answers 404 SESSION_NOT_FOUND first, GAP-051), so
   * a result for an id the mock has never seen is returned to the caller but
   * records no state.
   */
  private recordDecision(
    sessionId: string,
    decision: Pick<Decision, "decision" | "decision_id">,
    create: boolean,
  ): void {
    const now = nowIso();
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      if (!create) return;
      this.sessions.set(sessionId, {
        session_id: sessionId,
        started_at: now,
        last_active: now,
        turn_count: 1,
        status: decision.decision === "end" ? "completed" : "active",
        current_decision: decision.decision_id,
        current_decision_type: decision.decision,
      });
      return;
    }
    // Router parity: cancelled is terminal — late process/result calls never
    // rewrite the lifecycle state of a cancelled session
    // (src/harness.ts:118, :206).
    if (existing.status === "cancelled") return;
    existing.turn_count += 1;
    existing.last_active = now;
    existing.current_decision = decision.decision_id;
    existing.current_decision_type = decision.decision;
    // An end decision transitions the session to "completed"
    // (src/harness.ts:123, :211).
    if (decision.decision === "end") existing.status = "completed";
  }

  /**
   * Per-session accessor — mirrors the router's HTTP session view,
   * `GET /v1/sessions/:session_id` (src/harness.ts:260-284): the same field
   * names (session_id, started_at, last_active, turn_count, status,
   * current_decision, current_decision_type) and the same lifecycle vocabulary,
   * so a harness unit test can read turn counts and session status without
   * tracking ids and counts by hand.
   *
   * Returns `undefined` for an unknown session id — the accessor's counterpart
   * of that route's 404 SESSION_NOT_FOUND. The returned object is a snapshot:
   * mutating it does not affect the state MockHermes keeps tracking.
   */
  session(sessionId: string): MockSessionState | undefined {
    const record = this.sessions.get(sessionId);
    return record ? { ...record } : undefined;
  }

  /**
   * Send a user message to the harness → return its Decision.
   */
  async sendMessage(content: string, sessionId?: string): Promise<Decision> {
    const id = sessionId ?? crypto.randomUUID();
    const req: ProcessRequest = {
      session_id: id,
      message: {
        role: "user",
        content,
        timestamp: nowIso(),
      },
      identity: defaultIdentity(),
      context: defaultContext(),
    };
    const decision = await this.harness.onProcess(req);
    this.recordDecision(id, decision, true);
    return decision;
  }

  /**
   * Send a result back to the harness → return its next Decision.
   * If decisionId is not provided, a UUID is auto-generated.
   */
  async sendResult(
    result: ResultPayload,
    sessionId?: string,
    decisionId?: string,
  ): Promise<Decision> {
    const id = sessionId ?? crypto.randomUUID();
    const req: ResultRequest = {
      session_id: id,
      decision_id: decisionId ?? crypto.randomUUID(),
      result,
    };
    const decision = await this.harness.onResult(req);
    // Router parity (GAP-051): /v1/result never auto-vivifies a session — an
    // unknown id records nothing. The mock still calls the harness for
    // backward compatibility; it just does not invent session state for an id
    // it has never seen.
    this.recordDecision(id, decision, false);
    return decision;
  }

  /**
   * Send a cancel request → return whether the harness confirmed.
   */
  async cancel(sessionId?: string, reason?: CancelReason): Promise<boolean> {
    const id = sessionId ?? crypto.randomUUID();
    // Router parity: a successful cancel marks the session cancelled and a
    // cancelled session is terminal (src/harness.ts:239-257). An unknown id has
    // no record to mark — the HTTP route 404s it before calling onCancel.
    const existing = this.sessions.get(id);
    if (!this.harness.onCancel) {
      if (existing) existing.status = "cancelled";
      return true;
    }
    const cancelled = await this.harness.onCancel({
      session_id: id,
      reason: reason ?? "user_interrupt",
    });
    if (existing) existing.status = "cancelled";
    return cancelled;
  }
}
