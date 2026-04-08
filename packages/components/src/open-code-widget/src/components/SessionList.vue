<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useOpenCodeWidgetContext } from "../context";

const {
  sessionListCollapsed: collapsed,
  sessionItems: sessions,
  loadingSessionList,
  handleCreateSession,
  handleSelectSession,
  handleDeleteSession,
} = useOpenCodeWidgetContext();

const isAnimating = ref(false);
let animTimer: ReturnType<typeof setTimeout> | null = null;

watch(collapsed, () => {
  isAnimating.value = true;
  if (animTimer) clearTimeout(animTimer);
  animTimer = setTimeout(() => {
    isAnimating.value = false;
  }, 200); // 匹配 CSS width transition 时间
});

const showSkeleton = computed(() => {
  if (isAnimating.value) return true;
  return false;
});
</script>

<template>
  <div class="opencode-session-list" :class="{ collapsed }">
    <!-- Header -->
    <div v-if="!showSkeleton" class="opencode-session-list-header">
      <span id="opencode-session-list-title">会话列表</span>
      <button
        class="opencode-new-session-btn"
        type="button"
        title="新建会话"
        aria-label="新建会话"
        @click="handleCreateSession"
      >
        +
      </button>
    </div>

    <!-- Header Skeleton -->
    <div v-else class="opencode-session-header-skeleton visible">
      <div class="opencode-skeleton-header-title" />
      <div class="opencode-skeleton-header-btn" />
    </div>

    <!-- Content Skeleton -->
    <div v-if="showSkeleton" class="opencode-session-skeleton visible">
      <div v-for="i in 5" :key="`skeleton-${i}`" class="opencode-skeleton-item">
        <div class="opencode-skeleton-title" />
        <div class="opencode-skeleton-meta" />
      </div>
    </div>

    <!-- Content -->
    <div
      v-else
      class="opencode-session-list-content"
      role="listbox"
      aria-labelledby="opencode-session-list-title"
    >
      <div v-if="loadingSessionList" class="opencode-session-list-loading-overlay">
        <div class="opencode-loading-spinner small" />
      </div>

      <template v-if="sessions.length > 0">
        <div
          v-for="item in sessions"
          :key="item.key"
          class="opencode-session-item"
          :class="{ active: item.active }"
          role="option"
          :aria-selected="item.active"
          @click="handleSelectSession(item)"
        >
          <div class="opencode-session-header">
            <div class="opencode-session-title">{{ item.title }}</div>
            <button
              class="opencode-session-delete-btn"
              type="button"
              :aria-label="`删除会话: ${item.title}`"
              @click.stop="handleDeleteSession(item)"
            >
              ×
            </button>
          </div>
          <div class="opencode-session-meta">{{ item.meta }}</div>
        </div>
      </template>

      <!-- Empty State -->
      <template v-else>
        <slot name="empty" />
      </template>
    </div>
  </div>
</template>

<style>
.opencode-session-list {
  width: 240px;
  background: var(--oc-bg-secondary);
  border-right: 1px solid var(--oc-border-primary);
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
  border-bottom: 1px solid var(--oc-border-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--oc-text-primary);
}

.opencode-new-session-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: var(--oc-primary);
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.opencode-new-session-btn:hover {
  background: var(--oc-primary-hover);
  transform: scale(1.05);
}

.opencode-session-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  position: relative;
}

.opencode-session-list-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--oc-overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 8px;
}

.opencode-loading-spinner.small {
  width: 24px;
  height: 24px;
  border-width: 2px;
}

.opencode-session-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  color: var(--oc-text-primary);
}

.opencode-session-item:hover {
  background: var(--oc-bg-tertiary);
}

.opencode-session-item.active {
  background: var(--oc-primary);
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
  color: var(--oc-text-placeholder);
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
  background: var(--oc-danger);
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
  border-bottom: 1px solid var(--oc-border-primary);
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
  background: var(--oc-skeleton-gradient);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

.opencode-skeleton-header-btn {
  width: 28px;
  height: 28px;
  background: var(--oc-skeleton-gradient);
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
  background: var(--oc-skeleton-bg);
}

.opencode-skeleton-title {
  height: 16px;
  background: var(--oc-skeleton-gradient);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
  margin-bottom: 8px;
  width: 70%;
}

.opencode-skeleton-meta {
  height: 12px;
  background: var(--oc-skeleton-gradient);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
  width: 50%;
}

.opencode-session-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--oc-text-placeholder);
  font-size: 13px;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}
</style>
