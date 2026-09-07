/**
 * 测试辅助：以组件实例挂载生命周期类 composable（驱动 onMounted/onUnmounted/watch），
 * 或以 effectScope 包裹纯逻辑 composable（自动停止内部 effect）。
 */
import { defineComponent, effectScope, nextTick, type EffectScope } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";

/** 记录所有已挂载的壳组件，测试结束后统一卸载，避免跨用例泄漏监听器/定时器 */
const mountedWrappers: VueWrapper[] = [];

export interface MountedComposable<T> {
  ctx: T;
  wrapper: VueWrapper;
}

/**
 * 挂载一个调用 setup() 的壳组件。setup() 内应调用被测 composable 并返回
 * { ...api, ...refs } 之类的结果；返回的 refs 在测试中可变，从而驱动 composable 逻辑。
 */
export function mountComposable<T>(setup: () => T): MountedComposable<T> {
  let ctx!: T;
  const Host = defineComponent({
    setup() {
      ctx = setup();
      // 不渲染任何 DOM，避免污染 document.body 查询
      return () => null;
    },
  });
  const wrapper = mount(Host);
  mountedWrappers.push(wrapper);
  return { ctx, wrapper };
}

/** 卸载所有由 mountComposable 创建的壳组件 */
export async function unmountAll(): Promise<void> {
  while (mountedWrappers.length > 0) {
    const wrapper = mountedWrappers.pop()!;
    if (wrapper.exists()) {
      wrapper.unmount();
    }
  }
  await flushPromises();
}

/**
 * 在独立 effectScope 中运行 factory（适用于无生命周期钩子的纯逻辑 composable，
 * 内部 computed/effect 会随 dispose() 一起停止）。
 */
export function runScoped<T>(factory: () => T): { value: T; dispose: () => void } {
  const scope: EffectScope = effectScope();
  const value = scope.run(factory)!;
  return { value, dispose: () => scope.stop() };
}

/** 等待 Vue 响应式 flush 完成（watch flush:'pre' 等） */
export async function flushVue(): Promise<void> {
  await nextTick();
  await flushPromises();
}
