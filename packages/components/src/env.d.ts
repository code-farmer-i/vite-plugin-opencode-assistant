/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;

  export default component;
}
