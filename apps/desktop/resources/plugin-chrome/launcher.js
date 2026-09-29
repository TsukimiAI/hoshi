"use strict";
var api = window.acquireHoshiApi();
var list = document.getElementById("list");
function paintTheme(tokens) {
  if (!tokens) return;
  var root = document.documentElement;
  if (tokens.bg) root.style.setProperty("--hoshi-bg", tokens.bg);
  if (tokens.font) root.style.setProperty("--hoshi-font", tokens.font);
  if (tokens.dialog) root.style.setProperty("--hoshi-dialog", tokens.dialog);
  if (tokens.menu) root.style.setProperty("--hoshi-menu", tokens.menu);
}
function paintLayout(data) {
  var deco = document.getElementById("deco");
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
if (api.theme) api.theme().then(paintTheme);
if (api.layout) api.layout().then(paintLayout);
api.slots().then(function (slots) {
  document.getElementById("title").textContent = slots && slots.title ? String(slots.title) : "启动器";
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
