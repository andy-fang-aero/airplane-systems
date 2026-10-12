import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // the optional AWS deploy script's tests run with npm run test:deploy (they need git and bash)
    exclude: [...configDefaults.exclude, "tests/deploy-aws*.test.ts"],
    environment: "node",
  },
});
