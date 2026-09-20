interface PanelSnapshot {
  fanVisible: boolean;
  dockVisible: boolean;
  chatVisible: boolean;
}

type PanelAction = "showChat" | "showFan" | "closeAll";

function resolveLeftClickAction(state: PanelSnapshot): PanelAction {
  if (state.dockVisible && state.chatVisible) {
    return "closeAll";
  }
  return "showChat";
}

function resolveRightClickAction(state: PanelSnapshot): PanelAction {
  const sidebarOpen = state.dockVisible && !state.chatVisible;
  if (state.fanVisible || sidebarOpen) {
    return "closeAll";
  }
  return "showFan";
}

(globalThis as unknown as {
  hoshiPanelAction: {
    resolveLeftClickAction: typeof resolveLeftClickAction;
    resolveRightClickAction: typeof resolveRightClickAction;
  };
}).hoshiPanelAction = {
  resolveLeftClickAction,
  resolveRightClickAction
};
