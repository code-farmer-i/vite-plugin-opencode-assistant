/**
 * mcp-tools 纯逻辑的 vitest 单元测试（官方默认工具面快照在 official-default.test.ts）：
 * - displayToolName / MCP_PREFIX / withPageIdSchema / PAGE_ID_PROP；
 * - officialDefaultShorts 与元数据规则、OFFICIAL_GLOBAL_POLICY 的关系；
 * - isOfficialExtraTool / extraToolFlag / officialExtraCandidates（从官方 meta 派生）；
 * - configureToolScope 的 extra/deny 过滤与告警、currentOfficialShorts、isAllowedToolName 白名单守卫。
 * configureToolScope 持有模块级状态，afterEach 用空配置复位。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCP_PREFIX,
  OFFICIAL_GLOBAL_POLICY,
  OFFICIAL_NO_PAGE_TOOLS,
  PAGE_ID_PROP,
  PROJECT_DESCRIPTION_NOTES,
  CUSTOM_TOOLS,
  configureToolScope,
  currentOfficialShorts,
  displayToolName,
  extraToolFlag,
  isAllowedToolName,
  isOfficialExtraTool,
  officialDefaultShorts,
  officialExtraCandidates,
  withPageIdSchema,
} from "../src/core/mcp-tools";
import { OFFICIAL_TOOL_META } from "../src/core/official-meta";

/** 非 safe 分类（与源码 UNSAFE_CATEGORIES 一致，用于白名单外推校验） */
const UNSAFE_CATEGORIES = new Set(["EXTENSIONS", "PWA", "THIRD_PARTY", "WEBMCP"]);
const GLOBAL_POLICY = [...OFFICIAL_GLOBAL_POLICY];

afterEach(() => {
  // 复位模块级 extra/deny 状态
  configureToolScope();
});

describe("displayToolName / MCP_PREFIX", () => {
  it("displayToolName 前缀使用 MCP_PREFIX", () => {
    expect(MCP_PREFIX).toBe("chrome-devtools_");
    expect(displayToolName("click")).toBe("chrome-devtools_click");
    expect(displayToolName("")).toBe("chrome-devtools_");
  });
});

describe("withPageIdSchema / PAGE_ID_PROP", () => {
  it("保留原 properties 与 required，pageId 置为首位必填", () => {
    const schema = withPageIdSchema({
      type: "object",
      properties: { foo: { type: "string" }, bar: { type: "number" } },
      required: ["foo"],
    });
    expect(schema.type).toBe("object");
    expect(schema.properties.pageId).toEqual(PAGE_ID_PROP.pageId);
    expect(schema.properties.foo).toEqual({ type: "string" });
    expect(schema.required).toEqual(["pageId", "foo"]);
  });

  it("无 required 的原 schema 追加后仅必填 pageId", () => {
    const schema = withPageIdSchema({ type: "object", properties: {} });
    expect(schema.required).toEqual(["pageId"]);
    expect(Object.keys(schema.properties)).toEqual(["pageId"]);
  });
});

describe("officialDefaultShorts 推导规则", () => {
  it("页面级无条件安全工具排序在前，GLOBAL_POLICY 特例追加在后", () => {
    const shorts = officialDefaultShorts();
    // 尾部追加的是全局特例（顺序固定）
    expect(shorts.slice(-GLOBAL_POLICY.length)).toEqual(GLOBAL_POLICY);
    // 其余部分按名称升序
    const pagePart = shorts.slice(0, -GLOBAL_POLICY.length);
    expect(pagePart).toEqual([...pagePart].sort());
    // 每项都能在官方 meta 中找到（排除特例与 unsafe 分类的页面级工具）
    for (const short of pagePart) {
      const meta = OFFICIAL_TOOL_META.find((m) => m.name === short);
      expect(meta).toBeDefined();
      expect(meta!.pageScoped).toBe(true);
      expect(meta!.conditions).toHaveLength(0);
      expect(UNSAFE_CATEGORIES.has(meta!.category)).toBe(false);
    }
  });

  it("GLOBAL_POLICY 工具（列表/新建/求值等）始终在默认面内", () => {
    const shorts = officialDefaultShorts();
    for (const short of GLOBAL_POLICY) {
      expect(shorts).toContain(short);
    }
  });

  it("受条件限制或 unsafe 分类的工具不出现在默认面", () => {
    const shorts = officialDefaultShorts();
    expect(shorts).not.toContain("get_tab_id"); // experimentalInteropTools 条件
    expect(shorts).not.toContain("screencast_start"); // experimentalScreencast 条件
    expect(shorts).not.toContain("install_extension"); // EXTENSIONS
    expect(shorts).not.toContain("execute_webmcp_tool"); // WEBMCP
    expect(shorts).not.toContain("list_3p_developer_tools"); // THIRD_PARTY
  });
});

