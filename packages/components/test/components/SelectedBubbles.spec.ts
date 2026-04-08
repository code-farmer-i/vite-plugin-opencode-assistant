import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import SelectedBubbles from "../../src/open-code-widget/src/components/SelectedBubbles.vue";
import * as contextModule from "../../src/open-code-widget/src/context";
import type { OpenCodeWidgetContext } from "../../src/open-code-widget/src/context";
import type { OpenCodeSelectedElementItem } from "../../src/open-code-widget/src/types";

vi.mock("../../src/open-code-widget/src/context", () => ({
  useOpenCodeWidgetContext: vi.fn(),
}));

describe("SelectedBubbles.vue", () => {
  const mockItems: OpenCodeSelectedElementItem[] = [
    {
      key: "1",
      description: "div.container",
      bubbleFileText: "src/App.vue",
      panelFileText: "src/App.vue",
      element: { filePath: "src/App.vue", line: 10, column: 5, innerText: "Hello", description: "div.container" },
    },
  ];

  const defaultContext = {
    bubbleVisible: ref(true),
    selectedElementItems: ref(mockItems),
    handleRemoveSelectedNode: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue(defaultContext as unknown as OpenCodeWidgetContext);
  });

  it("should render correctly with items", () => {
    const wrapper = mount(SelectedBubbles);
    
    expect(wrapper.classes()).toContain("visible");
    
    const items = wrapper.findAll(".opencode-selected-bubble");
    expect(items).toHaveLength(1);
    
    expect(items[0].find(".opencode-bubble-text").text()).toBe("div.container");
    expect(items[0].find(".opencode-bubble-file").text()).toBe("src/App.vue");
  });

  it("should not have visible class when bubbleVisible is false", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      bubbleVisible: ref(false),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectedBubbles);
    expect(wrapper.classes()).not.toContain("visible");
  });

  it("should display empty state when items are empty", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      selectedElementItems: ref([]),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectedBubbles);
    expect(wrapper.findAll(".opencode-selected-bubble")).toHaveLength(0);
    expect(wrapper.find(".opencode-bubble-empty").exists()).toBe(true);
    expect(wrapper.find(".opencode-bubble-empty").text()).toBe("暂无选中元素");
  });

  it("should call handleRemoveSelectedNode when remove button is clicked", async () => {
    const handleRemoveSelectedNode = vi.fn();
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      handleRemoveSelectedNode,
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectedBubbles);
    
    await wrapper.find(".opencode-bubble-remove").trigger("click");
    expect(handleRemoveSelectedNode).toHaveBeenCalledTimes(1);
    expect(handleRemoveSelectedNode).toHaveBeenCalledWith({
      item: mockItems[0],
      index: 0,
      source: "bubble",
    });
  });
});
