/**
 * utils/paths 路径解析的 vitest 单元测试：
 * paths.ts 顶层 import { resolvePackageDir } from "@aipanel/core/node"（模块顶层即调用，
 * 有副作用），故用 vi.mock 隔离其返回固定包目录 /virtual/pkg（路径型 mock 需与源文件
 * 的 specifier 一致），再用 vi.spyOn(fs, "existsSync") 控制产物存在性，验证
 * es 优先 → lib 兜底 → 均不存在时返回首个候选 的解析策略。
 * mock 后不再依赖真实 es/lib 构建产物，测试与构建状态解耦。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@aipanel/core/node", () => ({ resolvePackageDir: () => "/virtual/pkg" }));

import {
  resolveVueDevtoolsBridgePath,
  resolveWidgetPath,
  resolveWidgetStylePath,
} from "../src/utils/paths";

const PKG_DIR = "/virtual/pkg";

/**
 * 按 /es/ 与 /lib/ 目录前缀控制 existsSync：
 * esExists / libExists 分别代表 es、lib 产物是否可命中。
 */
function mockExists(esExists: boolean, libExists: boolean): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(fs, "existsSync")
    .mockImplementation((candidate) =>
      String(candidate).includes(`${path.sep}es${path.sep}`) ? esExists : libExists,
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("widget 产物路径解析", () => {
  it("es 与 lib 都存在时优先 es 产物", () => {
    mockExists(true, true);
    expect(resolveWidgetPath()).toBe(path.join(PKG_DIR, "es", "client.js"));
    expect(resolveWidgetStylePath()).toBe(path.join(PKG_DIR, "es", "client.css"));
    expect(resolveVueDevtoolsBridgePath()).toBe(
      path.join(PKG_DIR, "es", "client", "vue-devtools-bridge.mjs"),
    );
  });

  it("es 缺失时回退 lib 产物", () => {
    mockExists(false, true);
    expect(resolveWidgetPath()).toBe(path.join(PKG_DIR, "lib", "client.js"));
    expect(resolveWidgetStylePath()).toBe(path.join(PKG_DIR, "lib", "client.css"));
    expect(resolveVueDevtoolsBridgePath()).toBe(
      path.join(PKG_DIR, "lib", "client", "vue-devtools-bridge.cjs"),
    );
  });

  it("es 与 lib 均不存在时返回首个候选（es 路径，供调用方报错定位）", () => {
    const spy = mockExists(false, false);
    expect(resolveWidgetPath()).toBe(path.join(PKG_DIR, "es", "client.js"));
    expect(resolveWidgetStylePath()).toBe(path.join(PKG_DIR, "es", "client.css"));
    expect(resolveVueDevtoolsBridgePath()).toBe(
      path.join(PKG_DIR, "es", "client", "vue-devtools-bridge.mjs"),
    );
    // 每次解析都会探测存在性（es 优先探测）
    expect(spy).toHaveBeenCalled();
  });
});
