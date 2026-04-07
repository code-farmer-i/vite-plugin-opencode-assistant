/**
 * @fileoverview OpenCode 挂件客户端脚本
 * @description 用于在浏览器中显示 OpenCode AI 助手挂件
 */

(function () {
  "use strict";

  /** @type {string} 初始化标记 */
  const INIT_MARKER = "__OPENCODE_INITIALIZED__";

  /** @type {string} 选中元素存储键 */
  const SELECTED_ELEMENTS_KEY = "__opencode_selected_elements__";

  /** @type {number} 服务器同步间隔（毫秒） */
  const SERVER_SYNC_INTERVAL = 2000;

  /** @type {number} 检查 Vue Inspector 间隔（毫秒） */
  const INSPECTOR_CHECK_INTERVAL = 500;

  /** @type {number} 自动打开延迟（毫秒） */
  const AUTO_OPEN_DELAY = 1000;

  /** @type {number} 通知显示时间（毫秒） */
  const NOTIFICATION_DURATION = 3000;

  /**
   * @typedef {Object} HotkeyConfig
   * @property {boolean} ctrl - 是否需要 Ctrl/Meta 键
   * @property {boolean} shift - 是否需要 Shift 键
   * @property {boolean} alt - 是否需要 Alt 键
   * @property {string} key - 主键
   */

  /**
   * @typedef {Object} SelectedElement
   * @property {string|null} filePath - 文件路径
   * @property {number|null} line - 行号
   * @property {number|null} column - 列号
   * @property {string} innerText - 元素内部文本
   * @property {string} description - 元素描述（标签名+选择器）
   */

  /**
   * @typedef {Object} WidgetConfig
   * @property {string} webUrl - Web 服务 URL
   * @property {string} position - 挂件位置
   * @property {string} theme - 主题模式
   * @property {boolean} open - 是否自动打开
   * @property {string} sessionUrl - 会话 URL
   * @property {boolean} lazy - 是否懒加载
   * @property {string} hotkey - 快捷键配置
   */

  /**
   * 初始化 OpenCode 挂件
   * @param {WidgetConfig} config - 挂件配置
   */
  function initOpenCodeWidget(config) {
    if (window[INIT_MARKER]) return;
    window[INIT_MARKER] = true;

    const {
      webUrl,
      position,
      theme,
      open,
      sessionUrl: initialSessionUrl,
      lazy,
      hotkey,
      cwd,
    } = config;

    /** @type {string|undefined} 会话 URL */
    let sessionUrl = initialSessionUrl;

    /** @type {string|null} 当前会话 ID */
    let currentSessionId = null;

    /**
     * 从 URL 中提取会话 ID
     */
    function extractSessionId(url) {
      if (!url) return null;
      const match = url.match(/\/session\/([^/?]+)/);
      return match ? match[1] : null;
    }

    // 从初始 URL 中提取会话 ID
    currentSessionId = extractSessionId(sessionUrl);

    /** @type {string} 当前页面 URL */
    let currentPageUrl = "";

    /** @type {string} 当前页面标题 */
    let currentPageTitle = "";

    /** @type {boolean} 服务是否已启动 */
    let servicesStarted = !lazy;

    /** @type {boolean} 挂件是否打开 */
    let isOpen = false;

    /**
     * 解析快捷键字符串
     * @param {string} hotkeyStr - 快捷键字符串，如 'ctrl+k'
     * @returns {HotkeyConfig} 快捷键配置
     */
    function parseHotkey(hotkeyStr) {
      if (!hotkeyStr) return { ctrl: true, shift: false, alt: false, key: "k" };

      const parts = hotkeyStr.toLowerCase().split("+");
      const key = parts.pop();

      return {
        ctrl:
          parts.includes("ctrl") ||
          parts.includes("cmd") ||
          parts.includes("meta"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        key: key || "k",
      };
    }

    /** @type {HotkeyConfig} 主快捷键配置 */
    const mainHotkey = parseHotkey(hotkey);

    /** @type {HotkeyConfig} 选择模式快捷键配置 */
    const selectHotkey = parseHotkey("ctrl+p");

    /**
     * 检查键盘事件是否匹配快捷键
     * @param {KeyboardEvent} e - 键盘事件
     * @param {HotkeyConfig} hotkeyConfig - 快捷键配置
     * @returns {boolean} 是否匹配
     */
    function matchHotkey(e, hotkeyConfig) {
      const ctrlMatch = hotkeyConfig.ctrl
        ? e.ctrlKey || e.metaKey
        : !(e.ctrlKey || e.metaKey);
      const shiftMatch = hotkeyConfig.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = hotkeyConfig.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === hotkeyConfig.key.toLowerCase();

      return ctrlMatch && shiftMatch && altMatch && keyMatch;
    }

    /**
     * 从 sessionStorage 加载选中的元素
     * @returns {SelectedElement[]} 选中的元素列表
     */
    function loadSelectedElements() {
      try {
        const stored = sessionStorage.getItem(SELECTED_ELEMENTS_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        // 忽略错误
      }
      return [];
    }

    /**
     * 保存选中的元素到 sessionStorage
     * @param {SelectedElement[]} elements - 选中的元素列表
     */
    function saveSelectedElements(elements) {
      try {
        sessionStorage.setItem(SELECTED_ELEMENTS_KEY, JSON.stringify(elements));
      } catch (e) {
        // 忽略错误
      }
    }

    /** @type {SelectedElement[]} 选中的元素列表 */
    let selectedElements = loadSelectedElements();

    /**
     * 确保服务已启动
     * @returns {Promise<boolean>} 是否成功启动
     */
    async function ensureServicesStarted() {
      if (servicesStarted) return true;

      try {
        const res = await fetch("/__opencode_start__");
        const data = await res.json();
        if (data.success) {
          servicesStarted = true;
          if (data.sessionUrl) {
            sessionUrl = data.sessionUrl;
            currentSessionId = extractSessionId(sessionUrl);
            if (iframe) iframe.src = sessionUrl;
          } else {
            if (iframe) iframe.src = "about:blank";
            showLoading();
          }
          return true;
        }
      } catch (e) {
        console.error("[OpenCode Widget] Failed to start services:", e);
      }
      return false;
    }

    /**
     * 更新页面上下文
     * @param {boolean} [force=false] - 是否强制更新
     */
    function updateContext(force = false) {
      if (!servicesStarted) return;

      const newUrl = window.location.href;
      const newTitle = document.title;

      if (force || newUrl !== currentPageUrl || newTitle !== currentPageTitle) {
        currentPageUrl = newUrl;
        currentPageTitle = newTitle;

        fetch("/__opencode_context__", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: newUrl,
            title: newTitle,
            selectedElements,
          }),
        }).catch(() => {});
      }
    }

    // 监听路由变化
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(updateContext, 0);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      setTimeout(updateContext, 0);
    };

    window.addEventListener("popstate", () => setTimeout(updateContext, 0));
    window.addEventListener("hashchange", () => setTimeout(updateContext, 0));

    // 监听标题变化
    const titleObserver = new MutationObserver(() => {
      if (document.title !== currentPageTitle) {
        updateContext();
      }
    });

    if (document.head) {
      titleObserver.observe(document.head, { childList: true, subtree: true });
    }

    /** @type {EventSource|null} SSE 连接实例 */
    let sseConnection = null;

    if (servicesStarted) {
      updateContext(true);
      setupSSEConnection();
    }

    // 创建样式
    const style = document.createElement("style");
    style.textContent = buildWidgetStyles();
    document.head.appendChild(style);

    // 创建容器
    const container = document.createElement("div");
    container.className = `opencode-widget ${position}`;

    // 创建按钮
    const button = document.createElement("button");
    button.className = "opencode-button";
    button.innerHTML = `
      <svg t="1775402599580" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns=" http://www.w3.org/2000/svg " p-id="5390" xmlns:xlink=" http://www.w3.org/1999/xlink " width="100%" height="100%"><path d="M512 981.33H85.34c-15.85 0-30.38-8.77-37.77-22.81a42.624 42.624 0 0 1 2.6-44.02L135 791.08C75.25 710.5 42.67 612.6 42.67 512 42.67 253.21 253.21 42.67 512 42.67S981.34 253.21 981.34 512 770.8 981.33 512 981.33zM166.44 896H512c211.73 0 384-172.27 384-384S723.73 128 512 128 128 300.27 128 512c0 91.29 32.83 179.9 92.46 249.46 12.58 14.69 13.73 36 2.77 51.94L166.44 896z" fill="white" p-id="5391"></path><path d="M384 448m-64 0a64 64 0 1 0 128 0 64 64 0 1 0 -128 0Z" fill="white" p-id="5392"></path><path d="M640 448m-64 0a64 64 0 1 0 128 0 64 64 0 1 0 -128 0Z" fill="white" p-id="5393"></path></svg>
    `;
    button.setAttribute("aria-label", "打开 AI 助手");
    button.title = `AI 助手 (${hotkey || "Ctrl+K"})`;

    // 创建聊天面板
    const chat = document.createElement("div");
    chat.className = "opencode-chat";
    chat.setAttribute("role", "dialog");
    chat.setAttribute("aria-modal", "true");
    chat.setAttribute("aria-label", "AI 助手对话窗口");

    // 创建面板头部操作栏
    const chatHeader = document.createElement("div");
    chatHeader.className = "opencode-chat-header";

    // 左侧操作区
    const headerLeft = document.createElement("div");
    headerLeft.className = "opencode-chat-header-left";

    // 会话列表折叠按钮
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "opencode-header-btn session-toggle";
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"/>
      </svg>
    `;
    toggleBtn.title = "展开会话列表";
    toggleBtn.setAttribute("aria-label", "展开会话列表");
    toggleBtn.setAttribute("aria-expanded", "false");

    // 选择元素按钮
    const selectButton = document.createElement("button");
    selectButton.className = "opencode-header-btn select-btn";
    selectButton.innerHTML = `
      <svg viewBox="0 0 1024 1024" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M512 896a384 384 0 1 0 0-768 384 384 0 0 0 0 768m0 64a448 448 0 1 1 0-896 448 448 0 0 1 0 896"></path><path fill="currentColor" d="M512 96a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V128a32 32 0 0 1 32-32m0 576a32 32 0 0 1 32 32v192a32 32 0 1 1-64 0V704a32 32 0 0 1 32-32M96 512a32 32 0 0 1 32-32h192a32 32 0 0 1 0 64H128a32 32 0 0 1-32-32m576 0a32 32 0 0 1 32-32h192a32 32 0 1 1 0 64H704a32 32 0 0 1-32-32"></path>
      </svg>
    `;
    selectButton.title = "选择页面元素 (Ctrl+P)";
    selectButton.setAttribute("aria-label", "选择页面元素");
    selectButton.setAttribute("aria-pressed", "false");

    headerLeft.appendChild(toggleBtn);
    headerLeft.appendChild(selectButton);

    // 标题
    const headerTitle = document.createElement("span");
    headerTitle.className = "opencode-chat-header-title";
    headerTitle.textContent = "AI 助手";

    // 右侧操作区
    const headerActions = document.createElement("div");
    headerActions.className = "opencode-chat-header-actions";

    // 关闭按钮
    const closeBtn = document.createElement("button");
    closeBtn.className = "opencode-header-btn close";
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    `;
    closeBtn.title = "关闭";
    closeBtn.setAttribute("aria-label", "关闭面板");
    closeBtn.addEventListener("click", () => {
      isOpen = false;
      chat.classList.remove("open");
      button.classList.remove("active");
    });

    headerActions.appendChild(closeBtn);
    chatHeader.appendChild(headerLeft);
    chatHeader.appendChild(headerTitle);
    chatHeader.appendChild(headerActions);

    // 创建会话列表
    const sessionList = document.createElement("div");
    sessionList.className = "opencode-session-list collapsed";

    // 创建会话列表头部
    const sessionListHeader = document.createElement("div");
    sessionListHeader.className = "opencode-session-list-header";
    sessionListHeader.innerHTML = `
      <span id="opencode-session-list-title">会话列表</span>
      <button class="opencode-new-session-btn" title="新建会话" aria-label="新建会话">+</button>
    `;

    // 创建会话列表头部骨架屏
    const sessionHeaderSkeleton = document.createElement("div");
    sessionHeaderSkeleton.className = "opencode-session-header-skeleton";
    sessionHeaderSkeleton.innerHTML = `
      <div class="opencode-skeleton-header-title"></div>
      <div class="opencode-skeleton-header-btn"></div>
    `;

    // 创建会话列表内容
    const sessionListContent = document.createElement("div");
    sessionListContent.className = "opencode-session-list-content";
    sessionListContent.setAttribute("role", "listbox");
    sessionListContent.setAttribute(
      "aria-labelledby",
      "opencode-session-list-title",
    );

    // 创建会话列表内容骨架屏
    const sessionSkeleton = document.createElement("div");
    sessionSkeleton.className = "opencode-session-skeleton";
    sessionSkeleton.innerHTML = `
      <div class="opencode-skeleton-item">
        <div class="opencode-skeleton-title"></div>
        <div class="opencode-skeleton-meta"></div>
      </div>
      <div class="opencode-skeleton-item">
        <div class="opencode-skeleton-title"></div>
        <div class="opencode-skeleton-meta"></div>
      </div>
      <div class="opencode-skeleton-item">
        <div class="opencode-skeleton-title"></div>
        <div class="opencode-skeleton-meta"></div>
      </div>
      <div class="opencode-skeleton-item">
        <div class="opencode-skeleton-title"></div>
        <div class="opencode-skeleton-meta"></div>
      </div>
      <div class="opencode-skeleton-item">
        <div class="opencode-skeleton-title"></div>
        <div class="opencode-skeleton-meta"></div>
      </div>
    `;

    sessionList.appendChild(sessionHeaderSkeleton);
    sessionList.appendChild(sessionListHeader);
    sessionList.appendChild(sessionSkeleton);
    sessionList.appendChild(sessionListContent);

    // 折叠/展开会话列表
    let isSessionListCollapsed = true;
    function toggleSessionList() {
      isSessionListCollapsed = !isSessionListCollapsed;

      if (!isSessionListCollapsed) {
        sessionHeaderSkeleton.classList.add("visible");
        sessionListHeader.style.display = "none";
        sessionSkeleton.classList.add("visible");
        sessionListContent.style.display = "none";
      }

      sessionList.classList.toggle("collapsed", isSessionListCollapsed);
      toggleBtn.title = isSessionListCollapsed
        ? "展开会话列表"
        : "折叠会话列表";
      toggleBtn.setAttribute(
        "aria-label",
        isSessionListCollapsed ? "展开会话列表" : "折叠会话列表",
      );
      toggleBtn.setAttribute("aria-expanded", String(!isSessionListCollapsed));

      if (!isSessionListCollapsed) {
        setTimeout(() => {
          sessionHeaderSkeleton.classList.remove("visible");
          sessionListHeader.style.display = "";
          sessionSkeleton.classList.remove("visible");
          sessionListContent.style.display = "";
        }, 200);
      }
    }
    toggleBtn.addEventListener("click", toggleSessionList);

    // 创建 iframe 容器
    const iframeContainer = document.createElement("div");
    iframeContainer.className = "opencode-iframe-container";

    // 创建加载指示器
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "opencode-loading-overlay";
    loadingOverlay.innerHTML = `
      <div class="opencode-loading-spinner"></div>
      <div class="opencode-loading-text">加载中...</div>
    `;

    // 创建 iframe
    const iframe = document.createElement("iframe");
    iframe.className = "opencode-iframe";
    iframe.src = servicesStarted && sessionUrl ? sessionUrl : "about:blank";
    iframe.allow = "clipboard-write; clipboard-read";
    iframe.referrerPolicy = "origin";

    if (servicesStarted && !sessionUrl) {
      showLoading();
    }

    iframe.onload = function () {
      if (
        servicesStarted &&
        iframe.src !== "about:blank" &&
        iframe.src !== window.location.href
      ) {
        updateContext();
        loadSessions();
      }
      if (iframe.src !== "about:blank" && iframe.src !== window.location.href) {
        hideLoading();
      }
    };

    iframeContainer.appendChild(loadingOverlay);
    iframeContainer.appendChild(iframe);

    // 创建右侧工具栏
    const rightToolbar = document.createElement("div");
    rightToolbar.className = `opencode-right-toolbar${selectedElements.length === 0 ? " collapsed" : ""}`;

    // 创建已选节点标题
    const selectedNodesHeader = document.createElement("div");
    selectedNodesHeader.className = "opencode-selected-nodes-header";
    selectedNodesHeader.innerHTML = `
      <div class="opencode-selected-nodes-title">已选节点</div>
      <div class="opencode-selected-nodes-desc">选中的节点会在对话时一起发送给助手</div>
    `;

    // 创建已选节点容器
    const selectedNodesContainer = document.createElement("div");
    selectedNodesContainer.className = "opencode-selected-nodes";
    selectedNodesContainer.setAttribute("role", "list");
    selectedNodesContainer.setAttribute("aria-label", "已选元素列表");

    // 创建清空按钮
    const clearAllButton = document.createElement("button");
    clearAllButton.className = "opencode-clear-all-btn";
    clearAllButton.setAttribute("aria-label", "清空所有已选节点");
    clearAllButton.innerHTML = "一键清空";

    rightToolbar.appendChild(selectedNodesHeader);
    rightToolbar.appendChild(selectedNodesContainer);
    rightToolbar.appendChild(clearAllButton);

    // 创建选择模式常驻提示（固定到页面顶部）
    const selectModeHint = document.createElement("div");
    selectModeHint.className = "opencode-select-mode-hint";
    selectModeHint.innerHTML = `
      <span>🎯 选择模式已开启 - 点击元素进行选择</span>
      <span class="opencode-hint-shortcut">按 ESC 或 Ctrl+P 退出</span>
    `;

    // 创建元素高亮覆盖层
    const elementHighlight = document.createElement("div");
    elementHighlight.className = "opencode-element-highlight";

    // 创建元素信息提示框
    const elementTooltip = document.createElement("div");
    elementTooltip.className = "opencode-element-tooltip";

    // 创建已选节点气泡容器（气泡按钮上方）
    const selectedBubbles = document.createElement("div");
    selectedBubbles.className = "opencode-selected-bubbles";
    selectedBubbles.setAttribute("role", "list");
    selectedBubbles.setAttribute("aria-label", "已选元素列表");

    // 创建内容容器
    const chatContent = document.createElement("div");
    chatContent.className = "opencode-chat-content";

    chat.appendChild(chatHeader);
    chatContent.appendChild(sessionList);
    chatContent.appendChild(iframeContainer);
    chatContent.appendChild(rightToolbar);
    chat.appendChild(chatContent);

    container.appendChild(button);
    container.appendChild(selectedBubbles);
    container.appendChild(chat);
    document.body.appendChild(container);
    document.body.appendChild(selectModeHint);
    document.body.appendChild(elementHighlight);
    document.body.appendChild(elementTooltip);

    if (selectedElements.length > 0) {
      renderSelectedNodes();
    }

    /** @type {Array} 会话列表 */
    let sessions = [];

    /**
     * 显示加载状态
     */
    function showLoading() {
      loadingOverlay.classList.add("visible");
    }

    /**
     * 隐藏加载状态
     */
    function hideLoading() {
      loadingOverlay.classList.remove("visible");
    }

    /**
     * 加载会话列表
     */
    async function loadSessions() {
      try {
        const response = await fetch("/__opencode_sessions__");
        sessions = await response.json();
        renderSessionList();
      } catch (e) {
        console.error("Failed to load sessions:", e);
      }
    }

    /**
     * 渲染会话列表
     */
    function renderSessionList() {
      sessionListContent.innerHTML = "";

      const currentProjectSessions = sessions.filter(
        (session) => session.directory === cwd,
      );

      currentProjectSessions.forEach((session) => {
        const item = document.createElement("div");
        item.className = "opencode-session-item";
        item.setAttribute("role", "option");
        item.setAttribute(
          "aria-selected",
          String(session.id === currentSessionId),
        );
        if (session.id === currentSessionId) {
          item.classList.add("active");
        }

        const header = document.createElement("div");
        header.className = "opencode-session-header";

        const title = document.createElement("div");
        title.className = "opencode-session-title";
        title.textContent = session.title || "新会话";

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "opencode-session-delete-btn";
        deleteBtn.innerHTML = "×";
        deleteBtn.title = "删除会话";
        deleteBtn.setAttribute(
          "aria-label",
          `删除会话: ${session.title || "新会话"}`,
        );
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          confirmDeleteSession(session);
        });

        header.appendChild(title);
        header.appendChild(deleteBtn);

        const meta = document.createElement("div");
        meta.className = "opencode-session-meta";
        const date = new Date(session.time.updated);
        meta.textContent =
          date.toLocaleDateString() + " " + date.toLocaleTimeString();

        item.appendChild(header);
        item.appendChild(meta);

        item.addEventListener("click", () => {
          switchSession(session);
        });

        sessionListContent.appendChild(item);
      });
    }

    /**
     * 切换会话
     */
    function switchSession(session) {
      if (session.id === currentSessionId) {
        return;
      }

      currentSessionId = session.id;
      const encodedDir = btoa(cwd);
      const baseUrl = webUrl;
      showLoading();
      iframe.src = `${baseUrl}/${encodedDir}/session/${session.id}`;
      renderSessionList();
    }

    /**
     * 创建新会话
     */
    async function createNewSession() {
      try {
        const response = await fetch("/__opencode_sessions__", {
          method: "POST",
        });
        const newSession = await response.json();
        sessions.unshift(newSession);
        switchSession(newSession);
      } catch (e) {
        console.error("Failed to create session:", e);
        showNotification("创建会话失败");
      }
    }

    /**
     * 确认删除会话
     */
    async function confirmDeleteSession(session) {
      const confirmed = await showConfirmDialog(
        `确定要删除会话 "${session.title || "新会话"}" 吗？`,
      );
      if (confirmed) {
        deleteSession(session);
      }
    }

    /**
     * 删除会话
     */
    async function deleteSession(session) {
      try {
        const response = await fetch(
          `/__opencode_sessions__?id=${session.id}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          throw new Error("Delete failed");
        }

        sessions = sessions.filter((s) => s.id !== session.id);

        if (session.id === currentSessionId) {
          const remainingSessions = sessions.filter((s) => s.directory === cwd);
          if (remainingSessions.length > 0) {
            switchSession(remainingSessions[0]);
          } else {
            currentSessionId = null;
            iframe.src = "about:blank";
          }
        }

        renderSessionList();
        showNotification("会话已删除");
      } catch (e) {
        console.error("Failed to delete session:", e);
        showNotification("删除会话失败");
      }
    }

    // 绑定新建会话按钮
    sessionListHeader
      .querySelector(".opencode-new-session-btn")
      .addEventListener("click", createNewSession);

    /**
     * 应用主题
     */
    function applyTheme() {
      const resolvedTheme =
        theme === "auto"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;

      container.classList.toggle("opencode-dark", resolvedTheme === "dark");
      container.style.colorScheme = resolvedTheme;
    }

    applyTheme();

    if (theme === "auto") {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", applyTheme);
    }

    /**
     * 切换挂件显示状态
     */
    async function toggle() {
      if (lazy && !servicesStarted) {
        button.classList.add("loading");
        const started = await ensureServicesStarted();
        button.classList.remove("loading");
        if (!started) {
          showNotification("服务启动失败，请检查控制台");
          return;
        }
        setupSSEConnection();
      }

      if (isSelectMode) {
        exitSelectMode();
        updateContext();
        return;
      }

      isOpen = !isOpen;
      chat.classList.toggle("open", isOpen);
      button.classList.toggle("active", isOpen);

      if (isOpen) {
        updateContext();
      }
    }

    button.addEventListener("click", toggle);

    document.addEventListener("keydown", (e) => {
      if (matchHotkey(e, mainHotkey)) {
        e.preventDefault();
        toggle();
      }

      if (matchHotkey(e, selectHotkey)) {
        e.preventDefault();
        if (window.__VUE_INSPECTOR__) {
          toggleSelectMode();
        } else {
          showNotification("Vue Inspector 未加载，无法使用元素选择功能");
        }
      }
    });

    if (open && servicesStarted) {
      setTimeout(() => {
        toggle();
      }, AUTO_OPEN_DELAY);
    }

    /**
     * 显示自定义确认对话框
     * @param {string} message - 确认消息
     * @returns {Promise<boolean>} 用户选择结果
     */
    function showConfirmDialog(message) {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "opencode-dialog-overlay";

        const dialog = document.createElement("div");
        dialog.className = "opencode-dialog";
        dialog.setAttribute("role", "alertdialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "opencode-dialog-title");
        dialog.setAttribute("aria-describedby", "opencode-dialog-desc");

        dialog.innerHTML = `
          <div class="opencode-dialog-content">
            <div id="opencode-dialog-desc" class="opencode-dialog-message">${message}</div>
          </div>
          <div class="opencode-dialog-actions">
            <button class="opencode-dialog-btn cancel" aria-label="取消">取消</button>
            <button class="opencode-dialog-btn confirm" aria-label="确认">确认</button>
          </div>
        `;

        const handleConfirm = () => {
          overlay.remove();
          resolve(true);
        };

        const handleCancel = () => {
          overlay.remove();
          resolve(false);
        };

        dialog
          .querySelector(".confirm")
          .addEventListener("click", handleConfirm);
        dialog.querySelector(".cancel").addEventListener("click", handleCancel);

        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) {
            handleCancel();
          }
        });

        document.addEventListener("keydown", function handleEscape(e) {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", handleEscape);
            handleCancel();
          }
        });

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        dialog.querySelector(".confirm").focus();
      });
    }

    /**
     * 显示通知
     * @param {string} message - 通知消息
     */
    function showNotification(message) {
      const notification = document.createElement("div");
      notification.className = "opencode-notification";
      notification.textContent = message;
      chat.appendChild(notification);

      setTimeout(() => {
        notification.remove();
      }, NOTIFICATION_DURATION);
    }

    /**
     * 添加选中元素
     * @param {SelectedElement} elementInfo - 元素信息
     */
    function addElement(elementInfo) {
      const key =
        elementInfo.filePath && elementInfo.line
          ? `${elementInfo.filePath}:${elementInfo.line}`
          : null;

      const exists =
        key &&
        selectedElements.some((el) => {
          const elKey =
            el.filePath && el.line ? `${el.filePath}:${el.line}` : null;
          return elKey === key;
        });

      if (!exists) {
        selectedElements.push(elementInfo);
        saveSelectedElements(selectedElements);
        renderSelectedNodes();
        if (isSelectMode) {
          renderSelectedBubbles();
        }
        showNotification(`已选中元素 (${selectedElements.length}个)`);
      } else {
        showNotification("该元素已选中");
      }
    }

    /**
     * 移除选中元素
     * @param {number} index - 元素索引
     */
    function removeElement(index) {
      selectedElements.splice(index, 1);
      saveSelectedElements(selectedElements);
      renderSelectedNodes();
      updateToolbarState();
      sendSelectedElements();
    }

    /**
     * 清除所有选中元素
     */
    function clearAllElements() {
      selectedElements = [];
      saveSelectedElements(selectedElements);
      renderSelectedNodes();
      updateToolbarState();
      sendSelectedElements();
      showNotification("已清除所有选中元素");
    }

    /**
     * 更新工具栏状态
     */
    function updateToolbarState() {
      if (selectedElements.length > 0) {
        rightToolbar.classList.remove("collapsed");
      } else {
        rightToolbar.classList.add("collapsed");
      }
    }

    /** @type {boolean} 是否处于元素选择模式 */
    let isSelectMode = false;

    /**
     * 处理鼠标移动事件（选择模式下高亮元素）
     * @param {MouseEvent} e - 鼠标事件
     */
    function handleMouseMove(e) {
      if (!isSelectMode) return;

      const inspector = window.__VUE_INSPECTOR__;
      if (!inspector) return;

      const { targetNode, params } = inspector.getTargetNode(e);

      if (targetNode && params) {
        const rect = targetNode.getBoundingClientRect();

        elementHighlight.style.display = "block";
        elementHighlight.style.top = `${rect.top}px`;
        elementHighlight.style.left = `${rect.left}px`;
        elementHighlight.style.width = `${rect.width}px`;
        elementHighlight.style.height = `${rect.height}px`;

        const description = getElementDescription(targetNode);
        const fileName = params.file ? params.file.split("/").pop() : "";
        let lineInfo = "";
        if (params.line) {
          lineInfo = `:${params.line}`;
          if (params.column) {
            lineInfo += `:${params.column}`;
          }
        }

        elementTooltip.innerHTML = `
          <div class="opencode-tooltip-tag">${description}</div>
          ${fileName ? `<div class="opencode-tooltip-file">${fileName}${lineInfo}</div>` : ""}
        `;
        elementTooltip.style.display = "block";

        const tooltipRect = elementTooltip.getBoundingClientRect();
        let tooltipTop = rect.top - tooltipRect.height - 8;
        let tooltipLeft = rect.left;

        if (tooltipTop < 10) {
          tooltipTop = rect.bottom + 8;
        }
        if (tooltipLeft + tooltipRect.width > window.innerWidth - 10) {
          tooltipLeft = window.innerWidth - tooltipRect.width - 10;
        }

        elementTooltip.style.top = `${tooltipTop}px`;
        elementTooltip.style.left = `${tooltipLeft}px`;
      } else {
        elementHighlight.style.display = "none";
        elementTooltip.style.display = "none";
      }
    }

    /**
     * 切换元素选择模式
     */
    function toggleSelectMode() {
      const inspector = window.__VUE_INSPECTOR__;

      if (!inspector) {
        showNotification("Vue Inspector 未加载，无法使用元素选择功能");
        return;
      }

      isSelectMode = !isSelectMode;
      selectButton.classList.toggle("active", isSelectMode);
      selectButton.setAttribute("aria-pressed", String(isSelectMode));
      selectModeHint.classList.toggle("visible", isSelectMode);
      selectedBubbles.classList.toggle("visible", isSelectMode);

      if (isSelectMode) {
        if (isOpen) {
          isOpen = false;
          chat.classList.remove("open");
          button.classList.remove("active");
        }
        chat.style.display = "none";
        inspector.enable();
        renderSelectedBubbles();
        document.addEventListener("mousemove", handleMouseMove);
      } else {
        chat.style.display = "";
        isOpen = true;
        chat.classList.add("open");
        button.classList.add("active");
        inspector.disable();
        document.removeEventListener("mousemove", handleMouseMove);
        elementHighlight.style.display = "none";
        elementTooltip.style.display = "none";
      }
    }

    /**
     * 退出选择模式
     */
    function exitSelectMode() {
      if (!isSelectMode) return;

      const inspector = window.__VUE_INSPECTOR__;
      if (inspector) {
        inspector.disable();
      }

      isSelectMode = false;
      selectButton.classList.remove("active");
      selectModeHint.classList.remove("visible");
      selectedBubbles.classList.remove("visible");
      chat.style.display = "";

      isOpen = true;
      chat.classList.add("open");
      button.classList.add("active");

      document.removeEventListener("mousemove", handleMouseMove);
      elementHighlight.style.display = "none";
      elementTooltip.style.display = "none";
    }

    // ESC 键退出选择模式（使用捕获阶段确保优先处理）
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && isSelectMode) {
          e.preventDefault();
          e.stopPropagation();
          exitSelectMode();
        }
      },
      true,
    );

    /**
     * 建立 SSE 连接监听服务端事件
     */
    function setupSSEConnection() {
      if (!servicesStarted || sseConnection) return;

      sseConnection = new EventSource("/__opencode_events__");

      sseConnection.onopen = () => {
        console.log("[OpenCode] SSE connected");
      };

      sseConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[OpenCode] SSE message:", data);

          if (data.type === "CONNECTED") {
            // 连接成功后，主动同步当前节点到服务端
            if (selectedElements.length > 0) {
              fetch("/__opencode_context__", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: window.location.href,
                  title: document.title,
                  selectedElements: selectedElements,
                }),
              }).catch(() => {});
            }
          }

          if (data.type === "SESSION_READY") {
            if (data.sessionUrl && !sessionUrl) {
              sessionUrl = data.sessionUrl;
              currentSessionId = extractSessionId(sessionUrl);
              if (iframe) {
                iframe.src = sessionUrl;
              }
            }
          }

          if (data.type === "CLEAR_ELEMENTS" && selectedElements.length > 0) {
            console.log("[OpenCode] Clearing elements");
            selectedElements = [];
            saveSelectedElements(selectedElements);
            renderSelectedNodes();
            updateToolbarState();
            if (isSelectMode) {
              renderSelectedBubbles();
            }
          }
        } catch (e) {
          console.error("[OpenCode] SSE parse error:", e);
        }
      };

      sseConnection.onerror = (e) => {
        console.error("[OpenCode] SSE error:", e);
        // 连接失败时自动重连
        if (sseConnection) {
          sseConnection.close();
          sseConnection = null;
        }
        setTimeout(setupSSEConnection, 3000);
      };
    }

    /**
     * 渲染已选节点气泡
     */
    function renderSelectedBubbles() {
      selectedBubbles.innerHTML = "";

      if (selectedElements.length === 0) {
        selectedBubbles.innerHTML =
          '<div class="opencode-bubble-empty">暂无选中元素</div>';
        return;
      }

      selectedElements.forEach((element, index) => {
        const bubble = document.createElement("div");
        bubble.className = "opencode-selected-bubble";
        bubble.setAttribute("role", "listitem");

        const description = element.description || "未知元素";
        const fileName = element.filePath
          ? element.filePath.split("/").pop()
          : "";
        const lineInfo = element.line
          ? `:${element.line}${element.column ? `:${element.column}` : ""}`
          : "";

        bubble.innerHTML = `
          <span class="opencode-bubble-text">${description}</span>
          ${fileName ? `<span class="opencode-bubble-file">${fileName}${lineInfo}</span>` : ""}
          <button class="opencode-bubble-remove" data-index="${index}" aria-label="移除元素: ${description}">×</button>
        `;

        bubble
          .querySelector(".opencode-bubble-remove")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            removeElement(index);
            renderSelectedBubbles();
          });

        selectedBubbles.appendChild(bubble);
      });
    }
    function renderSelectedNodes() {
      selectedNodesContainer.innerHTML = "";

      if (selectedElements.length === 0) {
        rightToolbar.classList.add("collapsed");
        clearAllButton.style.display = "none";
      } else {
        rightToolbar.classList.remove("collapsed");
        clearAllButton.style.display = "block";
      }

      selectedElements.forEach((element, index) => {
        const node = document.createElement("div");
        node.className = "opencode-selected-node";
        node.setAttribute("role", "listitem");

        const description = element.description || "未知元素";
        const textPreview = element.innerText
          ? element.innerText.substring(0, 30)
          : "";
        const fileName = element.filePath
          ? element.filePath.split("/").pop()
          : "未知文件";
        const lineInfo = element.line
          ? `:${element.line}${element.column ? `:${element.column}` : ""}`
          : "";

        node.innerHTML = `
          <div class="opencode-node-content">
            <span class="opencode-node-text">${description}</span>
            <span class="opencode-node-file">${textPreview ? textPreview + " · " : ""}${fileName}${lineInfo}</span>
          </div>
          <button class="opencode-node-remove" data-index="${index}" aria-label="移除元素: ${description}">×</button>
        `;

        node
          .querySelector(".opencode-node-remove")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            removeElement(index);
          });

        node.addEventListener("click", () => {
          highlightElement(element);
        });

        selectedNodesContainer.appendChild(node);
      });
    }

    // 绑定清空按钮点击事件
    clearAllButton.addEventListener("click", async () => {
      if (selectedElements.length === 0) return;

      const confirmed = await showConfirmDialog(
        `确定要清空所有 ${selectedElements.length} 个已选节点吗？`,
      );
      if (confirmed) {
        clearAllElements();
      }
    });

    // 绑定选择按钮点击事件
    selectButton.addEventListener("click", toggleSelectMode);

    /**
     * 高亮页面元素
     * @param {SelectedElement} element - 元素信息
     */
    function highlightElement(element) {
      try {
        const description = element.description;
        if (!description) return;

        let targetElement = null;

        if (description.includes("#")) {
          const idMatch = description.match(/#([^\.\[\s]+)/);
          if (idMatch) {
            targetElement = document.getElementById(idMatch[1]);
          }
        }

        if (!targetElement && description.includes(".")) {
          const classMatch = description.match(/^([a-z]+)\.([^\[\s]+)/i);
          if (classMatch) {
            const tagName = classMatch[1];
            const classes = classMatch[2].split(".").filter(Boolean);
            const selector = `${tagName}.${classes.join(".")}`;
            targetElement = document.querySelector(selector);
          }
        }

        if (!targetElement) {
          const tagMatch = description.match(/^([a-z]+)/i);
          if (tagMatch) {
            const simpleSelector = description.split(/[\.\[\s]/)[0];
            targetElement = document.querySelector(simpleSelector);
          }
        }

        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

          const highlightOverlay = document.createElement("div");
          highlightOverlay.className = "opencode-element-highlight-temp";
          const rect = targetElement.getBoundingClientRect();
          highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
          highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
          highlightOverlay.style.width = `${rect.width}px`;
          highlightOverlay.style.height = `${rect.height}px`;
          document.body.appendChild(highlightOverlay);

          setTimeout(() => {
            highlightOverlay.remove();
          }, 2000);
        }
      } catch (e) {
        console.error("Failed to highlight element:", e);
      }
    }

    /**
     * 发送选中元素到服务器
     */
    function sendSelectedElements() {
      if (!servicesStarted) {
        console.log("[OpenCode] sendSelectedElements: services not started");
        return;
      }

      console.log("[OpenCode] Sending selected elements:", selectedElements);
      fetch("/__opencode_context__", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: currentPageUrl,
          title: currentPageTitle,
          selectedElements: selectedElements,
        }),
      })
        .then(() => {
          console.log("[OpenCode] Selected elements sent successfully");
        })
        .catch((e) => {
          console.error("[OpenCode] Failed to send selected elements:", e);
        });
    }

    /**
     * 截断字符串
     * @param {string} str - 原字符串
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的字符串
     */
    function truncate(str, maxLength) {
      if (!str) return "";
      return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
    }

    /**
     * 获取元素的直接文本内容
     * @param {Element} element - DOM 元素
     * @returns {string} 直接文本内容
     */
    function getDirectText(element) {
      let text = "";
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent || "";
        }
      }
      return text.trim();
    }

    /**
     * 获取元素描述信息
     * @param {Element} element - DOM 元素
     * @returns {string} 元素描述
     */
    function getElementDescription(element) {
      const tag = element.tagName.toLowerCase();
      const parts = [tag];

      const id = element.id;
      if (id) parts.push(`#${id}`);

      const className =
        element.className && typeof element.className === "string"
          ? element.className
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .join(".")
          : "";
      if (className) parts.push(`.${className}`);

      const name = element.getAttribute("name");
      if (name) parts.push(`[name="${name}"]`);

      const placeholder = element.getAttribute("placeholder");
      if (placeholder)
        parts.push(`[placeholder="${placeholder.substring(0, 20)}"]`);

      const src = element.getAttribute("src");
      if (src) parts.push(`[src]`);

      const href = element.getAttribute("href");
      if (href && href !== "#") parts.push(`[href]`);

      return parts.join("");
    }

    /**
     * 设置 Vue Inspector 钩子
     */
    function setupInspectorHook() {
      if (window.__VUE_INSPECTOR__) {
        const inspector = window.__VUE_INSPECTOR__;
        const originalHandleClick = inspector.handleClick.bind(inspector);

        inspector.handleClick = function (e) {
          if (isSelectMode) {
            const { targetNode, params } = inspector.getTargetNode(e);
            if (targetNode && params) {
              const innerText = getDirectText(targetNode);
              const description = getElementDescription(targetNode);

              const elementInfo = {
                filePath: params.file,
                line: params.line,
                column: params.column,
                innerText: truncate(innerText, 200),
                description,
              };
              addElement(elementInfo);
              sendSelectedElements();
            }
            return;
          }

          return originalHandleClick.call(inspector, e);
        };
      }
    }

    if (window.__VUE_INSPECTOR__) {
      setupInspectorHook();
    } else {
      const checkInspector = setInterval(() => {
        if (window.__VUE_INSPECTOR__) {
          setupInspectorHook();
          clearInterval(checkInspector);
        }
      }, INSPECTOR_CHECK_INTERVAL);
    }

    // 导出全局 API
    window.OpenCodeWidget = {
      open: () => {
        if (!isOpen) toggle();
      },
      close: () => {
        if (isOpen) toggle();
      },
      toggle,
      showNotification,
      updateContext,
    };
  }

  /**
   * 构建挂件样式
   * @returns {string} CSS 样式字符串
   */
  function buildWidgetStyles() {
    return `
      .opencode-widget {
        position: fixed;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .opencode-widget.bottom-right {
        bottom: 20px;
        right: 20px;
      }

      .opencode-widget.bottom-left {
        bottom: 20px;
        left: 20px;
      }

      .opencode-widget.top-right {
        top: 20px;
        right: 20px;
      }

      .opencode-widget.top-left {
        top: 20px;
        left: 20px;
      }

      .opencode-button {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        padding: 0;
        position: relative;
      }

      .opencode-button::before {
        content: '';
        position: absolute;
        top: -8px;
        left: -8px;
        right: -8px;
        bottom: -8px;
        border-radius: 50%;
      }

      .opencode-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
      }

      .opencode-button.active {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        box-shadow: 0 6px 20px rgba(240, 147, 251, 0.4);
      }

      .opencode-button.active svg {
        transform: rotate(180deg);
      }

      .opencode-button svg {
        transition: transform 0.3s ease;
      }

      .opencode-button.loading {
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .opencode-chat {
        position: absolute;
        width: 700px;
        height: 86vh;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: translateY(20px) scale(0.95);
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
      }

      .opencode-chat-content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .opencode-widget.bottom-right .opencode-chat {
        bottom: 48px;
        right: 0;
      }

      .opencode-widget.bottom-left .opencode-chat {
        bottom: 48px;
        left: 0;
      }

      .opencode-widget.top-right .opencode-chat {
        top: 48px;
        right: 0;
      }

      .opencode-widget.top-left .opencode-chat {
        top: 48px;
        left: 0;
      }

      .opencode-chat.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      .opencode-chat-header {
        position: relative;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        height: 40px;
        background: #f8f9fa;
        border-bottom: 1px solid #282828;
        z-index: 5;
      }

      .opencode-chat-header-left {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .opencode-chat-header-title {
        font-size: 14px;
        font-weight: 600;
        color: #282828;
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
      }

      .opencode-chat-header-actions {
        display: flex;
        gap: 4px;
      }

      .opencode-header-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .opencode-header-btn:hover {
        background: #282828;
        color: #282828;
      }

      .opencode-header-btn.close:hover {
        background: #ef4444;
        color: white;
      }

      .opencode-header-btn.select-btn.active {
        background: #3b82f6;
        color: white;
      }

      .opencode-dark .opencode-chat-header {
        background: #121212;
        border-bottom-color: #282828;
      }

      .opencode-dark .opencode-chat-header-title {
        color: #f3f4f6;
      }

      .opencode-dark .opencode-header-btn {
        color: #9ca3af;
      }

      .opencode-dark .opencode-header-btn:hover {
        background: #282828;
        color: #f3f4f6;
      }

      .opencode-dark .opencode-header-btn.close:hover {
        background: #ef4444;
        color: white;
      }

      .opencode-session-list {
        width: 240px;
        background: #f8f9fa;
        border-right: 1px solid #282828;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        transition: width 0.2s ease;
      }

      .opencode-session-list.collapsed {
        width: 0;
        overflow: hidden;
      }

      .opencode-session-list.collapsed .opencode-session-list-header,
      .opencode-session-list.collapsed .opencode-session-list-content {
        display: none;
      }

      .opencode-session-list-header {
        padding: 16px;
        border-bottom: 1px solid #282828;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 14px;
        color: #282828;
      }

      .opencode-new-session-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .opencode-new-session-btn:hover {
        background: #2563eb;
        transform: scale(1.05);
      }

      .opencode-session-list-content {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }

      .opencode-session-item {
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 4px;
      }

      .opencode-session-item:hover {
        background: #282828;
      }

      .opencode-session-item.active {
        background: #3b82f6;
        color: white;
      }

      .opencode-session-title {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .opencode-session-meta {
        font-size: 12px;
        opacity: 0.6;
      }

      .opencode-session-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }

      .opencode-session-delete-btn {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: #6b7280;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        opacity: 0;
        flex-shrink: 0;
      }

      .opencode-session-item:hover .opencode-session-delete-btn {
        opacity: 1;
      }

      .opencode-session-delete-btn:hover {
        background: #ef4444;
        color: white;
      }

      .opencode-session-item.active .opencode-session-delete-btn {
        color: rgba(255, 255, 255, 0.7);
      }

      .opencode-session-item.active .opencode-session-delete-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: white;
      }

      .opencode-session-header-skeleton {
        padding: 16px;
        border-bottom: 1px solid #282828;
        display: none;
        justify-content: space-between;
        align-items: center;
      }

      .opencode-session-header-skeleton.visible {
        display: flex;
      }

      .opencode-skeleton-header-title {
        height: 18px;
        width: 80px;
        background: #151515;
        background-size: 200% 100%;
        animation: skeleton-loading 1.5s ease-in-out infinite;
        border-radius: 4px;
      }

      .opencode-skeleton-header-btn {
        width: 28px;
        height: 28px;
        background: #151515;
        background-size: 200% 100%;
        animation: skeleton-loading 1.5s ease-in-out infinite;
        border-radius: 6px;
      }

      .opencode-session-skeleton {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        display: none;
      }

      .opencode-session-skeleton.visible {
        display: block;
      }

      .opencode-skeleton-item {
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 4px;
        background: white;
      }

      .opencode-skeleton-title {
        height: 16px;
        background: #151515;
        background-size: 200% 100%;
        animation: skeleton-loading 1.5s ease-in-out infinite;
        border-radius: 4px;
        margin-bottom: 8px;
        width: 70%;
      }

      .opencode-skeleton-meta {
        height: 12px;
        background: #151515;
        background-size: 200% 100%;
        animation: skeleton-loading 1.5s ease-in-out infinite;
        border-radius: 4px;
        width: 50%;
      }

      @keyframes skeleton-loading {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      .opencode-dark .opencode-skeleton-item {
        background: #1e1e1e;
      }

      .opencode-dark .opencode-skeleton-title,
      .opencode-dark .opencode-skeleton-meta {
        background: linear-gradient(90deg, #282828 25%, #4b5563 50%, #282828 75%);
        background-size: 200% 100%;
      }

      .opencode-dark .opencode-session-header-skeleton {
        border-bottom-color: #282828;
      }

      .opencode-dark .opencode-skeleton-header-title,
      .opencode-dark .opencode-skeleton-header-btn {
        background: linear-gradient(90deg, #282828 25%, #4b5563 50%, #282828 75%);
        background-size: 200% 100%;
      }

      .opencode-iframe-container {
        flex: 1;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        margin-top: -42px;
      }

      .opencode-loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.9);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10;
        transition: opacity 0.3s ease;
      }

      .opencode-loading-overlay.visible {
        display: flex;
      }

      .opencode-loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #282828;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .opencode-loading-text {
        margin-top: 12px;
        font-size: 14px;
        color: #6b7280;
      }

      .opencode-iframe {
        width: 100%;
        height: 100%;
        border: none;
      }

      .opencode-dark .opencode-chat {
        background: #1a1a1a;
      }

      .opencode-dark .opencode-session-list {
        background: #121212;
        border-right-color: #282828;
      }

      .opencode-dark .opencode-session-toggle {
        color: #9ca3af;
        border-bottom-color: #282828;
      }

      .opencode-dark .opencode-session-toggle:hover {
        background: #282828;
        color: #f3f4f6;
      }

      .opencode-dark .opencode-session-list-header {
        border-bottom-color: #282828;
        color: #f3f4f6;
      }

      .opencode-dark .opencode-session-item:hover {
        background: #282828;
      }

      .opencode-dark .opencode-session-item.active {
        background: #3b82f6;
      }

      .opencode-dark .opencode-loading-overlay {
        background: rgba(26, 26, 26, 0.9);
      }

      .opencode-dark .opencode-loading-spinner {
        border-color: #282828;
        border-top-color: #3b82f6;
      }

      .opencode-dark .opencode-loading-text {
        color: #9ca3af;
      }

      .opencode-right-toolbar {
        width: 140px;
        background: #f8f9fa;
        border-left: 1px solid #282828;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        transition: width 0.2s ease;
        overflow: hidden;
      }

      .opencode-right-toolbar.collapsed {
        width: 0;
        overflow: hidden;
      }

      .opencode-right-toolbar.collapsed .opencode-selected-nodes-header,
      .opencode-right-toolbar.collapsed .opencode-selected-nodes,
      .opencode-right-toolbar.collapsed .opencode-clear-all-btn {
        display: none;
      }

      .opencode-selected-nodes-header {
        padding: 12px 8px 8px;
        border-bottom: 1px solid #282828;
      }

      .opencode-selected-nodes-title {
        font-size: 14px;
        font-weight: 600;
        color: #282828;
        margin-bottom: 4px;
      }

      .opencode-selected-nodes-desc {
        font-size: 11px;
        color: #9ca3af;
        line-height: 1.4;
      }

      .opencode-selected-nodes {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 8px;
        gap: 6px;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .opencode-selected-nodes:empty::before {
        content: '暂无选中元素';
        color: #9ca3af;
        font-size: 12px;
        text-align: center;
        padding: 20px 10px;
      }

      .opencode-selected-node {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: white;
        border: 1px solid #282828;
        border-radius: 6px;
        font-size: 12px;
        transition: all 0.2s;
      }

      .opencode-selected-node:hover {
        border-color: #3b82f6;
        box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
      }

      .opencode-node-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .opencode-node-text {
        color: #282828;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .opencode-node-file {
        color: #9ca3af;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .opencode-node-remove {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.2s;
        flex-shrink: 0;
      }

      .opencode-node-remove:hover {
        background: #ef4444;
        color: white;
      }

      .opencode-clear-all-btn {
        width: calc(100% - 16px);
        margin: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        border: none;
        background: #ef4444;
        color: white;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s;
      }

      .opencode-clear-all-btn:hover {
        background: #dc2626;
        transform: scale(1.02);
      }

      .opencode-dark .opencode-right-toolbar {
        background: #121212;
        border-left-color: #282828;
      }

      .opencode-dark .opencode-selected-nodes-header {
        border-bottom-color: #282828;
      }

      .opencode-dark .opencode-selected-nodes-title {
        color: #f3f4f6;
      }

      .opencode-dark .opencode-selected-nodes-desc {
        color: #6b7280;
      }

      .opencode-dark .opencode-selected-nodes:empty::before {
        color: #6b7280;
      }

      .opencode-dark .opencode-selected-node {
        background: #1e1e1e;
        border-color: #282828;
      }

      .opencode-dark .opencode-selected-node:hover {
        border-color: #3b82f6;
      }

      .opencode-dark .opencode-node-text {
        color: #f3f4f6;
      }

      .opencode-dark .opencode-node-file {
        color: #6b7280;
      }

      .opencode-dark .opencode-node-remove {
        color: #6b7280;
      }

      .opencode-dark .opencode-node-remove:hover {
        background: #ef4444;
        color: white;
      }

      .opencode-dark .opencode-clear-all-btn {
        background: #dc2626;
        color: white;
      }

      .opencode-dark .opencode-clear-all-btn:hover {
        background: #b91c1c;
      }

      .opencode-dark .opencode-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
      }

      .opencode-notification {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        background: #10b981;
        color: white;
        border-radius: 8px;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideDown 0.3s ease;
        z-index: 10;
      }

      .opencode-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999999;
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .opencode-dialog {
        background: white;
        border-radius: 12px;
        padding: 24px;
        min-width: 320px;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: scaleIn 0.2s ease;
      }

      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .opencode-dialog-content {
        margin-bottom: 20px;
      }

      .opencode-dialog-message {
        font-size: 15px;
        color: #282828;
        line-height: 1.5;
      }

      .opencode-dialog-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .opencode-dialog-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .opencode-dialog-btn.cancel {
        background: #f3f4f6;
        color: #282828;
      }

      .opencode-dialog-btn.cancel:hover {
        background: #282828;
      }

      .opencode-dialog-btn.confirm {
        background: #ef4444;
        color: white;
      }

      .opencode-dialog-btn.confirm:hover {
        background: #dc2626;
      }

      .opencode-dark .opencode-dialog {
        background: #1e1e1e;
      }

      .opencode-dark .opencode-dialog-message {
        color: #f3f4f6;
      }

      .opencode-dark .opencode-dialog-btn.cancel {
        background: #282828;
        color: #f3f4f6;
      }

      .opencode-dark .opencode-dialog-btn.cancel:hover {
        background: #4b5563;
      }

      @keyframes slideDown {
        from {
          transform: translateX(-50%) translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }

      .opencode-select-mode-hint {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 16px;
        background: #ef4444;
        color: white;
        border-radius: 8px;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        z-index: 9999999;
        display: none;
        align-items: center;
        gap: 12px;
      }

      .opencode-select-mode-hint.visible {
        display: flex;
        animation: slideDown 0.3s ease;
      }

      .opencode-hint-shortcut {
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        font-size: 12px;
      }

      .opencode-element-highlight {
        position: fixed;
        pointer-events: none;
        border: 2px solid #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        z-index: 9999998;
        display: none;
        transition: all 0.1s ease;
        border-radius: 4px;
      }

      #vue-inspector-container {
        display: none !important;
      }

      .opencode-element-tooltip {
        position: fixed;
        background: #1e1e1e;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 9999998;
        display: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        max-width: 300px;
        pointer-events: none;
      }

      .opencode-tooltip-tag {
        font-weight: 500;
        margin-bottom: 4px;
        word-break: break-all;
      }

      .opencode-tooltip-file {
        font-size: 11px;
        color: #9ca3af;
        word-break: break-all;
      }

      .opencode-selected-bubbles {
        position: absolute;
        bottom: 44px;
        right: 0;
        display: none;
        flex-direction: column;
        gap: 6px;
        max-width: 220px;
        max-height: 300px;
        overflow-y: auto;
      }

      .opencode-selected-bubbles.visible {
        display: flex;
      }

      .opencode-selected-bubble {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        background: white;
        border: 1px solid #282828;
        border-radius: 8px;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        position: relative;
      }

      .opencode-bubble-text {
        color: #282828;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .opencode-bubble-file {
        color: #9ca3af;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .opencode-bubble-remove {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: all 0.2s;
      }

      .opencode-bubble-remove:hover {
        background: #ef4444;
        color: white;
      }

      .opencode-bubble-empty {
        padding: 8px 12px;
        background: white;
        border: 1px dashed #d1d5db;
        border-radius: 8px;
        color: #9ca3af;
        font-size: 12px;
        text-align: center;
      }

      .opencode-dark .opencode-selected-bubble {
        background: #1e1e1e;
        border-color: #282828;
      }

      .opencode-dark .opencode-bubble-text {
        color: #f3f4f6;
      }

      .opencode-dark .opencode-bubble-file {
        color: #6b7280;
      }

      .opencode-dark .opencode-bubble-remove {
        color: #6b7280;
      }

      .opencode-dark .opencode-bubble-empty {
        background: #1e1e1e;
        border-color: #282828;
        color: #6b7280;
      }

      .opencode-element-highlight-temp {
        position: absolute;
        pointer-events: none;
        border: 3px solid #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        z-index: 9999;
        border-radius: 4px;
        animation: highlight-pulse 2s ease-out forwards;
      }

      @keyframes highlight-pulse {
        0% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.02);
        }
        100% {
          opacity: 0;
          transform: scale(1);
        }
      }

      @media (max-width: 768px) {
        .opencode-chat {
          width: calc(100vw - 40px);
          height: calc(100vh - 100px);
        }
      }
    `;
  }

  /**
   * 自动初始化挂件
   */
  function autoInit() {
    const script =
      document.currentScript ||
      document.querySelector("script[data-opencode-config]");
    if (script) {
      const configBase64 = script.getAttribute("data-opencode-config");
      if (configBase64) {
        try {
          const config = JSON.parse(atob(configBase64));
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () {
              initOpenCodeWidget(config);
            });
          } else {
            initOpenCodeWidget(config);
          }
        } catch (e) {
          console.error("[OpenCode Widget] Failed to parse config:", e);
        }
      }
    }
  }

  // 导出全局初始化函数
  window.initOpenCodeWidget = initOpenCodeWidget;

  // 自动初始化
  autoInit();
})();
