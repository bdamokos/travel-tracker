import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "plugin:jsx-a11y/recommended"),
  {
    rules: {
      // Downgrade some rules from errors to warnings to prevent build failures
      "@typescript-eslint/no-unused-vars": "warn",
      // "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      // Keep a11y checks visible without blocking CI until legacy violations are resolved.
      // Tracking: https://github.com/bdamokos/travel-tracker/issues/219 (target: 2026-03-31)
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/html-has-lang": "warn",
      "jsx-a11y/label-has-associated-control": ["warn", {
        controlComponents: ["AccessibleDatePicker", "AriaSelect"],
        depth: 3
      }],
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
];

export default eslintConfig;
