/**
 * @aipanel/provider-deepseek DeepSeekWebProvider 纯逻辑能力面测试。
 *
 * 仅覆盖可安全实例化、无网络/进程副作用的能力面：
 *   - DeepSeekAPI 构造只保存 hostname + getWebPort 闭包（api.ts/deepseek-web.ts/dsh-install.ts
 *     无顶层网络/进程副作用，execa 仅在 start/ensureDshPackage 内部才被调用）；
 *   - 不调用 start / checkEnvironment / listSessions / createSession 等网络/进程方法。
 * resolveDeepSeekOptions 为模块私有函数（未导出），无法直接构造观测 → 跳过（见交付报告）。
 */
import { describe, expect, it } from "vitest";
import type { ProviderConfig, WebProvider } from "@aipanel/core";
import { DSH_LOOPBACK_HOST, DSH_DEFAULT_PORT } from "../src/constants";
import { DeepSeekWebProvider } from "../src/provider";

function makeProvider(): DeepSeekWebProvider {
  return new DeepSeekWebProvider(
    { hostname: DSH_LOOPBACK_HOST },
    {
      getWebPort: () => DSH_DEFAULT_PORT,
      getProxyPort: () => 6097,
    },
    undefined,
  );
}

/** 白盒读取私有 uiTheme（applyConfig 只经 start 使用，start 属网络/进程方法不可调用） */
function readUiTheme(p: DeepSeekWebProvider): string {
  return (p as unknown as { uiTheme: string }).uiTheme;
}

describe("DeepSeekWebProvider 静态能力面", () => {
  it("暴露 id/displayName 且 capabilities.deepLink=false（SPA 壳式无深链）", () => {
    const p: WebProvider = makeProvider();
    expect(p.id).toBe("deepseek");
    expect(p.displayName).toBe("DeepSeek Harness");
    expect(p.capabilities).toEqual({ deepLink: false });
  });

  it("构造零网络：默认 uiTheme 为 auto", () => {
    const p = makeProvider();
    expect(readUiTheme(p)).toBe("auto");
  });
});

describe("DeepSeekWebProvider.applyConfig（非法 theme 回退 auto）", () => {
  it("合法 light/dark 透传，auto 原样，非法/缺省回退 auto", () => {
    const p = makeProvider();
    p.applyConfig({ theme: "light" } satisfies ProviderConfig);
    expect(readUiTheme(p)).toBe("light");
    p.applyConfig({ theme: "dark" } satisfies ProviderConfig);
    expect(readUiTheme(p)).toBe("dark");
    p.applyConfig({ theme: "auto" } satisfies ProviderConfig);
    expect(readUiTheme(p)).toBe("auto");

    // 非法值（类型上不存在，按运行时行为验证）回退 auto
    p.applyConfig({ theme: "garbage" } as unknown as ProviderConfig);
    expect(readUiTheme(p)).toBe("auto");
    // 缺省 theme 也回退 auto
    p.applyConfig({} satisfies ProviderConfig);
    expect(readUiTheme(p)).toBe("auto");
  });
});

describe("DeepSeekWebProvider.buildSessionUrl（纯方法）", () => {
  it("无 deepLink：所有会话返回代理端口应用壳 URL（DSH_LOOPBACK_HOST + proxyPort）", () => {
    const p = makeProvider();
    const url = p.buildSessionUrl("/any/project", "");
    expect(url).toBe(`http://${DSH_LOOPBACK_HOST}:6097/`);
    // 不同会话/目录得到同一壳 URL
    expect(p.buildSessionUrl("/other", "sess-1")).toBe(url);
  });
});
