import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import Trigger from "../../src/open-code-widget/src/components/Trigger.vue";
import * as contextModule from "../../src/open-code-widget/src/context";
import type { OpenCodeWidgetContext } from "../../src/open-code-widget/src/context";

// Mock the context hook
vi.mock("../../src/open-code-widget/src/context", () => ({
  useOpenCodeWidgetContext: vi.fn(),
}));

describe("Trigger.vue", () => {
  const defaultContext = {
    buttonActive: ref(false),
    open: ref(false),
    hotkeyLabel: ref("Ctrl+K"),
    handleToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue(defaultContext as unknown as OpenCodeWidgetContext);
  });

  it("should render correctly with default context", () => {
    const wrapper = mount(Trigger);

    const button = wrapper.find(".opencode-button");
    expect(button.exists()).toBe(true);
    expect(button.classes()).not.toContain("active");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(button.attributes("title")).toBe("AI 助手 (Ctrl+K)");
  });

  it("should have active class when buttonActive is true", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      buttonActive: ref(true),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(Trigger);
    const button = wrapper.find(".opencode-button");
    expect(button.classes()).toContain("active");
  });

  it("should have aria-expanded true when open is true", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      open: ref(true),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(Trigger);
    const button = wrapper.find(".opencode-button");
    expect(button.attributes("aria-expanded")).toBe("true");
  });

  it("should call handleToggle when clicked", async () => {
    const handleToggle = vi.fn();
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      handleToggle,
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(Trigger);
    const button = wrapper.find(".opencode-button");

    await button.trigger("click");
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
