/**
 * Minimal H3 Harness Example — bare minimum implementation.
 *
 * Run:
 *   npx tsx src/examples/minimal.ts
 */

import { Hono } from "hono";

import { createH3Router } from "../harness.js";
import type { Harness } from "../harness.js";
import type {
  Decision,
  HealthResponse,
  ProcessRequest,
  ResultRequest,
} from "../protocol.js";

class MinimalHarness implements Harness {
  async onProcess(_req: ProcessRequest): Promise<Decision> {
    return {
      decision: "text",
      decision_id: crypto.randomUUID(),
      history: [],
      text: { content: "Hello from TypeScript!", finished: true },
    };
  }

  async onResult(_req: ResultRequest): Promise<Decision> {
    return {
      decision: "end",
      decision_id: crypto.randomUUID(),
      history: [],
      end: { reason: "task_complete" },
    };
  }

  health(): HealthResponse {
    return {
      status: "ok",
      version: "0.1.0",
      transport: "rest",
      protocol_version: "1.0",
      capabilities: ["text", "end"],
    };
  }
}

const app = new Hono();
app.route("/", createH3Router(new MinimalHarness()));

export default app;
