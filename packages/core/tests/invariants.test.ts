/**
 * @fileoverview 纯类型/常量模块的少量不变量断言
 * （packages/core/src/common/constants.ts / types.ts）
 * provider.ts 为纯类型契约，无运行时导出，不在此覆盖。
 */
import { describe, expect, it } from "vitest";
import {
  CHROME_DEVTOOLS_PORT,
  DEFAULT_PROXY_PORT,
  DEFAULT_WEB_PORT,
  EXT_BROADCAST,
  EXT_MSG,
  MUTATING_TOOLS,
  OPENCODE_ENV,
  SSE_EVENT_TYPES,
  WIDGET_MSG,
  WIDGET_THEME_MODES,
} from "../src/common/constants";
import {
  ChromeMcpWarmupError,
  ChromeMcpWarmupErrorType,
  SERVICE_STARTUP_TASKS,
} from "../src/common/types";

describe("constants invariants", () => {
  it("EXT_MSG is a superset of EXT_BROADCAST with identical values", () => {
    for (const [key, value] of Object.entries(EXT_BROADCAST)) {
      expect(EXT_MSG[key as keyof typeof EXT_MSG]).toBe(value);
    }
  });

  it("EXT_BROADCAST values are distinct from one another", () => {
    const broadcastValues = Object.values(EXT_BROADCAST);
    expect(new Set(broadcastValues).size).toBe(broadcastValues.length);
  });

  it("WIDGET_MSG values are stable uppercase protocol tokens", () => {
    for (const value of Object.values(WIDGET_MSG)) {
      expect(value).toMatch(/^[A-Z_]+$/);
    }
    // 大多数以 AIPANEL_ 开头，个别历史值不带前缀，逐一钉住
    expect(WIDGET_MSG.READY).toBe("AIPANEL_READY");
    expect(WIDGET_MSG.MINIMIZE_STATE).toBe("MINIMIZE_STATE_CHANGE");
    expect(WIDGET_MSG.REVIEW_PANEL_TOGGLE).toBe("REVIEW_PANEL_TOGGLE");
    expect(WIDGET_MSG.SELECTOR_START).toBe("AIPANEL_SELECTOR_START");
  });

  it("WIDGET_THEME_MODES is exactly the supported modes", () => {
    expect(WIDGET_THEME_MODES).toEqual(["auto", "light", "dark"]);
  });

  it("MUTATING_TOOLS covers the file-writing tool names", () => {
    expect([...MUTATING_TOOLS].sort()).toEqual(["apply_patch", "edit", "write"]);
  });

  it("OPENCODE_ENV values are unique and prefixed with OPENCODE_", () => {
    const values = Object.values(OPENCODE_ENV);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(v.startsWith("OPENCODE_")).toBe(true);
    }
  });

  it("SSE_EVENT_TYPES values mirror their keys", () => {
    expect(Object.keys(SSE_EVENT_TYPES)).toHaveLength(5);
    for (const [key, value] of Object.entries(SSE_EVENT_TYPES)) {
      expect(value).toBe(key);
    }
  });

  it("network port defaults are pairwise distinct", () => {
    const ports = [DEFAULT_WEB_PORT, DEFAULT_PROXY_PORT, CHROME_DEVTOOLS_PORT];
    expect(new Set(ports).size).toBe(3);
  });
});

describe("types runtime invariants", () => {
  it("SERVICE_STARTUP_TASKS carries non-empty copy for every task", () => {
    for (const [key, label] of Object.entries(SERVICE_STARTUP_TASKS)) {
      expect(key.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
    }
    expect(SERVICE_STARTUP_TASKS.ready).toBe("准备完成");
    expect(SERVICE_STARTUP_TASKS.checking_provider).toBe("检查 Provider 环境");
  });

  it("ChromeMcpWarmupError carries type/message/details and is an Error", () => {
    const err = new ChromeMcpWarmupError(
      ChromeMcpWarmupErrorType.AI_TIMEOUT,
      "model timed out",
      "extra",
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ChromeMcpWarmupError");
    expect(err.type).toBe("AI_TIMEOUT");
    expect(err.type).toBe(ChromeMcpWarmupErrorType.AI_TIMEOUT);
    expect(err.message).toBe("model timed out");
    expect(err.details).toBe("extra");
  });

  it("ChromeMcpWarmupErrorType lists all known failure kinds", () => {
    expect(Object.values(ChromeMcpWarmupErrorType)).toEqual([
      "CHROME_NOT_CONNECTED",
      "AI_TIMEOUT",
      "AI_RESPONSE_ERROR",
      "SESSION_ERROR",
      "UNKNOWN",
    ]);
  });
});
