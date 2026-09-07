/**
 * @fileoverview Node 端 logger 单测（packages/core/src/node/node-logger.ts，node 环境）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_PREFIX } from "../src/common/constants";
import { LogLevel, configureLogger } from "../src/common/logger-core";
import {
  RequestContext,
  createNodeLogger,
  logMethod,
  logger,
  nodeLogger,
  PerformanceTimer,
} from "../src/node/node-logger";

function silenceConsole(): void {
  for (const method of ["log", "warn", "error", "debug", "group", "groupEnd"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
}

beforeEach(() => {
  configureLogger({
    verbose: false,
    level: LogLevel.INFO,
    showTimestamp: true,
    showCaller: true,
    showTrace: false,
    indent: "  ",
  });
  silenceConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("node logger routing & gating", () => {
  it("uses the alias export and routes INFO to console.log with prefix", () => {
    expect(logger).toBe(nodeLogger);
    logger.info("node hello", { module: "svc" });
    const spy = vi.mocked(console.log);
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain(LOG_PREFIX);
    expect(output).toContain("INFO");
    expect(output).toContain("[svc]");
    expect(output).toContain("node hello");
  });

  it("suppresses DEBUG below the configured INFO level", () => {
    logger.debug("hidden");
    expect(vi.mocked(console.log)).not.toHaveBeenCalled();
  });

  it("emits DEBUG when verbose config lowers the level", () => {
    configureLogger({ level: LogLevel.DEBUG, verbose: true });
    logger.debug("visible");
    expect(vi.mocked(console.log)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.log).mock.calls[0][0] as string).toContain("visible");
  });

  it("routes WARN and ERROR to their console methods", () => {
    logger.warn("w1");
    logger.error("e1");
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain("w1");
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain("e1");
  });

  it("includes the formatted args after the message", () => {
    configureLogger({ level: LogLevel.DEBUG });
    logger.debug("args", { module: "m" }, 1, { k: "v" });
    expect(vi.mocked(console.log).mock.calls[0][0]).toContain('args 1 {k: "v"}');
  });

  it("renders Error context and optional stack trace", () => {
    configureLogger({ level: LogLevel.DEBUG, showTrace: false });
    logger.error("failed", { error: new Error("boom") });
    const errOut = vi.mocked(console.error).mock.calls[0][0] as string;
    expect(errOut).toContain("Error: boom");
  });

  it("appends the stack via a second console.error when showTrace is on", () => {
    configureLogger({ level: LogLevel.ERROR, showTrace: true });
    const err = new Error("stacky");
    logger.error("failed", { error: err });
    const spy = vi.mocked(console.error);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const joined = spy.mock.calls.flat().join("\n");
    expect(joined).toContain("stacky");
  });

  it("annotates warn/error lines with caller info", () => {
    logger.warn("who-calls");
    const output = vi.mocked(console.warn).mock.calls[0][0] as string;
    expect(output).toMatch(/\(node-logger\.test\.ts:\d+[^)]*\)/);
  });

  it("emits group markers only in verbose mode", () => {
    nodeLogger.group("phase");
    expect(console.log).not.toHaveBeenCalled();
    configureLogger({ verbose: true, level: LogLevel.DEBUG });
    nodeLogger.group("phase", { module: "m" });
    expect(vi.mocked(console.log)).toHaveBeenCalled();
    expect(vi.mocked(console.log).mock.calls[0][0]).toContain("phase");
  });
});

describe("createNodeLogger", () => {
  it("injects the module into context of each call", () => {
    const infoSpy = vi.spyOn(nodeLogger, "info");
    const errSpy = vi.spyOn(nodeLogger, "error");
    const mod = createNodeLogger("core");
    mod.info("hi", { operation: "start" });
    mod.error("bad", { error: new Error("x") });
    expect(infoSpy).toHaveBeenCalledWith("hi", { operation: "start", module: "core" });
    expect(errSpy).toHaveBeenCalledWith("bad", { error: expect.any(Error), module: "core" });
  });

  it("exposes a timer factory that returns PerformanceTimer", () => {
    const mod = createNodeLogger("core");
    const timer = mod.timer("op", { traceId: "t" });
    expect(timer).toBeInstanceOf(PerformanceTimer);
  });
});

describe("PerformanceTimer", () => {
  it("reports a duration number on end and logs start/end", () => {
    configureLogger({ level: LogLevel.DEBUG });
    const timer = new PerformanceTimer("build");
    const duration = timer.end("done");
    expect(typeof duration).toBe("number");
    expect(duration).toBeGreaterThanOrEqual(0);
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(logCalls.length).toBeGreaterThanOrEqual(2);
    expect(logCalls[0][0]).toContain("Starting: build");
  });

  it("checkpoint returns elapsed duration", () => {
    const timer = new PerformanceTimer("op");
    expect(typeof timer.checkpoint("step")).toBe("number");
  });
});

describe("RequestContext", () => {
  it("generates a trace id and logs lifecycle in non-quiet mode", () => {
    configureLogger({ level: LogLevel.DEBUG });
    const ctx = new RequestContext("GET", "/api/session");
    expect(ctx.traceId).toMatch(/^[0-9a-z]+-[0-9a-z]{4}$/);
    ctx.checkpoint("lookup");
    ctx.end(200);
    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((m) => m.includes("GET /api/session"))).toBe(true);
    expect(logCalls.some((m) => m.includes("←") && m.includes("200"))).toBe(true);
  });

  it("stays silent in quiet mode (except error reports)", () => {
    configureLogger({ level: LogLevel.DEBUG });
    const ctx = new RequestContext("POST", "/api/x", { quiet: true });
    ctx.checkpoint("step");
    ctx.end(500);
    expect(vi.mocked(console.log)).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    // 注意：error() 不受 quiet 影响，仍会上报
    ctx.error(new Error("gone"));
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0] as string).toContain("gone");
  });
});

describe("logMethod decorator", () => {
  it("wraps an async method and forwards the result", async () => {
    const target = { constructor: { name: "Klass" } };
    const descriptor = {
      value: async function (x: number): Promise<number> {
        return x * 2;
      },
    } as PropertyDescriptor;
    const wrapped = logMethod(target, "double", descriptor);
    await expect(wrapped.value.call(target, 21)).resolves.toBe(42);
  });

  it("re-throws the original error from the wrapped method", async () => {
    const target = { constructor: { name: "Klass" } };
    const boom = new Error("inner");
    const descriptor = {
      value: async function (): Promise<never> {
        throw boom;
      },
    } as PropertyDescriptor;
    const wrapped = logMethod(target, "explode", descriptor);
    await expect(wrapped.value.call(target)).rejects.toBe(boom);
  });
});
