import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
};

export default tseslint.config(
  {
    ignores: [
      "**/.trae/**",
      "**/coverage/**",
      "**/dist/**",
      "**/es/**",
      "**/lib/**",
      "**/node_modules/**",
      "**/*.d.ts",
    ],
  },
  {
    extends: [eslint.configs.recommended],
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals,
    },
  },
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...eslintPluginVue.configs["flat/recommended"],
    ],
    files: ["**/*.{ts,mts,cts,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
  eslintConfigPrettier,
);
