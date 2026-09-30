"use strict";
var api = window.acquireHoshiApi();
var home = document.getElementById("home");
var grid = document.getElementById("grid");
var empty = document.getElementById("empty");
var stage = document.getElementById("stage");
var back = document.getElementById("back");
var closeBtn = document.getElementById("close");
var barMini = document.getElementById("bar-mini");
var barTitle = document.getElementById("bar-title");
var box = document.getElementById("box");
var mounts = {};
var currentId = "";
var lastAppSize = { width: 280, height: 360 };
var backHandler = null;

window.hoshiAppsChrome = {
  setMini: function (on) {
    box.classList.toggle("is-mini", Boolean(on));
    if (on) {
      back.hidden = true;
      barMini.hidden = true;
      if (api.setBoxSize) void api.setBoxSize([280, 56]);
    } else if (currentId) {
      back.hidden = false;
      if (api.setBoxSize) void api.setBoxSize([lastAppSize.width, lastAppSize.height]);
    }
  },
  setBackHandler: function (fn) {
    backHandler = typeof fn === "function" ? fn : null;
  },
  setMiniVisible: function (on) {
    barMini.hidden = !on;
  }
};

function showHome(size) {
  currentId = "";
  backHandler = null;
  barMini.hidden = true;
  box.classList.remove("is-mini");
  home.classList.remove("is-off");
  stage.classList.remove("open");
  back.hidden = true;
  barTitle.textContent = "应用";
  Array.prototype.forEach.call(stage.children, function (el) {
    el.classList.remove("is-on");
  });
  if (size && api.setBoxSize) {
    void api.setBoxSize([size.width, size.height]);
  }
}

function showApp(id, title, size) {
  currentId = id;
  backHandler = null;
  barMini.hidden = true;
  box.classList.remove("is-mini");
  home.classList.add("is-off");
  stage.classList.add("open");
  back.hidden = false;
  barTitle.textContent = title || "应用";
  Array.prototype.forEach.call(stage.children, function (el) {
    el.classList.toggle("is-on", el.getAttribute("data-plugin") === id);
  });
  if (size && api.setBoxSize) {
    lastAppSize = { width: size.width, height: size.height };
    void api.setBoxSize([size.width, size.height]);
  }
}

function renderList(apps) {
  grid.replaceChildren();
  if (!apps || !apps.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  apps.forEach(function (item) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-icon";
    var glyph = document.createElement("img");
    glyph.className = "app-glyph-img";
    glyph.alt = "";
    var icon = item.icon || item.template || "panel";
    glyph.src = "icons/" + icon + ".svg";
    var name = document.createElement("span");
    name.className = "app-name";
    name.textContent = item.title || item.pluginId;
    btn.appendChild(glyph);
    btn.appendChild(name);
    btn.addEventListener("click", function () {
      void openApp(item);
    });
    grid.appendChild(btn);
  });
}

function refresh() {
  return api.listPluginApps().then(function (data) {
    var apps = data && data.apps ? data.apps : [];
    renderList(apps);
    if (!currentId) {
      showHome(data && data.size);
    } else if (!apps.some(function (item) { return item.pluginId === currentId; })) {
      showHome(data && data.size);
    }
    return data;
  });
}

function openApp(item) {
  return api.activate(item.pluginId).then(function (info) {
    if (!mounts[item.pluginId]) {
      var view = document.createElement("div");
      view.className = "app-view";
      view.setAttribute("data-plugin", item.pluginId);
      stage.appendChild(view);
      if (info.template === "launcher") {
        window.mountHoshiLauncher(view);
      } else if (info.template === "music") {
        window.mountHoshiMusic(view);
      } else if (info.template === "schedule") {
        window.mountHoshiSchedule(view);
      } else {
        window.mountHoshiPlayer(view);
      }
      mounts[item.pluginId] = view;
    }
    showApp(item.pluginId, item.title, info.size);
    if (mounts[item.pluginId] && mounts[item.pluginId].__expandMusic) {
      mounts[item.pluginId].__expandMusic();
    }
  });
}

back.addEventListener("click", function () {
  if (backHandler && backHandler()) return;
  void refresh().then(function (data) {
    showHome(data && data.size);
  });
});
barMini.addEventListener("click", function () {
  var view = currentId ? mounts[currentId] : null;
  if (view && view.__collapseMusic) view.__collapseMusic();
});
closeBtn.addEventListener("click", function () {
  api.close();
});
if (api.onAppsChanged) {
  api.onAppsChanged(function (removedId) {
    if (removedId && mounts[removedId]) {
      mounts[removedId].remove();
      delete mounts[removedId];
    }
    void refresh();
  });
}
void refresh();
