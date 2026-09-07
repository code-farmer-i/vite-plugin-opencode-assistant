/**
 * provider-loader.loadProvider 的 vitest 单元测试：
 * 用 vi.mock 把运行时动态 import 的 Provider 包（@aipanel/provider-opencode/deepseek）
 * 替换为可控工厂，验证：
 * - 未登记 id 报错，错误信息含可用 Provider 列表（必测）；
 * - 已登记 id（含 default 别名）正确调用对应包的 createProvider(ctx) 并返回其结果；
 * - 包未导出 createProvider 时报明确错误（getter 导出使开关可随时翻转，不受模块缓存影响）。
 * mock specifier 与源码 import(pkg) 变量解析后的包 id 一致即可命中。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderInitContext } from "@aipanel/core";

const h = vi.hoisted(() => ({
  opencodeFactory: vi.fn(() => ({ name: "opencode-provider", displayName: "OpenCode" })),
  deepseekFactory: vi.fn(() => ({ name: "deepseek-provider", displayName: "DeepSeek" })),
  opencodeDropsExport: false,
  deepseekDropsExport: false,
}));

vi.mock("@aipanel/provider-opencode", () => ({
  get createProvider() {
    return h.opencodeDropsExport ? undefined : h.opencodeFactory;
  },
}));
vi.mock("@aipanel/provider-deepseek", () => ({
  get createProvider() {
    return h.deepseekDropsExport ? undefined : h.deepseekFactory;
  },
}));

import { loadProvider } from "../src/core/provider-loader";

const ctx: ProviderInitContext = {
  hostname: "localhost",
  chromeDevtoolsPort: 0,
  getWebPort: () => 0,
  getProxyPort: () => 0,
  options: { verbose: false },
};

afterEach(() => {
  h.opencodeDropsExport = false;
  h.deepseekDropsExport = false;
  h.opencodeFactory.mockClear();
  h.deepseekFactory.mockClear();
});

describe("loadProvider", () => {
  it("未登记 id 报错，错误信息包含可用 Provider 列表", async () => {
    await expect(loadProvider("ghost-provider", ctx)).rejects.toThrow();
    try {
      await loadProvider("ghost-provider", ctx);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('未知的 Web Provider: "ghost-provider"');
      // 可用 Provider 列表（映射表未导出，按领域约定固定断言）
      for (const id of ["default", "opencode", "deepseek"]) {
        expect(message).toContain(id);
      }
    }
  });

  it("opencode id 动态加载 opencode 包并调用 createProvider(ctx)", async () => {
    const provider = await loadProvider("opencode", ctx);
    expect(h.opencodeFactory).toHaveBeenCalledTimes(1);
    expect(h.opencodeFactory).toHaveBeenCalledWith(ctx);
    expect(provider).toEqual(h.opencodeFactory.mock.results[0].value);
    expect(h.deepseekFactory).not.toHaveBeenCalled();
  });

  it("default 别名映射到 opencode 包", async () => {
    const provider = await loadProvider("default", ctx);
    expect(h.opencodeFactory).toHaveBeenCalledTimes(1);
    expect(provider).toEqual(h.opencodeFactory.mock.results[0].value);
  });

  it("deepseek id 动态加载 deepseek 包并调用 createProvider(ctx)", async () => {
    const provider = await loadProvider("deepseek", ctx);
    expect(h.deepseekFactory).toHaveBeenCalledTimes(1);
    expect(h.deepseekFactory).toHaveBeenCalledWith(ctx);
    expect(provider).toEqual(h.deepseekFactory.mock.results[0].value);
  });

  it("Provider 包未导出 createProvider 时报明确错误", async () => {
    h.opencodeDropsExport = true;
    await expect(loadProvider("opencode", ctx)).rejects.toThrow(/未导出 createProvider 工厂/);
  });

  it("未导出 createProvider 的错误信息包含包名，便于定位", async () => {
    h.deepseekDropsExport = true;
    try {
      await loadProvider("deepseek", ctx);
    } catch (err) {
      expect((err as Error).message).toContain("@aipanel/provider-deepseek");
    }
  });
});
