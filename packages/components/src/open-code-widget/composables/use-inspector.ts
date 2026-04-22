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

interface FileInfo {
  file: string | null;
  line: number | null;
  column: number | null;
}

// 需要忽略的选择器列表
const IGNORE_SELECTORS = [
  "#vue-inspector-container",
  ".opencode-widget",
  ".opencode-element-highlight",
  ".opencode-element-tooltip",
  ".opencode-select-mode-hint",
  ".floating-bubble",
];

const IGNORE_ATTRIBUTE = "data-v-inspector-ignore";

const KEY_PROPS_DATA = "__v_inspector";
const KEY_DATA = "data-v-inspector";

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

function getElementDescription(element: Element): string {
  return getCssSelector(element, {
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

function shouldIgnoreElement(el: Element): boolean {
  if (el.hasAttribute(IGNORE_ATTRIBUTE)) return true;
  for (const selector of IGNORE_SELECTORS) {
    if (el.closest(selector)) return true;
  }
  return false;
}

function getDataFromElement(el: Element): string | undefined {
  const vnodeData = (el as unknown as { __vnode?: { props?: Record<string, unknown> } }).__vnode
    ?.props?.[KEY_PROPS_DATA];
  if (vnodeData) return vnodeData as string;
  const attr = el.getAttribute(KEY_DATA);
  return attr ?? undefined;
}

function findInspectorFileInfo(element: Element): FileInfo | null {
  let current: Element | null = element;
  while (current) {
    const data = getDataFromElement(current);
    if (data) {
      const splitRE = /(.+):([\d]+):([\d]+)$/;
      const match = data.match(splitRE);
      if (match) {
        return {
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
        };
      }
    }
    current = current.parentElement;
  }
  return null;
}

function mergeFileInfo(inspectorFileInfo: FileInfo | null, vueFileInfo: FileInfo | null): FileInfo {
  if (!inspectorFileInfo?.file && !vueFileInfo?.file) {
    return { file: null, line: null, column: null };
  }

  const isNodeModules = (path: string) => path.includes("node_modules");

  if (inspectorFileInfo?.file && vueFileInfo?.file) {
    if (!isNodeModules(inspectorFileInfo.file)) {
      return inspectorFileInfo;
    } else if (!isNodeModules(vueFileInfo.file)) {
      return vueFileInfo;
    } else {
      return inspectorFileInfo;
    }
  } else if (inspectorFileInfo?.file) {
    return inspectorFileInfo;
  } else {
    return vueFileInfo!;
  }
}

function getTargetElement(e: MouseEvent): Element | null {
  if (!e.target || !(e.target instanceof Element)) return null;
  const el = e.target as Element;
  if (shouldIgnoreElement(el)) return null;
  return el;
}

function getFileInfo(e: MouseEvent, element: Element | null): FileInfo {
  const inspector = window.__VUE_INSPECTOR__;

  let inspectorFileInfo: FileInfo | null = null;

  if (inspector) {
    const { targetNode, params } = inspector.getTargetNode(e);
    if (targetNode && params && params.file) {
      inspectorFileInfo = {
        file: params.file,
        line: params.line ?? null,
        column: params.column ?? null,
      };
    }
  }

  if (element && !inspectorFileInfo) {
    inspectorFileInfo = findInspectorFileInfo(element);
  }

  const vueFileInfo = element ? getFileInfoFromVueInstance(element) : null;

  return mergeFileInfo(inspectorFileInfo, vueFileInfo);
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
  let currentPrimary = "#3b82f6";
  let currentPrimaryBg = "rgba(59, 130, 246, 0.1)";

  function setPointerEventsNone(elements: (Element | null)[]) {
    elements.forEach((el) => {
      if (el) (el as HTMLElement).style.pointerEvents = "none";
    });
  }

  function setPointerEventsAuto(elements: (Element | null)[]) {
    elements.forEach((el) => {
      if (el) (el as HTMLElement).style.pointerEvents = "";
    });
  }

  function handleMouseMoveCore(e: MouseEvent) {
    if (!options.selectMode.value) return;

    const highlight = document.querySelector(".opencode-element-highlight");
    const tooltip = document.querySelector(".opencode-element-tooltip");
    const selectHint = document.querySelector(".opencode-select-mode-hint");
    const floatingBubble = document.querySelector(".floating-bubble");

    const uiElements = [highlight, tooltip, selectHint, floatingBubble];
    setPointerEventsNone(uiElements);

    const elementToHighlight = getTargetElement(e);
    const fileInfo = getFileInfo(e, elementToHighlight);

    setPointerEventsAuto(uiElements);

    if (elementToHighlight) {
      const widget = document.querySelector(".opencode-widget");
      if (widget) {
        const style = getComputedStyle(widget);
        currentPrimary = style.getPropertyValue("--oc-primary").trim() || currentPrimary;
        currentPrimaryBg = style.getPropertyValue("--oc-primary-bg").trim() || currentPrimaryBg;
      }

      const description = getElementDescription(elementToHighlight);
      const fileName = fileInfo.file ? fileInfo.file.split("/").pop() : "";
      let lineInfo = "";
      if (fileInfo.line) {
        lineInfo = `:${fileInfo.line}`;
        if (fileInfo.column) {
          lineInfo += `:${fileInfo.column}`;
        }
      }
      const fileInfoText = fileName ? `${fileName}${lineInfo}` : "";

      tooltipContent.value = {
        description,
        fileInfo: fileInfoText,
      };

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
      const margin = 10;

      let tooltipTop = rect.top - tooltipHeight - 8;
      let tooltipLeft = rect.left;

      if (tooltipTop < margin) {
        tooltipTop = rect.bottom + 8;
      }

      if (tooltipTop + tooltipHeight > window.innerHeight - margin) {
        tooltipTop = Math.max(margin, rect.top - tooltipHeight - 8);
      }

      if (tooltipLeft < margin) {
        tooltipLeft = margin;
      }
      if (tooltipLeft + tooltipWidth > window.innerWidth - margin) {
        tooltipLeft = window.innerWidth - tooltipWidth - margin;
      }

      const newTooltipTop = `${tooltipTop}px`;
      const newTooltipLeft = `${tooltipLeft}px`;

      if (tooltipStyle.value.top !== newTooltipTop || tooltipStyle.value.left !== newTooltipLeft) {
        tooltipStyle.value = {
          top: newTooltipTop,
          left: newTooltipLeft,
        };
      }

      highlightVisible.value = true;
      tooltipVisible.value = true;
    } else {
      highlightVisible.value = false;
      tooltipVisible.value = false;
    }
  }

  const handleMouseMove = handleMouseMoveCore;

  function setupInspectorHook() {
    const inspector = window.__VUE_INSPECTOR__;
    if (!inspector || inspector.__opencode_hooked) return;

    const originalHandleClick = inspector.handleClick.bind(inspector);

    inspector.handleClick = function (e: MouseEvent) {
      if (options.selectMode.value) {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (targetEl && targetEl.closest(".opencode-widget")) {
          return originalHandleClick.call(inspector, e);
        }

        e.preventDefault();
        e.stopPropagation();

        const elementToSelect = getTargetElement(e);
        const fileInfo = getFileInfo(e, elementToSelect);

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
