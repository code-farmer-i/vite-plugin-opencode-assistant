/**
 * allowOrigins 条目匹配（isOriginEntryMatch）单元测试：
 * 精确 origin 前缀匹配 / glob 通配符（picomatch）/ 正则字面量三种写法。
 */
import { describe, expect, it } from "vitest";
import { isOriginEntryMatch, isPageAllowed } from "../src/core/mcp-chrome";

describe("allowOrigins entry matching", () => {
  it("exact origin: prefix match with any path", () => {
    expect(isOriginEntryMatch("https://www.baidu.com/", "https://www.baidu.com")).toBe(true);
    expect(isOriginEntryMatch("https://www.baidu.com/s?wd=1", "https://www.baidu.com")).toBe(true);
    expect(isOriginEntryMatch("https://evil.com/", "https://www.baidu.com")).toBe(false);
  });

  it("glob wildcard matches via picomatch", () => {
    expect(isOriginEntryMatch("https://sub.example.com/path", "https://*.example.com/**")).toBe(true);
    expect(isOriginEntryMatch("https://sub.example.com/", "https://*.example.com/**")).toBe(true);
    // * 不跨 /，需要放开路径时以 /** 结尾
    expect(isOriginEntryMatch("https://sub.example.com/a", "https://*.example.com")).toBe(false);
    expect(isOriginEntryMatch("https://other.org/", "https://*.example.com/**")).toBe(false);
  });

  it("regex literal entry tests full URL", () => {
    const entry = "/^https:\/\/app\.example\.com\//";
    expect(isOriginEntryMatch("https://app.example.com/", entry)).toBe(true);
    expect(isOriginEntryMatch("https://sub.example.com/", entry)).toBe(false);
  });

  it("regex literal supports flags", () => {
    const ci = "/^https:\/\/[a-z]+\.example\.com\//i";
    expect(isOriginEntryMatch("https://A.example.com/x", ci)).toBe(true);
    const digits = "/^https:\/\/[0-9]+\.example\.com\//";
    expect(isOriginEntryMatch("https://a.example.com/x", digits)).toBe(false);
  });

  it("isPageAllowed honors includeExtensions beyond entries", () => {
    const entries = ["https://www.baidu.com"];
    expect(isPageAllowed("chrome-extension://abc/panel.html", entries, true)).toBe(true);
    expect(isPageAllowed("chrome-extension://abc/panel.html", entries, false)).toBe(false);
    expect(isPageAllowed("https://www.baidu.com/x", entries, false)).toBe(true);
  });
});
