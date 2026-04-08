import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useWidget } from "../src/open-code-widget/composables/use-widget";

describe("useWidget composable", () => {
  it("should compute containerClasses based on position, theme, and state", () => {
    const options = {
      position: ref("bottom-right"),
      theme: ref("dark"),
      open: ref(false),
      selectMode: ref(false),
      iframeSrc: ref(""),
      sessionListCollapsed: ref(true),
      onToggle: vi.fn(),
      onClose: vi.fn(),
      onToggleSessionList: vi.fn(),
      onEmptyAction: vi.fn(),
    };

    const { containerClasses } = useWidget(options);
    expect(containerClasses.value).toEqual([
      "opencode-widget",
      "bottom-right",
      "opencode-theme-dark",
    ]);

    options.position.value = "top-left";
    expect(containerClasses.value).toEqual(["opencode-widget", "top-left", "opencode-theme-dark"]);
  });

  it("should compute buttonActive based on open or selectMode", () => {
    const options = {
      position: ref("bottom-right"),
      theme: ref("light"),
      open: ref(false),
      selectMode: ref(false),
      iframeSrc: ref(""),
      sessionListCollapsed: ref(true),
      onToggle: vi.fn(),
      onClose: vi.fn(),
      onToggleSessionList: vi.fn(),
      onEmptyAction: vi.fn(),
    };

    const { buttonActive } = useWidget(options);
    expect(buttonActive.value).toBe(false);

    options.open.value = true;
    expect(buttonActive.value).toBe(true);

    options.open.value = false;
    options.selectMode.value = true;
    expect(buttonActive.value).toBe(true);
  });

  it("should compute sessionListTitle correctly", () => {
    const options = {
      position: ref("bottom-right"),
      theme: ref("light"),
      open: ref(false),
      selectMode: ref(false),
      iframeSrc: ref(""),
      sessionListCollapsed: ref(true),
      onToggle: vi.fn(),
      onClose: vi.fn(),
      onToggleSessionList: vi.fn(),
      onEmptyAction: vi.fn(),
    };

    const { sessionListTitle } = useWidget(options);
    expect(sessionListTitle.value).toBe("展开会话列表");

    options.sessionListCollapsed.value = false;
    expect(sessionListTitle.value).toBe("折叠会话列表");
  });

  it("should trigger callbacks correctly", () => {
    const options = {
      position: ref("bottom-right"),
      theme: ref("light"),
      open: ref(false),
      selectMode: ref(false),
      iframeSrc: ref(""),
      sessionListCollapsed: ref(true),
      onToggle: vi.fn(),
      onClose: vi.fn(),
      onToggleSessionList: vi.fn(),
      onEmptyAction: vi.fn(),
    };

    const { handleToggle, handleClose, handleToggleSessionList, handleEmptyAction } =
      useWidget(options);

    handleToggle();
    expect(options.onToggle).toHaveBeenCalledWith(true);

    options.open.value = true;
    handleToggle();
    expect(options.onToggle).toHaveBeenCalledWith(false);

    handleClose();
    expect(options.onClose).toHaveBeenCalled();

    handleToggleSessionList();
    expect(options.onToggleSessionList).toHaveBeenCalledWith(false);

    options.sessionListCollapsed.value = false;
    handleToggleSessionList();
    expect(options.onToggleSessionList).toHaveBeenCalledWith(true);

    handleEmptyAction();
    expect(options.onEmptyAction).toHaveBeenCalled();
  });
});
