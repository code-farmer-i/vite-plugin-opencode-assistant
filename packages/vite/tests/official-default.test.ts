/**
 * 默认官方工具集的 vitest 快照：防止官方元数据潜移改变暴露面。
 * 确认是意图内变更时：pnpm --filter vite-plugin-aipanel test -u。
 */
import { describe, expect, it } from "vitest";
import { officialDefaultShorts, officialExtraCandidates } from "../src/core/mcp-tools";
import { OFFICIAL_TOOL_META } from "../src/core/official-meta";

describe("official tool default surface", () => {
  it("default official shorts match snapshot (meta-driven)", () => {
    expect([...officialDefaultShorts()].sort()).toMatchSnapshot();
  });

  it("meta has unique tool names", () => {
    const names = OFFICIAL_TOOL_META.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every extra candidate declares official conditions", () => {
    for (const short of officialExtraCandidates()) {
      const meta = OFFICIAL_TOOL_META.find((m) => m.name === short);
      expect(meta?.conditions.length ?? 0).toBeGreaterThan(0);
    }
  });
});
