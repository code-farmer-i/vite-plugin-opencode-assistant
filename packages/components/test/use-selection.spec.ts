import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useSelection } from "../src/open-code-widget/composables/use-selection";
import type { OpenCodeSelectedElement } from "../src/open-code-widget/src/types";

describe("useSelection composable", () => {
  it("should compute bubbleVisible based on selectMode and selectedElements", () => {
    const options = {
      selectMode: ref(false),
      selectedElements: ref<OpenCodeSelectedElement[]>([]),
      onToggleSelectMode: vi.fn(),
      onClickSelectedNode: vi.fn(),
      onRemoveSelectedNode: vi.fn(),
      onClearSelectedNodes: vi.fn(),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    };

    const { bubbleVisible } = useSelection(options);
    expect(bubbleVisible.value).toBe(false);

    options.selectMode.value = true;
    expect(bubbleVisible.value).toBe(true);

    options.selectMode.value = false;
    options.selectedElements.value = [
      {
        description: "div.test",
        filePath: "/src/App.vue",
        line: 10,
        column: 5,
        innerText: "Hello",
      },
    ];
    expect(bubbleVisible.value).toBe(true);
  });

  it("should compute selectedElementItems correctly", () => {
    const mockElements: OpenCodeSelectedElement[] = [
      {
        description: "button.btn",
        filePath: "/src/components/Button.vue",
        line: 12,
        column: 4,
        innerText: "Click Me",
      },
      {
        description: "",
        filePath: null,
        line: null,
        column: null,
        innerText: "",
      },
    ];

    const options = {
      selectMode: ref(false),
      selectedElements: ref(mockElements),
      onToggleSelectMode: vi.fn(),
      onClickSelectedNode: vi.fn(),
      onRemoveSelectedNode: vi.fn(),
      onClearSelectedNodes: vi.fn(),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    };

    const { selectedElementItems, hasSelectedElements } = useSelection(options);

    expect(hasSelectedElements.value).toBe(true);
    expect(selectedElementItems.value).toHaveLength(2);

    const item1 = selectedElementItems.value[0];
    expect(item1.description).toBe("button.btn");
    expect(item1.bubbleFileText).toBe("Button.vue:12:4");
    expect(item1.panelFileText).toBe("Click Me · Button.vue:12:4");
    expect(item1.element).toStrictEqual(mockElements[0]);

    const item2 = selectedElementItems.value[1];
    expect(item2.description).toBe("未知元素");
    expect(item2.bubbleFileText).toBe("");
    expect(item2.panelFileText).toBe("未知文件");
  });

  it("should trigger callbacks correctly", async () => {
    const mockElements: OpenCodeSelectedElement[] = [
      {
        description: "div",
        filePath: null,
        line: null,
        column: null,
        innerText: "",
      },
    ];

    const options = {
      selectMode: ref(false),
      selectedElements: ref(mockElements),
      onToggleSelectMode: vi.fn(),
      onClickSelectedNode: vi.fn(),
      onRemoveSelectedNode: vi.fn(),
      onClearSelectedNodes: vi.fn(),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    };

    const {
      handleToggleSelectMode,
      handleClickSelectedNode,
      handleRemoveSelectedNode,
      handleClearSelectedNodes,
      selectedElementItems,
    } = useSelection(options);

    handleToggleSelectMode();
    expect(options.onToggleSelectMode).toHaveBeenCalledWith(true);

    const item = selectedElementItems.value[0];
    handleClickSelectedNode(item);
    expect(options.onClickSelectedNode).toHaveBeenCalledWith(item.element);

    handleRemoveSelectedNode(item, 0, "bubble");
    expect(options.onRemoveSelectedNode).toHaveBeenCalledWith({
      element: item.element,
      index: 0,
      source: "bubble",
    });

    await handleClearSelectedNodes();
    expect(options.onClearSelectedNodes).toHaveBeenCalled();
  });
});
