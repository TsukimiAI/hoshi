"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
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
