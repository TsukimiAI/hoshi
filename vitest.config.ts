import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "packages/agent/src/**/*.ts",
        "packages/shared/src/**/*.ts",
        "apps/desktop/src/renderer/panelAction.ts",
        "packages/shared/src/settings.ts"
      ]
    }
  }
});
