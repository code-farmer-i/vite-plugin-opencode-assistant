import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OpenCodeWidget from "../src/open-code-widget/src/index.vue";
import type { OpenCodeSelectedElement } from "../src/open-code-widget/src/types";

describe("OpenCodeWidget", () => {
  it("renders correctly with default props", () => {
    const wrapper = mount(OpenCodeWidget);

    expect(wrapper.classes()).toContain("opencode-widget");
    expect(wrapper.classes()).toContain("bottom-right");
    expect(wrapper.classes()).toContain("opencode-theme-light");

    // Default mode is not selectMode
    expect(wrapper.find(".opencode-chat").exists()).toBe(true);
    expect(wrapper.find(".opencode-select-mode-hint").classes()).not.toContain("visible");
  });

  it("handles toggle and close actions", async () => {
    const wrapper = mount(OpenCodeWidget, {
      props: {
        open: false,
      },
    });

    const triggerBtn = wrapper.find(".opencode-button");
    await triggerBtn.trigger("click");

    // Emit 'update:open' and 'toggle'
    expect(wrapper.emitted()["update:open"]).toBeTruthy();
    expect(wrapper.emitted()["update:open"][0]).toEqual([true]);
    expect(wrapper.emitted().toggle).toBeTruthy();
    expect(wrapper.emitted().toggle[0]).toEqual([true]);

    // Update prop to true
    await wrapper.setProps({ open: true });

    // Close button
    const closeBtn = wrapper.find(".opencode-header-btn.close");
    await closeBtn.trigger("click");

    expect(wrapper.emitted()["update:open"][1]).toEqual([false]);
    expect(wrapper.emitted().close).toBeTruthy();
  });

  it("displays and interacts with session list", async () => {
    const wrapper = mount(OpenCodeWidget, {
      props: {
        sessions: [
          { id: "1", title: "Test Session 1" },
          { id: "2", title: "Test Session 2" },
        ],
        currentSessionId: "1",
        sessionListCollapsed: false,
      },
    });

    const sessionList = wrapper.find(".opencode-session-list");
    expect(sessionList.classes()).not.toContain("collapsed");

    const items = wrapper.findAll(".opencode-session-item");
    expect(items).toHaveLength(2);
    expect(items[0].classes()).toContain("active");

    // Click item 2
    await items[1].trigger("click");
    expect(wrapper.emitted()["select-session"]).toBeTruthy();
    expect((wrapper.emitted()["select-session"] as unknown[][])[0][0]).toMatchObject({
      id: "2",
      title: "Test Session 2",
    });
  });

  it("toggles select mode and handles selection", async () => {
    const mockElements: OpenCodeSelectedElement[] = [
      {
        description: "div.test",
        filePath: "/test.vue",
        line: 1,
        column: 1,
        innerText: "test",
      },
    ];

    const wrapper = mount(OpenCodeWidget, {
      props: {
        selectMode: true,
        selectedElements: mockElements,
      },
    });

    // Chat should be hidden, hint should be visible
    expect(wrapper.find(".opencode-chat").isVisible()).toBe(false);
    expect(wrapper.find(".opencode-select-mode-hint").classes()).toContain("visible");
    expect(wrapper.find(".opencode-selected-bubbles").exists()).toBe(true);

    // Test removing from bubbles
    const removeBtn = wrapper.find(".opencode-bubble-remove");
    await removeBtn.trigger("click");

    expect(wrapper.emitted()["remove-selected-node"]).toBeTruthy();
    expect((wrapper.emitted()["remove-selected-node"] as unknown[][])[0][0]).toMatchObject({
      element: mockElements[0],
      index: 0,
      source: "bubble",
    });
  });

  it("handles empty state and loading", () => {
    const wrapper = mount(OpenCodeWidget, {
      props: {
        loading: true,
        showEmptyState: true,
        emptyStateText: "No data",
        emptyStateActionText: "Reload",
      },
    });

    expect(wrapper.find(".opencode-loading-overlay").classes()).toContain("visible");
    expect(wrapper.find(".opencode-empty-state-overlay").classes()).toContain("visible");
    expect(wrapper.find(".opencode-empty-state-text").text()).toBe("No data");
  });
});
