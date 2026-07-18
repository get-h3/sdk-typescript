/**
 * H3 Echo Harness — TypeScript example.
 * Echoes back the user's message content and reports the received decision ID on each result.
 * Matches the Go and Python echo harness patterns.
 *
 * Usage:
 *   npx tsx examples/echo/index.ts
 *   # then: h3-test --endpoint http://localhost:9193
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Harness, Decision, ProcessRequest, ResultRequest, HealthResponse } from "../../src/index.js";
import { createH3Router } from "../../src/index.js";

class EchoHarness implements Harness {
  private responseCount = 0;

  async onProcess(req: ProcessRequest): Promise<Decision> {
    const content = `Echo: ${req.message.content}`;
    return {
      decision: "text",
      decision_id: "echo-001",
      text: { content, finished: true },
    } as Decision;
  }

  async onResult(req: ResultRequest): Promise<Decision> {
    this.responseCount++;
    if (this.responseCount >= 2) {
      return {
        decision: "end",
        decision_id: "echo-end",
        end: { reason: "task_complete", summary: "Echo conversation complete" },
      } as Decision;
    }
    const content = `Result received: ${req.decision_id}`;
    return {
      decision: "text",
      decision_id: "echo-002",
      text: { content, finished: true },
    } as Decision;
  }

  health(): HealthResponse {
    return {
      status: "ok",
      version: "1.0.0",
      transport: "rest",
      protocol_version: "1.0",
      capabilities: ["text", "end"],
    };
  }
}

const app = new Hono();
app.route("/", createH3Router(new EchoHarness()));

const port = parseInt(process.env.PORT || "9193");
console.log(`Echo harness listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
