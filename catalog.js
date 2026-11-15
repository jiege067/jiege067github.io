(function () {
  "use strict";

  var CARS = (window.A9_CARS && window.A9_CARS.cars) || [];

  var state = { q: "", cls: "全部", star: "全部", key: false, sort: "score" };

  // 各项性能在全部车里的最大值，用来画进度条
  var MAX = { top: 1, accel: 1, handling: 1, nitroPower: 1 };
  CARS.forEach(function (c) {
    ["top", "accel", "handling", "nitroPower"].forEach(function (k) {
      var v = c.perf[k];
      if (v != null && v > MAX[k]) MAX[k] = v;
    });
  });

  var ICONS = {
    top: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1.2 9.2a5 5 0 1 1 9.6 0"/><path d="M6 9.2 8.2 6.4"/></svg>',
    accel: '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M7.2.8 2.2 6.6h2.7L4.6 11.2 9.8 5.2H6.9z"/></svg>',
    handling: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="6" r="4.4"/><circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none"/></svg>',
    nitro: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M6 1.2c2.2 2.6 3.4 4.3 3.4 5.9A3.4 3.4 0 0 1 6 10.8 3.4 3.4 0 0 1 2.6 7.1C2.6 5.5 3.8 3.8 6 1.2z"/></svg>'
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v, d) {
    if (v == null || isNaN(v)) return "-";
    return d ? Number(v).toFixed(d) : String(Math.round(v));
  }
  function money(v) {
    if (v == null) return "-";
    return Math.round(v).toLocaleString("en-US");
  }
  function starStr(n) {
    var s = "";
    for (var i = 0; i < (n || 0); i++) s += "★";
    return s;
  }

  /* ---------- 卡片 ---------- */

  // 性能行：[图标] [名称] [进度条] [数值]
  function perfRow(icon, label, val, key) {
    var pct = (val == null) ? 0 : Math.min(100, (val / MAX[key]) * 100);
    return '<div class="prow">' +
      '<i class="pico">' + icon + "</i>" +
      '<span class="plabel">' + label + "</span>" +
      '<span class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
      '<b class="pval">' + (val == null ? '<em class="na">-</em>' : num(val, 1)) + "</b>" +
    "</div>";
  }

  function bpCell(label, val, cls) {
    var empty = (val == null);
    return '<div class="bp-cell' + (cls ? " " + cls : "") + (empty ? " na" : "") + '">' +
      "<span>" + label + "</span><b>" + (empty ? "-" : val) + "</b></div>";
  }

  // 图纸网格：
  //   普通车：1★…N★（数字=升到该星所需图纸）+ 总计
  //   钥匙车：🔑 + 2★…N★ + 总计（获取即 1 星，无解锁费）
  function bpBlock(c) {
    if (!c.bp || !c.bp.length) {
      return '<div class="bp bp-none">图纸数据未知</div>';
    }

    var stars = c.stars || c.bp.length;
    var cells = [];

    if (c.key) {
      cells.push('<div class="bp-cell key"><span>钥匙</span><b>🔑</b></div>');
      for (var s = 2; s <= stars; s++) {
        cells.push(bpCell(s + "★", c.bp[s - 2]));
      }
    } else {
      for (var t = 1; t <= stars; t++) {
        cells.push(bpCell(t + "★", c.bp[t - 1]));
      }
    }

    cells.push(bpCell("总计", c.bpTotal, c.bpTotal == null ? "" : "total"));
    return '<div class="bp">' + cells.join("") + "</div>";
  }

  // 进口零件：蓝 / 紫 / 黄三种品质，有几个显示几个
  function partsHtml(c) {
    var list = [
      ["blue", c.parts && c.parts.blue],
      ["purple", c.parts && c.parts.purple],
      ["yellow", c.parts && c.parts.yellow]
    ].filter(function (x) { return x[1] != null; });

    if (!list.length) return '<em class="na">-</em>';
    return list.map(function (x) {
      return '<b class="part"><i class="dot ' + x[0] + '"></i>' + x[1] + "</b>";
    }).join("");
  }

  function cardHtml(c) {
    var p = c.perf;

    return '<article class="car">' +
      '<header class="car-head">' +
        '<span class="cls cls-' + esc(c.cls) + '">' + esc(c.cls) + "</span>" +
        '<div class="head-main">' +
          '<h3 class="name">' + esc(c.name) + "</h3>" +
          '<div class="meta">' +
            '<span class="stars">' + starStr(c.stars) + "</span>" +
            (c.key ? '<span class="keytag">🔑</span>' : "") +
            (c.alias ? '<span class="alias">' + esc(c.alias) + "</span>" : "") +
          "</div>" +
        "</div>" +
        '<div class="score"><b>' + (c.score == null ? "-" : c.score) + "</b><span>总分</span></div>" +
      "</header>" +

      '<div class="car-body">' +
        '<div class="perf">' +
          perfRow(ICONS.top, "极速", p.top, "top") +
          perfRow(ICONS.accel, "加速", p.accel, "accel") +
          perfRow(ICONS.handling, "操控", p.handling, "handling") +
          perfRow(ICONS.nitro, "氮气", p.nitroPower, "nitroPower") +
        "</div>" +
        bpBlock(c) +
      "</div>" +

      '<footer class="car-foot">' +
        '<div class="footline">' +
          '<span class="item"><span class="lbl">进口零件</span>' + partsHtml(c) + "</span>" +
          '<span class="item"><i class="ico coin"></i><span class="lbl">改装费用</span><b class="money">' +
            money(c.cost) + "</b></span>" +
        "</div>" +
        '<div class="minor">空速 ' + num(p.air, 0) +
          " · 氮速 " + num(p.nitro, 0) +
          " · 单喷 " + (p.spray == null ? "-" : p.spray + "s") + "</div>" +
      "</footer>" +
    "</article>";
  }

  /* ---------- 筛选 ---------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = CARS.filter(function (c) {
      if (state.cls !== "全部" && c.cls !== state.cls) return false;
      if (state.star !== "全部" && c.stars !== state.star) return false;
      if (state.key && !c.key) return false;
      if (q) {
        var hay = (c.name + " " + (c.alias || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    var key = state.sort;
    out.sort(function (a, b) {
      if (key === "name") return a.name.localeCompare(b.name);
      if (key === "top") return (b.perf.top || 0) - (a.perf.top || 0);
      if (key === "accel") return (b.perf.accel || 0) - (a.perf.accel || 0);
      if (key === "handling") return (b.perf.handling || 0) - (a.perf.handling || 0);
      return (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name);
    });
    return out;
  }

  /* ---------- 渲染 ---------- */
  function renderChips() {
    var classes = ["全部", "S", "A", "B", "C", "D", "R"];
    $("clsChips").innerHTML = classes.map(function (k) {
      return '<button class="chip' + (state.cls === k ? " on" : "") +
        '" data-cls="' + k + '">' + k + "</button>";
    }).join("");

    var stars = ["全部", 3, 4, 5, 6];
    var h = stars.map(function (k) {
      return '<button class="chip' + (state.star === k ? " on" : "") + '" data-star="' + k + '">' +
        (k === "全部" ? "全部星级" : k + "★") + "</button>";
    }).join("");
    h += '<button class="chip' + (state.key ? " on" : "") + '" data-key="1" title="只看钥匙车">🔑 钥匙</button>';
    $("starChips").innerHTML = h;
  }

  function render() {
    var list = filtered();
    $("count").textContent = "共 " + CARS.length + " 台 · 显示 " + list.length + " 台";
    $("totalTag").textContent = CARS.length + " 台";
    $("list").innerHTML = list.length
      ? list.map(cardHtml).join("")
      : '<div class="empty">没有符合条件的车</div>';
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $("q").addEventListener("input", function (e) {
      state.q = e.target.value;
      render();
    });

    $("sort").addEventListener("change", function (e) {
      state.sort = e.target.value;
      render();
    });

    $("clsChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cls]");
      if (!b) return;
      state.cls = b.getAttribute("data-cls");
      renderChips();
      render();
    });

    $("starChips").addEventListener("click", function (e) {
      var s = e.target.closest("[data-star]");
      if (s) {
        var v = s.getAttribute("data-star");
        state.star = (v === "全部") ? "全部" : Number(v);
        renderChips();
        render();
        return;
      }
      var k = e.target.closest("[data-key]");
      if (k) {
        state.key = !state.key;
        renderChips();
        render();
      }
    });
  }

  function init() {
    var m = location.search.match(/[?&]q=([^&]*)/);
    if (m) {
      state.q = decodeURIComponent(m[1]);
      $("q").value = state.q;
    }
    renderChips();
    bind();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
