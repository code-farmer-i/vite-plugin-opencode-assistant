/**
 * @aipanel/provider-deepseek system（版本语义 / CLI 薄封装）单元测试。
 *
 * isDeepSeekVersionAtLeast：
 *   - 默认 minimum = MIN_DSH_VERSION（源码常量，不重复硬编码）；
 *   - 覆盖 v 前缀与空白、rc.1 < 正式版、数值段比较、pre-release 相等/大小、
 *     长短段（同前缀短段 < 长段）、非法输入返回 null。
 *
 * checkDeepSeekInstalled / getDeepSeekVersion / killOrphanDeepSeekProcesses 只是
 * @aipanel/core/node 同名函数的薄封装：vi.mock 该依赖后断言转发参数与返回值。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkCliInstalled, getCliVersion, killOrphanCliProcesses } from "@aipanel/core/node";
import {
  checkDeepSeekInstalled,
  getDeepSeekVersion,
  isDeepSeekVersionAtLeast,
  killOrphanDeepSeekProcesses,
  MIN_DSH_VERSION,
} from "../src/system";

vi.mock("@aipanel/core/node", () => ({
  checkCliInstalled: vi.fn(),
  getCliVersion: vi.fn(),
  killOrphanCliProcesses: vi.fn(),
}));

describe("isDeepSeekVersionAtLeast（默认 minimum = MIN_DSH_VERSION）", () => {
  it("默认 minimum 即 MIN_DSH_VERSION（源码单一来源）", () => {
    expect(isDeepSeekVersionAtLeast(MIN_DSH_VERSION)).toBe(true);
    // 与显式传入同一 minimum 结果一致
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1", MIN_DSH_VERSION)).toBe(true);
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1", "0.1.2-rc.1")).toBe(true);
  });

  it("容忍 v 前缀与首尾空白/换行（CLI 输出常见 v0.1.2-rc.1\n）", () => {
    expect(isDeepSeekVersionAtLeast("v0.1.2-rc.1")).toBe(true);
    expect(isDeepSeekVersionAtLeast(" 0.1.2-rc.1\n")).toBe(true);
    expect(isDeepSeekVersionAtLeast("v0.1.2-rc.2")).toBe(true);
  });

  it("rc.1 < 正式版：正式版 >= rc.1，rc.1 < 正式 minimum", () => {
    // 无 pre-release（正式版）> 带 pre-release：0.1.2 正式 >= 0.1.2-rc.1
    expect(isDeepSeekVersionAtLeast("0.1.2")).toBe(true);
    // 反向：0.1.2-rc.1 不 >= 0.1.2（rc.1 < 正式）
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1", "0.1.2")).toBe(false);
  });

  it("数值段比较（major/minor/patch 与 pre-release 数字段）", () => {
    expect(isDeepSeekVersionAtLeast("0.1.3")).toBe(true);
    expect(isDeepSeekVersionAtLeast("0.2.0")).toBe(true);
    expect(isDeepSeekVersionAtLeast("1.0.0")).toBe(true);
    expect(isDeepSeekVersionAtLeast("0.1.1")).toBe(false);
    expect(isDeepSeekVersionAtLeast("0.0.9")).toBe(false);
    // 同 core、不同 pre 数字段：rc.2 > rc.1、rc.0 < rc.1
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.2")).toBe(true);
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.0")).toBe(false);
    // 数字段按数值而非字符串比较：rc.10 > rc.9
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.10", "0.1.2-rc.9")).toBe(true);
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.8", "0.1.2-rc.9")).toBe(false);
    // major 更大的版本即使带 pre-release 也 >=
    expect(isDeepSeekVersionAtLeast("2.0.0-alpha.1", MIN_DSH_VERSION)).toBe(true);
  });

  it("字符串标识段比较（字母段按字典序）", () => {
    // beta < rc（b < r），故 0.1.2-beta 不 >= 0.1.2-rc.1
    expect(isDeepSeekVersionAtLeast("0.1.2-beta")).toBe(false);
    expect(isDeepSeekVersionAtLeast("0.1.2-zeta", "0.1.2-rc.1")).toBe(true);
  });

  it("长短段：相等前缀、短段 < 长段、长段 > 短段（rc.1 == rc.1、rc < rc.1）", () => {
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1", "0.1.2-rc.1")).toBe(true);
    // 0.1.2-rc 比 0.1.2-rc.1 少一段（同前缀）：短段优先级更低，rc < rc.1 → 不满足 >=
    expect(isDeepSeekVersionAtLeast("0.1.2-rc", "0.1.2-rc.1")).toBe(false);
    // 0.1.2-rc.1.1 比 0.1.2-rc.1 多一段（前缀相等）：长段更高 → 满足 >=
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1.1", "0.1.2-rc.1")).toBe(true);
    // 0.1.2-rc.1 比 minimum 0.1.2-rc 多一段：长段更高 → 满足 >=
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1", "0.1.2-rc")).toBe(true);
  });

  it("非法版本/非法 minimum 返回 null（调用方按“无法确认”处理）", () => {
    for (const bad of ["", "  ", "abc", "not-semver", "1.2", "v1.2", "0.1", "0", "x.y.z", "v"]) {
      expect(isDeepSeekVersionAtLeast(bad)).toBe(null);
    }
    expect(isDeepSeekVersionAtLeast("0.1.2-rc.1", "garbage")).toBe(null);
    expect(isDeepSeekVersionAtLeast("garbage", "garbage")).toBe(null);
  });
});

describe("CLI 薄封装转发 @aipanel/core/node", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checkDeepSeekInstalled 转发 checkCliInstalled('dsh') 并透传结果", async () => {
    vi.mocked(checkCliInstalled).mockResolvedValue(true);
    await expect(checkDeepSeekInstalled()).resolves.toBe(true);
    vi.mocked(checkCliInstalled).mockResolvedValue(false);
    await expect(checkDeepSeekInstalled()).resolves.toBe(false);
    expect(checkCliInstalled).toHaveBeenCalledTimes(2);
    expect(checkCliInstalled).toHaveBeenCalledWith("dsh");
  });

  it("getDeepSeekVersion 转发 getCliVersion('dsh') 并透传结果", async () => {
    vi.mocked(getCliVersion).mockResolvedValue("0.1.2-rc.1");
    await expect(getDeepSeekVersion()).resolves.toBe("0.1.2-rc.1");
    vi.mocked(getCliVersion).mockResolvedValue(null);
    await expect(getDeepSeekVersion()).resolves.toBeNull();
    expect(getCliVersion).toHaveBeenCalledTimes(2);
    expect(getCliVersion).toHaveBeenCalledWith("dsh");
  });

  it("killOrphanDeepSeekProcesses 转发 killOrphanCliProcesses 及匹配选项并透传结果", async () => {
    vi.mocked(killOrphanCliProcesses).mockResolvedValue(3);
    await expect(killOrphanDeepSeekProcesses()).resolves.toBe(3);
    expect(killOrphanCliProcesses).toHaveBeenCalledTimes(1);
    expect(killOrphanCliProcesses).toHaveBeenCalledWith("dsh", {
      match: "dsh",
      winName: "node.exe",
      label: "dsh",
    });
  });
});
