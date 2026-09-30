"use strict";
function paintThemeOn(el, tokens) {
  if (!el || !tokens) return;
  if (tokens.bg) el.style.setProperty("--hoshi-bg", tokens.bg);
  if (tokens.font) el.style.setProperty("--hoshi-font", tokens.font);
  if (tokens.dialog) el.style.setProperty("--hoshi-dialog", tokens.dialog);
  if (tokens.menu) el.style.setProperty("--hoshi-menu", tokens.menu);
}
function paintLayoutIn(root, api, data) {
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
function mountHoshiPlayer(root) {
  var api = window.acquireHoshiApi();
  if (!root.querySelector("#player")) {
    root.innerHTML =
      '<div id="deco"></div><h1 id="title">播放器</h1><button id="pick" type="button">选择文件</button><audio id="player" controls></audio>';
  }
  if (api.theme) {
    api.theme().then(function (tokens) {
      paintThemeOn(root, tokens);
    });
  }
  if (api.layout) api.layout().then(function (data) {
    paintLayoutIn(root, api, data);
  });
  api.slots().then(function (slots) {
    var title = slots && slots.title ? String(slots.title) : "播放器";
    var titleEl = root.querySelector("#title");
    if (titleEl) titleEl.textContent = title;
    var filters =
      slots && Array.isArray(slots.filters) && slots.filters.length
        ? slots.filters
        : [{ name: "音频", extensions: ["mp3", "m4a", "flac", "wav", "aac", "ogg"] }];
    var multiple = !slots || slots.multiple !== false;
    var pick = root.querySelector("#pick");
    if (!pick) return;
    pick.onclick = function () {
      api.pick({ multiple: multiple, filters: filters }).then(function (paths) {
        if (!paths || !paths.length) return;
        var player = root.querySelector("#player");
        player.src = api.localUrl(paths[0]);
        void player.play();
      });
    };
  });
}
window.mountHoshiPlayer = mountHoshiPlayer;
if (document.getElementById("pick") && document.getElementById("player")) {
  mountHoshiPlayer(document.body);
}
