/**
 * mcp-proxy 用户参数过滤纯逻辑的 vitest 单元测试：
 * - classifyUserMcpArgs / filterUserMcpArgs：受保护 flag（CORE_MCP_ARGS 对应 canonical 名
 *   及反义形式）与策略接管 flag 被剔除并归类，其余参数按原顺序透传；
 * - canonical 归一化：去 -/-- 前缀、去 no- 反义前缀、去 =value 后缀；
 * - McpProxy 构造不做进程级副作用（isRunning=false、sessionId 唯一），
 *   真实 spawn / readline / Chrome 连接属于集成逻辑，不在本文件覆盖。
 */
import { describe, expect, it } from "vitest";
import {
  CORE_MCP_ARGS,
  McpProxy,
  classifyUserMcpArgs,
  filterUserMcpArgs,
} from "../src/core/mcp-proxy";

describe("classifyUserMcpArgs", () => {
  it("保留普通参数与未接管 flag，剔除受保护/策略接管 flag 并归类", () => {
    const { kept, dropped } = classifyUserMcpArgs([
      "--auto-connect",
      "--no-usage-statistics",
      "--slim",
      "--experimental-vision",
      "--port=9222",
      "serve",
      "--page-id-routing",
      "--allow-unrestricted-paths",
      "-x",
    ]);
    // 普通参数与未知 flag 按原顺序保留
    expect(kept).toEqual(["--port=9222", "serve", "-x"]);
    expect(dropped).toEqual([
      { arg: "--auto-connect", kind: "protected" },
      { arg: "--no-usage-statistics", kind: "protected" },
      { arg: "--slim", kind: "managed" },
      { arg: "--experimental-vision", kind: "managed" },
      { arg: "--page-id-routing", kind: "protected" },
      { arg: "--allow-unrestricted-paths", kind: "managed" },
    ]);
  });

  it("canonical 归一化：no- 反义与 =value 写法同样命中保护名单", () => {
    const { kept, dropped } = classifyUserMcpArgs([
      "--no-auto-connect",
      "--usage-statistics=true",
      "--no-page-id-routing",
    ]);
    expect(kept).toEqual([]);
    expect(dropped.every((d) => d.kind === "protected")).toBe(true);
  });

  it("与 CORE_MCP_ARGS 冲突的 canonical 名都被保护，无法被用户覆盖", () => {
    // CORE_MCP_ARGS 自身不再出现在任何用户透传参数里
    const canonicalOf = (arg: string) => arg.replace(/^--?/, "").replace(/^no-/, "").split("=")[0];
    const coreNames = new Set(CORE_MCP_ARGS.map(canonicalOf));
    for (const name of [
      "auto-connect",
      "usage-statistics",
      "performance-crux",
      "page-id-routing",
    ]) {
      expect(coreNames.has(name)).toBe(true);
      const { dropped } = classifyUserMcpArgs([`--${name}`, `--no-${name}`]);
      expect(dropped).toHaveLength(2);
      expect(dropped.every((d) => d.kind === "protected")).toBe(true);
    }
  });

  it("策略接管 flag（experimental-*/category-* 等）归类为 managed", () => {
    const { dropped } = classifyUserMcpArgs([
      "--experimental-interop-tools",
      "--category-extensions",
      "--category-performance",
      "--experimental-include-all-pages",
    ]);
    expect(dropped).toHaveLength(4);
    expect(dropped.every((d) => d.kind === "managed")).toBe(true);
  });

  it("非 flag 项（如命令/位置参数）原样保留", () => {
    const { kept } = classifyUserMcpArgs(["chrome", "--port=9333", "extra"]);
    expect(kept).toEqual(["chrome", "--port=9333", "extra"]);
  });
});

describe("filterUserMcpArgs", () => {
  it("等价于 classify 的 kept 子集", () => {
    const args = ["--auto-connect", "--port=9222", "serve"];
    expect(filterUserMcpArgs(args)).toEqual(classifyUserMcpArgs(args).kept);
    expect(filterUserMcpArgs(args)).toEqual(["--port=9222", "serve"]);
  });
});

describe("McpProxy 构造（无进程副作用）", () => {
  it("构造仅做参数组装，不启动进程", () => {
    const proxy = new McpProxy({ userArgs: ["--port=9222"] });
    expect(proxy.isRunning).toBe(false);
    expect(proxy.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sessionId 实例间唯一", () => {
    expect(new McpProxy().sessionId).not.toBe(new McpProxy().sessionId);
  });
});
