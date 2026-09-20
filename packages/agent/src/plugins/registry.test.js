"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const vitest_1 = require("vitest");
const shared_1 = require("@hoshi/shared");
const registry_1 = require("./registry");
function settingsWith(enabled) {
    return {
        ...shared_1.DEFAULT_HOSHI_SETTINGS,
        plugins: {
            enabled,
            configs: {}
        }
    };
}
(0, vitest_1.describe)("PluginRegistry", () => {
    (0, vitest_1.it)("空目录不列出内置搜索", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "hoshi-plugins-"));
        try {
            const registry = new registry_1.PluginRegistry(dir);
            registry.reload(settingsWith([]));
            (0, vitest_1.expect)(registry.list()).toEqual([]);
            (0, vitest_1.expect)(registry.tools()).toEqual([]);
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
    (0, vitest_1.it)("未启用时不向模型暴露 tool", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "hoshi-plugins-"));
        try {
            const good = (0, node_path_1.join)(dir, "echo_tool");
            (0, node_fs_1.mkdirSync)(good);
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(good, "plugin.json"), JSON.stringify({
                id: "echo_tool",
                name: "回声",
                description: "测试",
                version: "1.0.0",
                main: "index.js",
                tool: {
                    name: "echo_tool",
                    description: "echo",
                    parameters: { type: "object", properties: { text: { type: "string" } } }
                }
            }));
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(good, "index.js"), "exports.execute = async (args) => String(args.text ?? '');");
            const registry = new registry_1.PluginRegistry(dir);
            registry.reload(settingsWith([]));
            (0, vitest_1.expect)(registry.tools()).toEqual([]);
            (0, vitest_1.expect)(registry.list().map((item) => item.id)).toEqual(["echo_tool"]);
            (0, vitest_1.expect)(registry.list()[0]?.enabled).toBe(false);
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
    (0, vitest_1.it)("本地合法包出现在列表，坏包带 error 且 key 不重复", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "hoshi-plugins-"));
        try {
            const good = (0, node_path_1.join)(dir, "echo_tool");
            (0, node_fs_1.mkdirSync)(good);
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(good, "plugin.json"), JSON.stringify({
                id: "echo_tool",
                name: "回声",
                description: "测试",
                version: "1.0.0",
                main: "index.js",
                tool: {
                    name: "echo_tool",
                    description: "echo",
                    parameters: { type: "object", properties: { text: { type: "string" } } }
                }
            }));
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(good, "index.js"), "exports.execute = async (args) => String(args.text ?? '');");
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(dir, "broken"));
            const registry = new registry_1.PluginRegistry(dir);
            registry.reload(settingsWith(["echo_tool"]));
            const ids = registry.list().map((item) => item.id);
            (0, vitest_1.expect)(ids).not.toContain("web_search");
            (0, vitest_1.expect)(ids).toContain("echo_tool");
            (0, vitest_1.expect)(ids).toContain("broken");
            const keys = registry.list().map((item) => item.key);
            (0, vitest_1.expect)(new Set(keys).size).toBe(keys.length);
            (0, vitest_1.expect)(registry.list().find((item) => item.id === "broken")?.error).toBeTruthy();
            (0, vitest_1.expect)(registry.tools().map((tool) => tool.function.name)).toEqual(["echo_tool"]);
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
});
