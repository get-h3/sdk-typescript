import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { addMiddleware, requestLogger } from "../middleware.js";

describe("requestLogger", () => {
  it("logs successful requests with method, path, status, and duration", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = new Hono();

    app.use("*", requestLogger);
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");

    expect(consoleInfo).toHaveBeenCalled();
    const logMsg = consoleInfo.mock.calls[0]?.[0] as string;
    expect(logMsg).toContain("GET");
    expect(logMsg).toContain("/test");
    expect(logMsg).toContain("200");
    expect(logMsg).toMatch(/\d+ms/);

    consoleInfo.mockRestore();
  });

  it("returns 500 error response on exception", async () => {
    const app = new Hono();

    app.use("*", requestLogger);
    app.get("/crash", () => {
      throw new Error("BOOM");
    });

    const res = await app.request("/crash");
    expect(res.status).toBe(500);

    const text = await res.text();
    // Hono catches the error and may return text or JSON depending on middleware chain
    // The important thing is the 500 status
    expect(res.status).toBe(500);
    expect(text).toBeTruthy();
  });
});

describe("addMiddleware", () => {
  it("attaches requestLogger to the app", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = new Hono();

    addMiddleware(app);
    app.get("/hello", (c) => c.text("world"));

    const res = await app.request("/hello");
    expect(res.status).toBe(200);
    expect(consoleInfo).toHaveBeenCalled();

    consoleInfo.mockRestore();
  });
});
