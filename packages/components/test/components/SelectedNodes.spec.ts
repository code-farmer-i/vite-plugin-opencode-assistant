import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import SelectedNodes from "../../src/open-code-widget/src/components/SelectedNodes.vue";
import * as contextModule from "../../src/open-code-widget/src/context";
import type { OpenCodeWidgetContext } from "../../src/open-code-widget/src/context";
import type { OpenCodeSelectedElementItem } from "../../src/open-code-widget/src/types";

vi.mock("../../src/open-code-widget/src/context", () => ({
  useOpenCodeWidgetContext: vi.fn(),
}));

describe("SelectedNodes.vue", () => {
  const mockItems: OpenCodeSelectedElementItem[] = [
    {
      key: "1",
      description: "div.header",
      bubbleFileText: "src/Header.vue",
      panelFileText: "src/Header.vue:10",
      element: {
        filePath: "src/Header.vue",
        line: 10,
        column: 5,
        innerText: "Logo",
        description: "div.header",
      },
    },
    {
      key: "2",
      description: "button.submit",
      bubbleFileText: "src/Button.vue",
      panelFileText: "src/Button.vue:20",
      element: {
        filePath: "src/Button.vue",
        line: 20,
        column: 2,
        innerText: "Submit",
        description: "button.submit",
      },
    },
  ];

  const defaultContext = {
    selectedElementItems: ref(mockItems),
    showClearAll: ref(true),
    handleClickSelectedNode: vi.fn(),
    handleRemoveSelectedNode: vi.fn(),
    handleClearSelectedNodes: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue(
      defaultContext as unknown as OpenCodeWidgetContext,
    );
  });

  it("should render correctly with items", () => {
    const wrapper = mount(SelectedNodes);

    expect(wrapper.classes()).not.toContain("collapsed");

    const items = wrapper.findAll(".opencode-selected-node");
    expect(items).toHaveLength(2);

    expect(items[0].find(".opencode-node-text").text()).toBe("div.header");
    expect(items[0].find(".opencode-node-file").text()).toBe("src/Header.vue:10");

    expect(items[1].find(".opencode-node-text").text()).toBe("button.submit");
    expect(items[1].find(".opencode-node-file").text()).toBe("src/Button.vue:20");

    expect(wrapper.find(".opencode-clear-all-btn").exists()).toBe(true);
  });

  it("should have collapsed class when items are empty", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      selectedElementItems: ref([]),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectedNodes);
    expect(wrapper.classes()).toContain("collapsed");
    expect(wrapper.findAll(".opencode-selected-node")).toHaveLength(0);
    expect(wrapper.find(".opencode-clear-all-btn").exists()).toBe(false);
  });

  it("should hide clear all button when showClearAll is false", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      showClearAll: ref(false),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectedNodes);
    expect(wrapper.find(".opencode-clear-all-btn").exists()).toBe(false);
  });

  it("should call handlers when buttons are clicked", async () => {
    const handleClickSelectedNode = vi.fn();
    const handleRemoveSelectedNode = vi.fn();
    const handleClearSelectedNodes = vi.fn();

    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      handleClickSelectedNode,
      handleRemoveSelectedNode,
      handleClearSelectedNodes,
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectedNodes);

    const items = wrapper.findAll(".opencode-selected-node");

    // Click node
    await items[0].trigger("click");
    expect(handleClickSelectedNode).toHaveBeenCalledTimes(1);
    expect(handleClickSelectedNode).toHaveBeenCalledWith(mockItems[0]);

    // Remove node
    const removeBtn = items[1].find(".opencode-node-remove");
    await removeBtn.trigger("click");
    expect(handleRemoveSelectedNode).toHaveBeenCalledTimes(1);
    expect(handleRemoveSelectedNode).toHaveBeenCalledWith({
      item: mockItems[1],
      index: 1,
      source: "panel",
    });

    // Clear all
    await wrapper.find(".opencode-clear-all-btn").trigger("click");
    expect(handleClearSelectedNodes).toHaveBeenCalledTimes(1);
  });
});
