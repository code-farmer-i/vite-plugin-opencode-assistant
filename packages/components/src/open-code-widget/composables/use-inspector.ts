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

function throttle<T extends (...args: never[]) => void>(fn: T, delay: number): T {
  let lastCall = 0;
  let rafId: number | null = null;

  return ((...args: never[]) => {
    const now = performance.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        lastCall = performance.now();
        fn(...args);
      });
    }
  }) as T;
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

const DYNAMIC_ID_PATTERN =
  /^(?:el-|:r[0-9]+:|radix-|uid-|ts-|uuid-|id-[a-f0-9]{4,}|.*[0-9]{4,}.*|.*-[a-f0-9]{6,}$)/i;

const STATE_CLASS_PATTERN =
  /^(?:hover|active|focus|focus-visible|focus-within|disabled|enabled|checked|selected|open|closed|loading|error|success|warning|hidden|visible|show|hide|current|expanded|collapsed|pressed|dragging|droppable|sortable|placeholder|transition|enter|leave|appear|move)$/i;

const STATE_CLASS_PREFIX_PATTERN =
  /^(?:is-|has-|was-|are-|can-|should-|will-|did-|does-|on-|off-|in-|out-|at-|to-|from-)/i;

function isDynamicId(id: string): boolean {
  if (!id) return false;

  if (DYNAMIC_ID_PATTERN.test(id)) {
    return true;
  }

  const digitCount = (id.match(/\d/g) || []).length;
  const letterCount = (id.match(/[a-zA-Z]/g) || []).length;
  if (digitCount > letterCount && digitCount >= 3) {
    return true;
  }

  const dashParts = id.split("-");
  if (dashParts.length >= 3) {
    const lastPart = dashParts[dashParts.length - 1];
    if (/^\d+$/.test(lastPart) || /^[a-f0-9]{4,}$/i.test(lastPart)) {
      return true;
    }
  }

  return false;
}

function isStateClass(className: string): boolean {
  if (!className) return false;

  if (STATE_CLASS_PATTERN.test(className)) {
    return true;
  }

  if (STATE_CLASS_PREFIX_PATTERN.test(className)) {
    return true;
  }

  if (
    className.includes("-active") ||
    className.includes("-hover") ||
    className.includes("-focus")
  ) {
    return true;
  }

  if (/^(?:router-link|nuxt-link)/.test(className)) {
    return true;
  }

  return false;
}

function filterStateClasses(classes: string[]): string[] {
  return classes.filter((cls) => !isStateClass(cls));
}

