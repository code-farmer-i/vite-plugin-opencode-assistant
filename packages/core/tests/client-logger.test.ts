// @vitest-environment jsdom
/**
 * @fileoverview 浏览器端 logger 单测（packages/core/src/client/logger.ts，jsdom）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_PREFIX } from "../src/common/constants";
import { LogLevel, configureLogger } from "../src/common/logger-core";
import { createLogger, logger } from "../src/client/logger";

function silenceConsole(): void {
  for (const method of ["log", "info", "warn", "error", "debug", "group", "groupEnd"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
}

function consoleSpy(method: "log" | "info" | "warn" | "error" | "debug") {
  const spy = vi.mocked(console[method]);
  return spy;
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
  configureLogger({ level: LogLevel.INFO });
});

describe("client logger routing", () => {
  it("suppresses messages below the configured level", () => {
    logger.debug("hidden");
    expect(consoleSpy("debug")).not.toHaveBeenCalled();
    expect(consoleSpy("log")).not.toHaveBeenCalled();
  });

  it("logs INFO via console.log with prefix/level/message", () => {
    logger.info("hello world", { module: "widget" });
    const spy = consoleSpy("log");
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain(LOG_PREFIX);
    expect(output).toContain("INFO");
    expect(output).toContain("[widget]");
    expect(output).toContain("hello world");
    // 浏览器端使用 %c 分段样式
    expect(output).toContain("%c");
  });

  it("routes DEBUG to console.debug when level allows", () => {
    configureLogger({ level: LogLevel.DEBUG });
    logger.debug("dbg");
    expect(consoleSpy("debug")).toHaveBeenCalledTimes(1);
    expect(consoleSpy("debug").mock.calls[0][0] as string).toContain("dbg");
  });

  it("routes WARN to console.warn", () => {
    logger.warn("careful");
    expect(consoleSpy("warn")).toHaveBeenCalledTimes(1);
    expect(consoleSpy("warn").mock.calls[0][0] as string).toContain("careful");
  });

  it("routes ERROR to console.error", () => {
    logger.error("bad thing");
    expect(consoleSpy("error")).toHaveBeenCalledTimes(1);
    expect(consoleSpy("error").mock.calls[0][0] as string).toContain("bad thing");
  });

  it("omits the timestamp segment when disabled", () => {
    configureLogger({ showTimestamp: false });
    logger.info("no time");
    const output = consoleSpy("log").mock.calls[0][0] as string;
    expect(output.startsWith("%c%s")).toBe(false);
  });
});

describe("client logger error handling", () => {
  it("renders an Error context message with red styling", () => {
    logger.error("failed", { error: new Error("boom") });
    const spy = consoleSpy("error");
    expect(spy).toHaveBeenCalled();
    const joined = spy.mock.calls.flat().join(" ");
    expect(joined).toContain("Error: boom");
  });

  it("appends the full stack when showTrace is enabled at ERROR level", () => {
    configureLogger({ showTrace: true });
    const err = new Error("with-stack");
    logger.error("failed", { error: err });
    const joined = consoleSpy("error").mock.calls.flat().join("\n");
    expect(joined).toContain(err.stack ?? "");
  });

  it("serializes a non-Error context error", () => {
    logger.error("failed", { error: "string-issue" });
    const joined = consoleSpy("error").mock.calls.flat().join(" ");
    expect(joined).toContain("Error: string-issue");
  });
});

describe("client logger group helpers", () => {
  it("only emits group markers in verbose mode", () => {
    logger.group("phase1");
    expect(console.group).not.toHaveBeenCalled();
    logger.groupEnd();
    expect(console.groupEnd).not.toHaveBeenCalled();

    configureLogger({ verbose: true });
    logger.group("phase1", { module: "x" });
    expect(console.group).toHaveBeenCalledTimes(1);
    logger.groupEnd();
    expect(console.groupEnd).toHaveBeenCalledTimes(1);
  });
});

describe("createLogger module injection", () => {
  it("injects the module into the context of every call", () => {
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");
    const errSpy = vi.spyOn(logger, "error");
    const debugSpy = vi.spyOn(logger, "debug");

    const mod = createLogger("my-module");
    mod.info("hi", { operation: "op" });
    mod.warn("careful", { traceId: "t1" });
    mod.error("bad", { error: new Error("x") });
    mod.debug("dbg");

    expect(infoSpy).toHaveBeenCalledWith("hi", { operation: "op", module: "my-module" });
    expect(warnSpy).toHaveBeenCalledWith("careful", { traceId: "t1", module: "my-module" });
    expect(errSpy).toHaveBeenCalledWith("bad", { error: expect.any(Error), module: "my-module" });
    expect(debugSpy).toHaveBeenCalledWith("dbg", { module: "my-module" });
  });
});
