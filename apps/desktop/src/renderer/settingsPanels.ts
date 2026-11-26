function memoryAckBadge(ackedAt: string | null | undefined): string {
  return ackedAt ? "" : "未确认";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderUsageTotals(el: HTMLElement, totals: UsageTotals): void {
  el.innerHTML = `
    <div class="usage-card"><span>输入</span><strong>${totals.promptTokens}</strong></div>
    <div class="usage-card"><span>输出</span><strong>${totals.completionTokens}</strong></div>
    <div class="usage-card"><span>缓存</span><strong>${totals.cachedTokens}</strong></div>
    <div class="usage-card"><span>合计</span><strong>${totals.totalTokens}</strong></div>
    <div class="usage-card"><span>轮次</span><strong>${totals.turns}</strong></div>
  `;
}

function renderUsageSessions(el: HTMLElement, sessions: UsageSummary["sessions"]): void {
  if (sessions.length === 0) {
    el.innerHTML = `<p class="field-hint">暂无用量记录</p>`;
    return;
  }
  el.innerHTML = sessions
    .map(
      (item) =>
        `<div class="usage-session"><span class="usage-session-title">${escapeHtml(item.title)}</span><span>↑${item.promptTokens} ↓${item.completionTokens} · ${item.totalTokens}</span></div>`
    )
    .join("");
}

function usagePurposeLabel(purpose: string): string {
  if (purpose === "chat") {
    return "对话";
  }
  if (purpose === "tool") {
    return "工具";
  }
  if (purpose === "compact") {
    return "压缩";
  }
  if (purpose === "extract") {
    return "记忆";
  }
  if (purpose === "asr") {
    return "语音识别";
  }
  return purpose;
}

function renderUsagePurpose(
  el: HTMLElement,
  byPurpose: UsageSummary["byPurpose"] | undefined
): void {
  const order = ["chat", "tool", "compact", "extract", "asr"];
  if (!byPurpose) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = order
    .map((purpose) => {
      const item = byPurpose[purpose];
      const all = item?.all;
      if (!all) {
        return "";
      }
      return `<div class="usage-session"><span class="usage-session-title">${usagePurposeLabel(purpose)}</span><span>↑${all.promptTokens} ↓${all.completionTokens} · ${all.totalTokens}（今日 ${item.today.totalTokens}）</span></div>`;
    })
    .join("");
}

function memoryKindLabel(kind: string): string {
  if (kind === "identity") {
    return "身份";
  }
  if (kind === "preference") {
    return "偏好";
  }
  if (kind === "habit") {
    return "习惯";
  }
  if (kind === "agreement") {
    return "约定";
  }
  return "其他";
}

function renderMemories(memories: MemoryItem[], archived: MemoryItem[]): void {
  const list = document.getElementById("memory-list") as HTMLDivElement;
  if (memories.length === 0 && archived.length === 0) {
    list.innerHTML = `<p class="memory-empty">暂无长期记忆</p>`;
    return;
  }
  const groups = ["identity", "agreement", "preference", "habit", "other"];
  const activeHtml = groups
    .map((kind) => {
      const items = memories.filter((item) => item.kind === kind);
      if (items.length === 0) {
        return "";
      }
      const cards = items
        .map(
          (item) => {
            const source = item.meta?.source === "knowledge" && item.meta.documentTitle
              ? `<div class="memory-source">📄 来自《${escapeHtml(item.meta.documentTitle)}》</div>`
              : "";
            const ack = memoryAckBadge(item.ackedAt);
            const ackHtml = ack ? `<span class="memory-ack">${escapeHtml(ack)}</span>` : "";
            return `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-card-body">
          <div class="memory-kind">${escapeHtml(memoryKindLabel(item.kind))}${ackHtml}</div>
          <input data-memory-text="${escapeHtml(item.id)}" value="${escapeHtml(item.text)}" />
          ${source}
        </div>
        <div class="memory-card-actions">
          <button type="button" data-memory-save="${escapeHtml(item.id)}">保存</button>
          <button type="button" class="memory-delete" data-memory-delete="${escapeHtml(item.id)}">删除</button>
        </div>
      </article>`;
          }
        )
        .join("");
      return `<h2 class="memory-group">${escapeHtml(memoryKindLabel(kind))}</h2>${cards}`;
    })
    .join("");
  const archivedHtml =
    archived.length === 0
      ? ""
      : `<h2 class="memory-group">已删除</h2>${archived
          .map(
            (item) => `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-card-body">
          <p>${escapeHtml(item.text)}</p>
        </div>
        <div class="memory-card-actions">
          <button type="button" data-memory-restore="${escapeHtml(item.id)}">恢复</button>
        </div>
      </article>`
          )
          .join("")}`;
  list.innerHTML = `${activeHtml}${archivedHtml}`;
}

function renderPlugins(plugins: PluginMarketItem[]): void {
  const list = document.getElementById("plugin-list") as HTMLDivElement;
  if (plugins.length === 0) {
    list.innerHTML = `<p class="plugin-empty">暂无插件</p>`;
    return;
  }
  list.innerHTML = plugins
    .map((plugin) => {
      const source = plugin.source === "builtin" ? "内置" : "本地";
      const fieldId = plugin.error ? plugin.key : plugin.id;
      const fields =
        plugin.enabled && plugin.settingsFields.length > 0
          ? plugin.settingsFields
              .map((field) => {
                const value = escapeHtml(plugin.config[field.key] ?? "");
                const placeholder = field.placeholder
                  ? ` placeholder="${escapeHtml(field.placeholder)}"`
                  : "";
                if (field.type === "textarea") {
                  return `<label>${escapeHtml(field.label)}<textarea data-plugin-id="${escapeHtml(fieldId)}" data-field-key="${escapeHtml(field.key)}">${value}</textarea></label>`;
                }
                const inputType = field.type === "password" ? "password" : "text";
                return `<label>${escapeHtml(field.label)}<input type="${inputType}" data-plugin-id="${escapeHtml(fieldId)}" data-field-key="${escapeHtml(field.key)}" value="${value}"${placeholder} /></label>`;
              })
              .join("")
          : "";
      const error = plugin.error ? `<p class="plugin-error">${escapeHtml(plugin.error)}</p>` : "";
      const disabled = plugin.error ? " disabled" : "";
      const checked = plugin.enabled ? " checked" : "";
      return `<article class="plugin-card" data-plugin-key="${escapeHtml(plugin.key)}">
        <div class="plugin-card-head">
          <div>
            <h2>${escapeHtml(plugin.name)}</h2>
            <div class="plugin-meta">${source} · ${escapeHtml(plugin.version)}</div>
            <p class="plugin-desc">${escapeHtml(plugin.description)}</p>
            ${error}
          </div>
          <label class="plugin-toggle"><input type="checkbox" data-plugin-enable="${escapeHtml(plugin.id)}"${checked}${disabled} />启用</label>
        </div>
        <div class="plugin-fields">${fields}</div>
      </article>`;
    })
    .join("");
}

