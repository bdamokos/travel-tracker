import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Downgrade some rules from errors to warnings to prevent build failures
      "@typescript-eslint/no-unused-vars": "warn",
      // "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      // Keep jsx-a11y enabled as errors (see: https://github.com/bdamokos/travel-tracker/issues/227)
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/label-has-associated-control": ["error", {
        controlComponents: ["AccessibleDatePicker", "AriaSelect"],
        depth: 3
      }],
      // React Aria uses non-DOM `autoFocus` props (e.g. <FocusScope autoFocus>) for accessible
      // focus management in dialogs; keep the rule for DOM elements but ignore non-DOM props.
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
      // Note: jsx-a11y/no-noninteractive-element-interactions is disabled with inline comments
      // where role="application" is used (e.g., interactive map widgets)
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        {
          // Allow tabIndex on elements with role="application" (e.g., interactive map widgets)
          roles: ["application"],
          tags: [],
        },
      ],
      "jsx-a11y/no-static-element-interactions": "error",
    },
  },
];

export default eslintConfig;
