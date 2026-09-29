exports.execute = async (args) => {
  const a = args && typeof args === "object" ? args : {};
  if (a.action === "ping") return JSON.stringify({ ok: true });
  if (a.action === "import") {
    const paths = Array.isArray(a.paths) ? a.paths.map(String) : [];
    return JSON.stringify({ ok: true, paths });
  }
  return JSON.stringify({ ok: false, error: "unknown action" });
};
