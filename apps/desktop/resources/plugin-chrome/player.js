"use strict";
var api = window.acquireHoshiApi();
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
  var title = slots && slots.title ? String(slots.title) : "播放器";
  document.getElementById("title").textContent = title;
  var filters =
    slots && Array.isArray(slots.filters) && slots.filters.length
      ? slots.filters
      : [{ name: "音频", extensions: ["mp3", "m4a", "flac", "wav", "aac", "ogg"] }];
  var multiple = !slots || slots.multiple !== false;
  document.getElementById("pick").onclick = function () {
    api.pick({ multiple: multiple, filters: filters }).then(function (paths) {
      if (!paths || !paths.length) return;
      var player = document.getElementById("player");
      player.src = api.localUrl(paths[0]);
      void player.play();
    });
  };
});
