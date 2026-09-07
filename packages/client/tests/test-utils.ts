/**
 * 测试公共工具：挂载壳组件以驱动 composable 生命周期（onMounted/onUnmounted）。
 * 用渲染函数（h）而非 template，避免依赖运行时模板编译器。
 */
import { h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

export interface MountedComposable<T> {
  /** 已挂载的壳组件（用于触发 unmount 等生命周期） */
  wrapper: VueWrapper;
  /** composable 返回值 */
  api: T;
}

export function mountComposable<T>(setup: () => T): MountedComposable<T> {
  let api!: T;
  const wrapper = mount({
    setup() {
      api = setup();
      return () => h("div");
    },
  });
  return { wrapper, api };
}
