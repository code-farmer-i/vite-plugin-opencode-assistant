import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import SelectHint from "../../src/open-code-widget/src/components/SelectHint.vue";
import * as contextModule from "../../src/open-code-widget/src/context";
import type { OpenCodeWidgetContext } from "../../src/open-code-widget/src/context";

vi.mock("../../src/open-code-widget/src/context", () => ({
  useOpenCodeWidgetContext: vi.fn(),
}));

describe("SelectHint.vue", () => {
  const defaultContext = {
    selectMode: ref(false),
    selectShortcutLabel: ref("Esc"),
  };

  beforeEach(() => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue(defaultContext as unknown as OpenCodeWidgetContext);
  });

  it("should render correctly and reflect selectMode", () => {
    const wrapper = mount(SelectHint);

    expect(wrapper.classes()).not.toContain("visible");
    expect(wrapper.find(".opencode-hint-shortcut").text()).toBe("Esc");
  });

  it("should have visible class when selectMode is true", () => {
    vi.mocked(contextModule.useOpenCodeWidgetContext).mockReturnValue({
      ...defaultContext,
      selectMode: ref(true),
    } as unknown as OpenCodeWidgetContext);

    const wrapper = mount(SelectHint);
    expect(wrapper.classes()).toContain("visible");
  });
});
