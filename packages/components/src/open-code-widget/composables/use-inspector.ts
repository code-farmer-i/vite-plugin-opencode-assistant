/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { ref, watch, onMounted, onUnmounted, type Ref } from "vue";
import { truncate } from "@vite-plugin-opencode-assistant/shared";
import getCssSelector from "css-selector-generator";
import type { OpenCodeSelectedElement } from "../src/types";

interface VueInspector {
  getTargetNode: (e: MouseEvent) => {
    targetNode: Element | null;
    params: { file?: string; line?: number; column?: number } | null;
  };
  handleClick: (e: MouseEvent) => void;
  enable: () => void;
  disable: () => void;
  __opencode_hooked?: boolean;
}

declare global {
  interface Window {
    __VUE_INSPECTOR__?: VueInspector;
  }
}

interface UseInspectorOptions {
  selectMode: Ref<boolean>;
  onAddSelectedNode: (element: OpenCodeSelectedElement) => void;
  onExitSelectMode: () => void;
}

function getDirectText(element: Element): string {
  let text = "";
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || "";
    }
  }
  return text.trim();
}

function getElementDescription(element: Element): string {
  try {
    const selector = getCssSelector(element, {
      selectors: ["id", "class", "tag", "attribute", "nthchild"],
      combineWithinSelector: true,
      combineBetweenSelectors: true,
      maxCombinations: 100,
      maxCandidates: 100,
    });
    return selector;
  } catch {
    const tag = element.tagName.toLowerCase();
    const parts = [tag];

    const id = element.id;
    if (id) parts.push(`#${id}`);

    if (typeof element.className === "string") {
      const className = element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      if (className) parts.push(`.${className}`);
    }

    const name = element.getAttribute("name");
    if (name) parts.push(`[name="${name}"]`);

    const placeholder = element.getAttribute("placeholder");
    if (placeholder) parts.push(`[placeholder="${placeholder.substring(0, 20)}"]`);

    const src = element.getAttribute("src");
    if (src) parts.push(`[src]`);

    const href = element.getAttribute("href");
    if (href && href !== "#") parts.push(`[href]`);

    return parts.join("");
  }
}

interface FileInfo {
  file: string | null;
  line: number | null;
  column: number | null;
}

function findFileInfo(element: Element, inspector: VueInspector): FileInfo {
  let current: Element | null = element;

  while (current) {
    const fakeEvent = {
      clientX: 0,
      clientY: 0,
      target: current,
      currentTarget: current,
    } as unknown as MouseEvent;

    const { params } = inspector.getTargetNode(fakeEvent);

    if (params && params.file) {
      return {
        file: params.file,
        line: params.line ?? null,
        column: params.column ?? null,
      };
    }

    current = current.parentElement;
  }

  return { file: null, line: null, column: null };
}

/**
 * 获取鼠标位置下最精确的 DOM 元素（在指定边界内）
 * 使用 document.elementsFromPoint 获取所有层叠元素，找到最深层且在边界内的元素
 */
function getPreciseElementAtPoint(x: number, y: number, boundary: Element | null): Element | null {
  const highlight = document.querySelector(".opencode-element-highlight");
  const tooltip = document.querySelector(".opencode-element-tooltip");
  const highlightDisplay = highlight?.getAttribute("style")?.includes("display: block")
    ? "block"
    : "none";
  const tooltipDisplay = tooltip?.getAttribute("style")?.includes("display: block")
    ? "block"
    : "none";

  if (highlight) (highlight as HTMLElement).style.display = "none";
  if (tooltip) (tooltip as HTMLElement).style.display = "none";

  let element: Element | null = null;
  try {
    const elements = document.elementsFromPoint(x, y);

    for (const el of elements) {
      if (el.closest("#vue-inspector-container")) continue;
      if (el.closest(".opencode-widget")) continue;
      if (el.hasAttribute("data-v-inspector-ignore")) continue;

      if (boundary) {
        if (boundary.contains(el) || el === boundary) {
          element = el;
          break;
        }
      } else {
        element = el;
        break;
      }
    }
  } finally {
    if (highlight) (highlight as HTMLElement).style.display = highlightDisplay;
    if (tooltip) (tooltip as HTMLElement).style.display = tooltipDisplay;
  }

  return element;
}