describe("isOfficialExtraTool / extraToolFlag / officialExtraCandidates", () => {
  it("isOfficialExtraTool 仅认官方声明条件且分类安全的工具", () => {
    expect(isOfficialExtraTool("get_tab_id")).toBe(true);
    expect(isOfficialExtraTool("click_at")).toBe(true);
    // 无条件（本就默认暴露）或 unsafe 分类不算 extra
    expect(isOfficialExtraTool("click")).toBe(false);
    expect(isOfficialExtraTool("install_extension")).toBe(false);
    expect(isOfficialExtraTool("unknown_tool")).toBe(false);
  });

  it("extraToolFlag 把 experimental 条件转成 CLI flag（camelCase → kebab）", () => {
    expect(extraToolFlag("get_tab_id")).toBe("--experimental-interop-tools");
    expect(extraToolFlag("screencast_start")).toBe("--experimental-screencast");
    expect(extraToolFlag("click_at")).toBe("--experimental-vision");
    expect(extraToolFlag("click")).toBeUndefined();
    expect(extraToolFlag("unknown")).toBeUndefined();
  });

  it("officialExtraCandidates 与 meta 中带条件的非 unsafe 工具一一对应", () => {
    const expected = OFFICIAL_TOOL_META.filter(
      (m) => m.conditions.length > 0 && !UNSAFE_CATEGORIES.has(m.category),
    ).map((m) => m.name);
    expect([...officialExtraCandidates()].sort()).toEqual([...expected].sort());
  });
});

describe("configureToolScope / currentOfficialShorts / isAllowedToolName", () => {
  it("空配置时当前面与默认面一致", () => {
    configureToolScope();
    expect(currentOfficialShorts()).toEqual(officialDefaultShorts());
  });

  it("extra 增加二级工具（get_tab_id）后可调用、并入当前面", () => {
    configureToolScope(["get_tab_id"]);
    expect(currentOfficialShorts()).toContain("get_tab_id");
    expect(isAllowedToolName(displayToolName("get_tab_id"))).toBe(true);
    expect(isAllowedToolName("chrome-devtools_get_tab_id")).toBe(true);
  });

  it("extra 传入非二级/默认工具名时告警并忽略", () => {
    const warn = vi.fn();
    configureToolScope(["click", "totally-unknown"], [], warn);
    // click 属于默认面，extra 无需重复加入 —— 仍应被忽略并告警
    expect(warn).toHaveBeenCalledTimes(2);
    const msgs = warn.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => m.includes("click"))).toBe(true);
    expect(msgs.some((m) => m.includes("totally-unknown"))).toBe(true);
    expect(currentOfficialShorts()).toEqual(officialDefaultShorts());
    expect(isAllowedToolName("chrome-devtools_totally-unknown")).toBe(false);
  });

  it("deny 移除默认工具（click），其余默认工具不受影响", () => {
    configureToolScope([], ["click"]);
    expect(currentOfficialShorts()).not.toContain("click");
    expect(isAllowedToolName(displayToolName("click"))).toBe(false);
    expect(isAllowedToolName(displayToolName("fill"))).toBe(true);
  });

  it("deny 未知工具名时告警并忽略", () => {
    const warn = vi.fn();
    configureToolScope([], ["no-such-tool"], warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("no-such-tool");
    expect(currentOfficialShorts()).toEqual(officialDefaultShorts());
  });

  it("同一工具同时进 extra 与 deny 时 deny 生效：列表与调用守卫一致移除", () => {
    configureToolScope(["get_tab_id"], ["get_tab_id"]);
    expect(isAllowedToolName("chrome-devtools_get_tab_id")).toBe(false);
    expect(currentOfficialShorts()).not.toContain("get_tab_id");
  });

  it("current_page 作为自定义工具始终可用，deny 也无法关闭（完整工具名）", () => {
    const customName = displayToolName("current_page");
    expect(CUSTOM_TOOLS.map((t) => t.name)).toContain(customName);
    configureToolScope([], ["current_page"]);
    // 守卫对带 MCP_PREFIX 的完整工具名做硬特判
    expect(isAllowedToolName(customName)).toBe(true);
    // 裸短名不享受特判，仍受 deny 影响
    expect(isAllowedToolName("current_page")).toBe(false);
  });

  it("白名单守卫同时接受带前缀与裸短名（按 default/extra/deny 判定）", () => {
    configureToolScope(["get_tab_id"], ["click"]);
    expect(isAllowedToolName("click")).toBe(false);
    expect(isAllowedToolName("chrome-devtools_click")).toBe(false);
    expect(isAllowedToolName("get_tab_id")).toBe(true);
  });
});

describe("PROJECT_DESCRIPTION_NOTES / OFFICIAL_NO_PAGE_TOOLS 一致性", () => {
  it("notes 覆盖的工具都声明在官方 meta 或 GLOBAL_POLICY 中", () => {
    const allKnown = new Set([
      ...officialDefaultShorts(),
      ...officialExtraCandidates(),
      ...OFFICIAL_GLOBAL_POLICY,
    ]);
    for (const short of Object.keys(PROJECT_DESCRIPTION_NOTES)) {
      expect(allKnown.has(short)).toBe(true);
    }
  });

  it("无目标页工具集合（list_pages/new_page）不要求 pageId", () => {
    expect(OFFICIAL_NO_PAGE_TOOLS).toEqual(new Set(["list_pages", "new_page"]));
  });
});
