"use strict";
function mountHoshiMusic(root) {
  var api = window.acquireHoshiApi();
  var FILTERS = [{ name: "音频", extensions: ["mp3", "m4a", "flac", "wav", "aac", "ogg"] }];
  var ICO_PREV = '<svg width="20" height="20" viewBox="0 0 22 22" fill="currentColor"><path d="M5 4h1.6v14H5V4zm3.2 7L18 4.6v12.8L8.2 11z"/></svg>';
  var ICO_NEXT = '<svg width="20" height="20" viewBox="0 0 22 22" fill="currentColor"><path d="M15.4 4H17v14h-1.6V4zM4 4.6L13.8 11 4 17.4V4.6z"/></svg>';
  var ICO_PLAY = '<svg width="18" height="18" viewBox="0 0 22 22" fill="#fff"><path d="M7 4.8v12.4L17.4 11 7 4.8z"/></svg>';
  var ICO_PAUSE = '<svg width="18" height="18" viewBox="0 0 22 22" fill="#fff"><path d="M6 5h3.4v12H6V5zm6.6 0H16v12h-3.4V5z"/></svg>';
  var ICO_PLAY_D = '<svg width="16" height="16" viewBox="0 0 22 22" fill="currentColor"><path d="M7 4.8v12.4L17.4 11 7 4.8z"/></svg>';
  var ICO_PAUSE_D = '<svg width="16" height="16" viewBox="0 0 22 22" fill="currentColor"><path d="M6 5h3.4v12H6V5zm6.6 0H16v12h-3.4V5z"/></svg>';
  var ICO_NOTE = '<svg width="22" height="22" viewBox="0 0 22 22" fill="#fff"><path d="M8 4v9.1A3.4 3.4 0 1 0 9.9 16V8.6l7-1.6v6.2A3.4 3.4 0 1 0 18.7 16V6.2c0-.7-.6-1.2-1.3-1L9.3 6.8C8.6 7 8 7.6 8 8.3V4z"/></svg>';
  var ICO_VOL = '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2 6.2h2.2L7 4v8L4.2 9.8H2V6.2zm8 1.8a2.2 2.2 0 0 0-1.2-2v4A2.2 2.2 0 0 0 10 8zm1.7-3.4v6.8A4.4 4.4 0 0 0 14 8a4.4 4.4 0 0 0-2.3-3.4z"/></svg>';
  root.classList.add("music-app");
  root.innerHTML =
    '<div class="music-lib">' +
    '<div class="music-lib-bar"><span>曲库</span><button type="button" class="music-add">导入</button></div>' +
    '<div class="music-empty"><div class="music-empty-ico">' + ICO_NOTE + '</div><div>从本机导入音频</div></div>' +
    '<div class="music-list"></div>' +
    "</div>" +
    '<div class="music-now" hidden>' +
    '<div class="music-art"></div>' +
    '<div class="music-title">未播放</div>' +
    '<div class="music-artist"></div>' +
    '<div class="music-seek" role="slider" aria-label="进度" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0">' +
    '<div class="music-seek-track"><div class="music-seek-fill"></div><div class="music-seek-thumb"></div></div>' +
    "</div>" +
    '<div class="music-time"><span class="music-cur">0:00</span><span class="music-dur">0:00</span></div>' +
    '<div class="music-ctrl">' +
    '<div class="music-ctrl-side"><button type="button" class="music-mode" aria-label="播放模式">列表</button></div>' +
    '<div class="music-ctrl-mid">' +
    '<button type="button" class="music-prev" aria-label="上一首">' + ICO_PREV + "</button>" +
    '<button type="button" class="music-play" aria-label="播放">' + ICO_PLAY + "</button>" +
    '<button type="button" class="music-next" aria-label="下一首">' + ICO_NEXT + "</button>" +
    "</div>" +
    '<div class="music-ctrl-side music-ctrl-right">' +
    '<div class="music-vol-wrap">' +
    '<button type="button" class="music-vol-btn" aria-label="音量">' + ICO_VOL + "</button>" +
    '<div class="music-vol-pop" hidden><input class="music-vol" type="range" min="0" max="100" value="80" /></div>' +
    "</div></div></div>" +
    "</div>" +
    '<div class="music-dock" hidden>' +
    '<button type="button" class="music-dock-art" aria-label="展开"></button>' +
    '<div class="music-dock-meta"><div class="music-dock-title">未播放</div><div class="music-dock-artist"></div></div>' +
    '<button type="button" class="music-dock-play" aria-label="播放">' + ICO_PLAY_D + "</button>" +
    '<button type="button" class="music-dock-next" aria-label="下一首">' + ICO_NEXT + "</button>" +
    "</div>" +
    '<audio class="music-audio"></audio>';
  var lib = root.querySelector(".music-lib");
  var now = root.querySelector(".music-now");
  var dock = root.querySelector(".music-dock");
  var listEl = root.querySelector(".music-list");
  var empty = root.querySelector(".music-empty");
  var art = root.querySelector(".music-art");
  var titleEl = root.querySelector(".music-title");
  var artistEl = root.querySelector(".music-artist");
  var dockArt = root.querySelector(".music-dock-art");
  var dockTitle = root.querySelector(".music-dock-title");
  var dockArtist = root.querySelector(".music-dock-artist");
  var seek = root.querySelector(".music-seek");
  var seekFill = root.querySelector(".music-seek-fill");
  var seekThumb = root.querySelector(".music-seek-thumb");
  var curEl = root.querySelector(".music-cur");
  var durEl = root.querySelector(".music-dur");
  var playBtn = root.querySelector(".music-play");
  var dockPlay = root.querySelector(".music-dock-play");
  var modeBtn = root.querySelector(".music-mode");
  var volBtn = root.querySelector(".music-vol-btn");
  var volPop = root.querySelector(".music-vol-pop");
  var vol = root.querySelector(".music-vol");
  var audio = root.querySelector(".music-audio");
  var tracks = [];
  var index = 0;
  var seeking = false;
  var mode = "all";
  var history = [];
  var mini = false;
  var wantPlay = false;
  var enterPlay = false;
  audio.volume = 0.8;

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var s = Math.floor(sec % 60);
    var m = Math.floor(sec / 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function colorFor(title) {
    var n = 0;
    for (var i = 0; i < (title || "").length; i++) n = (n + title.charCodeAt(i) * (i + 1)) % 360;
    return "hsl(" + n + " 42% 46%)";
  }
  function persist() {
    if (!root.classList.contains("is-on")) return;
    void api.storage.set("library", {
      tracks: tracks.map(function (t) {
        return { path: t.path, title: t.title, artist: t.artist };
      }),
      index: index,
      mode: mode,
      volume: Math.round(audio.volume * 100)
    });
  }
  function setPlaying(on) {
    playBtn.innerHTML = on ? ICO_PAUSE : ICO_PLAY;
    playBtn.setAttribute("aria-label", on ? "暂停" : "播放");
    dockPlay.innerHTML = on ? ICO_PAUSE_D : ICO_PLAY_D;
    dockPlay.setAttribute("aria-label", on ? "暂停" : "播放");
  }
  function duration() {
    var d = audio.duration;
    return isFinite(d) && d > 0 ? d : 0;
  }
  function paintSeek(ratio) {
    var x = Math.min(1, Math.max(0, ratio));
    seekFill.style.width = x * 100 + "%";
    seekThumb.style.left = x * 100 + "%";
    seek.setAttribute("aria-valuenow", String(Math.round(x * 1000)));
  }
  function paintModes() {
    var label = mode === "one" ? "单曲" : mode === "shuffle" ? "随机" : mode === "off" ? "顺序" : "列表";
    modeBtn.textContent = label;
    modeBtn.classList.toggle("is-off", mode === "off");
    modeBtn.setAttribute("aria-label", "播放模式 " + label);
  }
  function paintCover(el, t) {
    if (!t) {
      el.style.backgroundImage = "";
      el.style.backgroundColor = "#d1d1d6";
      return;
    }
    if (t.picture) {
      el.style.backgroundImage = "url(" + JSON.stringify(t.picture) + ")";
      el.style.backgroundColor = "";
    } else {
      el.style.backgroundImage = "";
      el.style.backgroundColor = colorFor(t.title || t.path);
    }
  }
  function paintNow() {
    var t = tracks[index];
    titleEl.textContent = t ? t.title || "未知曲目" : "未播放";
    artistEl.textContent = t ? t.artist || "" : "";
    dockTitle.textContent = titleEl.textContent;
    dockArtist.textContent = artistEl.textContent;
    paintCover(art, t);
    paintCover(dockArt, t);
  }
  function requestPlay() {
    wantPlay = true;
    if (audio.readyState >= 2) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    }
  }
  function showLib() {
    if (mini) setMini(false);
    lib.hidden = false;
    now.hidden = true;
    dock.hidden = true;
    syncChrome();
  }
  function showNow() {
    if (mini) setMini(false);
    lib.hidden = true;
    now.hidden = false;
    dock.hidden = true;
    syncChrome();
  }
  function syncChrome() {
    var chrome = window.hoshiAppsChrome;
    if (!chrome) return;
    var onNow = !now.hidden && !mini;
    if (chrome.setMiniVisible) chrome.setMiniVisible(onNow);
    if (chrome.setBackHandler) {
      chrome.setBackHandler(
        onNow
          ? function () {
              showLib();
              paintList();
              return true;
            }
          : null
      );
    }
  }
  function setMini(on) {
    mini = on;
    lib.hidden = true;
    now.hidden = true;
    dock.hidden = !on;
    if (window.hoshiAppsChrome && window.hoshiAppsChrome.setMini) {
      window.hoshiAppsChrome.setMini(on);
    }
    if (!on) {
      now.hidden = false;
      dock.hidden = true;
    }
    syncChrome();
  }
  function paintList() {
    listEl.replaceChildren();
    empty.hidden = tracks.length > 0;
    var playing = !audio.paused && Boolean(audio.src);
    tracks.forEach(function (t, i) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "music-row" + (i === index ? " is-on" : "");
      var cover = document.createElement("span");
      cover.className = "music-row-art";
      paintCover(cover, t);
      var meta = document.createElement("span");
      meta.className = "music-row-meta";
      var name = document.createElement("span");
      name.className = "music-row-title";
      name.textContent = t.title || "未知曲目";
      var by = document.createElement("span");
      by.className = "music-row-artist";
      by.textContent = t.artist || "未知艺人";
      meta.appendChild(name);
      meta.appendChild(by);
      var mark = document.createElement("span");
      mark.className = "music-row-mark";
      mark.textContent = i === index ? (playing ? "播放中" : "当前") : "";
      row.appendChild(cover);
      row.appendChild(meta);
      row.appendChild(mark);
      row.addEventListener("click", function () {
        playAt(i, true);
      });
      listEl.appendChild(row);
    });
  }
  function loadSrc() {
    if (!tracks[index]) return;
    audio.src = api.localUrl(tracks[index].path);
    audio.load();
    paintNow();
    paintList();
  }
  function playAt(i, openNow) {
    if (!tracks.length) return;
    var next = ((i % tracks.length) + tracks.length) % tracks.length;
    if (next === index && audio.src) {
      if (openNow) showNow();
      requestPlay();
      return;
    }
    if (mode === "shuffle" && index !== next) history.push(index);
    index = next;
    loadSrc();
    requestPlay();
    persist();
    if (openNow) showNow();
  }
  function enterNowAndPlay() {
    enterPlay = true;
    if (!tracks.length) {
      showLib();
      return;
    }
    if (!audio.src) loadSrc();
    showNow();
    requestPlay();
  }
  root.__expandMusic = function () {
    if (mini) setMini(false);
    enterNowAndPlay();
  };
  root.__collapseMusic = function () {
    setMini(true);
    paintNow();
  };
  function nextIndex() {
    if (!tracks.length) return -1;
    if (mode === "one") return index;
    if (mode === "shuffle" && tracks.length > 1) {
      var pool = [];
      for (var i = 0; i < tracks.length; i++) if (i !== index) pool.push(i);
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (index + 1 < tracks.length) return index + 1;
    if (mode === "all") return 0;
    return -1;
  }
  function prevIndex() {
    if (mode === "shuffle" && history.length) return history.pop();
    if (index > 0) return index - 1;
    if ((mode === "all" || mode === "shuffle") && tracks.length) return tracks.length - 1;
    return index;
  }
  function goNext(openNow) {
    var n = nextIndex();
    if (n < 0) {
      wantPlay = false;
      audio.pause();
      return;
    }
    if (mode === "one") {
      audio.currentTime = 0;
      requestPlay();
      return;
    }
    playAt(n, openNow);
  }
  function commitSeek(ratio) {
    var x = Math.min(1, Math.max(0, ratio));
    paintSeek(x);
    var dur = duration();
    if (!dur) return;
    try {
      audio.currentTime = x * dur;
    } catch {
      /* ignore */
    }
    curEl.textContent = fmt(x * dur);
  }
  function bindSeek(el) {
    var pending = 0;
    var gen = 0;
    function ratioFromEvent(ev) {
      var rect = el.getBoundingClientRect();
      return rect.width ? Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) : 0;
    }
    function onMove(ev) {
      if (!seeking) return;
      ev.preventDefault();
      pending = ratioFromEvent(ev);
      paintSeek(pending);
      var dur = duration();
      if (dur) curEl.textContent = fmt(pending * dur);
    }
    function onUp() {
      if (!seeking) return;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      var id = gen;
      commitSeek(pending);
      var finish = function () {
        if (id !== gen) return;
        seeking = false;
        audio.removeEventListener("seeked", finish);
      };
      audio.addEventListener("seeked", finish);
      setTimeout(finish, 500);
    }
    el.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      gen += 1;
      seeking = true;
      pending = ratioFromEvent(ev);
      paintSeek(pending);
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    });
  }

  root.querySelector(".music-add").onclick = function () {
    api.pick({ multiple: true, filters: FILTERS }).then(function (paths) {
      if (!paths || !paths.length || !api.probeTracks) return;
      return api.probeTracks(paths).then(function (tags) {
        (tags || []).forEach(function (tag) {
          var hit = tracks.findIndex(function (t) {
            return t.path === tag.path;
          });
          if (hit >= 0) tracks[hit] = tag;
          else tracks.push(tag);
        });
        if (tags && tags.length) {
          var last = tags[tags.length - 1];
          var at = tracks.findIndex(function (t) {
            return t.path === last.path;
          });
          persist();
          playAt(at < 0 ? tracks.length - 1 : at, true);
        } else {
          paintList();
        }
      });
    });
  };
  dockArt.onclick = function () {
    setMini(false);
    showNow();
  };
  root.querySelector(".music-prev").onclick = function () {
    playAt(prevIndex(), !mini);
  };
  root.querySelector(".music-next").onclick = function () {
    goNext(!mini);
  };
  root.querySelector(".music-dock-next").onclick = function (ev) {
    ev.stopPropagation();
    goNext(false);
  };
  modeBtn.onclick = function () {
    mode = mode === "all" ? "one" : mode === "one" ? "shuffle" : mode === "shuffle" ? "off" : "all";
    if (mode !== "shuffle") history = [];
    paintModes();
    persist();
  };
  volBtn.onclick = function (ev) {
    ev.stopPropagation();
    volPop.hidden = !volPop.hidden;
  };
  document.addEventListener("pointerdown", function (ev) {
    if (!volPop.hidden && !root.querySelector(".music-vol-wrap").contains(ev.target)) {
      volPop.hidden = true;
    }
  });
  vol.oninput = function () {
    audio.volume = Number(vol.value) / 100;
    persist();
  };
  function togglePlay() {
    if (!tracks.length) return;
    if (!audio.src) loadSrc();
    if (audio.paused) requestPlay();
    else {
      wantPlay = false;
      audio.pause();
    }
  }
  playBtn.onclick = togglePlay;
  dockPlay.onclick = function (ev) {
    ev.stopPropagation();
    togglePlay();
  };
  bindSeek(seek);
  audio.addEventListener("timeupdate", function () {
    var dur = duration();
    if (seeking || !dur) return;
    paintSeek(audio.currentTime / dur);
    curEl.textContent = fmt(audio.currentTime);
    durEl.textContent = fmt(dur);
  });
  audio.addEventListener("canplay", function () {
    if (wantPlay) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    }
  });
  audio.addEventListener("loadedmetadata", function () {
    durEl.textContent = fmt(duration());
  });
  audio.addEventListener("ended", function () {
    if (mode === "one") {
      audio.currentTime = 0;
      requestPlay();
      return;
    }
    var n = nextIndex();
    if (n < 0) {
      wantPlay = false;
      setPlaying(false);
      return;
    }
    playAt(n, false);
  });
  audio.addEventListener("play", function () {
    setPlaying(true);
    paintList();
  });
  audio.addEventListener("pause", function () {
    setPlaying(false);
    paintList();
  });
  setPlaying(false);
  paintModes();

  function restore() {
    return api.storage.get("library").then(function (raw) {
      var data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (data.mode === "one" || data.mode === "off" || data.mode === "all" || data.mode === "shuffle") {
        mode = data.mode;
      } else if (data.shuffle === true) {
        mode = "shuffle";
      } else if (data.loop === "one" || data.loop === "off" || data.loop === "all") {
        mode = data.loop;
      }
      if (typeof data.volume === "number") {
        audio.volume = Math.min(1, Math.max(0, data.volume / 100));
        vol.value = String(Math.round(audio.volume * 100));
      }
      paintModes();
      var saved = Array.isArray(data.tracks) ? data.tracks : [];
      var paths = saved
        .map(function (t) {
          return t && t.path ? String(t.path) : "";
        })
        .filter(Boolean);
      if (!paths.length || !api.probeTracks) {
        paintList();
        return;
      }
      return api.probeTracks(paths).then(function (tags) {
        tracks = tags || [];
        index = Math.min(Math.max(0, Number(data.index) || 0), Math.max(0, tracks.length - 1));
        persist();
        paintList();
        paintNow();
        if (tracks[index]) loadSrc();
        if (enterPlay) enterNowAndPlay();
      });
    });
  }
  void restore();
}
window.mountHoshiMusic = mountHoshiMusic;
