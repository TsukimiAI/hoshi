import type { McpServerRow } from "./types.js";
import {
  mcpArgsInput,
  mcpCommandInput,
  mcpEnvInput,
  mcpFormErr,
  mcpIdInput,
  mcpListEl,
  mcpNote,
  mcpProbeOut,
  mcpTemplatesEl,
  emptyStateEl,
  showNote,
  wb as workbenchApi
} from "./ctx.js";

const wb = workbenchApi;

export function parseMcpForm(): { name: string; command: string; args: string[]; env: Record<string, string> } {
  const name = mcpIdInput.value.trim();
  const command = mcpCommandInput.value.trim();
  const args = mcpArgsInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const env: Record<string, string> = {};
  for (const line of mcpEnvInput.value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return { name, command, args, env };
}

function fillMcpForm(input: { name?: string; command: string; args: string[]; env: Record<string, string> }): void {
  if (input.name) mcpIdInput.value = input.name;
  mcpCommandInput.value = input.command;
  mcpArgsInput.value = input.args.join("\n");
  mcpEnvInput.value = Object.entries(input.env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function mcpStatusText(row: McpServerRow): string {
  if (!row.enabled) return "已停用";
  if (row.connected) return `已连接 · ${row.toolNames.length} 个工具`;
  return row.lastError ? "失败" : "未连接";
}

export async function refreshConnect(): Promise<void> {
  if (!wb) return;
  mcpNote.textContent = "";
  const [servers, templates] = await Promise.all([wb.listMcpServers(), wb.listMcpTemplates()]);
  mcpListEl.replaceChildren();
  if (servers.length === 0) {
    mcpListEl.appendChild(emptyStateEl("🔌", "还没有连接器，从下方模版填入或手写 command"));
  }
  for (const row of servers) {
    const li = document.createElement("li");
    const wrap = document.createElement("div");
    wrap.className = "mcp-row";
    const meta = document.createElement("div");
    meta.className = "mcp-meta";
    const h3 = document.createElement("h3");
    h3.textContent = row.name;
    const p = document.createElement("p");
    p.textContent = `${mcpStatusText(row)} · ${row.command} ${row.args.join(" ")}`.trim();
    meta.append(h3, p);
    if (row.lastError) {
      const err = document.createElement("p");
      err.textContent = row.lastError;
      meta.appendChild(err);
    }
    if (row.toolNames.length) {
      const tools = document.createElement("p");
      tools.className = "mcp-tools";
      tools.textContent = row.toolNames.join("、");
      meta.appendChild(tools);
    }
    const actions = document.createElement("div");
    actions.className = "mcp-actions";
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "card-toggle";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = row.enabled;
    toggle.addEventListener("change", () => {
      void wb
        ?.setMcpEnabled(row.name, toggle.checked)
        .then(() => refreshConnect())
        .catch((error) => {
          toggle.checked = !toggle.checked;
          showNote(error instanceof Error ? error.message : "开关失败");
        });
    });
    toggleLabel.append(toggle, document.createTextNode("启用"));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "填入表单";
    edit.addEventListener("click", () => {
      fillMcpForm(row);
    });
    const probe = document.createElement("button");
    probe.type = "button";
    probe.textContent = "试连";
    probe.addEventListener("click", () => {
      void runMcpProbe(row);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      void (async () => {
        await wb?.removeMcpServer(row.name);
        await refreshConnect();
      })().catch((error) => {
        showNote(error instanceof Error ? error.message : "删除失败");
      });
    });
    actions.append(toggleLabel, edit, probe, del);
    wrap.append(meta, actions);
    li.appendChild(wrap);
    mcpListEl.appendChild(li);
  }
  mcpTemplatesEl.replaceChildren();
  for (const tpl of templates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mcp-tpl";
    const h3 = document.createElement("h3");
    h3.textContent = tpl.name;
    const p = document.createElement("p");
    p.textContent = tpl.hints ? `${tpl.description}\n${tpl.hints}` : tpl.description;
    btn.append(h3, p);
    btn.addEventListener("click", () => {
      fillMcpForm({ name: tpl.id, command: tpl.command, args: tpl.args, env: tpl.env });
      mcpFormErr.textContent = "";
    });
    mcpTemplatesEl.appendChild(btn);
  }
}

export async function runMcpProbe(server: { name: string; command: string; args: string[]; env: Record<string, string> }): Promise<void> {
  if (!wb) return;
  mcpProbeOut.hidden = false;
  mcpProbeOut.textContent = "试连中…";
  try {
    const result = await wb.probeMcpServer(server);
    mcpProbeOut.textContent = result.ok
      ? `试连成功\n${result.toolNames.join("\n") || "（无工具）"}`
      : `试连失败\n${result.error}`;
  } catch (error) {
    mcpProbeOut.textContent = error instanceof Error ? error.message : "试连失败";
  }
}
