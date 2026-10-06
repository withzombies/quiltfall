import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["web/*.js", "web/*.mjs"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["tests/*.mjs", "tests/browser/*.js", "scripts/*.mjs", "*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
