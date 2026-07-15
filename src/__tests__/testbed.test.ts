import { describe, it, expect } from "vitest";
import { MockHermes } from "../testbed.js";
import type { Harness } from "../harness.js";
import type { Decision, ProcessRequest, ResultRequest, CancelRequest, HealthResponse } from "../protocol.js";

function makeHarness(overrides?: Partial<{
  onProcess: (req: ProcessRequest) => Promise<Decision>;
  onResult: (req: ResultRequest) => Promise<Decision>;
  onCancel: (req: CancelRequest) => Promise<boolean>;
}>): Harness {
  return {
    health(): HealthResponse {
      return { status: "ok", version: "1.0.0", transport: "rest" };
    },
    async onProcess(req: ProcessRequest): Promise<Decision> {
      return overrides?.onProcess?.(req) ?? {
        decision: "text",
        decision_id: crypto.randomUUID(),
        text: { content: `Echo: ${req.message.content}`, finished: true },
      };
    },
    async onResult(req: ResultRequest): Promise<Decision> {
      return overrides?.onResult?.(req) ?? {
        decision: "end",
        decision_id: crypto.randomUUID(),
        end: { reason: "task_complete" },
      };
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
      const mock = new MockHermes(makeHarness({ onCancel: undefined as never }));
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
});
