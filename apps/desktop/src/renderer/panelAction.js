"use strict";
function resolveLeftClickAction(state) {
    if (state.dockVisible && state.chatVisible) {
        return "closeAll";
    }
    return "showChat";
}
function resolveRightClickAction(state) {
    const sidebarOpen = state.dockVisible && !state.chatVisible;
    if (state.fanVisible || sidebarOpen) {
        return "closeAll";
    }
    return "showFan";
}
globalThis.hoshiPanelAction = {
    resolveLeftClickAction,
    resolveRightClickAction
};
