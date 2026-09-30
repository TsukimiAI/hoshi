"use strict";
function paintThemeOnLauncher(el, tokens) {
  if (!el || !tokens) return;
  if (tokens.bg) el.style.setProperty("--hoshi-bg", tokens.bg);
  if (tokens.font) el.style.setProperty("--hoshi-font", tokens.font);
  if (tokens.dialog) el.style.setProperty("--hoshi-dialog", tokens.dialog);
  if (tokens.menu) el.style.setProperty("--hoshi-menu", tokens.menu);
}
function paintLayoutInLauncher(root, api, data) {
  var deco = root.querySelector("#deco");
  if (!deco) return;
  deco.replaceChildren();
  (data && data.nodes ? data.nodes : []).forEach(function (node) {
    var el;
    if (node.type === "image" && node.src) {
      el = document.createElement("img");
      el.src = api.localUrl(node.src);
    } else {
      el = document.createElement("span");
      el.textContent = node.text || "";
    }
    el.style.left = (node.x || 0) + "px";
    el.style.top = (node.y || 0) + "px";
    el.style.width = (node.w || 40) + "px";
    el.style.height = (node.h || 24) + "px";
    deco.appendChild(el);
  });
}
function mountHoshiLauncher(root) {
  var api = window.acquireHoshiApi();
  if (!root.querySelector("#list")) {
    root.innerHTML = '<div id="deco"></div><h1 id="title">启动器</h1><div id="list"></div>';
  }
  var list = root.querySelector("#list");
  if (api.theme) {
    api.theme().then(function (tokens) {
      paintThemeOnLauncher(root, tokens);
    });
  }
  if (api.layout) api.layout().then(function (data) {
    paintLayoutInLauncher(root, api, data);
  });
  api.slots().then(function (slots) {
    var titleEl = root.querySelector("#title");
    if (titleEl) titleEl.textContent = slots && slots.title ? String(slots.title) : "启动器";
  });
  api.listApps().then(function (apps) {
    (apps || []).forEach(function (app) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = app.name || "";
      btn.onclick = function () {
        void api.openExternal(app.name);
      };
      list.appendChild(btn);
    });
  });
}
window.mountHoshiLauncher = mountHoshiLauncher;
if (document.getElementById("list") && document.getElementById("title") && !document.getElementById("home")) {
  mountHoshiLauncher(document.body);
}