function getElementDescription(element: Element): string {
  try {
    const selector = getCssSelector(element, {
      selectors: ["id", "class", "tag", "nthchild"],
      combineWithinSelector: true,
      combineBetweenSelectors: true,
      maxCombinations: 100,
      maxCandidates: 100,
      blacklist: [
        (selectorValue: string) => {
          const idMatch = selectorValue.match(/^#(.+)$/);
          if (idMatch) {
            return isDynamicId(idMatch[1]);
          }
          const classMatch = selectorValue.match(/^\.([a-zA-Z_-][\w-]*)$/);
          if (classMatch) {
            return isStateClass(classMatch[1]);
          }
          return false;
        },
      ],
    });
    return selector;
  } catch {
    const tag = element.tagName.toLowerCase();
    const parts = [tag];

    const id = element.id;
    if (id && !isDynamicId(id)) parts.push(`#${id}`);

    const className = element.className;
    if (typeof className === "string") {
      const classes = filterStateClasses(className.trim().split(/\s+/).filter(Boolean)).slice(0, 2);
      if (classes.length > 0) parts.push(`.${classes.join(".")}`);
    } else {
      const svgClass = (className as SVGAnimatedString).baseVal;
      if (svgClass) {
        const classes = filterStateClasses(svgClass.trim().split(/\s+/).filter(Boolean)).slice(
          0,
          2,
        );
        if (classes.length > 0) parts.push(`.${classes.join(".")}`);
      }
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

interface Vue3ComponentInstance {
  type?: {
    __file?: string;
    name?: string;
  };
  parent?: Vue3ComponentInstance;
  vnode?: {
    type?: {
      __file?: string;
      name?: string;
    };
  };
}

interface Vue2ComponentInstance {
  $options?: {
    __file?: string;
    name?: string;
    _componentTag?: string;
  };
  $parent?: Vue2ComponentInstance;
}

function getFileInfoFromAttributes(element: Element): FileInfo | null {
  const file = element.getAttribute("data-v-inspector-file");
  if (file) {
    const line = element.getAttribute("data-v-inspector-line");
    const column = element.getAttribute("data-v-inspector-column");
    return {
      file,
      line: line ? parseInt(line, 10) : null,
      column: column ? parseInt(column, 10) : null,
    };
  }
  return null;
}

function getFileInfoFromVueInstance(element: Element): FileInfo | null {
  const vue3Instance = (element as Element & { __vueParentComponent?: Vue3ComponentInstance })
    .__vueParentComponent;
  if (vue3Instance) {
    let current: Vue3ComponentInstance | undefined = vue3Instance;
    while (current) {
      const file = current.type?.__file || current.vnode?.type?.__file;
      if (file) {
        return { file, line: null, column: null };
      }
      current = current.parent;
    }
  }

  const vue2Instance = (element as Element & { __vue__?: Vue2ComponentInstance }).__vue__;
  if (vue2Instance) {
    let current: Vue2ComponentInstance | undefined = vue2Instance;
    while (current) {
      const file = current.$options?.__file;
      if (file) {
        return { file, line: null, column: null };
      }
      current = current.$parent;
    }
  }

  return null;
}

function findFileInfo(element: Element, inspector: VueInspector): FileInfo {
  let current: Element | null = element;
  let fallbackFileInfo: FileInfo | null = null;

  while (current) {
    const attrInfo = getFileInfoFromAttributes(current);
    if (attrInfo && attrInfo.line !== null) {
      return attrInfo;
    }
    if (attrInfo && !fallbackFileInfo) {
      fallbackFileInfo = attrInfo;
    }

    const fakeEvent = {
      clientX: 0,
      clientY: 0,
      target: current,
      currentTarget: current,
    } as unknown as MouseEvent;

    const { params } = inspector.getTargetNode(fakeEvent);

    if (params && params.file) {
      const info: FileInfo = {
        file: params.file,
        line: params.line ?? null,
        column: params.column ?? null,
      };
      if (info.line !== null) {
        return info;
      }
      if (!fallbackFileInfo) {
        fallbackFileInfo = info;
      }
    }

    const vueInfo = getFileInfoFromVueInstance(current);
    if (vueInfo && !fallbackFileInfo) {
      fallbackFileInfo = vueInfo;
    }

    current = current.parentElement;
  }

  return fallbackFileInfo || { file: null, line: null, column: null };
}

/**
 * 获取鼠标位置下最精确的 DOM 元素（在指定边界内）
 * 使用 document.elementsFromPoint 获取所有层叠元素，找到最深层且在边界内的元素
 */
function getPreciseElementAtPoint(x: number, y: number, boundary: Element | null): Element | null {
  const elements = document.elementsFromPoint(x, y);

  for (const el of elements) {
    if (el.closest("#vue-inspector-container")) continue;
    if (el.closest(".opencode-widget")) continue;
    if (el.hasAttribute("data-v-inspector-ignore")) continue;

    if (boundary) {
      if (boundary.contains(el) || el === boundary) {
        return el;
      }
    } else {
      return el;
    }
  }

  return null;
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
  let currentHighlightElement: Element | null = null;
  let currentPrimary = "#3b82f6";
  let currentPrimaryBg = "rgba(59, 130, 246, 0.1)";
  let currentDescription = "";
  let currentFileInfoText = "";

  function handleMouseMoveCore(e: MouseEvent) {
    if (!options.selectMode.value) return;

    const inspector = window.__VUE_INSPECTOR__;

    const highlight = document.querySelector(".opencode-element-highlight");
    const tooltip = document.querySelector(".opencode-element-tooltip");

    if (highlight) (highlight as HTMLElement).style.pointerEvents = "none";
    if (tooltip) (tooltip as HTMLElement).style.pointerEvents = "none";

    let elementToHighlight: Element | null = null;
    let fileInfo: FileInfo = { file: null, line: null, column: null };

    try {
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
          } else {
            fileInfo = findFileInfo(targetNode, inspector);
          }
        }
      }

      if (!elementToHighlight) {
        elementToHighlight = getPreciseElementAtPoint(e.clientX, e.clientY, null);
      }

      if (elementToHighlight && !fileInfo.file) {
        fileInfo = getFileInfoFromVueInstance(elementToHighlight) || fileInfo;
      }
    } finally {
      if (highlight) (highlight as HTMLElement).style.pointerEvents = "";
      if (tooltip) (tooltip as HTMLElement).style.pointerEvents = "";
    }

    if (elementToHighlight) {
      const elementChanged = currentHighlightElement !== elementToHighlight;

      const fileName = fileInfo.file ? fileInfo.file.split("/").pop() : "";
      let lineInfo = "";
      if (fileInfo.line) {
        lineInfo = `:${fileInfo.line}`;
        if (fileInfo.column) {
          lineInfo += `:${fileInfo.column}`;
        }
      }
      const newFileInfoText = fileName ? `${fileName}${lineInfo}` : "";
      const fileInfoChanged = currentFileInfoText !== newFileInfoText;

      if (elementChanged || fileInfoChanged) {
        currentHighlightElement = elementToHighlight;

        const widget = document.querySelector(".opencode-widget");
        if (widget) {
          const style = getComputedStyle(widget);
          currentPrimary = style.getPropertyValue("--oc-primary").trim() || currentPrimary;
          currentPrimaryBg = style.getPropertyValue("--oc-primary-bg").trim() || currentPrimaryBg;
        }

        currentDescription = getElementDescription(elementToHighlight);
        currentFileInfoText = newFileInfoText;

        tooltipContent.value = {
          description: currentDescription,
          fileInfo: currentFileInfoText,
        };
      }

      const rect = elementToHighlight.getBoundingClientRect();

      const newTop = `${rect.top}px`;
      const newLeft = `${rect.left}px`;
      const newWidth = `${rect.width}px`;
      const newHeight = `${rect.height}px`;

      if (
        highlightStyle.value.top !== newTop ||
        highlightStyle.value.left !== newLeft ||
        highlightStyle.value.width !== newWidth ||
        highlightStyle.value.height !== newHeight
      ) {
        highlightStyle.value = {
          top: newTop,
          left: newLeft,
          width: newWidth,
          height: newHeight,
          border: `2px solid ${currentPrimary}`,
          background: currentPrimaryBg,
        };
      }

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

      const newTooltipTop = `${tooltipTop}px`;
      const newTooltipLeft = `${tooltipLeft}px`;

      if (tooltipStyle.value.top !== newTooltipTop || tooltipStyle.value.left !== newTooltipLeft) {
        tooltipStyle.value = {
          top: newTooltipTop,
          left: newTooltipLeft,
        };
      }

      if (!highlightVisible.value) {
        highlightVisible.value = true;
      }
      if (!tooltipVisible.value) {
        tooltipVisible.value = true;
      }
    } else {
      currentHighlightElement = null;
      currentDescription = "";
      currentFileInfoText = "";
      if (highlightVisible.value) {
        highlightVisible.value = false;
      }
      if (tooltipVisible.value) {
        tooltipVisible.value = false;
      }
    }
  }

  const handleMouseMove = throttle(handleMouseMoveCore, 16);

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

        if (elementToSelect && !fileInfo.file) {
          fileInfo = getFileInfoFromVueInstance(elementToSelect) || fileInfo;
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
      currentHighlightElement = null;
      currentDescription = "";
      currentFileInfoText = "";
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
