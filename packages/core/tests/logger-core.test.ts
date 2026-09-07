/**
 * @fileoverview logger-core 单测（packages/core/src/common/logger-core.ts）
 * 注意：模块内有模块级可变 globalConfig，各用例通过 configureLogger 重置。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LOG_PREFIX } from "../src/common/constants";
import {
  LEVEL_NAMES,
  LogLevel,
  type LogContext,
  type LoggerConfig,
  configureLogger,
  formatBytes,
  formatContext,
  formatDuration,
  formatLogMessage,
  formatValue,
  generateTraceId,
  getConfig,
  setVerbose,
} from "../src/common/logger-core";

const DEFAULTS: LoggerConfig = {
  verbose: false,
  level: LogLevel.INFO,
  showTimestamp: true,
  showCaller: true,
  showTrace: false,
  indent: "  ",
};

beforeEach(() => {
  configureLogger(DEFAULTS);
});

describe("LogLevel / LEVEL_NAMES", () => {
  it("declares levels in ascending severity order", () => {
    expect(LogLevel.DEBUG).toBe(0);
    expect(LogLevel.INFO).toBe(1);
    expect(LogLevel.WARN).toBe(2);
    expect(LogLevel.ERROR).toBe(3);
    expect(LogLevel.NONE).toBe(4);
  });

  it("maps every level value to a name (mapping completeness)", () => {
    expect(LEVEL_NAMES[LogLevel.DEBUG]).toBe("DEBUG");
    expect(LEVEL_NAMES[LogLevel.INFO]).toBe("INFO");
    expect(LEVEL_NAMES[LogLevel.WARN]).toBe("WARN");
    expect(LEVEL_NAMES[LogLevel.ERROR]).toBe("ERROR");
    expect(LEVEL_NAMES[LogLevel.NONE]).toBe("NONE");
    expect(Object.keys(LEVEL_NAMES)).toHaveLength(5);
  });
});

describe("getConfig / configureLogger / setVerbose", () => {
  it("returns the pristine defaults", () => {
    expect(getConfig()).toEqual(DEFAULTS);
  });

  it("merges partial options without dropping existing keys", () => {
    configureLogger({ level: LogLevel.WARN, showTimestamp: false });
    const cfg = getConfig();
    expect(cfg.level).toBe(LogLevel.WARN);
    expect(cfg.showTimestamp).toBe(false);
    expect(cfg.verbose).toBe(false);
    expect(cfg.showCaller).toBe(true);
    expect(cfg.indent).toBe("  ");
  });

  it("setVerbose(true) enables verbose and lowers level to DEBUG", () => {
    setVerbose(true);
    expect(getConfig().verbose).toBe(true);
    expect(getConfig().level).toBe(LogLevel.DEBUG);
  });

  it("setVerbose(false) restores level to INFO", () => {
    setVerbose(true);
    setVerbose(false);
    expect(getConfig().verbose).toBe(false);
    expect(getConfig().level).toBe(LogLevel.INFO);
  });
});

describe("formatValue", () => {
  it("formats primitives", () => {
    expect(formatValue(null)).toBe("null");
    expect(formatValue(undefined)).toBe("undefined");
    expect(formatValue(123)).toBe("123");
    expect(formatValue(true)).toBe("true");
    expect(formatValue("top")).toBe("top");
    expect(formatValue("nested", 1)).toBe('"nested"');
    expect(formatValue("deep", 2)).toBe('"deep"');
  });

  it("caps recursion depth", () => {
    expect(formatValue({ any: 1 }, 4)).toBe("...");
    expect(formatValue([1], 4)).toBe("...");
  });

  it("formats Error with name, message and stack", () => {
    const err = new Error("boom");
    const out = formatValue(err);
    expect(out.startsWith("Error: boom")).toBe(true);
    expect(out).toContain("\n    at ");
  });

  it("formats empty and small arrays", () => {
    expect(formatValue([])).toBe("[]");
    expect(formatValue([1, "a", true])).toBe('[1, "a", true]');
  });

  it("truncates large arrays with an item count", () => {
    expect(formatValue([1, 2, 3, 4, 5, 6, 7, 8])).toBe("[1, 2, 3, ... 5 more items]");
  });

  it("formats empty and small objects", () => {
    expect(formatValue({})).toBe("{}");
    expect(formatValue({ a: 1, b: "x" })).toBe('{a: 1, b: "x"}');
  });

  it("truncates large objects with a key count", () => {
    expect(formatValue({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })).toBe(
      "{a: 1, b: 2, c: 3, ... 3 more keys}",
    );
  });

  it("falls back to String() for exotic values", () => {
    expect(formatValue(Symbol("s"))).toBe("Symbol(s)");
  });
});

describe("formatContext", () => {
  it("returns empty string for absent or empty context", () => {
    expect(formatContext()).toBe("");
    expect(formatContext({})).toBe("");
  });

  it("formats known fields in canonical order", () => {
    const ctx: LogContext = {
      module: "m",
      operation: "op",
      traceId: "t1",
      duration: 3,
    };
    expect(formatContext(ctx)).toBe("[m] (op) trace:t1 3ms");
  });

  it("formats extra keys as a compact object and ignores error", () => {
    const ctx: LogContext = { module: "m", error: new Error("x"), custom: 1, flag: true };
    expect(formatContext(ctx)).toBe("[m] {custom: 1, flag: true}");
  });

  it("only logs nothing when the sole field is error", () => {
    expect(formatContext({ error: new Error("x") })).toBe("");
  });
});

describe("generateTraceId", () => {
  it("produces unique ids with a padded counter", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]{4}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(200);
  });
});

describe("formatBytes", () => {
  it("returns 0B for zero", () => {
    expect(formatBytes(0)).toBe("0B");
  });

  it("formats byte and binary-unit boundaries", () => {
    expect(formatBytes(1023)).toBe("1023B");
    expect(formatBytes(1024)).toBe("1KB");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2GB");
  });
});

describe("formatDuration", () => {
  it("keeps sub-second durations as raw ms", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats seconds with two decimals", () => {
    expect(formatDuration(1000)).toBe("1.00s");
    expect(formatDuration(1500)).toBe("1.50s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(61000)).toBe("1m 1s");
    expect(formatDuration(125000)).toBe("2m 5s");
    expect(formatDuration(3600000)).toBe("60m 0s");
  });
});

describe("formatLogMessage", () => {
  it("prepends the timestamp when enabled", () => {
    configureLogger({ showTimestamp: true });
    expect(formatLogMessage(LogLevel.INFO, "hello")).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} /);
  });

  it("omits the timestamp when disabled", () => {
    configureLogger({ showTimestamp: false });
    expect(formatLogMessage(LogLevel.INFO, "hello")).not.toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it("includes padded level name and plugin prefix", () => {
    configureLogger({ showTimestamp: false });
    const out = formatLogMessage(LogLevel.INFO, "hello");
    expect(out.startsWith("INFO  ")).toBe(true);
    expect(out).toContain(LOG_PREFIX);
    expect(out).toContain("hello");
  });

  it("joins context and formatted args after the message", () => {
    configureLogger({ showTimestamp: false });
    const ctx: LogContext = { module: "svc", operation: "start", traceId: "t", duration: 2 };
    const out = formatLogMessage(LogLevel.WARN, "slow", ctx, 42, { k: "v" });
    expect(out).toContain("[svc] (start) trace:t 2ms");
    expect(out).toContain("slow");
    expect(out).toContain('42 {k: "v"}');
  });

  it("maps every level name through LEVEL_NAMES", () => {
    configureLogger({ showTimestamp: false });
    for (const level of [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]) {
      const out = formatLogMessage(level, "m");
      expect(out.startsWith(LEVEL_NAMES[level].padEnd(5))).toBe(true);
    }
  });
});
