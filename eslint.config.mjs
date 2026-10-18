import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
      ".private/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
    },
  },
  // Allow console.warn and console.error in lib/log.ts
  {
    files: ["lib/log.ts"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  // Allow console in scripts and tests
  {
    files: ["scripts/**", "tests/**"],
    rules: {
      "no-console": "off",
    },
  },
  // Forbid process.env outside lib/config.ts, scripts/, tests/, and root configs
  {
    ignores: [
      "lib/config.ts",
      "scripts/**",
      "tests/**",
      "*.config.ts",
      "*.config.mjs",
      "*.config.js",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "process.env is forbidden outside lib/config.ts, scripts/, and tests/.",
        },
      ],
    },
  },
  // Forbid importing from lib/qloo/ inside app/**/page.tsx
  {
    files: ["app/**/page.tsx", "app/**/page.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/qloo/*", "@/lib/qloo", "../lib/qloo/*", "../../lib/qloo/*"],
              message: "Direct imports from lib/qloo are forbidden in page components. The browser must never touch the Qloo client.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
