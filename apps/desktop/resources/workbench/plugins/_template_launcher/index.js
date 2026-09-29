exports.execute = async (args, ctx) => {
  const a = args && typeof args === "object" ? args : {};
  if (a.action === "ping") return JSON.stringify({ ok: true });
  if (a.action === "list") {
    const apps = typeof ctx.listApps === "function" ? await ctx.listApps() : [];
    return JSON.stringify({ ok: true, apps });
  }
  if (a.action === "open") {
    const name = String(a.app || "").trim();
    if (!name) return JSON.stringify({ ok: false, error: "缺少 app" });
    if (typeof ctx.openExternal !== "function") return JSON.stringify({ ok: false, error: "无 openExternal" });
    await ctx.openExternal(name);
    return JSON.stringify({ ok: true, app: name });
  }
  return JSON.stringify({ ok: false, error: "unknown action" });
};
