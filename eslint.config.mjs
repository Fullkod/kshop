import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "apps/*/android/**",
      "apps/*/release/**",
      "**/gql/**",
      "**/next-env.d.ts",
      "docs/design-v2/referencias/**",
      ".claude/**",
      ".codex/**",
      ".agents/**",
      "plugins/**",
      ".titan/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // New `any` is forbidden: use `unknown` (AGENTS.md).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    // Shared packages run in the web, the server and the Capacitor apps: never depend on Next.js.
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "@next/*"],
              message: "packages/* must not import Next.js (mobile apps reuse them).",
            },
          ],
        },
      ],
    },
  },
  {
    // Business logic goes through /api/v1 (Bearer), never Server Actions: the mobile apps need the same API.
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement > Literal[value='use server']",
          message: "No Server Actions: expose the operation in /api/v1 instead.",
        },
      ],
    },
  },
);
