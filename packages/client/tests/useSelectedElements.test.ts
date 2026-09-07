/**
 * useSelectedElements 单元测试
 * 覆盖：sessionStorage 持久化恢复、storageKey 带 serviceInstanceId 后缀、
 * addElement 按 filePath+line 去重返回 true/false、remove/clear、deep watch 写回。
 * watch 默认 flush=pre，改写后需 await nextTick() 再断言存储内容。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import type { AIPanelSelectedElement } from "@aipanel/core";
import { SELECTED_ELEMENTS_KEY } from "@aipanel/core";
import { useSelectedElements } from "../src/composables/useSelectedElements";

function element(partial: Partial<AIPanelSelectedElement>): AIPanelSelectedElement {
  return { filePath: "/a.ts", line: 1, column: 1, innerText: "", ...partial };
}

function readStorage(key: string): AIPanelSelectedElement[] | null {
  const raw = window.sessionStorage.getItem(key);
  return raw == null ? null : (JSON.parse(raw) as AIPanelSelectedElement[]);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("useSelectedElements", () => {
  it("默认存储键即 SELECTED_ELEMENTS_KEY，空存储下初始为空", () => {
    const api = useSelectedElements();
    expect(api.selectedElements.value).toEqual([]);
    expect(window.sessionStorage.getItem(SELECTED_ELEMENTS_KEY)).toBeNull();
  });

  it("serviceInstanceId 时存储键带后缀", () => {
    const api = useSelectedElements("svc-7");
    api.addElement(element({ filePath: "/x.ts", line: 2 }));
    const key = SELECTED_ELEMENTS_KEY + "_svc-7";
    expect(window.sessionStorage.getItem(SELECTED_ELEMENTS_KEY)).toBeNull();
    // 写回在 nextTick 后发生
    return nextTick().then(() => {
      expect(readStorage(key)).toHaveLength(1);
    });
  });

  it("从 sessionStorage 恢复历史选中", () => {
    const stored = [element({ filePath: "/old.ts", line: 9 }) as AIPanelSelectedElement];
    window.sessionStorage.setItem(SELECTED_ELEMENTS_KEY, JSON.stringify(stored));
    const api = useSelectedElements();
    expect(api.selectedElements.value).toEqual(stored);
  });

  it("addElement 按 filePath+line 去重：新增 true，重复 false", () => {
    const api = useSelectedElements();
    expect(api.addElement(element({ filePath: "/a.ts", line: 10 }))).toBe(true);
    expect(api.addElement(element({ filePath: "/a.ts", line: 10, innerText: "dup" }))).toBe(false);
    expect(api.addElement(element({ filePath: "/a.ts", line: 11 }))).toBe(true);
    expect(api.addElement(element({ filePath: "/b.ts", line: 10 }))).toBe(true);
    expect(api.selectedElements.value).toHaveLength(3);
  });

  it("deep watch 将变更写回 sessionStorage（add/remove/clear）", async () => {
    const api = useSelectedElements();
    api.addElement(element({ filePath: "/a.ts", line: 1 }));
    api.addElement(element({ filePath: "/b.ts", line: 2 }));
    await nextTick();
    let stored = readStorage(SELECTED_ELEMENTS_KEY);
    expect(stored).toHaveLength(2);
    expect(stored?.[0].filePath).toBe("/a.ts");

    api.removeElement(0);
    await nextTick();
    stored = readStorage(SELECTED_ELEMENTS_KEY);
    expect(stored).toHaveLength(1);
    expect(stored?.[0].filePath).toBe("/b.ts");

    api.clearElements();
    await nextTick();
    expect(readStorage(SELECTED_ELEMENTS_KEY)).toEqual([]);
    expect(api.selectedElements.value).toEqual([]);
  });

  it("不同 serviceInstanceId 使用各自存储键，互不串扰", () => {
    window.sessionStorage.setItem(
      SELECTED_ELEMENTS_KEY + "_one",
      JSON.stringify([element({ filePath: "/one.ts", line: 1 })]),
    );
    const a = useSelectedElements("one");
    const b = useSelectedElements("two");
    expect(a.selectedElements.value).toHaveLength(1);
    expect(b.selectedElements.value).toEqual([]);
    expect(window.sessionStorage.getItem(SELECTED_ELEMENTS_KEY + "_two")).toBeNull();
  });
});
