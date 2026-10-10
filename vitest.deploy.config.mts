import { configDefaults, defineConfig } from "vitest/config";
import config from "./vitest.config.mts";

// Reuse the aliases; the deploy suite is explicitly opt-in.
export default defineConfig({
  ...config,
  test: { ...config.test, include: ["tests/deploy-aws*.test.ts"], exclude: configDefaults.exclude },
});
