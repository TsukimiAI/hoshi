import type { PluginHost } from "../runtime";
import type { LlmTool } from "./types";

export class CompositePluginHost implements PluginHost {
  constructor(private readonly hosts: PluginHost[]) {}

  tools(): LlmTool[] {
    return this.hosts.flatMap((host) => host.tools());
  }

  execute(name: string, args: Record<string, unknown>): Promise<string> {
    for (const host of this.hosts) {
      if (host.tools().some((tool) => tool.function.name === name)) {
        return host.execute(name, args);
      }
    }
    return Promise.resolve(`工具不可用：${name}`);
  }
}
