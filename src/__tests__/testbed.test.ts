import { describe, it, expect } from "vitest";
import { MockHermes } from "../testbed.js";
import type { Harness } from "../harness.js";
import { SessionResponseSchema } from "../protocol.js";
import type {
  Decision,
  ProcessRequest,
  ResultRequest,
  CancelRequest,
  HealthResponse,
} from "../protocol.js";

function makeHarness(
  overrides?: Partial<{
    onProcess: (req: ProcessRequest) => Promise<Decision>;
    onResult: (req: ResultRequest) => Promise<Decision>;
    onCancel: (req: CancelRequest) => Promise<boolean>;
  }>,
): Harness {
  return {
    health(): HealthResponse {
      return { status: "ok", version: "1.0.0", transport: "rest" };
    },
    async onProcess(req: ProcessRequest): Promise<Decision> {
      return (
        overrides?.onProcess?.(req) ?? {
          decision: "text",
          decision_id: crypto.randomUUID(),
          text: { content: `Echo: ${req.message.content}`, finished: true },
        }
      );
    },
    async onResult(req: ResultRequest): Promise<Decision> {
      return (
        overrides?.onResult?.(req) ?? {
          decision: "end",
          decision_id: crypto.randomUUID(),
          end: { reason: "task_complete" },
        }
      );
    },
    async onCancel(req: CancelRequest): Promise<boolean> {
      return overrides?.onCancel?.(req) ?? false;
    },
  };
}

