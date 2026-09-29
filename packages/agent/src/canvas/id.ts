/** 模型常把卡片 id 写成 weather-week 这类 slug，HTTP 路径不能只认 UUID。 */
export function canvasItemIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/v1/canvas/")) {
    return null;
  }
  const rest = pathname.slice("/v1/canvas/".length);
  if (!rest || rest.includes("/")) {
    return null;
  }
  let id = rest;
  try {
    id = decodeURIComponent(rest);
  } catch {
    return null;
  }
  id = id.trim();
  if (!id || id === "." || id === ".." || id === "restore" || id === "snapshots" || id === "reorder") {
    return null;
  }
  return id;
}
