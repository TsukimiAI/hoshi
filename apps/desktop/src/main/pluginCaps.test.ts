import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { disposePluginCaps, pluginIdForMediaPath, setPluginMediaRoot, isPluginMediaAllowed } from "./pluginCaps";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirs.length = 0;
  disposePluginCaps("a");
  disposePluginCaps("b");
});

describe("pluginIdForMediaPath", () => {
  it("按媒体根目录命中插件", () => {
    const a = mkdtempSync(join(tmpdir(), "hoshi-a-"));
    const b = mkdtempSync(join(tmpdir(), "hoshi-b-"));
    dirs.push(a, b);
    writeFileSync(join(a, "x.png"), "a");
    writeFileSync(join(b, "x.png"), "b");
    setPluginMediaRoot("a", a);
    setPluginMediaRoot("b", b);
    expect(pluginIdForMediaPath(join(a, "x.png"))).toBe("a");
    expect(pluginIdForMediaPath(join(b, "x.png"))).toBe("b");
    expect(isPluginMediaAllowed("a", join(a, "x.png"))).toBe(true);
    expect(isPluginMediaAllowed("a", join(b, "x.png"))).toBe(false);
  });
});