export function useInspector(options: UseInspectorOptions) {
  const highlightVisible = ref(false);
  const highlightStyle = ref<Record<string, string>>({
    top: "0px",
    left: "0px",
    width: "0px",
    height: "0px",
  });

  const tooltipVisible = ref(false);
  const tooltipStyle = ref({ top: "0px", left: "0px" });
  const tooltipContent = ref({ description: "", fileInfo: "" });

  const INSPECTOR_CHECK_INTERVAL = 500;
  let inspectorCheckTimer: number | null = null;

  function handleMouseMove(e: MouseEvent) {
    if (!options.selectMode.value) return;

    const inspector = window.__VUE_INSPECTOR__;

    let elementToHighlight: Element | null = null;
    let fileInfo: FileInfo = { file: null, line: null, column: null };

    if (inspector) {
      const { targetNode, params } = inspector.getTargetNode(e);

      if (targetNode) {
        const preciseElement = getPreciseElementAtPoint(e.clientX, e.clientY, targetNode);
        elementToHighlight = preciseElement || targetNode;

        if (params && params.file) {
          fileInfo = {
            file: params.file,
            line: params.line ?? null,
            column: params.column ?? null,
          };
        } else if (elementToHighlight) {
          fileInfo = findFileInfo(elementToHighlight, inspector);
        }
      }
    }

    if (!elementToHighlight) {
      elementToHighlight = getPreciseElementAtPoint(e.clientX, e.clientY, null);
    }

    if (elementToHighlight) {
      const rect = elementToHighlight.getBoundingClientRect();

      const widget = document.querySelector(".opencode-widget");
      let primary = "#3b82f6";
      let primaryBg = "rgba(59, 130, 246, 0.1)";
      if (widget) {
        const style = getComputedStyle(widget);
        primary = style.getPropertyValue("--oc-primary").trim() || primary;
        primaryBg = style.getPropertyValue("--oc-primary-bg").trim() || primaryBg;
      }

      highlightVisible.value = true;
      highlightStyle.value = {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        border: `2px solid ${primary}`,
        background: primaryBg,
      };

      const description = getElementDescription(elementToHighlight);
      const fileName = fileInfo.file ? fileInfo.file.split("/").pop() : "";
      let lineInfo = "";
      if (fileInfo.line) {
        lineInfo = `:${fileInfo.line}`;
        if (fileInfo.column) {
          lineInfo += `:${fileInfo.column}`;
        }
      }

      tooltipContent.value = {
        description,
        fileInfo: fileName ? `${fileName}${lineInfo}` : "",
      };
      tooltipVisible.value = true;

      const tooltipHeight = 50;
      const tooltipWidth = 200;

      let tooltipTop = rect.top - tooltipHeight - 8;
      let tooltipLeft = rect.left;

      if (tooltipTop < 10) {
        tooltipTop = rect.bottom + 8;
      }
      if (tooltipLeft + tooltipWidth > window.innerWidth - 10) {
        tooltipLeft = window.innerWidth - tooltipWidth - 10;
      }

      tooltipStyle.value = {
        top: `${tooltipTop}px`,
        left: `${tooltipLeft}px`,
      };
    } else {
      highlightVisible.value = false;
      tooltipVisible.value = false;
    }
  }

  function setupInspectorHook() {
    const inspector = window.__VUE_INSPECTOR__;
    if (!inspector || inspector.__opencode_hooked) return;

    const originalHandleClick = inspector.handleClick.bind(inspector);

    inspector.handleClick = function (e: MouseEvent) {
      if (options.selectMode.value) {
        let elementToSelect: Element | null = null;
        let fileInfo: FileInfo = { file: null, line: null, column: null };

        const { targetNode, params } = inspector.getTargetNode(e);

        if (targetNode) {
          const preciseElement = getPreciseElementAtPoint(e.clientX, e.clientY, targetNode);
          elementToSelect = preciseElement || targetNode;

          if (params && params.file) {
            fileInfo = {
              file: params.file,
              line: params.line ?? null,
              column: params.column ?? null,
            };
          } else if (elementToSelect) {
            fileInfo = findFileInfo(elementToSelect, inspector);
          }
        }

        if (!elementToSelect) {
          elementToSelect = getPreciseElementAtPoint(e.clientX, e.clientY, null);
        }

        if (elementToSelect) {
          const innerText = getDirectText(elementToSelect);
          const description = getElementDescription(elementToSelect);

          const elementInfo: OpenCodeSelectedElement = {
            filePath: fileInfo.file,
            line: fileInfo.line,
            column: fileInfo.column,
            innerText: truncate(innerText, 200),
            description,
          };

          options.onAddSelectedNode(elementInfo);
        }
        return;
      }

      return originalHandleClick.call(inspector, e);
    };

    inspector.__opencode_hooked = true;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && options.selectMode.value) {
      e.preventDefault();
      e.stopPropagation();
      options.onExitSelectMode();
    }
  }

  watch(options.selectMode, (newVal) => {
    const inspector = window.__VUE_INSPECTOR__;
    if (newVal) {
      if (inspector) {
        inspector.enable();
      }
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("keydown", handleKeydown, true);
    } else {
      if (inspector) {
        inspector.disable();
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("keydown", handleKeydown, true);
      highlightVisible.value = false;
      tooltipVisible.value = false;
    }
  });

  onMounted(() => {
    if (window.__VUE_INSPECTOR__) {
      setupInspectorHook();
    } else {
      inspectorCheckTimer = window.setInterval(() => {
        if (window.__VUE_INSPECTOR__) {
          setupInspectorHook();
          if (inspectorCheckTimer) {
            window.clearInterval(inspectorCheckTimer);
            inspectorCheckTimer = null;
          }
        }
      }, INSPECTOR_CHECK_INTERVAL);
    }
  });

  onUnmounted(() => {
    if (inspectorCheckTimer) {
      window.clearInterval(inspectorCheckTimer);
    }
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("keydown", handleKeydown, true);
  });

  return {
    highlightVisible,
    highlightStyle,
    tooltipVisible,
    tooltipStyle,
    tooltipContent,
  };
}