describe("MockHermes", () => {
  describe("constructor", () => {
    it("stores the harness reference", () => {
      const h = makeHarness();
      const mock = new MockHermes(h);
      expect(mock.harness).toBe(h);
    });
  });

  describe("sendMessage", () => {
    it("sends a message and returns a decision", async () => {
      const mock = new MockHermes(makeHarness());
      const decision = await mock.sendMessage("Hello");

      expect(decision.decision).toBe("text");
      expect(decision.text).toBeDefined();
      expect(decision.text!.content).toContain("Hello");
    });

    it("accepts a custom sessionId", async () => {
      let capturedSessionId = "";
      const mock = new MockHermes(
        makeHarness({
          onProcess: async (req) => {
            capturedSessionId = req.session_id;
            return {
              decision: "text",
              decision_id: crypto.randomUUID(),
              text: { content: "ok", finished: true },
            };
          },
        }),
      );
      await mock.sendMessage("test", "my-custom-session");
      expect(capturedSessionId).toBe("my-custom-session");
    });
  });

  describe("sendResult", () => {
    it("sends a result and returns the next decision", async () => {
      const mock = new MockHermes(makeHarness());
      const decision = await mock.sendResult({
        type: "tool_result",
        tool_name: "search",
        data: { found: true },
        success: true,
      });

      expect(decision.decision).toBe("end");
      expect(decision.end?.reason).toBe("task_complete");
    });

    it("accepts custom sessionId and decisionId", async () => {
      let capturedSessionId = "";
      let capturedDecisionId = "";
      const mock = new MockHermes(
        makeHarness({
          onResult: async (req) => {
            capturedSessionId = req.session_id;
            capturedDecisionId = req.decision_id;
            return {
              decision: "end",
              decision_id: crypto.randomUUID(),
              end: { reason: "task_complete" },
            };
          },
        }),
      );

      await mock.sendResult(
        { type: "tool_result", success: true },
        "my-session",
        "my-decision",
      );
      expect(capturedSessionId).toBe("my-session");
      expect(capturedDecisionId).toBe("my-decision");
    });
  });

  describe("cancel", () => {
    it("returns false when onCancel is not defined", async () => {
      const mock = new MockHermes(
        makeHarness({ onCancel: undefined as never }),
      );
      const result = await mock.cancel("ses-1", "user_interrupt");
      expect(result).toBe(false);
    });

    it("calls onCancel when defined", async () => {
      let capturedReason = "";
      const mock = new MockHermes(
        makeHarness({
          onCancel: async (req) => {
            capturedReason = req.reason;
            return true;
          },
        }),
      );
      const result = await mock.cancel("ses-1", "timeout");
      expect(result).toBe(true);
      expect(capturedReason).toBe("timeout");
    });

    it("falls back to user_interrupt reason when not provided", async () => {
      let capturedReason = "";
      const mock = new MockHermes(
        makeHarness({
          onCancel: async (req) => {
            capturedReason = req.reason;
            return true;
          },
        }),
      );
      await mock.cancel("ses-1");
      expect(capturedReason).toBe("user_interrupt");
    });
  });

  describe("session accessor", () => {
    it("returns undefined for an unknown session id", () => {
      const mock = new MockHermes(makeHarness());
      expect(mock.session("never-seen")).toBeUndefined();
    });

    it("counts a sendMessage then a sendResult on one session as two turns", async () => {
      const mock = new MockHermes(
        makeHarness({
          onResult: async () => ({
            decision: "text",
            decision_id: crypto.randomUUID(),
            text: { content: "still going", finished: false },
          }),
        }),
      );

      await mock.sendMessage("Hello", "ses-count");
      const afterMessage = mock.session("ses-count");
      expect(afterMessage?.turn_count).toBe(1);
      expect(afterMessage?.status).toBe("active");
      expect(afterMessage?.current_decision_type).toBe("text");

      await mock.sendResult(
        { type: "tool_result", success: true },
        "ses-count",
      );
      const afterResult = mock.session("ses-count");
      expect(afterResult?.turn_count).toBe(2);
      expect(afterResult?.status).toBe("active");
      expect(afterResult?.current_decision_type).toBe("text");
    });

    it("marks the session completed when a decision ends the turn", async () => {
      const mock = new MockHermes(makeHarness());

      await mock.sendMessage("Hi", "ses-end");
      expect(mock.session("ses-end")?.status).toBe("active");

      await mock.sendResult({ type: "tool_result", success: true }, "ses-end");
      const session = mock.session("ses-end");
      expect(session?.status).toBe("completed");
      expect(session?.turn_count).toBe(2);
      expect(session?.current_decision_type).toBe("end");
    });

    it("keeps a cancelled session terminal — later calls do not advance it", async () => {
      const mock = new MockHermes(makeHarness({ onCancel: async () => true }));

      await mock.sendMessage("Hello", "ses-cancel");
      const confirmed = await mock.cancel("ses-cancel", "user_interrupt");
      expect(confirmed).toBe(true);

      const cancelled = mock.session("ses-cancel");
      expect(cancelled?.status).toBe("cancelled");
      expect(cancelled?.turn_count).toBe(1);

      await mock.sendMessage("More", "ses-cancel");
      await mock.sendResult(
        { type: "tool_result", success: true },
        "ses-cancel",
      );

      const after = mock.session("ses-cancel");
      expect(after?.status).toBe("cancelled");
      expect(after?.turn_count).toBe(1);
      expect(after?.current_decision_type).toBe("text");
    });

    it("keeps two session ids independent", async () => {
      const mock = new MockHermes(makeHarness());

      await mock.sendMessage("one", "ses-a");
      await mock.sendMessage("two", "ses-a");
      await mock.sendMessage("three", "ses-b");

      const a = mock.session("ses-a");
      const b = mock.session("ses-b");
      expect(a?.session_id).toBe("ses-a");
      expect(b?.session_id).toBe("ses-b");
      expect(a?.turn_count).toBe(2);
      expect(b?.turn_count).toBe(1);
      expect(a?.current_decision).not.toBe(b?.current_decision);
    });

    it("returns the HTTP session view shape", async () => {
      const mock = new MockHermes(makeHarness());

      await mock.sendMessage("Hi", "ses-shape");
      const session = mock.session("ses-shape");

      expect(session).toBeDefined();
      expect(Object.keys(session!).sort()).toEqual([
        "current_decision",
        "current_decision_type",
        "last_active",
        "session_id",
        "started_at",
        "status",
        "turn_count",
      ]);
      expect(typeof session!.started_at).toBe("string");
      expect(typeof session!.last_active).toBe("string");
      // The accessor's payload is the router's GET /v1/sessions/:id body, so it
      // parses against the protocol's own session schema.
      expect(SessionResponseSchema.safeParse(session).success).toBe(true);
    });

    it("returns a snapshot — mutating it does not change tracked state", async () => {
      const mock = new MockHermes(makeHarness());

      await mock.sendMessage("Hi", "ses-snapshot");
      const session = mock.session("ses-snapshot")!;
      session.turn_count = 99;
      session.status = "cancelled";

      expect(mock.session("ses-snapshot")?.turn_count).toBe(1);
      expect(mock.session("ses-snapshot")?.status).toBe("active");
    });

    it("does not create a session for a sendResult on an unknown id (router parity)", async () => {
      const mock = new MockHermes(makeHarness());

      const decision = await mock.sendResult(
        { type: "tool_result", success: true },
        "ses-unknown",
      );

      expect(decision.decision).toBe("end");
      expect(mock.session("ses-unknown")).toBeUndefined();
    });

    it("still counts turns on a completed session (only cancel is terminal)", async () => {
      const mock = new MockHermes(
        makeHarness({
          onProcess: async () => ({
            decision: "text",
            decision_id: crypto.randomUUID(),
            text: { content: "after the end", finished: true },
          }),
        }),
      );

      await mock.sendMessage("Hi", "ses-after-end");
      await mock.sendResult(
        { type: "tool_result", success: true },
        "ses-after-end",
      );
      expect(mock.session("ses-after-end")?.status).toBe("completed");

      await mock.sendMessage("Again", "ses-after-end");
      const session = mock.session("ses-after-end");
      expect(session?.status).toBe("completed");
      expect(session?.turn_count).toBe(3);
    });
  });
});
