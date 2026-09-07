/**
 * official-tools.getOfficialProjectTools 的 vitest 单元测试：
 * 以 stub mcp（call 返回官方 tools/list 数据）驱动，不启动真实 chrome-devtools-mcp 进程：
 * - 白名单输出与默认工具面一致，名称带 MCP_PREFIX；
 * - 页面级工具 schema 统一追加必填 pageId（无目标页工具除外，见 OFFICIAL_NO_PAGE_TOOLS）；
 * - 描述追加 PROJECT_DESCRIPTION_NOTES 项目维度说明；
 * - extra/deny 配置影响输出面；
 * - 内存单飞缓存：tools/list 只在首次请求拉取（含"官方缺失某工具"分支），
 *   该两类用例依赖模块级缓存状态，用 vi.resetModules + 动态 import 独立实例验证。
 * 工具响应覆盖官方 meta + OFFICIAL_GLOBAL_POLICY 特例名（如 list_console_messages 不在 meta）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpProxy } from "../src/core/mcp-proxy";
import { getOfficialProjectTools } from "../src/core/official-tools";
import {
  MCP_PREFIX,
  OFFICIAL_GLOBAL_POLICY,
  OFFICIAL_NO_PAGE_TOOLS,
  PAGE_ID_PROP,
  PROJECT_DESCRIPTION_NOTES,
  configureToolScope,
  displayToolName,
  officialDefaultShorts,
  type CustomTool,
} from "../src/core/mcp-tools";
import { OFFICIAL_TOOL_META } from "../src/core/official-meta";

/** 官方 tools/list 可能返回的全部短名：官方 meta ∪ GLOBAL_POLICY 特例 */
const ALL_TOOL_SHORTS = [
  ...new Set([...OFFICIAL_TOOL_META.map((m) => m.name), ...OFFICIAL_GLOBAL_POLICY]),
];

/** 构造 tools/list 响应（schema/描述按官方风格，可选剔除部分工具模拟官方缺名） */
function toolsListResponse(include: (short: string) => boolean = () => true): {
  result: { tools: unknown[] };
} {
  return {
    result: {
      tools: ALL_TOOL_SHORTS.filter(include).map((short) => ({
        name: displayToolName(short),
        description: `official description of ${short}`,
        inputSchema: { type: "object", properties: { prop1: { type: "string" } }, required: [] },
      })),
    },
  };
}

function mcpStub(response: { result: { tools: unknown[] } } = toolsListResponse()): {
  mcp: McpProxy;
  call: ReturnType<typeof vi.fn>;
} {
  const call = vi.fn().mockResolvedValue(response);
  // mcp 必须是带自有 call 方法的对象：裸 vi.fn 的 .call 会命中 Function.prototype.call
  return { mcp: { call } as unknown as McpProxy, call };
}

function byShort(tools: CustomTool[], short: string): CustomTool | undefined {
  return tools.find((t) => t.name === displayToolName(short));
}

afterEach(() => {
  configureToolScope();
});

describe("getOfficialProjectTools", () => {
  it("默认配置下输出与默认工具面一致，名称统一加 MCP_PREFIX", async () => {
    configureToolScope();
    const { mcp, call } = mcpStub();
    const tools = await getOfficialProjectTools(mcp);
    expect(tools.map((t) => t.name)).toEqual(officialDefaultShorts().map(displayToolName));
    expect(call).toHaveBeenCalledWith("tools/list", {});
  });

  it("页面级工具 schema 注入必填 pageId；无目标页工具保持官方原 schema", async () => {
    configureToolScope();
    const tools = await getOfficialProjectTools(mcpStub().mcp);
    expect(tools).toHaveLength(officialDefaultShorts().length);
    for (const tool of tools) {
      const short = tool.name.slice(MCP_PREFIX.length);
      if (OFFICIAL_NO_PAGE_TOOLS.has(short)) {
        expect(tool.inputSchema.required ?? []).not.toContain("pageId");
        expect(tool.inputSchema.properties).not.toHaveProperty("pageId");
        // 原 schema 属性保留
        expect(tool.inputSchema.properties).toHaveProperty("prop1");
      } else {
        expect(tool.inputSchema.required?.[0]).toBe("pageId");
        expect(tool.inputSchema.properties).toHaveProperty("pageId");
        expect(tool.inputSchema.properties.pageId).toEqual(PAGE_ID_PROP.pageId);
      }
    }
  });

  it("描述 = 官方描述 + PROJECT_DESCRIPTION_NOTES 项目维度说明（有 note 才追加）", async () => {
    configureToolScope();
    const tools = await getOfficialProjectTools(mcpStub().mcp);
    const nav = byShort(tools, "navigate_page");
    expect(nav).toBeDefined();
    expect(nav!.description).toBe(
      `official description of navigate_page ${PROJECT_DESCRIPTION_NOTES.navigate_page}`,
    );
    const pages = byShort(tools, "list_pages");
    expect(pages!.description).toContain(PROJECT_DESCRIPTION_NOTES.list_pages);
    // 无 note 的工具描述不被改写
    const click = byShort(tools, "click");
    expect(click!.description).toBe("official description of click");
  });

  it("extra 配置的工具（get_tab_id）进入输出且同样注入 pageId", async () => {
    configureToolScope(["get_tab_id"]);
    const tools = await getOfficialProjectTools(mcpStub().mcp);
    const extra = byShort(tools, "get_tab_id");
    expect(extra).toBeDefined();
    expect(extra!.inputSchema.required?.[0]).toBe("pageId");
  });

  it("deny 配置从输出面移除对应工具", async () => {
    configureToolScope([], ["click"]);
    const tools = await getOfficialProjectTools(mcpStub().mcp);
    expect(byShort(tools, "click")).toBeUndefined();
    expect(byShort(tools, "fill")).toBeDefined();
  });
});

describe("getOfficialProjectTools — 缓存与官方缺名分支（独立模块实例）", () => {
  it("tools/list 只拉取一次，命中后用缓存复用", async () => {
    vi.resetModules();
    const fresh = await import("../src/core/official-tools");
    const { mcp, call } = mcpStub();
    const first = await fresh.getOfficialProjectTools(mcp);
    const second = await fresh.getOfficialProjectTools(mcp);
    expect(first.map((t) => t.name)).toEqual(second.map((t) => t.name));
    expect(second).toHaveLength(officialDefaultShorts().length);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("默认工具在官方 tools/list 中缺失时被跳过，不本地复制", async () => {
    vi.resetModules();
    const fresh = await import("../src/core/official-tools");
    const missing = "take_snapshot";
    const { mcp } = mcpStub(toolsListResponse((short) => short !== missing));
    const tools = await fresh.getOfficialProjectTools(mcp);
    expect(tools.some((t) => t.name === displayToolName(missing))).toBe(false);
    expect(tools).toHaveLength(officialDefaultShorts().length - 1);
  });
});
