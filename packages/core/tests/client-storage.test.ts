// @vitest-environment jsdom
/**
 * @fileoverview 浏览器存储辅助单测（packages/core/src/client/storage.ts，jsdom）
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { storageGet, storageRemove, storageSet } from "../src/client/storage";

// 保存原始 descriptor 以便被拒后恢复
const localDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const sessionDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");

afterEach(() => {
  vi.unstubAllGlobals();
  if (localDescriptor) Object.defineProperty(window, "localStorage", localDescriptor);
  if (sessionDescriptor) Object.defineProperty(window, "sessionStorage", sessionDescriptor);
  window.localStorage?.clear();
  window.sessionStorage?.clear();
});

describe("storageGet / storageSet round trip", () => {
  it("persists JSON values in localStorage", () => {
    storageSet("local", "user", { name: "ai", roles: [1, 2] });
    expect(storageGet("local", "user")).toEqual({ name: "ai", roles: [1, 2] });
  });

  it("keeps local and session areas independent", () => {
    storageSet("local", "k", "L");
    storageSet("session", "k", "S");
    expect(storageGet("local", "k")).toBe("L");
    expect(storageGet("session", "k")).toBe("S");
  });

  it("returns null for missing keys", () => {
    expect(storageGet("local", "missing")).toBeNull();
    expect(storageGet("session", "missing")).toBeNull();
  });

  it("returns null for stored invalid JSON", () => {
    window.localStorage.setItem("broken", "not json {");
    expect(storageGet("local", "broken")).toBeNull();
  });

  it("removes stored items", () => {
    storageSet("local", "gone", 1);
    expect(storageGet("local", "gone")).toBe(1);
    storageRemove("local", "gone");
    expect(storageGet("local", "gone")).toBeNull();
  });

  it("handles falsey values correctly (0, false, empty string)", () => {
    storageSet("local", "zero", 0);
    storageSet("local", "no", false);
    storageSet("local", "empty", "");
    expect(storageGet("local", "zero")).toBe(0);
    expect(storageGet("local", "no")).toBe(false);
    expect(storageGet("local", "empty")).toBe("");
  });
});

describe("storage unavailable", () => {
  it("degrades to null / no-op when the storage getter throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    expect(storageGet("local", "k")).toBeNull();
    expect(storageGet("session", "k")).toBeNull();
    expect(() => storageSet("local", "k", 1)).not.toThrow();
    expect(() => storageSet("session", "k", 1)).not.toThrow();
    expect(() => storageRemove("local", "k")).not.toThrow();
    expect(() => storageRemove("session", "k")).not.toThrow();
  });

  it("degrades gracefully when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(storageGet("local", "k")).toBeNull();
    expect(() => storageSet("local", "k", 1)).not.toThrow();
    expect(() => storageRemove("session", "k")).not.toThrow();
  });
});
