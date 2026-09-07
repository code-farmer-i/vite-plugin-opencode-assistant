/**
 * resolveProjectScope 的 vitest 单元测试：
 * 用 vi.mock 替换 mcp-chrome 模块的 getProjectOrigins 为固定返回值，
 * 验证 origins/operationsOrigins 的并集去重与 includeExtensionPages 的默认/显式取值。
 * mock 说明：源文件 import "./mcp-chrome"，测试内以 "../src/core/mcp-chrome" 注册，
 * 二者解析到同一模块文件，vitest 按其解析 id 拦截。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { getProjectOriginsMock } = vi.hoisted(() => ({ getProjectOriginsMock: vi.fn() }));

vi.mock("../src/core/mcp-chrome", () => ({ getProjectOrigins: getProjectOriginsMock }));

import { resolveProjectScope } from "../src/core/chrome-project";

/** 模拟 Vite 自动推导的项目页 origins（getProjectOrigins 的返回） */
const AUTO_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/** 被 mock 掉 getProjectOrigins 后，server 形参只需满足调用方传参，无需真实结构 */
const server = {} as unknown as Parameters<typeof resolveProjectScope>[0];

afterEach(() => {
  getProjectOriginsMock.mockReset();
});

describe("resolveProjectScope", () => {
  it("无 allowOrigins 时 operationsOrigins 与 auto origins 相同，includeExtensions 默认 false", () => {
    getProjectOriginsMock.mockReturnValue(AUTO_ORIGINS);
    const scope = resolveProjectScope(server);
    expect(scope.origins).toEqual(AUTO_ORIGINS);
    expect(scope.operationsOrigins).toEqual(AUTO_ORIGINS);
    expect(scope.includeExtensions).toBe(false);
  });

  it("allowOrigins 与 auto origins 重叠时按并集去重合并，auto 顺序在前", () => {
    getProjectOriginsMock.mockReturnValue(AUTO_ORIGINS);
    const scope = resolveProjectScope(server, {
      allowOrigins: ["http://127.0.0.1:5173", "https://www.baidu.com"],
    });
    expect(scope.operationsOrigins).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://www.baidu.com",
    ]);
    // origins 只保留 auto 推导结果，不受 allowOrigins 影响
    expect(scope.origins).toEqual(AUTO_ORIGINS);
  });

  it("空 allowOrigins 数组与原项目缺省行为一致", () => {
    getProjectOriginsMock.mockReturnValue(AUTO_ORIGINS);
    const scope = resolveProjectScope(server, { allowOrigins: [] });
    expect(scope.operationsOrigins).toEqual(AUTO_ORIGINS);
  });

  it("includeExtensionPages 显式 true 时 includeExtensions 为 true", () => {
    getProjectOriginsMock.mockReturnValue(AUTO_ORIGINS);
    const scope = resolveProjectScope(server, { includeExtensionPages: true });
    expect(scope.includeExtensions).toBe(true);
  });

  it("includeExtensionPages 显式 false 与缺省一致（默认关闭扩展页）", () => {
    getProjectOriginsMock.mockReturnValue(AUTO_ORIGINS);
    expect(resolveProjectScope(server, { includeExtensionPages: false }).includeExtensions).toBe(
      false,
    );
    expect(resolveProjectScope(server).includeExtensions).toBe(false);
  });

  it("去重合并不影响 allowOrigins 内自身的重复项", () => {
    getProjectOriginsMock.mockReturnValue(AUTO_ORIGINS);
    const scope = resolveProjectScope(server, {
      allowOrigins: ["https://a.example.com", "https://a.example.com", "https://b.example.com"],
    });
    expect(scope.operationsOrigins).toEqual([
      ...AUTO_ORIGINS,
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });
});
