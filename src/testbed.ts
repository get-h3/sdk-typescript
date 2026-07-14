/**
 * H3 Testbed — MockHermes for testing harnesses without a running Hermes Core.
 *
 * Usage:
 *   import { MockHermes } from "@get-h3/h3-harness-sdk";
 *
 *   const mock = new MockHermes(myHarness);
 *   const decision = await mock.sendMessage("Hello!");
 *   assert(decision.decision === "text");
 */

import type { Harness } from "./harness.js";
import type {
  CancelReason,
  Decision,
  Identity,
  ProcessRequest,
  ResultPayload,
  ResultRequest,
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

export class MockHermes {
  readonly harness: Harness;

  constructor(harness: Harness) {
    this.harness = harness;
  }

  /**
   * Send a user message to the harness → return its Decision.
   */
  async sendMessage(content: string, sessionId?: string): Promise<Decision> {
    const req: ProcessRequest = {
      session_id: sessionId ?? crypto.randomUUID(),
      message: {
        role: "user",
        content,
        timestamp: nowIso(),
      },
      identity: defaultIdentity(),
      context: defaultContext(),
    };
    return this.harness.onProcess(req);
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
    const req: ResultRequest = {
      session_id: sessionId ?? crypto.randomUUID(),
      decision_id: decisionId ?? crypto.randomUUID(),
      result,
    };
    return this.harness.onResult(req);
  }

  /**
   * Send a cancel request → return whether the harness confirmed.
   */
  async cancel(
    sessionId?: string,
    reason?: CancelReason,
  ): Promise<boolean> {
    if (!this.harness.onCancel) {
      return true;
    }
    return this.harness.onCancel({
      session_id: sessionId ?? crypto.randomUUID(),
      reason: reason ?? "user_interrupt",
    });
  }
}
