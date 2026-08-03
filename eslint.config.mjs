import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".gstack/**",
    // Agent scratch space. A sibling session put a git worktree in here, and
    // eslint walked into it and reported 49,000 problems in a second copy of
    // the repo plus its node_modules.
    ".claude/**",
    "public/demo/**",
  ]),
]);
