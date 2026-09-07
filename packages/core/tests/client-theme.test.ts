// @vitest-environment jsdom
/**
 * @fileoverview 浏览器主题辅助单测（packages/core/src/client/theme.ts，jsdom）
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSystemTheme, resolveWidgetTheme } from "../src/client/theme";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

function mockSystemTheme(matches: boolean): void {
  const mm = vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(window, "matchMedia", { configurable: true, value: mm });
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    delete (window as { matchMedia?: unknown }).matchMedia;
  }
});

describe("getSystemTheme", () => {
  it("reports dark when matchMedia prefers dark", () => {
    mockSystemTheme(true);
    expect(getSystemTheme()).toBe("dark");
  });

  it("reports light when matchMedia does not prefer dark", () => {
    mockSystemTheme(false);
    expect(getSystemTheme()).toBe("light");
  });

  it("falls back to light when there is no window (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(getSystemTheme()).toBe("light");
  });
});

describe("resolveWidgetTheme", () => {
  it("resolves auto from the explicit system theme", () => {
    expect(resolveWidgetTheme("auto", "dark")).toBe("dark");
    expect(resolveWidgetTheme("auto", "light")).toBe("light");
  });

  it("passes explicit themes through unchanged", () => {
    expect(resolveWidgetTheme("light", "dark")).toBe("light");
    expect(resolveWidgetTheme("dark", "light")).toBe("dark");
  });

  it("resolves auto from the current system theme by default", () => {
    mockSystemTheme(true);
    expect(resolveWidgetTheme("auto")).toBe("dark");
  });
});
