"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
require("./panelAction");
const { resolveLeftClickAction, resolveRightClickAction } = globalThis.hoshiPanelAction;
(0, vitest_1.describe)("panel actions", () => {
    (0, vitest_1.it)("左键：对话打开时收回，否则打开对话", () => {
        (0, vitest_1.expect)(resolveLeftClickAction({
            fanVisible: false,
            dockVisible: true,
            chatVisible: true
        })).toBe("closeAll");
        (0, vitest_1.expect)(resolveLeftClickAction({
            fanVisible: true,
            dockVisible: false,
            chatVisible: false
        })).toBe("showChat");
    });
    (0, vitest_1.it)("右键：侧栏打开时收回，否则打开侧栏", () => {
        (0, vitest_1.expect)(resolveRightClickAction({
            fanVisible: true,
            dockVisible: false,
            chatVisible: false
        })).toBe("closeAll");
        (0, vitest_1.expect)(resolveRightClickAction({
            fanVisible: false,
            dockVisible: true,
            chatVisible: false
        })).toBe("closeAll");
        (0, vitest_1.expect)(resolveRightClickAction({
            fanVisible: false,
            dockVisible: false,
            chatVisible: false
        })).toBe("showFan");
    });
});
