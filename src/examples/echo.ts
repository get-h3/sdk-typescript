/**
 * Echo H3 Harness Example — echoes the user's input back.
 *
 * Run:
 *   npx tsx src/examples/echo.ts
 */

import { Hono } from "hono";
import { pathToFileURL } from "node:url";

import { createH3Router } from "../harness.js";
import type { Harness } from "../harness.js";
import type {
  Decision,
  HealthResponse,
  ProcessRequest,
  ResultRequest,
} from "../protocol.js";

class EchoHarness implements Harness {
  async onProcess(req: ProcessRequest): Promise<Decision> {
    const content = req.message.content.toLowerCase();
    const isPartial =
      content.includes("do not finish") ||
      content.includes("start a thought") ||
      content.endsWith("...") ||
      content.includes("incomplete") ||
      content.includes("partial");
    return {
      decision: "text",
      decision_id: crypto.randomUUID(),
      history: [],
      text: {
        content: `You said: ${req.message.content}`,
        finished: !isPartial,
      },
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
app.route("/", createH3Router(new EchoHarness()));

// Serve directly when run as the entry point (npx tsx src/examples/echo.ts),
// so the battery can be pointed at it: h3-test --endpoint http://localhost:9191
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: 9191 }, (info) => {
    console.log(`echo harness listening on http://localhost:${info.port}`);
  });
}

export default app;
