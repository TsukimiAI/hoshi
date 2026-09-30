"use strict";
function mountHoshiSchedule(root) {
  var api = window.acquireHoshiApi();
  var WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  root.classList.add("schedule-app");
  root.innerHTML =
    '<div class="schedule-month-page">' +
    '<div class="schedule-bar">' +
    '<div class="schedule-month-nav">' +
    '<button type="button" class="schedule-prev" aria-label="上个月">‹</button>' +
    '<span class="schedule-month-label"></span>' +
    '<button type="button" class="schedule-next" aria-label="下个月">›</button>' +
    "</div>" +
    '<button type="button" class="schedule-add">添加</button>' +
    "</div>" +
    '<div class="schedule-week"></div>' +
    '<div class="schedule-grid"></div>' +
    '<div class="schedule-agenda-head"></div>' +
    '<div class="schedule-agenda-empty">当天没有日程</div>' +
    '<div class="schedule-agenda"></div>' +
    "</div>" +
    '<form class="schedule-form" hidden>' +
    '<div class="schedule-form-body">' +
    '<label class="schedule-field">标题<input class="schedule-title" type="text" maxlength="80" required /></label>' +
    '<label class="schedule-field">日期<input class="schedule-date" type="date" required /></label>' +
    '<label class="schedule-field">时间<input class="schedule-time" type="time" /></label>' +
    '<label class="schedule-field">提醒<select class="schedule-remind">' +
    '<option value="">无</option>' +
    '<option value="0">开始时</option>' +
    '<option value="15">提前15分钟</option>' +
    "</select></label>" +
    '<label class="schedule-field">备注<textarea class="schedule-note" rows="3" maxlength="400"></textarea></label>' +
    "</div>" +
    '<div class="schedule-form-actions">' +
    '<button type="button" class="schedule-delete" hidden>删除</button>' +
    '<span class="schedule-form-spacer"></span>' +
    '<button type="button" class="schedule-cancel">取消</button>' +
    '<button type="submit" class="schedule-save">保存</button>' +
    "</div>" +
    "</form>";

  var monthPage = root.querySelector(".schedule-month-page");
  var monthLabel = root.querySelector(".schedule-month-label");
  var weekEl = root.querySelector(".schedule-week");
  var gridEl = root.querySelector(".schedule-grid");
  var agendaHead = root.querySelector(".schedule-agenda-head");
  var agendaEmpty = root.querySelector(".schedule-agenda-empty");
  var agendaEl = root.querySelector(".schedule-agenda");
  var addBtn = root.querySelector(".schedule-add");
  var prevBtn = root.querySelector(".schedule-prev");
  var nextBtn = root.querySelector(".schedule-next");
  var form = root.querySelector(".schedule-form");
  var titleInput = root.querySelector(".schedule-title");
  var dateInput = root.querySelector(".schedule-date");
  var timeInput = root.querySelector(".schedule-time");
  var remindInput = root.querySelector(".schedule-remind");
  var noteInput = root.querySelector(".schedule-note");
  var cancelBtn = root.querySelector(".schedule-cancel");
  var deleteBtn = root.querySelector(".schedule-delete");

  WEEK.forEach(function (name) {
    var el = document.createElement("span");
    el.textContent = name;
    weekEl.appendChild(el);
  });

  var events = [];
  var editingId = "";
  var now = new Date();
  var viewYear = now.getFullYear();
  var viewMonth = now.getMonth();
  var selected = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function ymd(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseYmd(s) {
    var p = String(s || "").split("-");
    if (p.length !== 3) return null;
    var y = Number(p[0]);
    var m = Number(p[1]);
    var d = Number(p[2]);
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d };
  }

  function nid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeTime(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    var h = Number(m[1]);
    var min = Number(m[2]);
    if (h > 23 || min > 59) return "";
    return pad2(h) + ":" + pad2(min);
  }

  function normalizeRemind(raw) {
    return raw === "0" || raw === "15" ? raw : "";
  }

  function persist() {
    if (!root.classList.contains("is-on")) return;
    void api.storage.set("events", { events: events });
  }

  function sortEvents() {
    events.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var at = a.time || "";
      var bt = b.time || "";
      if (!at && bt) return -1;
      if (at && !bt) return 1;
      if (at !== bt) return at < bt ? -1 : 1;
      return (a.title || "").localeCompare(b.title || "");
    });
  }

  function formOpen() {
    return !form.hidden;
  }

  function syncChrome() {
    var chrome = window.hoshiAppsChrome;
    if (!chrome || !chrome.setBackHandler) return;
    if (!root.classList.contains("is-on")) return;
    chrome.setBackHandler(
      formOpen()
        ? function () {
            showMonth();
            return true;
          }
        : null
    );
  }

  function showMonth() {
    form.hidden = true;
    monthPage.hidden = false;
    paint();
    syncChrome();
  }

  function showForm(item) {
    editingId = item && item.id ? item.id : "";
    titleInput.value = item && item.title ? item.title : "";
    dateInput.value = item && item.date ? item.date : selected;
    timeInput.value = item && item.time ? item.time : "";
    remindInput.value = item && item.remind ? item.remind : "";
    noteInput.value = item && item.note ? item.note : "";
    deleteBtn.hidden = !editingId;
    monthPage.hidden = true;
    form.hidden = false;
    titleInput.focus();
    syncChrome();
  }

  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    } else if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    paintMonth();
  }

  function selectDay(dateStr, y, m) {
    selected = dateStr;
    viewYear = y;
    viewMonth = m - 1;
    paint();
  }

  function daysWithEvents() {
    var set = {};
    events.forEach(function (item) {
      if (item.date) set[item.date] = true;
    });
    return set;
  }

  function monthCells() {
    var first = new Date(viewYear, viewMonth, 1);
    var start = new Date(viewYear, viewMonth, 1 - first.getDay());
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({
        y: d.getFullYear(),
        m: d.getMonth() + 1,
        d: d.getDate(),
        date: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()),
        inMonth: d.getMonth() === viewMonth
      });
    }
    return cells;
  }

  function paintMonth() {
    monthLabel.textContent = viewYear + "年" + (viewMonth + 1) + "月";
    var dots = daysWithEvents();
    var today = ymd(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    gridEl.replaceChildren();
    monthCells().forEach(function (cell) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "schedule-cell";
      if (!cell.inMonth) btn.classList.add("is-out");
      if (cell.date === today) btn.classList.add("is-today");
      if (cell.date === selected) btn.classList.add("is-on");
      var num = document.createElement("span");
      num.className = "schedule-cell-num";
      num.textContent = String(cell.d);
      btn.appendChild(num);
      if (dots[cell.date]) {
        var dot = document.createElement("span");
        dot.className = "schedule-cell-dot";
        btn.appendChild(dot);
      }
      btn.addEventListener("click", function () {
        selectDay(cell.date, cell.y, cell.m);
      });
      gridEl.appendChild(btn);
    });
  }

  function agendaLabel() {
    var p = parseYmd(selected);
    var today = ymd(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    if (selected === today) return "今天";
    if (!p) return selected;
    return p.m + "月" + p.d + "日";
  }

  function paintAgenda() {
    agendaHead.textContent = agendaLabel();
    var dayItems = events.filter(function (item) {
      return item.date === selected;
    });
    agendaEl.replaceChildren();
    agendaEmpty.hidden = dayItems.length > 0;
    dayItems.forEach(function (item) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "schedule-agenda-row";
      var when = document.createElement("span");
      when.className = "schedule-agenda-time";
      when.textContent = item.time || "全天";
      var title = document.createElement("span");
      title.className = "schedule-agenda-title";
      title.textContent = item.title || "未命名";
      row.appendChild(when);
      row.appendChild(title);
      row.addEventListener("click", function () {
        showForm(item);
      });
      agendaEl.appendChild(row);
    });
  }

  function paint() {
    paintMonth();
    paintAgenda();
  }

  addBtn.addEventListener("click", function () {
    showForm(null);
  });
  prevBtn.addEventListener("click", function () {
    shiftMonth(-1);
  });
  nextBtn.addEventListener("click", function () {
    shiftMonth(1);
  });
  cancelBtn.addEventListener("click", function () {
    showMonth();
  });
  deleteBtn.addEventListener("click", function () {
    if (!editingId) return;
    events = events.filter(function (it) {
      return it.id !== editingId;
    });
    persist();
    showMonth();
  });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var title = String(titleInput.value || "").trim();
    var date = String(dateInput.value || "").trim();
    var time = normalizeTime(timeInput.value);
    var remind = normalizeRemind(remindInput.value);
    var note = String(noteInput.value || "").trim();
    if (!title || !date || !parseYmd(date)) return;
    var rec = { id: editingId || nid(), title: title, date: date, time: time, remind: remind, note: note };
    if (editingId) {
      events = events.map(function (item) {
        return item.id === editingId ? rec : item;
      });
    } else {
      events.push(rec);
    }
    sortEvents();
    persist();
    var p = parseYmd(date);
    selected = date;
    if (p) {
      viewYear = p.y;
      viewMonth = p.m - 1;
    }
    showMonth();
  });

  function restore() {
    return api.storage.get("events").then(function (raw) {
      var data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      var saved = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : [];
      events = saved
        .map(function (item) {
          if (!item || typeof item !== "object") return null;
          var id = item.id ? String(item.id) : nid();
          var title = item.title ? String(item.title).slice(0, 80) : "";
          var date = item.date ? String(item.date) : "";
          var note = item.note ? String(item.note).slice(0, 400) : "";
          var time = normalizeTime(item.time);
          var remind = normalizeRemind(item.remind);
          if (!title || !parseYmd(date)) return null;
          return { id: id, title: title, date: date, time: time, remind: remind, note: note };
        })
        .filter(Boolean);
      sortEvents();
      paint();
    });
  }

  new MutationObserver(function () {
    if (root.classList.contains("is-on")) syncChrome();
  }).observe(root, { attributes: true, attributeFilter: ["class"] });

  void restore();
}
window.mountHoshiSchedule = mountHoshiSchedule;
