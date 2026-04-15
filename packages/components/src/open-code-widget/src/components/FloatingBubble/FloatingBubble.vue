<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import type {
  FloatingBubbleAxis,
  FloatingBubbleMagnetic,
  FloatingBubbleOffset,
  FloatingBubbleGap,
  FloatingBubbleEmits,
} from "./types";

defineOptions({
  name: "FloatingBubble",
});

const props = withDefaults(
  defineProps<{
    offset?: FloatingBubbleOffset;
    axis?: FloatingBubbleAxis;
    magnetic?: FloatingBubbleMagnetic;
    gap?: number | FloatingBubbleGap;
    teleport?: string | Element;
  }>(),
  {
    offset: undefined,
    axis: "xy", // Vant default is y, but we use xy for free dragging
    magnetic: undefined,
    gap: 24,
    teleport: "body",
  }
);

const emit = defineEmits<FloatingBubbleEmits>();

const rootRef = ref<HTMLElement | null>(null);

const state = ref({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

const isObject = (val: unknown): val is FloatingBubbleGap =>
  val !== null && typeof val === "object";

const gapX = computed(() =>
  isObject(props.gap) ? props.gap.x : (props.gap as number)
);
const gapY = computed(() =>
  isObject(props.gap) ? props.gap.y : (props.gap as number)
);

const windowWidth = ref(typeof window !== "undefined" ? window.innerWidth : 0);
const windowHeight = ref(typeof window !== "undefined" ? window.innerHeight : 0);

const boundary = computed(() => ({
  top: gapY.value,
  right: windowWidth.value - state.value.width - gapX.value,
  bottom: windowHeight.value - state.value.height - gapY.value,
  left: gapX.value,
}));

const dragging = ref(false);
const initialized = ref(false);

const rootStyle = computed(() => {
  const style: Record<string, string | number> = {};

  const x = `${state.value.x}px`;
  const y = `${state.value.y}px`;
  style.transform = `translate3d(${x}, ${y}, 0)`;

  if (dragging.value || !initialized.value) {
    style.transition = "none";
  } else {
    style.transition = "transform 0.3s ease";
  }

  return style;
});

const show = ref(true);

const updateState = () => {
  if (!show.value || !rootRef.value || typeof window === "undefined") return;

  const rect = rootRef.value.getBoundingClientRect();
  const { offset } = props;

  let x = offset ? offset.x : windowWidth.value - rect.width - gapX.value;
  let y = offset ? offset.y : windowHeight.value - rect.height - gapY.value;

  const maxX = windowWidth.value - rect.width - gapX.value;
  const maxY = windowHeight.value - rect.height - gapY.value;

  if (x < gapX.value) x = gapX.value;
  if (x > maxX) x = maxX;
  if (y < gapY.value) y = gapY.value;
  if (y > maxY) y = maxY;

  state.value = {
    x,
    y,
    width: rect.width,
    height: rect.height,
  };
};

// Inline useTouch implementation to match Vant's useTouch exactly
const touch = {
  startX: ref(0),
  startY: ref(0),
  deltaX: ref(0),
  deltaY: ref(0),
  offsetX: ref(0),
  offsetY: ref(0),
  isTap: ref(true),

  start(e: TouchEvent | MouseEvent) {
    this.startX.value = "touches" in e ? e.touches[0].clientX : e.clientX;
    this.startY.value = "touches" in e ? e.touches[0].clientY : e.clientY;
    this.deltaX.value = 0;
    this.deltaY.value = 0;
    this.offsetX.value = 0;
    this.offsetY.value = 0;
    this.isTap.value = true;
  },

  move(e: TouchEvent | MouseEvent) {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    this.deltaX.value = clientX - this.startX.value;
    this.deltaY.value = clientY - this.startY.value;
    this.offsetX.value = Math.abs(this.deltaX.value);
    this.offsetY.value = Math.abs(this.deltaY.value);

    const TAP_OFFSET = 5;
    if (this.isTap.value && (this.offsetX.value > TAP_OFFSET || this.offsetY.value > TAP_OFFSET)) {
      this.isTap.value = false;
    }
  }
};

let prevX = 0;
let prevY = 0;

const onTouchStart = (e: TouchEvent | MouseEvent) => {
  touch.start(e);
  dragging.value = true;
  prevX = state.value.x;
  prevY = state.value.y;

  if (!("touches" in e)) {
    window.addEventListener("mousemove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", onTouchEnd);
  }
};

const onTouchMove = (e: TouchEvent | MouseEvent) => {
  if (e.cancelable) {
    e.preventDefault();
  }

  const wasTap = touch.isTap.value;
  touch.move(e);

  if (wasTap && !touch.isTap.value) {
    emit("drag-start");
  }

  if (props.axis === "lock") return;

  if (!touch.isTap.value) {
    if (props.axis === "x" || props.axis === "xy") {
      let nextX = prevX + touch.deltaX.value;
      if (nextX < boundary.value.left) nextX = boundary.value.left;
      if (nextX > boundary.value.right) nextX = boundary.value.right;
      state.value.x = nextX;
    }

    if (props.axis === "y" || props.axis === "xy") {
      let nextY = prevY + touch.deltaY.value;
      if (nextY < boundary.value.top) nextY = boundary.value.top;
      if (nextY > boundary.value.bottom) nextY = boundary.value.bottom;
      state.value.y = nextY;
    }

    const offset = { x: state.value.x, y: state.value.y };
    emit("update:offset", offset);
  }
};

const closest = (arr: number[], target: number) => {
  return arr.reduce((pre, cur) =>
    Math.abs(pre - target) < Math.abs(cur - target) ? pre : cur
  );
};

const onTouchEnd = (e?: TouchEvent | MouseEvent) => {
  dragging.value = false;

  if (e && !("touches" in e) && e.type === "mouseup") {
    window.removeEventListener("mousemove", onTouchMove);
    window.removeEventListener("mouseup", onTouchEnd);
  }

  requestAnimationFrame(() => {
    if (props.magnetic === "x") {
      const nextX = closest(
        [boundary.value.left, boundary.value.right],
        state.value.x
      );
      state.value.x = nextX;
    }
    if (props.magnetic === "y") {
      const nextY = closest(
        [boundary.value.top, boundary.value.bottom],
        state.value.y
      );
      state.value.y = nextY;
    }

    if (!touch.isTap.value) {
      emit("drag-end");
      const offset = { x: state.value.x, y: state.value.y };
      emit("update:offset", offset);
      if (prevX !== offset.x || prevY !== offset.y) {
        emit("offset-change", offset);
      }
    }
  });
};

const onClick = (e: MouseEvent) => {
  if (touch.isTap.value) {
    emit("click", e);
  } else {
    e.stopPropagation();
  }
};

const handleResize = () => {
  if (typeof window !== "undefined") {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
    // Removed direct updateState() here, handled by watch
  }
};

onMounted(() => {
  updateState();
  nextTick(() => {
    initialized.value = true;
  });

  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleResize);
  }

  if (rootRef.value) {
    // useEventListener will set passive to `false` to eliminate the warning of Chrome
    rootRef.value.addEventListener("touchmove", onTouchMove as EventListener, {
      passive: false,
    });
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("mousemove", onTouchMove as EventListener);
    window.removeEventListener("mouseup", onTouchEnd as EventListener);
  }
  if (rootRef.value) {
    rootRef.value.removeEventListener("touchmove", onTouchMove as EventListener);
  }
});

watch(
  [windowWidth, windowHeight, gapX, gapY, () => props.offset],
  updateState,
  { deep: true }
);

const isOnRightSide = computed(() => {
  return state.value.x > windowWidth.value / 2;
});

defineExpose({
  isOnRightSide,
  offset: computed(() => ({ x: state.value.x, y: state.value.y })),
});
</script>

<template>
  <Teleport :to="teleport">
    <div
      v-show="show"
      ref="rootRef"
      class="floating-bubble"
      :style="rootStyle"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @mousedown="onTouchStart"
      @click.capture="onClick"
    >
      <slot></slot>
    </div>
  </Teleport>
</template>

<style>
.floating-bubble {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 999999;
  cursor: grab;
  user-select: none;
  touch-action: none;
  visibility: hidden;
  will-change: transform;
}

.floating-bubble[style*="translate3d"] {
  visibility: visible;
}

.floating-bubble:active {
  cursor: grabbing;
}
</style>
